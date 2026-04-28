/**
 * Rotas de integração AdvBox
 *
 * PÚBLICO (sem auth):
 *   POST /api/advbox/webhook          → recebe eventos do AdvBox (push)
 *
 * PROTEGIDO:
 *   GET  /api/advbox/status           → chave configurada + URL do webhook
 *   GET  /api/advbox/events           → histórico de eventos recebidos
 *   POST /api/advbox/sync/:processoId → envia processo local → AdvBox (quando API funcionar)
 */

import { Router, Request, Response } from "express";
import { db, processosTable, conversationsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

// ─── Armazena eventos em memória (persiste até restart) ────────────────────────
// Em produção real usaria uma tabela; aqui usamos um buffer circular de 200 eventos
interface AdvboxEvent {
  id: string;
  receivedAt: string;
  eventType: string;
  payload: unknown;
  processed: boolean;
  result?: string;
}
const eventBuffer: AdvboxEvent[] = [];
function pushEvent(e: AdvboxEvent) {
  eventBuffer.unshift(e);
  if (eventBuffer.length > 200) eventBuffer.pop();
}

// ─── Mapeamento status AdvBox → nosso status ──────────────────────────────────
const ADVBOX_STATUS_MAP: Record<string, string> = {
  "em andamento": "em_andamento",
  "em_andamento": "em_andamento",
  "aguardando perícia": "aguardando_pericia",
  "aguardando_pericia": "aguardando_pericia",
  "perícia marcada": "pericia_marcada",
  "pericia_marcada": "pericia_marcada",
  "elaborar petição": "elaborar_peticao",
  "protocolado": "protocolado",
  "aguardando julgamento": "aguardando_julgamento",
  "sentença procedente": "sentenca_procedente",
  "sentença improcedente": "sentenca_improcedente",
  "recurso": "recurso",
  "encerrado": "encerrado",
  "benefício concedido": "beneficio_concedido",
  "beneficio_concedido": "beneficio_concedido",
};

// ═══════════════════════════════════════════════════════════════════════════════
// PÚBLICO — AdvBox chama este endpoint quando algo muda no sistema deles
// Não exige autenticação nossa (eles não têm nosso cookie)
// ═══════════════════════════════════════════════════════════════════════════════
router.post("/webhook", async (req: Request, res: Response) => {
  // Aceita qualquer payload do AdvBox
  const payload = req.body;
  const eventId = `adv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  // Detecta tipo de evento
  const eventType =
    payload?.event ??
    payload?.tipo ??
    payload?.type ??
    payload?.evento ??
    (payload?.caso ? "caso.update" : payload?.tarefa ? "tarefa.update" : "unknown");

  logger.info({ eventId, eventType, payload }, "AdvBox webhook recebido");

  // Responde 200 imediatamente para o AdvBox não retentar
  res.json({ ok: true, eventId });

  // Processa assincronamente
  setImmediate(async () => {
    let result = "sem ação";
    try {
      const caso = payload?.caso ?? payload?.data ?? payload;
      const advboxId = String(caso?.id ?? caso?.caso_id ?? "");
      const novoStatus = (caso?.status ?? caso?.etapa ?? "").toLowerCase();
      const numeroProcesso = caso?.numero_processo ?? caso?.numero ?? null;
      const titulo = caso?.titulo ?? caso?.nome ?? null;

      if (advboxId && advboxId !== "") {
        // Busca processo local pelo advboxId
        const [processo] = await db.select()
          .from(processosTable)
          .where(eq(processosTable.advboxId, advboxId))
          .limit(1);

        if (processo) {
          const updateData: Record<string, unknown> = {
            advboxSyncedAt: new Date(),
            updatedAt: new Date(),
          };

          if (novoStatus && ADVBOX_STATUS_MAP[novoStatus]) {
            updateData.status = ADVBOX_STATUS_MAP[novoStatus];
          }
          if (numeroProcesso) updateData.numeroProcesso = numeroProcesso;

          await db.update(processosTable)
            .set(updateData as Parameters<typeof processosTable.$inferInsert>[0])
            .where(eq(processosTable.id, processo.id));

          result = `processo ${processo.id} atualizado (status: ${ADVBOX_STATUS_MAP[novoStatus] ?? "inalterado"})`;
        } else if (titulo) {
          // Processo novo no AdvBox que não temos localmente — cria
          await db.insert(processosTable).values({
            clienteNome: titulo,
            status: ADVBOX_STATUS_MAP[novoStatus] ?? "em_andamento",
            advboxId,
            advboxSyncedAt: new Date(),
            ...(numeroProcesso ? { numeroProcesso } : {}),
          });
          result = `processo novo criado a partir do AdvBox (advboxId: ${advboxId})`;
        } else {
          result = `advboxId ${advboxId} não encontrado localmente e sem título para criar`;
        }
      } else {
        result = "payload sem ID de caso reconhecível — evento logado apenas";
      }
    } catch (err) {
      result = `erro: ${String(err)}`;
      logger.error({ eventId, err }, "AdvBox webhook processing error");
    }

    pushEvent({ id: eventId, receivedAt: new Date().toISOString(), eventType, payload, processed: true, result });
    logger.info({ eventId, result }, "AdvBox webhook processado");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PROTEGIDO — endpoints administrativos
// (requireAuth já aplicado no router pai antes de chegar aqui)
// ═══════════════════════════════════════════════════════════════════════════════

// Status + URL do webhook
router.get("/status", (req: Request, res: Response) => {
  const configured = !!process.env.ADVBOX_API_KEY;
  const host = process.env.REPLIT_DOMAINS?.split(",")[0] ?? req.hostname;
  const webhookUrl = `https://${host}/api/advbox/webhook`;
  res.json({
    configured,
    apiKeyStatus: configured ? "ativa" : "não configurada",
    webhookUrl,
    eventsReceived: eventBuffer.length,
    message: configured
      ? "Integração AdvBox configurada. Configure o webhook no AdvBox com a URL abaixo."
      : "ADVBOX_API_KEY não configurada (necessária apenas para push → AdvBox).",
  });
});

// Histórico de eventos recebidos
router.get("/events", (_req: Request, res: Response) => {
  res.json({ events: eventBuffer.slice(0, 50) });
});

// Sync manual processo → AdvBox (mantido para quando a API funcionar)
router.post("/sync/:processoId", async (req: Request, res: Response) => {
  res.json({
    ok: false,
    message: "Push direto para AdvBox API indisponível (token retorna 401). Use o webhook de entrada.",
    webhookMode: true,
  });
});

export default router;
