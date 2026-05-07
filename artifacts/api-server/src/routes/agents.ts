import { Router, Request, Response } from "express";
import { db, agentsTable, conversationsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

const router = Router();

// ─── STATS: métricas por atendente ────────────────────────────────────────────
router.get("/stats", async (_req: Request, res: Response) => {
  const agents = await db.select().from(agentsTable).orderBy(agentsTable.team, agentsTable.name);

  // Busca contagens usando ILIKE sobre assigned_agent (compatível com leads antigos sem agent_id)
  const rows = await db.execute(sql`
    SELECT
      LOWER(TRIM(assigned_agent))           AS agent_key,
      COUNT(*)::int                         AS total,
      COUNT(CASE WHEN status IN ('open','in_progress','waiting','unknown') THEN 1 END)::int AS active_count,
      COUNT(CASE WHEN status = 'resolved' THEN 1 END)::int                                 AS converted,
      COUNT(CASE WHEN status = 'resolved'
               AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW()) THEN 1 END)::int AS converted_month
    FROM conversations
    WHERE assigned_agent IS NOT NULL AND assigned_agent <> ''
    GROUP BY LOWER(TRIM(assigned_agent))
  `);

  const statMap = new Map<string, { total: number; active: number; converted: number; convertedMonth: number }>();
  for (const row of rows.rows as any[]) {
    statMap.set(row.agent_key, {
      total: Number(row.total),
      active: Number(row.active_count),
      converted: Number(row.converted),
      convertedMonth: Number(row.converted_month),
    });
  }

  const stats = agents.map(a => {
    const key = a.name.toLowerCase().trim();
    const s = statMap.get(key) ?? { total: 0, active: 0, converted: 0, convertedMonth: 0 };
    const rate = s.total > 0 ? Math.round((s.converted / s.total) * 100) : 0;
    return {
      id: a.id,
      name: a.name,
      phone: a.phone,
      team: a.team,
      active: a.active,
      stats: {
        total: s.total,
        active: s.active,
        converted: s.converted,
        convertedThisMonth: s.convertedMonth,
        conversionRate: rate,
      },
    };
  });

  res.json({ stats });
});

const AgentBody = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  team: z.enum(["COMERCIAL_TRAFEGO", "ATENDIMENTO"]),
  active: z.boolean().optional(),
});

const AgentPatch = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional().nullable(),
  team: z.enum(["COMERCIAL_TRAFEGO", "ATENDIMENTO"]).optional(),
  active: z.boolean().optional(),
});

router.get("/", async (_req: Request, res: Response) => {
  const agents = await db.select().from(agentsTable).orderBy(agentsTable.team, agentsTable.name);
  res.json({ agents });
});

router.post("/", async (req: Request, res: Response) => {
  const parsed = AgentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.message });
    return;
  }
  const [agent] = await db.insert(agentsTable).values(parsed.data).returning();
  res.json({ ok: true, agent });
});

router.patch("/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ ok: false }); return; }
  const parsed = AgentPatch.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ ok: false, error: parsed.error.message }); return; }
  const [agent] = await db.update(agentsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(agentsTable.id, id))
    .returning();
  res.json({ ok: true, agent });
});

router.delete("/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ ok: false }); return; }
  await db.delete(agentsTable).where(eq(agentsTable.id, id));
  res.json({ ok: true });
});

export default router;
