import { Router, Request, Response } from "express";
import { db, conversationsTable, webhookEventsTable, sentMessagesTable } from "@workspace/db";
import { eq, desc, and, gte, count } from "drizzle-orm";
import { logger } from "../lib/logger";
import { getTemplate, TEMPLATES } from "../lib/message-templates";

const router = Router();

const CHATGURU_API = "https://app.zap.guru/api/v1";
const API_KEY = process.env.CHATGURU_API_KEY!;
const ACCOUNT_ID = process.env.CHATGURU_ACCOUNT_ID!;
const PHONE_ID = process.env.CHATGURU_PHONE_ID!;

// Simple in-memory cache (2 min TTL)
const msgCache = new Map<string, { data: ConversationMessages; ts: number }>();
const CACHE_TTL = 2 * 60 * 1000;

interface ChatMessage {
  text: string;
  direction: "incoming" | "outgoing";
  author: string;
  timestamp: string;
  type: "text" | "audio" | "image" | "file";
}

interface ConversationMessages {
  chatNumber: string;
  contactName: string | null;
  messages: ChatMessage[];
  source: "chatguru" | "local";
}

function detectMsgType(rawType: string): ChatMessage["type"] {
  const t = rawType.toLowerCase();
  if (t.includes("audio") || t.includes("ptt")) return "audio";
  if (t.includes("image")) return "image";
  if (t.includes("document") || t.includes("file")) return "file";
  return "text";
}

// Try to parse messages from ChatGuru API
async function fetchFromChatGuru(chatNumber: string): Promise<ChatMessage[] | null> {
  try {
    const params = new URLSearchParams({
      key: API_KEY,
      account_id: ACCOUNT_ID,
      phone_id: PHONE_ID,
      action: "chat_messages",
      chat_number: chatNumber,
      limit: "10",
    });
    const resp = await fetch(`${CHATGURU_API}?${params}`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    const raw = (await resp.json()) as Record<string, unknown>;

    if (raw.result !== "success" && raw.code !== 200 && raw.code !== 201) return null;

    const rawMessages = (raw.messages ?? raw.data ?? raw.chats ?? []) as Array<Record<string, unknown>>;
    if (!Array.isArray(rawMessages) || rawMessages.length === 0) return null;

    return rawMessages.slice(-10).map((m): ChatMessage => {
      const direction: "incoming" | "outgoing" =
        m.direction === "outgoing" || m.type_direction === "out" || m.sent_by === "agent"
          ? "outgoing"
          : "incoming";

      return {
        text: String(m.text ?? m.message ?? m.body ?? ""),
        direction,
        author: String(m.author ?? m.agent_name ?? m.contact_name ?? (direction === "outgoing" ? "Equipe" : "")),
        timestamp: String(m.timestamp ?? m.created_at ?? m.date ?? new Date().toISOString()),
        type: detectMsgType(String(m.message_type ?? m.tipo ?? "text")),
      };
    }).filter(m => m.text || m.type !== "text");

  } catch {
    return null;
  }
}

// Fallback: reconstruct from local webhook_events
async function fetchFromLocal(chatNumber: string, contactName: string | null): Promise<ChatMessage[]> {
  const events = await db.select()
    .from(webhookEventsTable)
    .where(eq(webhookEventsTable.chatNumber, chatNumber))
    .orderBy(desc(webhookEventsTable.receivedAt))
    .limit(10);

  const messages: ChatMessage[] = [];
  for (const ev of events.reverse()) {
    try {
      const raw = JSON.parse(ev.rawPayload) as Record<string, unknown>;
      const text = String(raw.message ?? raw.texto_mensagem ?? "").trim();
      if (!text) continue;

      const agentName = raw.agent ?? raw.responsavel_nome ?? null;
      const direction: "incoming" | "outgoing" = agentName ? "outgoing" : "incoming";

      messages.push({
        text,
        direction,
        author: direction === "outgoing"
          ? String(agentName)
          : String(raw.name ?? raw.nome ?? contactName ?? chatNumber),
        timestamp: ev.receivedAt.toISOString(),
        type: detectMsgType(String(raw.tipo_mensagem ?? "text")),
      });
    } catch {
      // skip malformed
    }
  }
  return messages;
}

// GET /api/conversations/templates
router.get("/templates", (_req: Request, res: Response) => {
  res.json(TEMPLATES.map(t => ({ id: t.id, label: t.label, emoji: t.emoji, description: t.description })));
});

// GET /api/conversations/:chatNumber/messages
router.get("/:chatNumber/messages", async (req: Request, res: Response) => {
  const { chatNumber } = req.params;
  if (!chatNumber) { res.status(400).json({ error: "chatNumber obrigatório" }); return; }

  const cached = msgCache.get(chatNumber);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    res.json(cached.data);
    return;
  }

  try {
    const lead = await db.select({
      contactName: conversationsTable.contactName,
      campaign: conversationsTable.campaign,
    }).from(conversationsTable)
      .where(eq(conversationsTable.chatNumber, chatNumber))
      .limit(1);

    const contactName = lead[0]?.contactName ?? null;

    let messages = await fetchFromChatGuru(chatNumber);
    let source: "chatguru" | "local" = "chatguru";

    if (!messages || messages.length === 0) {
      messages = await fetchFromLocal(chatNumber, contactName);
      source = "local";
    }

    const result: ConversationMessages = {
      chatNumber,
      contactName,
      messages: messages.slice(-5),
      source,
    };

    msgCache.set(chatNumber, { data: result, ts: Date.now() });
    res.json(result);
  } catch (err) {
    logger.error({ err, chatNumber }, "Error fetching messages");
    res.status(500).json({ error: "Erro ao buscar mensagens" });
  }
});

