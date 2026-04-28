/**
 * Rotas de integração com AdvBox
 *
 * POST /api/advbox/sync/:processoId   → Envia processo local para o AdvBox
 * POST /api/advbox/sync-lead/:convId  → Cria caso no AdvBox a partir de um lead (contrato assinado)
 * GET  /api/advbox/status             → Verifica se a API key está configurada
 */

import { Router, Request, Response } from "express";
import { db, processosTable, conversationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  buscarOuCriarPessoa,
  criarCaso,
  atualizarCaso,
} from "../lib/advbox";

const router = Router();

// ─── Status da integração ─────────────────────────────────────────────────────
router.get("/status", (_req: Request, res: Response) => {
  const configured = !!process.env.ADVBOX_API_KEY;
  res.json({ configured, message: configured ? "Integração AdvBox ativa." : "ADVBOX_API_KEY não configurada." });
});

// ─── Sync processo local → AdvBox ─────────────────────────────────────────────
router.post("/sync/:processoId", async (req: Request, res: Response) => {
  const processoId = parseInt(req.params.processoId, 10);
  if (isNaN(processoId)) { res.status(400).json({ ok: false, error: "ID inválido" }); return; }

  const [processo] = await db.select().from(processosTable).where(eq(processosTable.id, processoId)).limit(1);
  if (!processo) { res.status(404).json({ ok: false, error: "Processo não encontrado" }); return; }

  try {
    // Busca ou cria pessoa no AdvBox
    const pessoa = await buscarOuCriarPessoa({
      nome: processo.clienteNome,
      // telefone vem da conversa, se disponível
    });

    let advboxId: string;

    if (processo.advboxId) {
      // Já existe no AdvBox — atualiza
      const caso = await atualizarCaso(processo.advboxId, {
        titulo: `${processo.clienteNome} — ${processo.tipo ?? processo.tipoFluxo ?? "Previdenciário"}`,
        ...(processo.numeroProcesso ? { numero_processo: processo.numeroProcesso } : {}),
      });
      advboxId = String(caso.id);
    } else {
      // Cria novo caso
      const titulo = `${processo.clienteNome} — ${processo.tipo ?? processo.tipoFluxo ?? "Previdenciário"}`;
      const caso = await criarCaso({
        titulo,
        pessoa_id: pessoa.id,
        ...(processo.numeroProcesso ? { numero_processo: processo.numeroProcesso } : {}),
        descricao: processo.observacoes ?? undefined,
      });
      advboxId = String(caso.id);
    }

    // Grava advboxId + data de sync no banco local
    await db.update(processosTable)
      .set({ advboxId, advboxSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(processosTable.id, processoId));

    res.json({ ok: true, advboxId });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// ─── Sync lead (conversa) → AdvBox (ex.: quando contrato é assinado) ──────────
router.post("/sync-lead/:convId", async (req: Request, res: Response) => {
  const convId = parseInt(req.params.convId, 10);
  if (isNaN(convId)) { res.status(400).json({ ok: false, error: "ID inválido" }); return; }

  const [conv] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, convId)).limit(1);
  if (!conv) { res.status(404).json({ ok: false, error: "Lead não encontrado" }); return; }

  try {
    const pessoa = await buscarOuCriarPessoa({
      nome: conv.contactName ?? conv.chatNumber,
      telefone: conv.chatNumber,
    });

    const titulo = `${conv.contactName ?? conv.chatNumber} — ${conv.campaign ?? "Previdenciário"}`;
    const caso = await criarCaso({
      titulo,
      pessoa_id: pessoa.id,
      descricao: conv.firstMessage ?? undefined,
    });

    // Cria processo local vinculado à conversa se ainda não existe
    const [existingProcesso] = await db.select({ id: processosTable.id })
      .from(processosTable)
      .where(eq(processosTable.conversationId, convId))
      .limit(1);

    if (!existingProcesso) {
      await db.insert(processosTable).values({
        clienteNome: conv.contactName ?? conv.chatNumber,
        status: "em_andamento",
        tipo: conv.campaign ?? undefined,
        tipoFluxo: detectTipoFluxo(conv.campaign),
        conversationId: convId,
        advboxId: String(caso.id),
        advboxSyncedAt: new Date(),
      });
    } else {
      await db.update(processosTable)
        .set({ advboxId: String(caso.id), advboxSyncedAt: new Date(), updatedAt: new Date() })
        .where(eq(processosTable.id, existingProcesso.id));
    }

    res.json({ ok: true, advboxId: String(caso.id), pessoaId: pessoa.id });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// ─── Helper ───────────────────────────────────────────────────────────────────

const TIPO_FLUXO: Record<string, string> = {
  LAUDO_SUS_PE: "judicial",
  LAUDO_SUS_GERAL: "judicial",
  FIBROMIALGIA: "judicial",
  PINO_PLACA_PARAFUSO: "judicial",
  AUX_DOENCA: "adm",
  AUX_ACIDENTE: "adm",
  BPC: "adm",
  PERICIA_NEGADA: "judicial",
  SALARIO_MATERNIDADE: "salario_maternidade",
};

function detectTipoFluxo(campaign?: string | null): string | undefined {
  if (!campaign) return undefined;
  return TIPO_FLUXO[campaign.toUpperCase()] ?? "judicial";
}

export default router;
