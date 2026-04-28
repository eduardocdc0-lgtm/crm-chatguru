import { Router, Request, Response } from "express";
import { db, processosTable, tarefasTable, agentsTable, conversationsTable } from "@workspace/db";
import { count, eq, and, sum, gte, lt } from "drizzle-orm";

const router = Router();

// GET /api/processos/metricas
router.get("/metricas", async (_req: Request, res: Response) => {
  const now = new Date();
  const em30dias = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [
    [{ totalProcessos }],
    [{ tarefasPendentes }],
    honorarios,
  ] = await Promise.all([
    db.select({ totalProcessos: count() }).from(processosTable),
    db.select({ tarefasPendentes: count() })
      .from(tarefasTable)
      .where(eq(tarefasTable.status, "pendente")),
    db.select({
      honorariosAReceber: sum(processosTable.honorarioValor),
    })
      .from(processosTable)
      .where(eq(processosTable.honorarioStatus, "pendente")),
  ]);

  // Despesas vencendo nos próximos 30 dias (tarefas com prazo próximo)
  const [{ despesasProximos30 }] = await db
    .select({ despesasProximos30: count() })
    .from(tarefasTable)
    .where(
      and(
        eq(tarefasTable.status, "pendente"),
        gte(tarefasTable.prazo, now),
        lt(tarefasTable.prazo, em30dias)
      )
    );

  res.json({
    totalProcessos: Number(totalProcessos),
    tarefasPendentes: Number(tarefasPendentes),
    honorariosAReceber: Number(honorarios[0]?.honorariosAReceber ?? 0),
    despesasProximos30: Number(despesasProximos30),
  });
});

// GET /api/processos/equipe/atividade
router.get("/equipe/atividade", async (_req: Request, res: Response) => {
  const agentes = await db.select().from(agentsTable);

  const atividade = await Promise.all(
    agentes.map(async (ag) => {
      const [{ pendentes }] = await db
        .select({ pendentes: count() })
        .from(tarefasTable)
        .where(
          and(
            eq(tarefasTable.responsavelId, ag.id),
            eq(tarefasTable.status, "pendente")
          )
        );

      const [{ processos }] = await db
        .select({ processos: count() })
        .from(processosTable)
        .where(eq(processosTable.responsavelId, ag.id));

      return {
        id: ag.id,
        nome: ag.name,
        tarefasPendentes: Number(pendentes),
        totalProcessos: Number(processos),
      };
    })
  );

  res.json(atividade.filter((a) => a.tarefasPendentes > 0 || a.totalProcessos > 0));
});

// GET /api/processos/campanhas/resumo
router.get("/campanhas/resumo", async (_req: Request, res: Response) => {
  const rows = await db
    .select({
      campaign: conversationsTable.campaign,
      total: count(),
    })
    .from(conversationsTable)
    .groupBy(conversationsTable.campaign);

  const data = rows
    .map((r) => ({
      nome: r.campaign ?? "Indefinida",
      totalLeads: Number(r.total),
    }))
    .sort((a, b) => b.totalLeads - a.totalLeads);

  res.json(data);
});

// GET /api/processos — lista todos
router.get("/", async (_req: Request, res: Response) => {
  const processos = await db
    .select()
    .from(processosTable)
    .orderBy(processosTable.createdAt);
  res.json({ processos });
});

// POST /api/processos — cria processo
router.post("/", async (req: Request, res: Response) => {
  const { clienteNome, numeroProcesso, status, tipo, honorarioValor, responsavelId, observacoes } = req.body;
  if (!clienteNome) {
    res.status(400).json({ error: "clienteNome obrigatório" });
    return;
  }
  const [novo] = await db.insert(processosTable).values({
    clienteNome,
    numeroProcesso: numeroProcesso ?? null,
    status: status ?? "em_andamento",
    tipo: tipo ?? null,
    honorarioValor: honorarioValor ?? null,
    responsavelId: responsavelId ?? null,
    observacoes: observacoes ?? null,
  }).returning();
  res.json(novo);
});

// POST /api/processos/:id/tarefas — cria tarefa em processo
router.post("/:id/tarefas", async (req: Request, res: Response) => {
  const processoId = Number(req.params.id);
  const { descricao, responsavelId, prazo } = req.body;
  if (!descricao) {
    res.status(400).json({ error: "descricao obrigatória" });
    return;
  }
  const [nova] = await db.insert(tarefasTable).values({
    processoId,
    descricao,
    responsavelId: responsavelId ?? null,
    prazo: prazo ? new Date(prazo) : null,
  }).returning();
  res.json(nova);
});

export default router;
