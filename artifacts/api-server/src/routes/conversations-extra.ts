import { Router, Request, Response } from "express";
import { db, conversationsTable, statusHistoryTable, tagsTable, conversationTagsTable, processosTable } from "@workspace/db";
import { eq, ilike, or, and, lt, isNotNull, desc, sql, isNull, inArray, count } from "drizzle-orm";
import { z } from "zod";
import { detectDisease } from "../lib/disease";
import { getAgentFilter, getSessionData } from "../lib/auth";

const router = Router();

// ─── ALERTS (antes das rotas /:id para não colidir) ───────────────────────────
router.get("/alerts/list", async (req: Request, res: Response) => {
  const h2 = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const h10m = new Date(Date.now() - 10 * 60 * 1000);
  const h24 = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Optional filter by whatsapp number id (origem)
  const waIdParam = req.query.whatsappNumberId;
  const waFilter = waIdParam ? eq(conversationsTable.whatsappNumberId, Number(waIdParam)) : undefined;

  // Agent isolation
  const agentIdFilter = getAgentFilter(req);
  const agentFilter = agentIdFilter ? eq(conversationsTable.agentId, agentIdFilter) : undefined;

  const alerts = await db.select().from(conversationsTable)
    .where(and(
      waFilter,
      agentFilter,
      isNotNull(conversationsTable.coolingAlert),
      sql`${conversationsTable.coolingAlert} != ''`
    ))
    .orderBy(desc(conversationsTable.updatedAt))
    .limit(100);

  // URGENTE: lead_novo sem resposta há +2h (Tráfego Pago) OU +10min (Base)
  const urgentTrafegoCount = await db.select({ count: sql<number>`count(*)::int` })
    .from(conversationsTable)
    .where(and(
      waFilter,
      agentFilter,
      or(eq(conversationsTable.status, "lead_novo"), eq(conversationsTable.status, "open")),
      Number(waIdParam) === 2
        ? lt(conversationsTable.updatedAt, h10m)
        : lt(conversationsTable.updatedAt, h2),
    ));

  // Alerta especial BASE: qualquer status ativo + +10min sem resposta
  const baseAlertCount = Number(waIdParam) === 2
    ? await db.select({ count: sql<number>`count(*)::int` })
        .from(conversationsTable)
        .where(and(
          eq(conversationsTable.whatsappNumberId, 2),
          agentFilter,
          or(
            eq(conversationsTable.status, "lead_novo"),
            eq(conversationsTable.status, "lead_qualificado"),
            eq(conversationsTable.status, "em_atendimento"),
            eq(conversationsTable.status, "follow_up"),
          ),
          lt(conversationsTable.updatedAt, h10m),
        ))
        .then(r => Number(r[0]?.count ?? 0))
    : 0;

  const coolingCount = await db.select({ count: sql<number>`count(*)::int` })
    .from(conversationsTable)
    .where(and(
      waFilter,
      agentFilter,
      or(
        eq(conversationsTable.status, "lead_qualificado"),
        eq(conversationsTable.status, "em_atendimento"),
        eq(conversationsTable.status, "follow_up"),
        eq(conversationsTable.status, "waiting"),
        eq(conversationsTable.status, "in_progress"),
      ),
      lt(conversationsTable.updatedAt, h24),
    ));

  res.json({
    alerts,
    counts: {
      urgent: Number(urgentTrafegoCount[0]?.count ?? 0),
      cooling: Number(coolingCount[0]?.count ?? 0),
      baseAlert: baseAlertCount,
    }
  });
});

