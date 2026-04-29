import { Router, Request, Response } from "express";
import { db, conversationsTable, statusHistoryTable, tagsTable, conversationTagsTable } from "@workspace/db";
import { eq, ilike, or, and, lt, isNotNull, desc, sql, isNull, inArray } from "drizzle-orm";
import { z } from "zod";
import { detectDisease } from "../lib/disease";

const router = Router();

// ─── ALERTS (antes das rotas /:id para não colidir) ───────────────────────────
router.get("/alerts/list", async (_req: Request, res: Response) => {
  const h2 = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const h24 = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const alerts = await db.select().from(conversationsTable)
    .where(and(
      isNotNull(conversationsTable.coolingAlert),
      sql`${conversationsTable.coolingAlert} != ''`
    ))
    .orderBy(desc(conversationsTable.updatedAt))
    .limit(100);

  const urgentCount = await db.select({ count: sql<number>`count(*)::int` })
    .from(conversationsTable)
    .where(and(
      or(eq(conversationsTable.status, "lead_novo"), eq(conversationsTable.status, "open")),
      lt(conversationsTable.updatedAt, h2),
    ));

  const coolingCount = await db.select({ count: sql<number>`count(*)::int` })
    .from(conversationsTable)
    .where(and(
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
      urgent: Number(urgentCount[0]?.count ?? 0),
      cooling: Number(coolingCount[0]?.count ?? 0),
    }
  });
});

// ─── SEARCH ──────────────────────────────────────────────────────────────────
router.get("/search", async (req: Request, res: Response) => {
  const q = String(req.query.q ?? "").trim();
  if (!q || q.length < 2) { res.json({ results: [] }); return; }
  const like = `%${q}%`;
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
    .where(or(
      ilike(conversationsTable.contactName, like),
      ilike(conversationsTable.chatNumber, like),
      ilike(conversationsTable.firstMessage, like),
      ilike(conversationsTable.lastMessage, like),
    ))
    .orderBy(desc(conversationsTable.updatedAt))
    .limit(15);
  res.json({ results: rows });
});

// ─── EXPORT CSV ──────────────────────────────────────────────────────────────
router.get("/export", async (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  const campaign = req.query.campaign as string | undefined;

  const conditions = [];
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
router.get("/disease/stats", async (_req: Request, res: Response) => {
  const rows = await db
    .select({ disease: conversationsTable.disease, count: sql<number>`count(*)::int` })
    .from(conversationsTable)
    .where(isNotNull(conversationsTable.disease))
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
    const existing = await db.select({ status: conversationsTable.status })
      .from(conversationsTable).where(eq(conversationsTable.id, id)).limit(1);
    if (existing.length > 0 && existing[0].status !== status) {
      await db.insert(statusHistoryTable).values({
        conversationId: id,
        fromStatus: existing[0].status,
        toStatus: status,
        changedBy: "manual",
      });
    }
    updateData.status = status;
  }

  const [conv] = await db.update(conversationsTable)
    .set(updateData as any)
    .where(eq(conversationsTable.id, id))
    .returning();
  res.json({ ok: true, conversation: conv });
});

// ─── STATUS HISTORY ───────────────────────────────────────────────────────────
router.get("/:id/history", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ ok: false }); return; }
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

  const history = await db.select().from(statusHistoryTable)
    .where(eq(statusHistoryTable.conversationId, id))
    .orderBy(desc(statusHistoryTable.createdAt));

  res.json({ conversation: conv, history });
});

export default router;