// GET /api/conversations/:chatNumber/sent — last sent message info
router.get("/:chatNumber/sent", async (req: Request, res: Response) => {
  const { chatNumber } = req.params;
  try {
    const last = await db.select()
      .from(sentMessagesTable)
      .where(and(
        eq(sentMessagesTable.chatNumber, chatNumber),
        eq(sentMessagesTable.status, "success"),
      ))
      .orderBy(desc(sentMessagesTable.sentAt))
      .limit(1);

    if (last.length === 0) { res.json({ sent: null }); return; }

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const recentCount = await db.select({ n: count() })
      .from(sentMessagesTable)
      .where(and(
        eq(sentMessagesTable.chatNumber, chatNumber),
        gte(sentMessagesTable.sentAt, twoHoursAgo),
      ));

    res.json({
      sent: {
        templateId: last[0].templateId,
        messageText: last[0].messageText,
        sentBy: last[0].sentBy,
        sentAt: last[0].sentAt,
        recentCount: Number(recentCount[0]?.n ?? 0),
      },
    });
  } catch (err) {
    logger.error({ err, chatNumber }, "Error fetching sent info");
    res.status(500).json({ sent: null });
  }
});

// POST /api/conversations/:chatNumber/send
router.post("/:chatNumber/send", async (req: Request, res: Response) => {
  const { chatNumber } = req.params;
  const { templateId, customMessage } = (req.body ?? {}) as { templateId?: string; customMessage?: string };

  if (!chatNumber) { res.status(400).json({ ok: false, error: "chatNumber obrigatório" }); return; }
  if (!templateId && !customMessage) { res.status(400).json({ ok: false, error: "templateId ou customMessage obrigatório" }); return; }

  // Rate limit: max 4 messages per chatNumber in last 2h
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const recentSent = await db.select({ n: count() })
    .from(sentMessagesTable)
    .where(and(
      eq(sentMessagesTable.chatNumber, chatNumber),
      gte(sentMessagesTable.sentAt, twoHoursAgo),
    ));

  if (Number(recentSent[0]?.n ?? 0) >= 4) {
    res.status(429).json({
      ok: false,
      error: "Você já enviou 4 mensagens nas últimas 2h. Aguarde antes de mandar mais.",
      rateLimit: true,
    });
    return;
  }

  try {
    const lead = await db.select({
      contactName: conversationsTable.contactName,
      campaign: conversationsTable.campaign,
    }).from(conversationsTable)
      .where(eq(conversationsTable.chatNumber, chatNumber))
      .limit(1);

    const contactName = lead[0]?.contactName ?? "";
    const campaign = lead[0]?.campaign ?? null;

    let messageText: string;
    if (customMessage) {
      // Replace {nome} with first name
      const firstName = contactName.trim().split(/\s+/)[0] ?? "tudo bem";
      messageText = customMessage.replace(/\{nome\}/gi, firstName);
    } else {
      const template = getTemplate(templateId!);
      if (!template) { res.status(400).json({ ok: false, error: "Template não encontrado" }); return; }
      messageText = template.text({ nome: contactName, campanha: campaign });
    }

    // Schedule 1 minute ahead
    const sendDate = new Date(Date.now() + 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const sendDateStr = `${sendDate.getFullYear()}-${pad(sendDate.getMonth() + 1)}-${pad(sendDate.getDate())} ${pad(sendDate.getHours())}:${pad(sendDate.getMinutes())}`;

    const params = new URLSearchParams({
      key: API_KEY,
      account_id: ACCOUNT_ID,
      phone_id: PHONE_ID,
      action: "message_send",
      chat_number: chatNumber,
      text: messageText,
      send_date: sendDateStr,
    });

    const response = await fetch(`${CHATGURU_API}?${params}`, { method: "POST" });
    const raw = (await response.json()) as Record<string, unknown>;
    const ok = raw.result === "success" || raw.code === 201 || raw.code === 200;

    const session = (req as any).session;
    const sentBy = session?.user?.role === "admin" ? "Eduardo" : "Equipe";

    await db.insert(sentMessagesTable).values({
      chatNumber,
      templateId: templateId ?? "custom",
      messageText,
      sentBy,
      chatguruResponse: raw as any,
      status: ok ? "success" : "error",
    });

    // Invalidate cache
    msgCache.delete(chatNumber);

    logger.info({ chatNumber, templateId, ok, sentBy }, "Template message sent");
    res.json({
      ok,
      messageText,
      messageId: raw.message_id ?? null,
      error: ok ? undefined : String(raw.description ?? raw.error ?? "Erro ao enviar"),
    });
  } catch (err) {
    logger.error({ err, chatNumber }, "Error sending template message");
    res.status(500).json({ ok: false, error: "Erro interno ao enviar mensagem" });
  }
});

export default router;