// ─── SEARCH ──────────────────────────────────────────────────────────────────
router.get("/search", async (req: Request, res: Response) => {
  const q = String(req.query.q ?? "").trim();
  if (!q || q.length < 2) { res.json({ results: [] }); return; }
  const like = `%${q}%`;
  const agentIdFilter = getAgentFilter(req);
  const agentFilter = agentIdFilter ? eq(conversationsTable.agentId, agentIdFilter) : undefined;
  const textFilter = or(
    ilike(conversationsTable.contactName, like),
    ilike(conversationsTable.chatNumber, like),
    ilike(conversationsTable.firstMessage, like),
    ilike(conversationsTable.lastMessage, like),
  );
  const where = agentFilter ? and(agentFilter, textFilter) : textFilter;
  const rows = await db.select({
    id: conversationsTable.id,
    chatNumber: conversationsTable.chatNumber,
    contactName: conversationsTable.contactName,
    status: conversationsTable.status,
    campaign: conversationsTable.campaign,
    assignedAgent: conversationsTable.assignedAgent,
    lastMessage: conversationsTable.lastMessage,
    firstMessage: conversationsTable.firstMessage,
    createdAt: conversationsTable.createdAt,
    coolingAlert: conversationsTable.coolingAlert,
  }).from(conversationsTable)
    .where(where)
    .orderBy(desc(conversationsTable.updatedAt))
    .limit(15);
  res.json({ results: rows });
});

// ─── REENGAJAMENTO ───────────────────────────────────────────────────────────
// GET /api/conversations/reengagement?days=3&whatsappNumberId=1
// Retorna leads onde o lead ficou em silêncio por +X dias
// Status permitidos: lead_novo, lead_qualificado, follow_up
router.get("/reengagement", async (req: Request, res: Response) => {
  const days = Math.max(1, Math.min(90, Number(req.query.days) || 3));
  const waIdParam = req.query.whatsappNumberId;

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const ALLOWED_STATUS = ["lead_novo", "lead_qualificado", "follow_up"];

  const conditions = [
    inArray(conversationsTable.status, ALLOWED_STATUS),
    or(
      and(isNotNull(conversationsTable.lastMessageAt), lt(conversationsTable.lastMessageAt, cutoff)),
      and(isNull(conversationsTable.lastMessageAt), lt(conversationsTable.createdAt, cutoff)),
    ),
  ];

  // Agent isolation
  const agentIdFilter = getAgentFilter(req);
  if (agentIdFilter) conditions.push(eq(conversationsTable.agentId, agentIdFilter));

  if (waIdParam) {
    conditions.push(eq(conversationsTable.whatsappNumberId, Number(waIdParam)));
  }

  const rows = await db.select({
    id: conversationsTable.id,
    chatNumber: conversationsTable.chatNumber,
    contactName: conversationsTable.contactName,
    status: conversationsTable.status,
    assignedAgent: conversationsTable.assignedAgent,
    campaign: conversationsTable.campaign,
    lastMessageAt: conversationsTable.lastMessageAt,
    createdAt: conversationsTable.createdAt,
    updatedAt: conversationsTable.updatedAt,
    whatsappNumberId: conversationsTable.whatsappNumberId,
    contextData: conversationsTable.contextData,
  })
    .from(conversationsTable)
    .where(and(...conditions))
    .orderBy(conversationsTable.lastMessageAt)
    .limit(500);

  res.json({ leads: rows, days, total: rows.length });
});

