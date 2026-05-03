import { Router, Request, Response } from "express";
import { db, conversationsTable } from "@workspace/db";
import { detectarQualificacao } from "../lib/qualification";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";

const router = Router();

/**
 * POST /api/qualified/backfill
 *
 * Body: { dryRun?: boolean }
 *
 * dryRun=true  → analisa todos os leads, retorna contagens SEM gravar no banco
 * dryRun=false → aplica os flags (hasLaudo, noAdvogado, intentResolve, isQualified)
 *
 * Retorna: { processed, qualified, skipped, errors, dryRun }
 */
router.post("/backfill", requireAdmin, async (req: Request, res: Response) => {
  const dryRun = req.body?.dryRun === true;

  try {
    const leads = await db
      .select({
        id: conversationsTable.id,
        firstMessage: conversationsTable.firstMessage,
        lastMessage: conversationsTable.lastMessage,
      })
      .from(conversationsTable);

    let processed = 0;
    let qualified = 0;
    let skipped = 0;
    let errors = 0;

    for (const lead of leads) {
      try {
        const qual = detectarQualificacao([lead.firstMessage, lead.lastMessage]);

        if (!dryRun) {
          await db
            .update(conversationsTable)
            .set({
              hasLaudo: qual.hasLaudo,
              noAdvogado: qual.noAdvogado,
              intentResolve: qual.intentResolve,
              isQualified: qual.isQualified,
              updatedAt: new Date(),
            })
            .where(eq(conversationsTable.id, lead.id));
        }

        processed++;
        if (qual.isQualified) qualified++;
        else skipped++;
      } catch {
        errors++;
      }
    }

    res.json({ dryRun, processed, qualified, skipped, errors });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

export default router;
