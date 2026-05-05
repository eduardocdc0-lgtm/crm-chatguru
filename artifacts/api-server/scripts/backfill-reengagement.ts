/**
 * Backfill de tentativas de reengajamento históricas.
 *
 * Heurística: olha mensagens enviadas PELO ESCRITÓRIO em webhook_events
 * que contenham marcadores típicos de reengajamento. Pra cada match,
 * cria 1 linha em reengagement_attempts e atualiza contadores.
 *
 * MODO DEFAULT É DRY-RUN. Nada é escrito. Use:
 *
 *   pnpm --filter @workspace/api-server run backfill:reengagement              # dry-run, mostra count
 *   APPLY=1 pnpm --filter @workspace/api-server run backfill:reengagement      # aplica de verdade
 *
 * ⚠️ Idempotência: o script verifica se já existe um attempt com a mesma
 *    mensagem na mesma conversa em ±10min — se existir, pula.
 */
import { db, conversationsTable, webhookEventsTable, reengagementAttemptsTable } from "@workspace/db";
import { eq, and, gte, lt, sql, isNotNull } from "drizzle-orm";

const APPLY = process.env.APPLY === "1";

// Marcadores de reengajamento (texto enviado pelo escritório).
// Se a mensagem contém qualquer um desses, considera reengajamento.
const MARKERS = [
  "desculpe a demora",
  "voltando ao trabalho",
  "verifiquei que não conseguimos concluir",
  "verifiquei que não conseguimos",
  "olá! verifiquei",
  "vi que você entrou em contato",
  "posso te ajudar",
  "continuamos de onde paramos",
  "ainda posso te ajudar",
  "ainda quer dar continuidade",
];

function looksLikeReengagement(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  return MARKERS.some((m) => t.includes(m));
}

async function main() {
  console.log(`\nBackfill de reengajamento — modo: ${APPLY ? "APPLY (escreve)" : "DRY-RUN (não escreve)"}`);
  console.log("─".repeat(60));

  // Buscar todos os webhook_events com chatNumber válido
  const events = await db
    .select()
    .from(webhookEventsTable)
    .where(isNotNull(webhookEventsTable.chatNumber))
    .orderBy(webhookEventsTable.receivedAt);

  console.log(`Total de webhook_events: ${events.length}`);

  // Pra cada evento, parsear payload e detectar mensagem do escritório
  // Heurística: payload tem agent ou responsavel_nome (mensagem do atendente)
  // E contém algum marker.
  type Hit = {
    chatNumber: string;
    sentAt: Date;
    sentByName: string;
    messageText: string;
  };
  const hits: Hit[] = [];

  for (const ev of events) {
    if (!ev.chatNumber) continue;
    let raw: any;
    try {
      raw = JSON.parse(ev.rawPayload);
    } catch {
      continue;
    }
    const agentName = raw.agent ?? raw.responsavel_nome ?? null;
    const message = String(raw.message ?? raw.texto_mensagem ?? "");
    if (!agentName) continue; // mensagem do lead, não do escritório
    if (!looksLikeReengagement(message)) continue;
    hits.push({
      chatNumber: ev.chatNumber,
      sentAt: ev.receivedAt,
      sentByName: String(agentName),
      messageText: message,
    });
  }

  console.log(`Mensagens identificadas como reengajamento: ${hits.length}`);

  // Agrupa por chatNumber pra calcular attemptNumber sequencial
  const byChat = new Map<string, Hit[]>();
  for (const h of hits) {
    if (!byChat.has(h.chatNumber)) byChat.set(h.chatNumber, []);
    byChat.get(h.chatNumber)!.push(h);
  }
  for (const list of byChat.values()) list.sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());

  console.log(`Conversas afetadas: ${byChat.size}`);

  let inserted = 0;
  let skipped = 0;
  let convsUpdated = 0;

  for (const [chatNumber, list] of byChat) {
    const [conv] = await db
      .select({ id: conversationsTable.id, reengagementCount: conversationsTable.reengagementCount })
      .from(conversationsTable)
      .where(eq(conversationsTable.chatNumber, chatNumber))
      .limit(1);
    if (!conv) {
      skipped += list.length;
      continue;
    }

    let attemptNumber = 0;
    let lastSentAt: Date | null = null;

    for (const hit of list) {
      attemptNumber++;
      // Idempotência: já existe attempt com texto parecido em ±10min?
      const tenMinBefore = new Date(hit.sentAt.getTime() - 10 * 60 * 1000);
      const tenMinAfter = new Date(hit.sentAt.getTime() + 10 * 60 * 1000);
      const dup = await db
        .select({ id: reengagementAttemptsTable.id })
        .from(reengagementAttemptsTable)
        .where(
          and(
            eq(reengagementAttemptsTable.conversationId, conv.id),
            gte(reengagementAttemptsTable.sentAt, tenMinBefore),
            lt(reengagementAttemptsTable.sentAt, tenMinAfter),
          ),
        )
        .limit(1);
      if (dup.length > 0) {
        skipped++;
        continue;
      }

      if (APPLY) {
        await db.insert(reengagementAttemptsTable).values({
          conversationId: conv.id,
          sentAt: hit.sentAt,
          sentByName: hit.sentByName,
          messageText: hit.messageText,
          attemptNumber,
          leadResponded: false, // backfill não sabe se respondeu (poderia inferir mas mantém conservador)
        });
      }
      inserted++;
      lastSentAt = hit.sentAt;
    }

    // Atualizar contadores na conversa
    if (APPLY && lastSentAt && attemptNumber > (conv.reengagementCount ?? 0)) {
      await db
        .update(conversationsTable)
        .set({
          reengagementCount: attemptNumber,
          lastReengagementAt: lastSentAt,
          updatedAt: new Date(),
        })
        .where(eq(conversationsTable.id, conv.id));
      convsUpdated++;
    } else if (!APPLY && lastSentAt) {
      convsUpdated++;
    }
  }

  console.log("\nResumo:");
  console.log(`  attempts a inserir: ${inserted}`);
  console.log(`  skipped (sem conv ou duplicado): ${skipped}`);
  console.log(`  conversations a atualizar: ${convsUpdated}`);
  console.log("─".repeat(60));

  if (!APPLY) {
    console.log("\n⚠️  DRY-RUN: nada foi escrito. Pra aplicar de verdade:");
    console.log("    APPLY=1 pnpm --filter @workspace/api-server run backfill:reengagement");
  } else {
    console.log("\n✅ Backfill aplicado.");
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