// ─── EXPORT CSV ──────────────────────────────────────────────────────────────
router.get("/export", async (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  const campaign = req.query.campaign as string | undefined;

  const conditions = [];
  // Agent isolation
  const agentIdFilter = getAgentFilter(req);
  if (agentIdFilter) conditions.push(eq(conversationsTable.agentId, agentIdFilter));
  if (status && status !== "all") conditions.push(eq(conversationsTable.status, status));
  if (campaign && campaign !== "all") conditions.push(eq(conversationsTable.campaign, campaign));

  const rows = await db.select().from(conversationsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(conversationsTable.createdAt))
    .limit(5000);

  const escape = (v: unknown) => {
    if (v == null) return "";
    const s = String(v).replace(/"/g, '""');
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
  };

  const headers = ["ID","Nome","Telefone","Campanha","Status","Atendente","Anotações","Primeira Mensagem","Última Mensagem","Alerta","Data Criação"];
  const csvLines = [
    headers.join(","),
    ...rows.map(r => [
      r.id,
      escape(r.contactName),
      escape(r.chatNumber),
      escape(r.campaign),
      escape(r.status),
      escape(r.assignedAgent),
      escape(r.notes),
      escape(r.firstMessage),
      escape(r.lastMessage),
      escape(r.coolingAlert),
      escape(r.createdAt?.toISOString()),
    ].join(","))
  ].join("\n");

  const date = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="leads_eduardo_${date}.csv"`);
  res.send("\uFEFF" + csvLines);
});

// ─── DISEASE STATS ───────────────────────────────────────────────────────────
router.get("/disease/stats", async (req: Request, res: Response) => {
  const waIdParam = req.query.whatsappNumberId;
  const waFilter = waIdParam ? eq(conversationsTable.whatsappNumberId, Number(waIdParam)) : undefined;
  const rows = await db
    .select({ disease: conversationsTable.disease, count: sql<number>`count(*)::int` })
    .from(conversationsTable)
    .where(waFilter ? and(isNotNull(conversationsTable.disease), waFilter) : isNotNull(conversationsTable.disease))
    .groupBy(conversationsTable.disease)
    .orderBy(desc(sql`count(*)`))
    .limit(12);
  res.json({ stats: rows });
});

// ─── DISEASE RETROACTIVE DETECTION ───────────────────────────────────────────
router.post("/disease/detect", async (_req: Request, res: Response) => {
  const rows = await db
    .select({ id: conversationsTable.id, firstMessage: conversationsTable.firstMessage, lastMessage: conversationsTable.lastMessage })
    .from(conversationsTable)
    .where(isNull(conversationsTable.disease));

  let updated = 0;
  for (const row of rows) {
    const disease = detectDisease([row.firstMessage, row.lastMessage]);
    if (disease) {
      await db.update(conversationsTable)
        .set({ disease, updatedAt: new Date() })
        .where(eq(conversationsTable.id, row.id));
      updated++;
    }
  }
  res.json({ ok: true, checked: rows.length, updated });
});

// ─── NOTES + STATUS PATCH ────────────────────────────────────────────────────
router.patch("/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ ok: false }); return; }

  // Ownership check for agents
  const session = getSessionData(req);
  const agentIdFilter = session?.role === "agent" && session.agentId ? session.agentId : null;
  if (agentIdFilter) {
    const [existing] = await db.select({ agentId: conversationsTable.agentId })
      .from(conversationsTable).where(eq(conversationsTable.id, id)).limit(1);
    if (!existing || existing.agentId !== agentIdFilter) {
      res.status(403).json({ ok: false, error: "Acesso negado" }); return;
    }
  }

  const parsed = z.object({
    notes: z.string().max(2000).optional(),
    status: z.string().optional(),
    assignedAgent: z.string().optional().nullable(),
    agentId: z.number().optional().nullable(),
    discardReason: z.string().optional().nullable(),
    campaign: z.string().optional().nullable(),
    disease: z.string().optional().nullable(),
    diseaseNote: z.string().max(200).optional().nullable(),
  }).safeParse(req.body);

  if (!parsed.success) { res.status(400).json({ ok: false, error: parsed.error.message }); return; }

  const { notes, status, ...rest } = parsed.data;
  const updateData: Record<string, unknown> = { ...rest, updatedAt: new Date() };
  if (notes !== undefined) updateData.notes = notes;

  if (status) {
    const existing = await db.select({
      status: conversationsTable.status,
      contactName: conversationsTable.contactName,
      campaign: conversationsTable.campaign,
    }).from(conversationsTable).where(eq(conversationsTable.id, id)).limit(1);

    if (existing.length > 0 && existing[0].status !== status) {
      await db.insert(statusHistoryTable).values({
        conversationId: id,
        fromStatus: existing[0].status,
        toStatus: status,
        changedBy: "manual",
      });

      // ── Contract attribution: quando atendente fecha contrato ──────────────
      if (status === "contrato_assinado" && session?.agentId) {
        const existingProcesso = await db
          .select({ id: processosTable.id, responsavelId: processosTable.responsavelId })
          .from(processosTable)
          .where(eq(processosTable.conversationId, id))
          .limit(1);

        if (existingProcesso.length === 0) {
          // Cria processo vinculado ao atendente logado
          await db.insert(processosTable).values({
            clienteNome: existing[0].contactName ?? `Lead #${id}`,
            status: "em_andamento",
            tipo: existing[0].campaign ?? undefined,
            tipoFluxo: null,
            conversationId: id,
            responsavelId: session.agentId,
          });
        } else if (!existingProcesso[0].responsavelId) {
          // Atualiza responsável se ainda não definido
          await db.update(processosTable)
            .set({ responsavelId: session.agentId, updatedAt: new Date() })
            .where(eq(processosTable.id, existingProcesso[0].id));
        }
      }
    }
    updateData.status = status;
  }

  const [conv] = await db.update(conversationsTable)
    .set(updateData as any)
    .where(eq(conversationsTable.id, id))
    .returning();
  res.json({ ok: true, conversation: conv });
});

