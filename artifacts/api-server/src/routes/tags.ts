import { Router, Request, Response } from "express";
import { db, tagsTable, conversationTagsTable } from "@workspace/db";
import { eq, count, inArray } from "drizzle-orm";
import { z } from "zod";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  const tags = await db.select().from(tagsTable).orderBy(tagsTable.category, tagsTable.name);

  // Contar conversas por tag
  const tagCounts = await db.select({
    tagId: conversationTagsTable.tagId,
    total: count(),
  }).from(conversationTagsTable).groupBy(conversationTagsTable.tagId);

  const countMap: Record<number, number> = {};
  for (const row of tagCounts) countMap[row.tagId] = Number(row.total);

  const grouped: Record<string, Array<{ id: number; name: string; total: number }>> = {};
  for (const tag of tags) {
    if (!grouped[tag.category]) grouped[tag.category] = [];
    grouped[tag.category].push({ id: tag.id, name: tag.name, total: countMap[tag.id] ?? 0 });
  }

  res.json({ tags, grouped });
});

router.post("/sync", async (_req: Request, res: Response) => {
  // Placeholder: em produção aqui faria fetch no ChatGuru e sincronizaria
  res.json({ ok: true, message: "Sync não disponível — tags sincronizadas manualmente." });
});

// Aplicar/remover tags de uma conversa
router.patch("/conversation/:conversationId", async (req: Request, res: Response) => {
  const conversationId = parseInt(req.params.conversationId as string, 10);
  if (isNaN(conversationId)) { res.status(400).json({ ok: false }); return; }

  const parsed = z.object({
    addTagIds: z.array(z.number()).optional(),
    removeTagIds: z.array(z.number()).optional(),
  }).safeParse(req.body);

  if (!parsed.success) { res.status(400).json({ ok: false }); return; }
  const { addTagIds = [], removeTagIds = [] } = parsed.data;

  if (removeTagIds.length > 0) {
    await db.delete(conversationTagsTable)
      .where(eq(conversationTagsTable.conversationId, conversationId));
  }

  if (addTagIds.length > 0) {
    await db.insert(conversationTagsTable).values(
      addTagIds.map(tagId => ({ conversationId, tagId }))
    ).onConflictDoNothing();
  }

  // Return current tags for this conversation
  const rows = await db.select({ tagId: conversationTagsTable.tagId })
    .from(conversationTagsTable)
    .where(eq(conversationTagsTable.conversationId, conversationId));

  const tagIds = rows.map(r => r.tagId);
  const currentTags = tagIds.length > 0
    ? await db.select().from(tagsTable).where(inArray(tagsTable.id, tagIds))
    : [];

  res.json({ ok: true, tags: currentTags });
});

export default router;
