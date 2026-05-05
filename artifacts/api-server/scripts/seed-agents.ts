/**
 * Seed/upsert de agentes no banco.
 * - Cria os agentes que ainda não existem.
 * - Não toca em agentes existentes (preserva edits feitos manualmente).
 *
 * Execução:
 *   pnpm --filter @workspace/api-server run seed:agents
 */
import { db, agentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const AGENTS_DESIRED = [
  // COMERCIAL — fechamento de leads novos
  { name: "Thiago Tavares", team: "COMERCIAL_TRAFEGO", chatguruEmail: "tavaresthiago109@gmail.com" },
  { name: "Tammyres",       team: "COMERCIAL_TRAFEGO", chatguruEmail: "tammyres.thayranna@hotmail.com" },
  // ATENDIMENTO — base de clientes + força-tarefa
  { name: "Letícia",        team: "ATENDIMENTO",       chatguruEmail: "leticiassoliveira29@gmail.com" },
  { name: "Marília",        team: "ATENDIMENTO",       chatguruEmail: "anamarilia048@gmail.com" },
  { name: "Alice",          team: "ATENDIMENTO",       chatguruEmail: "mariaalice09832@gmail.com" },
  { name: "Cau",            team: "ATENDIMENTO",       chatguruEmail: null },
  // FINANCEIRO (não vai pra rota de leads, mas existe)
  { name: "Claudiana",      team: "FINANCEIRO",        chatguruEmail: "claudianafrancisco14@gmail.com" },
];

async function main() {
  console.log("Seeding agentes...\n");

  for (const desired of AGENTS_DESIRED) {
    const existing = await db
      .select({ id: agentsTable.id, name: agentsTable.name, chatguruUserId: agentsTable.chatguruUserId })
      .from(agentsTable)
      .where(eq(agentsTable.name, desired.name))
      .limit(1);

    if (existing.length > 0) {
      // Se chatguru_user_id ainda não foi setado, popular com o email-tentativa.
      // ⚠️ Trocar pelo formato real (UUID?) depois de confirmar com 1 chamada de teste.
      if (!existing[0].chatguruUserId && desired.chatguruEmail) {
        await db
          .update(agentsTable)
          .set({ chatguruUserId: desired.chatguruEmail, updatedAt: new Date() })
          .where(eq(agentsTable.id, existing[0].id));
        console.log(`  ↻ "${desired.name}" — chatguru_user_id setado pra ${desired.chatguruEmail}`);
      } else {
        console.log(`  → "${desired.name}" já existe — pulando.`);
      }
      continue;
    }

    await db.insert(agentsTable).values({
      name: desired.name,
      team: desired.team,
      active: true,
      chatguruUserId: desired.chatguruEmail ?? null,
    });
    console.log(`  ✓ "${desired.name}" criado (team=${desired.team}, chatguru_user_id=${desired.chatguruEmail ?? "—"})`);
  }

  console.log("\nPronto!");
  console.log("\n⚠️  Importante: o chatguru_user_id está com EMAIL como tentativa.");
  console.log("    Confirme o formato real (email vs UUID) com 1 chamada de teste à API");
  console.log("    e ajuste manualmente via UPDATE se necessário:");
  console.log("    UPDATE agents SET chatguru_user_id='<valor>' WHERE name='Thiago Tavares';");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