// ─── QUALIFICADOS: lista leads com is_qualified = true ───────────────────────
router.get("/qualificados", async (req: Request, res: Response) => {
  const waIdParam = req.query.whatsappNumberId;
  const waFilter = waIdParam ? eq(conversationsTable.whatsappNumberId, Number(waIdParam)) : undefined;

  const conditions = [eq(conversationsTable.isQualified, true)];
  if (waFilter) conditions.push(waFilter);
  // Agent isolation
  const agentIdFilter = getAgentFilter(req);
  if (agentIdFilter) conditions.push(eq(conversationsTable.agentId, agentIdFilter));
  const where = and(...conditions);

  const [leads, [{ total }]] = await Promise.all([
    db.select({
      id: conversationsTable.id,
      chatNumber: conversationsTable.chatNumber,
      contactName: conversationsTable.contactName,
      status: conversationsTable.status,
      campaign: conversationsTable.campaign,
      hasLaudo: conversationsTable.hasLaudo,
      noAdvogado: conversationsTable.noAdvogado,
      intentResolve: conversationsTable.intentResolve,
      createdAt: conversationsTable.createdAt,
      lastMessageAt: conversationsTable.lastMessageAt,
      whatsappNumberId: conversationsTable.whatsappNumberId,
    }).from(conversationsTable)
      .where(where)
      .orderBy(desc(conversationsTable.createdAt))
      .limit(200),
    db.select({ total: count() }).from(conversationsTable).where(where),
  ]);

  res.json({ leads, total: Number(total) });
});

// ─── STATUS HISTORY ───────────────────────────────────────────────────────────
router.get("/:id/history", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ ok: false }); return; }

  // Ownership check for agents
  const agentIdFilter = getAgentFilter(req);
  if (agentIdFilter) {
    const [conv] = await db.select({ agentId: conversationsTable.agentId })
      .from(conversationsTable).where(eq(conversationsTable.id, id)).limit(1);
    if (!conv || conv.agentId !== agentIdFilter) {
      res.status(403).json({ ok: false, error: "Acesso negado" }); return;
    }
  }

  const history = await db.select().from(statusHistoryTable)
    .where(eq(statusHistoryTable.conversationId, id))
    .orderBy(desc(statusHistoryTable.createdAt));
  res.json({ history });
});

// ─── SINGLE CONVERSATION ─────────────────────────────────────────────────────
router.get("/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ ok: false }); return; }
  const [conv] = await db.select().from(conversationsTable)
    .where(eq(conversationsTable.id, id)).limit(1);
  if (!conv) { res.status(404).json({ ok: false }); return; }

  // Ownership check for agents
  const agentIdFilter = getAgentFilter(req);
  if (agentIdFilter && conv.agentId !== agentIdFilter) {
    res.status(403).json({ ok: false, error: "Acesso negado" }); return;
  }

  const history = await db.select().from(statusHistoryTable)
    .where(eq(statusHistoryTable.conversationId, id))
    .orderBy(desc(statusHistoryTable.createdAt));

  res.json({ conversation: conv, history });
});

export default router;
