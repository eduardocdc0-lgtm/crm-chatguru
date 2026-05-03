import { Router, Request, Response } from "express";
import { db, conversationsTable, webhookEventsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";

const router = Router();

/**
 * POST /api/qualified/backfill-v2
 *
 * Escaneia webhook_events procurando a frase-fechamento do bot
 * "já tem advogado cuidando do caso". Quando encontra, marca a
 * conversa correspondente como is_qualified = true.
 *
 * Body: { dryRun?: boolean }
 *   dryRun=true  → analisa, retorna contagens SEM gravar no banco
 *   dryRun=false → aplica is_qualified=true nas conversas encontradas
 *
 * Retorna: { dryRun, processed, qualified, skipped, errors, samples }
 */
router.post("/backfill-v2", requireAdmin, async (req: Request, res: Response) => {
  const dryRun = req.body?.dryRun !== false; // default: dryRun=true por segurança

  const BOT_PHRASE = "já tem advogado cuidando do caso";

  try {
    // Busca todos os eventos que contêm a frase
    const events = await db
      .select({
        id: webhookEventsTable.id,
        chatNumber: webhookEventsTable.chatNumber,
        rawPayload: webhookEventsTable.rawPayload,
      })
      .from(webhookEventsTable)
      .where(sql`${webhookEventsTable.rawPayload}::text ILIKE ${"%" + BOT_PHRASE + "%"}`);

    // Deduplica por chatNumber
    const uniqueChats = new Map<string, number>(); // chatNumber → eventId
    for (const ev of events) {
      const chatNum = ev.chatNumber
        ?? (ev.rawPayload as Record<string, unknown>)?.celular as string
        ?? null;
      if (chatNum && !uniqueChats.has(String(chatNum))) {
        uniqueChats.set(String(chatNum), ev.id);
      }
    }

    let processed = 0;
    let qualified = 0;
    let skipped = 0;
    let errors = 0;
    const samples: string[] = [];

    for (const [chatNumber] of uniqueChats) {
      try {
        // Verifica se existe conversa para esse número
        const [conv] = await db
          .select({ id: conversationsTable.id, isQualified: conversationsTable.isQualified })
          .from(conversationsTable)
          .where(eq(conversationsTable.chatNumber, chatNumber))
          .limit(1);

        processed++;

        if (!conv) {
          skipped++;
          continue;
        }

        if (conv.isQualified) {
          skipped++; // já marcado
          continue;
        }

        if (!dryRun) {
          await db
            .update(conversationsTable)
            .set({ isQualified: true, updatedAt: new Date() })
            .where(eq(conversationsTable.id, conv.id));
        }

        qualified++;
        if (samples.length < 10) samples.push(chatNumber);
      } catch {
        errors++;
      }
    }

    res.json({ dryRun, processed, qualified, skipped, errors, samples });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

export default router;
