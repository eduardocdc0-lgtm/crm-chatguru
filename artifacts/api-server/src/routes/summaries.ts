import { Router, Request, Response } from "express";
import { db, conversationsTable, dailySummariesTable, agentsTable } from "@workspace/db";
import { eq, and, gte, lt, count, sql, desc, or } from "drizzle-orm";

const router = Router();

export async function generateDailySummary(dateStr?: string): Promise<Record<string, unknown>> {
  const date = dateStr ?? new Date().toISOString().slice(0, 10);
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(`${date}T23:59:59.999Z`);

  // Leads novos do dia
  const newLeads = await db.select({ count: count() })
    .from(conversationsTable)
    .where(and(gte(conversationsTable.createdAt, dayStart), lt(conversationsTable.createdAt, dayEnd)));

  // Por campanha
  const byCampaign = await db.select({
    campaign: conversationsTable.campaign,
    count: count(),
  }).from(conversationsTable)
    .where(and(gte(conversationsTable.createdAt, dayStart), lt(conversationsTable.createdAt, dayEnd)))
    .groupBy(conversationsTable.campaign);

  // Por número WhatsApp
  const byNumber = await db.select({
    whatsappNumberId: conversationsTable.whatsappNumberId,
    count: count(),
  }).from(conversationsTable)
    .where(and(gte(conversationsTable.createdAt, dayStart), lt(conversationsTable.createdAt, dayEnd)))
    .groupBy(conversationsTable.whatsappNumberId);

  // Movimentação de status no dia (pipeline atual)
  const qualified = await db.select({ count: count() })
    .from(conversationsTable)
    .where(and(
      or(eq(conversationsTable.status, "em_atendimento"), eq(conversationsTable.status, "lead_qualificado"), eq(conversationsTable.status, "in_progress")),
      gte(conversationsTable.updatedAt, dayStart), lt(conversationsTable.updatedAt, dayEnd)));

  const resolved = await db.select({ count: count() })
    .from(conversationsTable)
    .where(and(
      or(eq(conversationsTable.status, "contrato_assinado"), eq(conversationsTable.status, "cliente_ativo"), eq(conversationsTable.status, "cliente_procedente"), eq(conversationsTable.status, "resolved")),
      gte(conversationsTable.updatedAt, dayStart), lt(conversationsTable.updatedAt, dayEnd)));

  const closed = await db.select({ count: count() })
    .from(conversationsTable)
    .where(and(
      or(eq(conversationsTable.status, "lead_descartado"), eq(conversationsTable.status, "closed")),
      gte(conversationsTable.updatedAt, dayStart), lt(conversationsTable.updatedAt, dayEnd)));

  // Alertas ativos
  const urgentCount = await db.select({ count: count() })
    .from(conversationsTable)
    .where(eq(conversationsTable.coolingAlert, "urgente"));

  const coolingCount = await db.select({ count: count() })
    .from(conversationsTable)
    .where(eq(conversationsTable.coolingAlert, "esfriando"));

  const summary = {
    date,
    newLeadsTotal: Number(newLeads[0]?.count ?? 0),
    byCampaign: byCampaign.map(r => ({ campaign: r.campaign ?? "INDEFINIDA", count: Number(r.count) })),
    byNumber: byNumber.map(r => ({ whatsappNumberId: r.whatsappNumberId, count: Number(r.count) })),
    movement: {
      inProgress: Number(qualified[0]?.count ?? 0),
      resolved: Number(resolved[0]?.count ?? 0),
      closed: Number(closed[0]?.count ?? 0),
    },
    alerts: {
      urgent: Number(urgentCount[0]?.count ?? 0),
      cooling: Number(coolingCount[0]?.count ?? 0),
    },
  };

  return summary;
}

router.post("/generate", async (req: Request, res: Response) => {
  try {
    const date = (req.body?.date as string) ?? new Date().toISOString().slice(0, 10);
    const data = await generateDailySummary(date);
    await db.insert(dailySummariesTable)
      .values({ date, data })
      .onConflictDoUpdate({ target: dailySummariesTable.date, set: { data, generatedAt: new Date() } });
    res.json({ ok: true, summary: data });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

router.get("/", async (_req: Request, res: Response) => {
  const summaries = await db.select().from(dailySummariesTable)
    .orderBy(desc(dailySummariesTable.date))
    .limit(30);
  res.json({ summaries });
});

router.get("/latest", async (_req: Request, res: Response) => {
  const [latest] = await db.select().from(dailySummariesTable)
    .orderBy(desc(dailySummariesTable.date)).limit(1);
  res.json({ summary: latest ?? null });
});

export default router;
