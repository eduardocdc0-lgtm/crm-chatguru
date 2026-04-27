import { Router, Request, Response } from "express";
import { db, conversationsTable, webhookEventsTable, whatsappNumbersTable, agentsTable, statusHistoryTable } from "@workspace/db";
import { eq, desc, count, and, or, isNull, sql, gte, asc } from "drizzle-orm";
import {
  ChatguruWebhookBody,
  ListConversationsQueryParams,
  CheckChatStatusBody,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { identifyCampaign } from "../lib/campaign";
import { detectDisease } from "../lib/disease";

const router = Router();

const CHATGURU_API = "https://app.zap.guru/api/v1";
const API_KEY = process.env.CHATGURU_API_KEY!;
const ACCOUNT_ID = process.env.CHATGURU_ACCOUNT_ID!;
const PHONE_ID = process.env.CHATGURU_PHONE_ID!;

// Pipeline de status do CRM:
// lead_novo → lead_qualificado → em_atendimento → follow_up
//           → contrato_assinado → cliente_ativo → cliente_procedente → lead_descartado
const PIPELINE_STATUSES = new Set([
  "lead_novo", "lead_qualificado", "em_atendimento", "follow_up",
  "contrato_assinado", "cliente_ativo", "cliente_procedente", "lead_descartado",
]);

// Mapeia status do ChatGuru para nosso pipeline
function mapStatus(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase().trim();
  // Novos valores nativos — passa direto
  if (PIPELINE_STATUSES.has(s)) return s;
  // Legado → novo pipeline
  if (s === "aberto" || s === "open" || s === "unknown") return "lead_novo";
  if (s === "em atendimento" || s === "in_progress" || s === "atendimento") return "em_atendimento";
  if (s === "aguardando" || s === "waiting") return "lead_qualificado";
  if (s === "resolvido" || s === "resolved") return "contrato_assinado";
  if (s === "fechado" || s === "closed") return "lead_descartado";
  return null; // não reconhecido → preservar status atual
}

/**
 * Round-robin: retorna o agente ativo do time especificado com MENOR
 * quantidade de leads já atribuídos. Em empate, usa o de menor ID (criado primeiro).
 */
async function pickRoundRobinAgent(team: string): Promise<{ id: number; name: string } | null> {
  // Busca agentes ativos do time
  const agents = await db.select({ id: agentsTable.id, name: agentsTable.name })
    .from(agentsTable)
    .where(and(eq(agentsTable.team, team), eq(agentsTable.active, true)))
    .orderBy(asc(agentsTable.id));

  if (agents.length === 0) return null;

  // Conta leads atuais de cada agente
  const counts = await db.select({
    agentId: conversationsTable.agentId,
    total: count(),
  }).from(conversationsTable)
    .where(sql`${conversationsTable.agentId} = ANY(ARRAY[${sql.join(agents.map(a => sql`${a.id}`), sql`, `)}]::integer[])`)
    .groupBy(conversationsTable.agentId);

  const countMap = new Map(counts.map(c => [c.agentId, Number(c.total)]));

  // Escolhe o agente com menor contagem; empate → menor id
  let best = agents[0];
  let bestCount = countMap.get(best.id) ?? 0;
  for (const agent of agents.slice(1)) {
    const c = countMap.get(agent.id) ?? 0;
    if (c < bestCount) { best = agent; bestCount = c; }
  }

  return best;
}

router.post("/webhook", async (req: Request, res: Response) => {
  try {
    const raw = req.body ?? {};
    req.log.info({ raw }, "Webhook received");

    await db.insert(webhookEventsTable).values({
      chatNumber: raw.chat_number ?? null,
      rawPayload: JSON.stringify(raw),
    });

    const chatNumber = raw.chat_number ?? raw.celular ?? raw.chat_id ?? null;
    const contactName = raw.name ?? raw.nome ?? null;
    const agentName = raw.agent ?? raw.responsavel_nome ?? null;
    const lastMsg = raw.message ?? raw.texto_mensagem ?? null;
    const rawStatus = raw.status ?? null;

    if (!chatNumber) {
      res.json({ ok: true });
      return;
    }

    const status = mapStatus(rawStatus);

    // Extrair contextData (campos não-mapeados)
    const knownFields = new Set([
      "chat_number", "name", "status", "agent", "message", "phone_id", "account_id", "key",
      "celular", "nome", "responsavel_nome", "texto_mensagem", "email",
      "responsavel_email", "chat_id", "tipo_mensagem", "executado_por",
    ]);
    const contextData: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (!knownFields.has(k) && v !== null && v !== undefined && v !== "" &&
        !(Array.isArray(v) && v.length === 0) &&
        !(typeof v === "object" && v !== null && Object.keys(v as object).length === 0)) {
        contextData[k] = v;
      }
    }
    const hasContext = Object.keys(contextData).length > 0;

    // Identificar número de WhatsApp de destino (origem do lead)
    const rawPhoneId = raw.phone_id ?? raw.celular_destino ?? null;
    let whatsappNumberId: number | null = null;
    let whatsappTeam: string | null = null;
    if (rawPhoneId) {
      const phoneClean = String(rawPhoneId).replace(/\D/g, "");
      const numRow = await db.select().from(whatsappNumbersTable)
        .where(eq(whatsappNumbersTable.number, phoneClean)).limit(1);
      if (numRow.length > 0) {
        whatsappNumberId = numRow[0].id;
        whatsappTeam = (numRow[0] as any).team ?? null;
      }
    }

    // Identificar agente pelo nome vindo do webhook (para updates)
    let agentId: number | null = null;
    if (agentName) {
      const agentRow = await db.select().from(agentsTable)
        .where(eq(agentsTable.name, agentName)).limit(1);
      if (agentRow.length > 0) agentId = agentRow[0].id;
    }

    const existing = await db.select()
      .from(conversationsTable)
      .where(eq(conversationsTable.chatNumber, String(chatNumber)))
      .limit(1);

    if (existing.length > 0) {
      // UPDATE: preserva o agentId atribuído internamente; só sobrescreve se webhook trouxer agente válido
      const existingAgentId = existing[0].agentId;
      const finalAgentId = agentId ?? existingAgentId;
      const finalAgentName = agentId ? agentName : existing[0].assignedAgent;

      // ── Determinar novo status ──────────────────────────────────────────────
      // Se ChatGuru enviou status explícito → mapear; senão → preservar o atual
      const mappedStatus = mapStatus(rawStatus);
      let newStatus = mappedStatus ?? existing[0].status;
      const prevStatus = existing[0].status;

      // ── Detecção de transição Bot → Humano ─────────────────────────────────
      // Se o lead não tinha agente humano E agora tem → LEAD QUALIFICADO
      const wasUnassigned = !existingAgentId;
      const nowAssigned = !!agentId; // agentId != null → agente existe na nossa tabela
      const isUpgradeableStatus = ["lead_novo", "open", "unknown", "waiting", "lead_qualificado"].includes(prevStatus);

      if (wasUnassigned && nowAssigned && isUpgradeableStatus) {
        newStatus = "lead_qualificado";
        // Registrar transição no histórico
        await db.insert(statusHistoryTable).values({
          conversationId: existing[0].id,
          fromStatus: prevStatus,
          toStatus: "lead_qualificado",
          changedBy: "system",
          notes: `Bot transferiu para atendente humano: ${agentName}`,
        });
        req.log.info({ chatNumber, from: prevStatus, to: "lead_qualificado", agent: agentName }, "Auto-transition: bot→human");
      }

      const prevContext = (existing[0].contextData as Record<string, unknown>) ?? {};
      await db.update(conversationsTable).set({
        contactName: contactName ?? existing[0].contactName,
        status: newStatus,
        assignedAgent: finalAgentName ?? existing[0].assignedAgent,
        agentId: finalAgentId,
        lastMessage: lastMsg ?? existing[0].lastMessage,
        lastMessageAt: new Date(),
        whatsappNumberId: whatsappNumberId ?? existing[0].whatsappNumberId,
        contextData: hasContext ? { ...prevContext, ...contextData } : existing[0].contextData,
        updatedAt: new Date(),
      }).where(eq(conversationsTable.chatNumber, String(chatNumber)));

    } else {
      // INSERT: lead novo — sempre começa em lead_novo
      const firstMsg = lastMsg ?? null;
      const campaign = identifyCampaign(firstMsg);

      // Round-robin automático para número Comercial (COMERCIAL_TRAFEGO)
      let finalAgentId: number | null = agentId;
      let finalAgentName: string | null = agentName;

      if (!finalAgentId) {
        const picked = await pickRoundRobinAgent("COMERCIAL_TRAFEGO");
        if (picked) {
          finalAgentId = picked.id;
          finalAgentName = picked.name;
        }
      }

      // Status inicial: lead_qualificado SOMENTE se o webhook já trouxer agente humano atribuído
      // Round-robin não conta — agente atribuído internamente não qualifica o lead automaticamente
      const initialStatus = agentId ? "lead_qualificado" : "lead_novo";

      const disease = detectDisease([firstMsg]);

      await db.insert(conversationsTable).values({
        chatNumber: String(chatNumber),
        contactName: contactName ?? null,
        status: initialStatus,
        assignedAgent: finalAgentName ?? null,
        agentId: finalAgentId,
        lastMessage: firstMsg,
        lastMessageAt: new Date(),
        contextData: hasContext ? contextData : null,
        whatsappNumberId,
        firstMessage: firstMsg,
        campaign,
        disease,
      });

      req.log.info({ chatNumber, campaign, agentId: finalAgentId, agentName: finalAgentName, status: initialStatus }, "New lead created");
    }

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error processing webhook");
    res.json({ ok: false });
  }
});

