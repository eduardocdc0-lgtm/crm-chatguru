/**
 * Sincronização de atribuição de agente CRM ↔ ChatGuru.
 *
 * ⚠️ AÇÃO PRECISA SER CONFIRMADA antes do uso em produção.
 * O nome real da action de transferência no ChatGuru s22 ainda não foi
 * verificado. Possibilidades testadas: chat_transfer, chat_assign,
 * transfer_chat, assign_user. Configure via env var:
 *
 *   CHATGURU_TRANSFER_ACTION=<nome_da_action>
 *
 * Se não configurada, a transferência é DESLIGADA e a operação CRM
 * prossegue normalmente (atribuição interna funciona, só não sincroniza
 * com ChatGuru). O log registra a tentativa como skipped.
 */
import { db, conversationsTable, agentsTable, whatsappNumbersTable, chatguruTransferLogTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const CHATGURU_API = "https://s22.chatguru.app/api/v1";
const API_KEY = process.env.CHATGURU_API_KEY;
const ACCOUNT_ID = process.env.CHATGURU_ACCOUNT_ID;
const PHONE_ID_DEFAULT = process.env.CHATGURU_PHONE_ID;
const TRANSFER_ACTION = process.env.CHATGURU_TRANSFER_ACTION; // não definido = transferência desligada

export type TransferTrigger = "reengagement_send" | "manual_reassign" | "pass_to_closer";

export interface TransferResult {
  success: boolean;
  skipped?: boolean;       // true quando faltam dados pra transferir (action, chatguru_user_id, etc.)
  error?: string;
}

async function logTransfer(
  conversationId: number,
  fromAgentId: number | null,
  toAgentId: number,
  triggeredBy: TransferTrigger,
  success: boolean,
  errorMessage?: string,
) {
  try {
    await db.insert(chatguruTransferLogTable).values({
      conversationId,
      fromAgentId: fromAgentId ?? null,
      toAgentId,
      triggeredBy,
      success,
      errorMessage: errorMessage ?? null,
    });
  } catch (err) {
    logger.warn({ err: String(err), conversationId }, "Falha ao registrar chatguru_transfer_log");
  }
}

/**
 * Transfere um lead pra outro agente no ChatGuru.
 *
 * Ordem:
 *   1. Tenta transferir via API ChatGuru (se action configurada).
 *   2. Loga sucesso/falha em chatguru_transfer_log.
 *   3. NUNCA bloqueia o caller — falhas são logadas, não lançadas.
 *
 * O caller é responsável por atualizar agent_id no CRM (não fazemos isso aqui
 * pra manter responsabilidade única).
 */
export async function transferLeadInChatGuru(
  conversationId: number,
  targetAgentId: number,
  triggeredBy: TransferTrigger,
): Promise<TransferResult> {
  // ── 1. Carregar dados ────────────────────────────────────────────────────
  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, conversationId))
    .limit(1);

  if (!conv) {
    const err = `Conversa #${conversationId} não encontrada`;
    await logTransfer(conversationId, null, targetAgentId, triggeredBy, false, err);
    return { success: false, error: err };
  }

  const [targetAgent] = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.id, targetAgentId))
    .limit(1);

  if (!targetAgent) {
    const err = `Agente #${targetAgentId} não encontrado`;
    await logTransfer(conversationId, conv.agentId, targetAgentId, triggeredBy, false, err);
    return { success: false, error: err };
  }

  // ── 2. Verificar pré-requisitos pra transferir ─────────────────────────────
  // Se a action ChatGuru ainda não foi configurada, registrar como skipped.
  if (!TRANSFER_ACTION) {
    await logTransfer(conversationId, conv.agentId, targetAgentId, triggeredBy, false,
      "CHATGURU_TRANSFER_ACTION não configurada — transferência desligada");
    return { success: false, skipped: true, error: "Transferência ChatGuru não configurada" };
  }

  if (!targetAgent.chatguruUserId) {
    const err = `Agente "${targetAgent.name}" sem chatguru_user_id mapeado`;
    await logTransfer(conversationId, conv.agentId, targetAgentId, triggeredBy, false, err);
    return { success: false, skipped: true, error: err };
  }

  if (!API_KEY || !ACCOUNT_ID) {
    const err = "CHATGURU_API_KEY ou CHATGURU_ACCOUNT_ID não configurados";
    await logTransfer(conversationId, conv.agentId, targetAgentId, triggeredBy, false, err);
    return { success: false, skipped: true, error: err };
  }

  // Resolve phone_id: prefer o do número de WhatsApp da conversa, senão usa env default
  let phoneId = PHONE_ID_DEFAULT;
  if (conv.whatsappNumberId) {
    const [waNum] = await db
      .select({ chatguruPhoneId: whatsappNumbersTable.chatguruPhoneId })
      .from(whatsappNumbersTable)
      .where(eq(whatsappNumbersTable.id, conv.whatsappNumberId))
      .limit(1);
    if (waNum?.chatguruPhoneId) phoneId = waNum.chatguruPhoneId;
  }

  if (!phoneId) {
    const err = "phone_id não resolvido pra essa conversa";
    await logTransfer(conversationId, conv.agentId, targetAgentId, triggeredBy, false, err);
    return { success: false, skipped: true, error: err };
  }

  // ── 3. Chamar ChatGuru ────────────────────────────────────────────────────
  try {
    const params = new URLSearchParams({
      key: API_KEY,
      account_id: ACCOUNT_ID,
      phone_id: phoneId,
      action: TRANSFER_ACTION,
      chat_number: conv.chatNumber,
      user_id: targetAgent.chatguruUserId,
    });

    const response = await fetch(`${CHATGURU_API}?${params}`, { method: "POST" });
    const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const ok =
      response.ok &&
      (raw.result === "success" || raw.code === 200 || raw.code === 201);

    if (!ok) {
      const err = `ChatGuru retornou ${response.status}: ${JSON.stringify(raw)}`;
      logger.warn({ conversationId, targetAgentId, raw, status: response.status }, "ChatGuru transfer rejected");
      await logTransfer(conversationId, conv.agentId, targetAgentId, triggeredBy, false, err);
      return { success: false, error: err };
    }

    await logTransfer(conversationId, conv.agentId, targetAgentId, triggeredBy, true);
    logger.info({ conversationId, targetAgentId, agent: targetAgent.name }, "ChatGuru transfer ok");
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ conversationId, targetAgentId, err: msg }, "ChatGuru transfer threw");
    await logTransfer(conversationId, conv.agentId, targetAgentId, triggeredBy, false, msg);
    return { success: false, error: msg };
  }
}
