/**
 * Endpoints de reengajamento + descarte + pass-to-closer.
 *
 * Substitui o uso direto de /api/chatguru/send-message pela página /reengagement.
 * Cada disparo:
 *   1. Sincroniza atribuição CRM ↔ ChatGuru (se action configurada).
 *   2. Envia a mensagem.
 *   3. Persiste 1 linha em reengagement_attempts.
 *   4. Atualiza reengagement_count e last_reengagement_at na conversation.
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import { eq, and, or, lt, gte, desc, sql, inArray, isNull, isNotNull, count } from "drizzle-orm";
import {
  db,
  conversationsTable,
  reengagementAttemptsTable,
  agentsTable,
  whatsappNumbersTable,
  usersTable,
  statusHistoryTable,
} from "@workspace/db";
import { logger } from "../lib/logger";
import { getSessionData, canSeeAllLeads, canReassign } from "../lib/auth";
import { transferLeadInChatGuru } from "../lib/chatguru-transfer";

const router = Router();

const CHATGURU_API = "https://s22.chatguru.app/api/v1";
const API_KEY = process.env.CHATGURU_API_KEY;
const ACCOUNT_ID = process.env.CHATGURU_ACCOUNT_ID;
const PHONE_ID_DEFAULT = process.env.CHATGURU_PHONE_ID;

// Status onde o lead pode receber reengajamento
const REENGAGEABLE_STATUSES = ["lead_novo", "lead_qualificado", "follow_up"];
// Status onde o lead NÃO pode mais ser descartado em massa
const FINAL_STATUSES = [
  "contrato_assinado",
  "cliente_ativo",
  "cliente_procedente",
  "lead_descartado",
];

async function resolveChatGuruPhoneId(whatsappNumberId?: number | null): Promise<string | null> {
  if (whatsappNumberId) {
    const [waNum] = await db
      .select({ chatguruPhoneId: whatsappNumbersTable.chatguruPhoneId })
      .from(whatsappNumbersTable)
      .where(eq(whatsappNumbersTable.id, whatsappNumberId))
      .limit(1);
    if (waNum?.chatguruPhoneId) return waNum.chatguruPhoneId;
  }
  return PHONE_ID_DEFAULT ?? null;
}

async function sendChatGuruMessage(opts: {
  chatNumber: string;
  message: string;
  phoneId: string;
}): Promise<{ ok: boolean; messageId?: string | null; error?: string }> {
  if (!API_KEY || !ACCOUNT_ID) {
    return { ok: false, error: "CHATGURU_API_KEY/ACCOUNT_ID não configurados" };
  }
  // ChatGuru espera horário de Brasília
  const sendDateStr = new Date()
    .toLocaleString("sv-SE", { timeZone: "America/Recife" })
    .slice(0, 16)
    .replace("T", " ");
  const params = new URLSearchParams({
    key: API_KEY,
    account_id: ACCOUNT_ID,
    phone_id: opts.phoneId,
    action: "message_send",
    chat_number: opts.chatNumber,
    text: opts.message,
    send_date: sendDateStr,
  });
  try {
    const response = await fetch(`${CHATGURU_API}?${params}`, { method: "POST" });
    const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const ok = raw.result === "success" || raw.code === 200 || raw.code === 201;
    return {
      ok,
      messageId: (raw.message_id as string | null | undefined) ?? null,
      error: ok ? undefined : (raw.description as string) ?? "Erro desconhecido",
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── POST /api/reengagement/send ─────────────────────────────────────────────
// Body: { conversationId, message, whatsappNumberId? }
// 1. Garante permissão (admin/agent_taskforce/agent dono).
// 2. Sincroniza atribuição CRM ↔ ChatGuru (best-effort).
// 3. Envia mensagem via ChatGuru.
// 4. Registra tentativa.
const sendBodySchema = z.object({
  conversationId: z.number().int().positive(),
  message: z.string().min(1).max(2000),
  whatsappNumberId: z.number().int().positive().optional(),
});

router.post("/send", async (req: Request, res: Response) => {
  const session = getSessionData(req);
  if (!session) {
    res.status(401).json({ ok: false, error: "Não autenticado" });
    return;
  }

  const parsed = sendBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.message });
    return;
  }
  const { conversationId, message, whatsappNumberId } = parsed.data;

  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, conversationId))
    .limit(1);

  if (!conv) {
    res.status(404).json({ ok: false, error: "Conversa não encontrada" });
    return;
  }

  // Ownership: agent comum só dispara nos próprios leads
  if (session.role === "agent" && session.agentId !== conv.agentId) {
    res.status(403).json({ ok: false, error: "Lead pertence a outro atendente" });
    return;
  }

  // Resolver user pra rastreabilidade
  let userId: number | undefined;
  let userAgentId: number | null = null;
  if (session.username) {
    const [user] = await db
      .select({ id: usersTable.id, agentId: usersTable.agentId })
      .from(usersTable)
      .where(eq(usersTable.username, session.username))
      .limit(1);
    if (user) {
      userId = user.id;
      userAgentId = user.agentId;
    }
  }

  // ── Sincronização ChatGuru: se quem dispara tem agentId vinculado e é diferente
  //    do atual, transferir o lead (best-effort, não bloqueante).
  let transferAttempted = false;
  let transferOk = false;
  let transferSkipped = false;
  let transferError: string | undefined;
  if (userAgentId && userAgentId !== conv.agentId) {
    transferAttempted = true;
    const result = await transferLeadInChatGuru(conversationId, userAgentId, "reengagement_send");
    transferOk = result.success;
    transferSkipped = !!result.skipped;
    transferError = result.error;
    // Atribui no CRM internamente independente da transferência ChatGuru
    const [agent] = await db
      .select({ name: agentsTable.name })
      .from(agentsTable)
      .where(eq(agentsTable.id, userAgentId))
      .limit(1);
    await db
      .update(conversationsTable)
      .set({
        agentId: userAgentId,
        assignedAgent: agent?.name ?? conv.assignedAgent,
        updatedAt: new Date(),
      })
      .where(eq(conversationsTable.id, conversationId));
  }

  // ── Enviar mensagem ───────────────────────────────────────────────────────
  const phoneId = await resolveChatGuruPhoneId(whatsappNumberId ?? conv.whatsappNumberId ?? null);
  if (!phoneId) {
    res.status(400).json({
      ok: false,
      error: "phone_id do ChatGuru não configurado pra esse número de WhatsApp",
    });
    return;
  }

  const sendResult = await sendChatGuruMessage({
    chatNumber: conv.chatNumber,
    message,
    phoneId,
  });

  if (!sendResult.ok) {
    res.status(502).json({
      ok: false,
      error: sendResult.error ?? "Falha ao enviar mensagem ChatGuru",
      transfer: transferAttempted ? { ok: transferOk, skipped: transferSkipped, error: transferError } : undefined,
    });
    return;
  }

  // ── Registrar tentativa + atualizar contador ──────────────────────────────
  const attemptNumber = (conv.reengagementCount ?? 0) + 1;
  await db.insert(reengagementAttemptsTable).values({
    conversationId,
    sentByUserId: userId ?? null,
    sentByName: session.username,
    messageText: message,
    attemptNumber,
    leadResponded: false,
  });

  await db
    .update(conversationsTable)
    .set({
      reengagementCount: attemptNumber,
      lastReengagementAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(conversationsTable.id, conversationId));

  logger.info(
    {
      conversationId,
      attemptNumber,
      sentBy: session.username,
      transferAttempted,
      transferOk,
      transferSkipped,
    },
    "Reengagement sent",
  );

  res.json({
    ok: true,
    attemptNumber,
    messageId: sendResult.messageId,
    transfer: transferAttempted
      ? { ok: transferOk, skipped: transferSkipped, error: transferError }
      : undefined,
  });
});

// ─── GET /api/reengagement/list ──────────────────────────────────────────────
// Lista enriquecida com reengagementCount, leadResponded da última tentativa, etc.
// Filtros: ?attemptState=never|once|twice|three_plus|responded ?lastAttempt=today|24h|2_3d|4_7d|8_14d|15_30d|30_plus
//          ?status=lead_novo,lead_qualificado ?sentByUserId=X ?whatsappNumberId=X ?days=N
router.get("/list", async (req: Request, res: Response) => {
  const session = getSessionData(req);
  if (!session) {
    res.status(401).json({ ok: false, error: "Não autenticado" });
    return;
  }

  const days = Math.max(1, Math.min(180, Number(req.query.days) || 3));
  const attemptState = String(req.query.attemptState ?? "");
  const lastAttempt = String(req.query.lastAttempt ?? "");
  const sentByUserId = req.query.sentByUserId ? Number(req.query.sentByUserId) : null;
  const waIdParam = req.query.whatsappNumberId ? Number(req.query.whatsappNumberId) : null;
  const statusParam = String(req.query.status ?? "");

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const conditions: any[] = [
    inArray(conversationsTable.status, REENGAGEABLE_STATUSES),
    or(
      and(isNotNull(conversationsTable.lastMessageAt), lt(conversationsTable.lastMessageAt, cutoff)),
      and(isNull(conversationsTable.lastMessageAt), lt(conversationsTable.createdAt, cutoff)),
    ),
  ];

  // Agent comum só vê os próprios
  if (session.role === "agent" && session.agentId) {
    conditions.push(eq(conversationsTable.agentId, session.agentId));
  }

  if (waIdParam) conditions.push(eq(conversationsTable.whatsappNumberId, waIdParam));

  if (statusParam) {
    const list = statusParam.split(",").map((s) => s.trim()).filter(Boolean);
    if (list.length === 1) conditions.push(eq(conversationsTable.status, list[0]));
    else if (list.length > 1) conditions.push(inArray(conversationsTable.status, list));
  }

  // Filtro por estado de tentativa
  switch (attemptState) {
    case "never":
      conditions.push(eq(conversationsTable.reengagementCount, 0));
      break;
    case "once":
      conditions.push(eq(conversationsTable.reengagementCount, 1));
      break;
    case "twice":
      conditions.push(eq(conversationsTable.reengagementCount, 2));
      break;
    case "three_plus":
      conditions.push(sql`${conversationsTable.reengagementCount} >= 3`);
      break;
    case "responded":
      // pelo menos 1 attempt com leadResponded=true
      conditions.push(
        sql`EXISTS (SELECT 1 FROM ${reengagementAttemptsTable} ra WHERE ra.conversation_id = ${conversationsTable.id} AND ra.lead_responded = true)`,
      );
      break;
  }

  // Filtro por janela do último disparo
  const now = Date.now();
  const ranges: Record<string, [number, number] | null> = {
    today: [0, 24 * 3600 * 1000],
    "24h": [0, 24 * 3600 * 1000],
    "2_3d": [1 * 86400000, 3 * 86400000],
    "4_7d": [3 * 86400000, 7 * 86400000],
    "8_14d": [7 * 86400000, 14 * 86400000],
    "15_30d": [14 * 86400000, 30 * 86400000],
    "30_plus": [30 * 86400000, Number.MAX_SAFE_INTEGER],
  };
  const range = ranges[lastAttempt];
  if (range) {
    const [minAgo, maxAgo] = range;
    conditions.push(isNotNull(conversationsTable.lastReengagementAt));
    if (maxAgo !== Number.MAX_SAFE_INTEGER) {
      conditions.push(gte(conversationsTable.lastReengagementAt, new Date(now - maxAgo)));
    }
    conditions.push(lt(conversationsTable.lastReengagementAt, new Date(now - minAgo)));
  }

  // Filtro por quem disparou — exige join, fazemos sub-select
  if (sentByUserId) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM ${reengagementAttemptsTable} ra WHERE ra.conversation_id = ${conversationsTable.id} AND ra.sent_by_user_id = ${sentByUserId})`,
    );
  }

  const rows = await db
    .select({
      id: conversationsTable.id,
      chatNumber: conversationsTable.chatNumber,
      contactName: conversationsTable.contactName,
      status: conversationsTable.status,
      assignedAgent: conversationsTable.assignedAgent,
      agentId: conversationsTable.agentId,
      campaign: conversationsTable.campaign,
      lastMessageAt: conversationsTable.lastMessageAt,
      createdAt: conversationsTable.createdAt,
      updatedAt: conversationsTable.updatedAt,
      whatsappNumberId: conversationsTable.whatsappNumberId,
      reengagementCount: conversationsTable.reengagementCount,
      lastReengagementAt: conversationsTable.lastReengagementAt,
    })
    .from(conversationsTable)
    .where(and(...conditions))
    .orderBy(conversationsTable.lastMessageAt)
    .limit(500);

  // Pra cada lead, buscar status do último attempt (responded ou não)
  const ids = rows.map((r) => r.id);
  let lastAttemptResponded = new Map<number, boolean>();
  if (ids.length > 0) {
    const lastAttempts = await db.execute(sql`
      SELECT DISTINCT ON (conversation_id) conversation_id, lead_responded
      FROM ${reengagementAttemptsTable}
      WHERE conversation_id = ANY(${ids}::int[])
      ORDER BY conversation_id, sent_at DESC
    `);
    for (const r of lastAttempts.rows as any[]) {
      lastAttemptResponded.set(Number(r.conversation_id), Boolean(r.lead_responded));
    }
  }

  const leads = rows.map((r) => ({
    ...r,
    lastAttemptResponded: lastAttemptResponded.get(r.id) ?? null,
  }));

  res.json({ leads, days, total: leads.length });
});

// ─── GET /api/reengagement/conversation/:id/attempts ─────────────────────────
// Histórico de tentativas de uma conversa (pra timeline no modal).
router.get("/conversation/:id/attempts", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ ok: false });
    return;
  }
  const session = getSessionData(req);
  if (session?.role === "agent" && session.agentId) {
    const [conv] = await db
      .select({ agentId: conversationsTable.agentId })
      .from(conversationsTable)
      .where(eq(conversationsTable.id, id))
      .limit(1);
    if (!conv || conv.agentId !== session.agentId) {
      res.status(403).json({ ok: false });
      return;
    }
  }
  const attempts = await db
    .select()
    .from(reengagementAttemptsTable)
    .where(eq(reengagementAttemptsTable.conversationId, id))
    .orderBy(desc(reengagementAttemptsTable.sentAt));
  res.json({ attempts });
});

// ─── GET /api/reengagement/senders ───────────────────────────────────────────
// Lista de quem já disparou pelo menos 1 reengajamento (pra dropdown de filtro).
router.get("/senders", async (_req: Request, res: Response) => {
  const rows = await db.execute(sql`
    SELECT DISTINCT sent_by_user_id, sent_by_name, COUNT(*)::int as total
    FROM ${reengagementAttemptsTable}
    WHERE sent_by_user_id IS NOT NULL
    GROUP BY sent_by_user_id, sent_by_name
    ORDER BY total DESC
  `);
  res.json({
    senders: (rows.rows as any[]).map((r) => ({
      userId: Number(r.sent_by_user_id),
      name: r.sent_by_name,
      total: Number(r.total),
    })),
  });
});

// ─── GET /api/reengagement/suggest-discards ──────────────────────────────────
// Leads candidatos a descarte: 2+ tentativas, último attempt sem resposta, +7 dias.
router.get("/suggest-discards", async (req: Request, res: Response) => {
  const session = getSessionData(req);
  if (!session) {
    res.status(401).json({ ok: false });
    return;
  }
  const minDaysSilence = Math.max(1, Number(req.query.minDays) || 7);
  const minAttempts = Math.max(1, Number(req.query.minAttempts) || 2);
  const cutoff = new Date(Date.now() - minDaysSilence * 86400000);

  const conditions: any[] = [
    sql`${conversationsTable.reengagementCount} >= ${minAttempts}`,
    isNotNull(conversationsTable.lastReengagementAt),
    lt(conversationsTable.lastReengagementAt, cutoff),
    sql`${conversationsTable.status} NOT IN (${sql.join(FINAL_STATUSES.map((s) => sql`${s}`), sql`, `)})`,
    // Último attempt SEM resposta
    sql`NOT EXISTS (
      SELECT 1 FROM ${reengagementAttemptsTable} ra
      WHERE ra.conversation_id = ${conversationsTable.id}
        AND ra.lead_responded = true
        AND ra.sent_at = (
          SELECT MAX(sent_at) FROM ${reengagementAttemptsTable}
          WHERE conversation_id = ${conversationsTable.id}
        )
    )`,
  ];

  if (session.role === "agent" && session.agentId) {
    conditions.push(eq(conversationsTable.agentId, session.agentId));
  }

  const leads = await db
    .select({
      id: conversationsTable.id,
      chatNumber: conversationsTable.chatNumber,
      contactName: conversationsTable.contactName,
      status: conversationsTable.status,
      campaign: conversationsTable.campaign,
      reengagementCount: conversationsTable.reengagementCount,
      lastReengagementAt: conversationsTable.lastReengagementAt,
      assignedAgent: conversationsTable.assignedAgent,
      whatsappNumberId: conversationsTable.whatsappNumberId,
    })
    .from(conversationsTable)
    .where(and(...conditions))
    .orderBy(conversationsTable.lastReengagementAt)
    .limit(1000);

  res.json({
    leads,
    total: leads.length,
    criteria: { minDaysSilence, minAttempts },
  });
});

// ─── POST /api/reengagement/discard-bulk ─────────────────────────────────────
// Marca um lote como lead_descartado. Body: { ids: number[], reason?: string }
const discardBodySchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(2000),
  reason: z.string().max(200).optional(),
});

router.post("/discard-bulk", async (req: Request, res: Response) => {
  const session = getSessionData(req);
  if (!canSeeAllLeads(session?.role) && session?.role !== "agent") {
    res.status(403).json({ ok: false, error: "Sem permissão" });
    return;
  }
  const parsed = discardBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.message });
    return;
  }
  const { ids, reason } = parsed.data;
  const reasonText = reason ?? "SUMIU_2_TENTATIVAS";

  // Filtro de ownership pra agent comum
  let allowedIds = ids;
  if (session?.role === "agent" && session.agentId) {
    const owned = await db
      .select({ id: conversationsTable.id })
      .from(conversationsTable)
      .where(and(inArray(conversationsTable.id, ids), eq(conversationsTable.agentId, session.agentId)));
    allowedIds = owned.map((r) => r.id);
  }

  if (allowedIds.length === 0) {
    res.json({ ok: true, updated: 0, skipped: ids.length });
    return;
  }

  // Buscar status atual pra logar transições
  const before = await db
    .select({ id: conversationsTable.id, status: conversationsTable.status })
    .from(conversationsTable)
    .where(inArray(conversationsTable.id, allowedIds));

  await db
    .update(conversationsTable)
    .set({ status: "lead_descartado", discardReason: reasonText, updatedAt: new Date() })
    .where(inArray(conversationsTable.id, allowedIds));

  // Log de transições
  if (before.length > 0) {
    await db.insert(statusHistoryTable).values(
      before.map((row) => ({
        conversationId: row.id,
        fromStatus: row.status,
        toStatus: "lead_descartado",
        changedBy: "manual",
        notes: `Descarte em massa — motivo: ${reasonText} — por: ${session?.username ?? "?"}`,
      })),
    );
  }

  res.json({ ok: true, updated: allowedIds.length, skipped: ids.length - allowedIds.length });
});

// ─── POST /api/reengagement/pass-to-closer ────────────────────────────────────
// Reatribui o lead pro Thiago/Tammy fechar. Body: { conversationId, toAgentId }
const passBodySchema = z.object({
  conversationId: z.number().int().positive(),
  toAgentId: z.number().int().positive(),
});

router.post("/pass-to-closer", async (req: Request, res: Response) => {
  const session = getSessionData(req);
  if (!canReassign(session?.role)) {
    res.status(403).json({ ok: false, error: "Sem permissão pra reatribuir" });
    return;
  }
  const parsed = passBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.message });
    return;
  }
  const { conversationId, toAgentId } = parsed.data;

  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, conversationId))
    .limit(1);

  if (!conv) {
    res.status(404).json({ ok: false, error: "Conversa não encontrada" });
    return;
  }

  const [targetAgent] = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.id, toAgentId))
    .limit(1);

  if (!targetAgent || targetAgent.team !== "COMERCIAL_TRAFEGO") {
    res
      .status(400)
      .json({ ok: false, error: "Destinatário precisa ser do time COMERCIAL_TRAFEGO" });
    return;
  }

  // Sincronizar com ChatGuru (não bloqueia se falhar)
  const transferResult = await transferLeadInChatGuru(conversationId, toAgentId, "pass_to_closer");

  // Atualizar atribuição interna + adicionar nota
  const fromName = conv.assignedAgent ?? "—";
  const noteText = `Passado por ${session?.username ?? "?"} em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Recife" })} pra ${targetAgent.name} fechar.`;
  const existingNotes = conv.notes ?? "";
  const newNotes = existingNotes ? `${existingNotes}\n\n${noteText}` : noteText;

  await db
    .update(conversationsTable)
    .set({
      agentId: toAgentId,
      assignedAgent: targetAgent.name,
      notes: newNotes,
      updatedAt: new Date(),
    })
    .where(eq(conversationsTable.id, conversationId));

  await db.insert(statusHistoryTable).values({
    conversationId,
    fromStatus: conv.status,
    toStatus: conv.status,
    changedBy: "manual",
    notes: `pass_to_closer: ${fromName} → ${targetAgent.name}`,
  });

  res.json({
    ok: true,
    transfer: { ok: transferResult.success, skipped: transferResult.skipped, error: transferResult.error },
  });
});

// ─── Fallback compat: endpoint que a página /reengagement antiga consome ──
// Mantém a rota /api/conversations/reengagement funcional pra não quebrar
// nada enquanto o frontend novo não vai pra produção.
router.get("/legacy", async (_req: Request, res: Response) => {
  res.json({ leads: [], total: 0, days: 0, deprecated: true });
});

export default router;