// ─── MIGRATE: reclassificar campanhas retroativamente ────────────────────────
router.post("/migrate/campaigns", async (req: Request, res: Response) => {
  try {
    // force=true: reclassifica TODOS; false (default): apenas null ou INDEFINIDA
    const allLeads = await db.select({
      id: conversationsTable.id,
      firstMessage: conversationsTable.firstMessage,
      lastMessage: conversationsTable.lastMessage,
      campaign: conversationsTable.campaign,
    }).from(conversationsTable)
      .where(req.body?.force ? undefined : or(
        isNull(conversationsTable.campaign),
        eq(conversationsTable.campaign, "INDEFINIDA"),
      ));

    let updated = 0;
    let reclassified = 0;
    const byCampaign: Record<string, number> = {};

    for (const lead of allLeads) {
      // Fallback: usa lastMessage quando firstMessage é null (leads antigos)
      const msgToAnalyze = lead.firstMessage || lead.lastMessage;
      const newCampaign = identifyCampaign(msgToAnalyze);

      // Atualiza firstMessage se estava null (preservar para o futuro)
      const updateData: Record<string, unknown> = { campaign: newCampaign, updatedAt: new Date() };
      if (!lead.firstMessage && lead.lastMessage) {
        updateData.firstMessage = lead.lastMessage;
      }

      await db.update(conversationsTable)
        .set(updateData as any)
        .where(eq(conversationsTable.id, lead.id));

      updated++;
      if (newCampaign !== "INDEFINIDA") reclassified++;
      byCampaign[newCampaign] = (byCampaign[newCampaign] || 0) + 1;
    }

    res.json({ ok: true, updated, reclassified, byCampaign });
  } catch (err) {
    req.log.error({ err }, "Campaign migration failed");
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// ─── MIGRATE: redistribuir agentes em round-robin ────────────────────────────
router.post("/migrate/agents", async (req: Request, res: Response) => {
  try {
    // Auto-seed agentes se tabela estiver vazia (produção)
    const existingAgents = await db.select({ id: agentsTable.id }).from(agentsTable).limit(1);
    if (existingAgents.length === 0) {
      await db.insert(agentsTable).values([
        { name: "Thiago Tavares", team: "COMERCIAL_TRAFEGO", active: true },
        { name: "Tammyres",       team: "COMERCIAL_TRAFEGO", active: true },
        { name: "Letícia",        team: "ATENDIMENTO",       active: true },
        { name: "Marília",        team: "ATENDIMENTO",       active: true },
        { name: "Alice",          team: "ATENDIMENTO",       active: true },
        { name: "Cau",            team: "ATENDIMENTO",       active: true },
      ]);
    }

    // Busca agentes COMERCIAL_TRAFEGO ativos por ordem de criação
    const comercialAgents = await db.select({ id: agentsTable.id, name: agentsTable.name })
      .from(agentsTable)
      .where(and(eq(agentsTable.team, "COMERCIAL_TRAFEGO"), eq(agentsTable.active, true)))
      .orderBy(asc(agentsTable.id));

    if (comercialAgents.length === 0) {
      res.json({ ok: false, error: "Nenhum agente COMERCIAL_TRAFEGO ativo" });
      return;
    }

    // Pega todos os leads sem agente atribuído OU todos (se force=true)
    const leadsQuery = req.body?.force
      ? db.select({ id: conversationsTable.id }).from(conversationsTable).orderBy(asc(conversationsTable.id))
      : db.select({ id: conversationsTable.id }).from(conversationsTable)
          .where(isNull(conversationsTable.agentId))
          .orderBy(asc(conversationsTable.id));

    const leads = await leadsQuery;
    let updated = 0;

    for (let i = 0; i < leads.length; i++) {
      const agent = comercialAgents[i % comercialAgents.length];
      await db.update(conversationsTable)
        .set({ agentId: agent.id, assignedAgent: agent.name, updatedAt: new Date() })
        .where(eq(conversationsTable.id, leads[i].id));
      updated++;
    }

    res.json({ ok: true, updated, agents: comercialAgents.map(a => a.name) });
  } catch (err) {
    req.log.error({ err }, "Agent migration failed");
    res.status(500).json({ ok: false, error: String(err) });
  }
});

router.get("/conversations", async (req: Request, res: Response) => {
  const parsed = ListConversationsQueryParams.safeParse(req.query);
  const { status, search, campaign, disease, limit = 50, offset = 0 } = parsed.success ? parsed.data : { status: undefined, search: undefined, campaign: undefined, disease: undefined, limit: 50, offset: 0 };

  const conditions = [];
  if (status) conditions.push(eq(conversationsTable.status, status));
  if (campaign) conditions.push(eq(conversationsTable.campaign, campaign));
  if (disease) {
    // Support comma-separated list for multi-select
    const diseases = disease.split(",").map(d => d.trim()).filter(Boolean);
    if (diseases.length === 1) {
      conditions.push(eq(conversationsTable.disease, diseases[0]));
    } else if (diseases.length > 1) {
      conditions.push(or(...diseases.map(d => eq(conversationsTable.disease, d)))!);
    }
  }
  if (search) {
    conditions.push(
      sql`(${conversationsTable.chatNumber} ILIKE ${"%" + search + "%"} OR ${conversationsTable.contactName} ILIKE ${"%" + search + "%"})`
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [conversations, [{ total }]] = await Promise.all([
    db.select().from(conversationsTable)
      .where(where)
      .orderBy(desc(conversationsTable.updatedAt))
      .limit(Number(limit))
      .offset(Number(offset)),
    db.select({ total: count() }).from(conversationsTable).where(where),
  ]);

  res.json({ conversations, total: Number(total) });
});

router.get("/stats", async (req: Request, res: Response) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [statusCounts, [{ todayTotal }], recentActivity, campaignCounts] = await Promise.all([
    db.select({ status: conversationsTable.status, count: count() })
      .from(conversationsTable).groupBy(conversationsTable.status),
    db.select({ todayTotal: count() })
      .from(conversationsTable).where(gte(conversationsTable.createdAt, today)),
    db.select().from(conversationsTable)
      .orderBy(desc(conversationsTable.updatedAt)).limit(10),
    db.select({ campaign: conversationsTable.campaign, count: count() })
      .from(conversationsTable).groupBy(conversationsTable.campaign),
  ]);

  // Pipeline completo com todos os status possíveis
  const pipeline: Record<string, number> = {
    lead_novo: 0, lead_qualificado: 0, em_atendimento: 0, follow_up: 0,
    contrato_assinado: 0, cliente_ativo: 0, cliente_procedente: 0, lead_descartado: 0,
  };
  let total = 0;

  for (const row of statusCounts) {
    const n = Number(row.count);
    total += n;
    const mapped = mapStatus(row.status);
    const key = mapped ?? row.status;
    if (key in pipeline) pipeline[key] += n;
    else if (key === "lead_novo" || row.status === "open" || row.status === "unknown") pipeline.lead_novo += n;
  }

  // Contagem por campanha
  const byCampaign: Record<string, number> = {};
  for (const row of campaignCounts) {
    const key = row.campaign ?? "INDEFINIDA";
    byCampaign[key] = (byCampaign[key] ?? 0) + Number(row.count);
  }

  // Campos legados mantidos para compatibilidade com frontend antigo
  res.json({
    total,
    todayTotal: Number(todayTotal),
    pipeline,
    byCampaign,
    // legado
    open: pipeline.lead_novo,
    inProgress: pipeline.em_atendimento,
    waiting: pipeline.lead_qualificado,
    resolved: pipeline.contrato_assinado,
    closed: pipeline.lead_descartado,
    recentActivity,
  });
});

// ─── MIGRATE: atualizar status retroativamente ────────────────────────────────
router.post("/migrate/statuses", async (req: Request, res: Response) => {
  try {
    // Busca leads com status "legado" que têm agente humano atribuído → LEAD QUALIFICADO
    const oldStatuses = ["open", "unknown", "waiting", "in_progress"];

    const leads = await db.select({
      id: conversationsTable.id,
      status: conversationsTable.status,
      agentId: conversationsTable.agentId,
      assignedAgent: conversationsTable.assignedAgent,
    }).from(conversationsTable);

    let qualificado = 0;
    let emAtendimento = 0;
    let leadNovo = 0;

    for (const lead of leads) {
      const hasHuman = !!lead.agentId;
      const isLegacy = oldStatuses.includes(lead.status) || !PIPELINE_STATUSES.has(lead.status);

      if (!isLegacy) continue; // já no novo pipeline, pula

      let toStatus: string;
      if (hasHuman && (lead.status === "in_progress")) {
        toStatus = "em_atendimento";
        emAtendimento++;
      } else if (hasHuman) {
        toStatus = "lead_qualificado";
        qualificado++;
      } else {
        toStatus = "lead_novo";
        leadNovo++;
      }

      await db.update(conversationsTable)
        .set({ status: toStatus, updatedAt: new Date() })
        .where(eq(conversationsTable.id, lead.id));

      await db.insert(statusHistoryTable).values({
        conversationId: lead.id,
        fromStatus: lead.status,
        toStatus,
        changedBy: "system",
        notes: "Migração retroativa de status (bot→pipeline)",
      });
    }

    res.json({ ok: true, qualificado, emAtendimento, leadNovo, total: qualificado + emAtendimento + leadNovo });
  } catch (err) {
    req.log.error({ err }, "Status migration failed");
    res.status(500).json({ ok: false, error: String(err) });
  }
});

router.delete("/conversations/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ ok: false, message: "ID inválido" }); return; }
  try {
    await db.delete(conversationsTable).where(eq(conversationsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting conversation");
    res.status(500).json({ ok: false });
  }
});

router.post("/check-status", async (req: Request, res: Response) => {
  const parsed = CheckChatStatusBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ chatNumber: "", found: false, raw: {} }); return; }
  const { chatNumber } = parsed.data;
  try {
    const params = new URLSearchParams({
      key: API_KEY, account_id: ACCOUNT_ID, phone_id: PHONE_ID,
      action: "chat_status", chat_number: chatNumber,
    });
    const response = await fetch(`${CHATGURU_API}?${params}`, { method: "POST" });
    const raw = (await response.json()) as Record<string, unknown>;
    req.log.info({ chatNumber, raw }, "ChatGuru check-status response");
    const found = raw.result === "success" || raw.code === 200 || raw.code === 201;
    const status = typeof raw.status === "string" ? mapStatus(raw.status) : undefined;
    if (found && status) {
      const existing = await db.select().from(conversationsTable)
        .where(eq(conversationsTable.chatNumber, chatNumber)).limit(1);
      if (existing.length > 0) {
        await db.update(conversationsTable).set({ status, updatedAt: new Date() })
          .where(eq(conversationsTable.chatNumber, chatNumber));
      } else {
        await db.insert(conversationsTable).values({ chatNumber, status, lastMessageAt: new Date() });
      }
    }
    res.json({ chatNumber, found, status, raw });
  } catch (err) {
    req.log.error({ err }, "Error checking chat status");
    res.status(500).json({ chatNumber, found: false });
  }
});

router.post("/send-message", async (req: Request, res: Response) => {
  const { chatNumber, message } = req.body ?? {};
  if (!chatNumber || !message) { res.status(400).json({ ok: false, error: "chatNumber e message são obrigatórios" }); return; }
  try {
    const sendDate = new Date(Date.now() + 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const sendDateStr = `${sendDate.getFullYear()}-${pad(sendDate.getMonth() + 1)}-${pad(sendDate.getDate())} ${pad(sendDate.getHours())}:${pad(sendDate.getMinutes())}`;
    const params = new URLSearchParams({
      key: API_KEY, account_id: ACCOUNT_ID, phone_id: PHONE_ID,
      action: "message_send", chat_number: chatNumber, text: message, send_date: sendDateStr,
    });
    req.log.info({ chatNumber, sendDateStr }, "Sending message via ChatGuru API");
    const response = await fetch(`${CHATGURU_API}?${params}`, { method: "POST" });
    const raw = (await response.json()) as Record<string, unknown>;
    const ok = raw.result === "success" || raw.code === 201 || raw.code === 200;
    res.json({ ok, messageId: raw.message_id ?? null, status: raw.message_status ?? null, error: ok ? undefined : (raw.description ?? "Erro desconhecido") });
  } catch (err) {
    req.log.error({ err }, "Error sending message via ChatGuru");
    res.status(500).json({ ok: false, error: "Erro ao enviar mensagem" });
  }
});

router.get("/webhook-url", (req: Request, res: Response) => {
  const domains = process.env.REPLIT_DOMAINS?.split(",")[0] ?? "seu-dominio.replit.app";
  const url = `https://${domains}/api/chatguru/webhook`;
  res.json({ url, instructions: "Configure este URL no ChatGuru em: Chatbot → Ação de CRM → POST Webhook." });
});

export default router;
