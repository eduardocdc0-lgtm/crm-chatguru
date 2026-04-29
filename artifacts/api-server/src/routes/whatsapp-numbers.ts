import { Router, Request, Response } from "express";
import { db, whatsappNumbersTable, conversationsTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const NumBody = z.object({
  number: z.string().min(10),
  label: z.string().min(1),
  team: z.enum(["COMERCIAL_TRAFEGO", "ATENDIMENTO"]),
  active: z.boolean().optional(),
  chatguruPhoneId: z.string().optional().nullable(),
});

const NumPatch = z.object({
  number: z.string().min(10).optional(),
  label: z.string().min(1).optional(),
  team: z.enum(["COMERCIAL_TRAFEGO", "ATENDIMENTO"]).optional(),
  active: z.boolean().optional(),
  chatguruPhoneId: z.string().optional().nullable(),
});

router.get("/", async (_req: Request, res: Response) => {
  const numbers = await db.select().from(whatsappNumbersTable).orderBy(whatsappNumbersTable.label);

  // Contar leads por número
  const counts = await db.select({
    whatsappNumberId: conversationsTable.whatsappNumberId,
    total: count(),
  }).from(conversationsTable).groupBy(conversationsTable.whatsappNumberId);

  const countMap: Record<number, number> = {};
  for (const row of counts) {
    if (row.whatsappNumberId) countMap[row.whatsappNumberId] = Number(row.total);
  }

  const result = numbers.map(n => ({ ...n, leadsTotal: countMap[n.id] ?? 0 }));
  res.json({ numbers: result });
});

router.post("/", async (req: Request, res: Response) => {
  const parsed = NumBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ ok: false, error: parsed.error.message }); return; }
  const [num] = await db.insert(whatsappNumbersTable).values(parsed.data).returning();
  res.json({ ok: true, number: num });
});

router.patch("/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ ok: false }); return; }
  const parsed = NumPatch.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ ok: false, error: parsed.error.message }); return; }
  const [num] = await db.update(whatsappNumbersTable)
    .set(parsed.data)
    .where(eq(whatsappNumbersTable.id, id))
    .returning();
  res.json({ ok: true, number: num });
});

export default router;
