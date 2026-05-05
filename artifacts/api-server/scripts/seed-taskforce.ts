/**
 * Seed do login da Letícia (força-tarefa).
 * Roda DEPOIS de seed:agents (precisa do agentId da Letícia).
 *
 * Execução:
 *   SEED_PASSWORD_LETICIA="L3t1c1@_25" pnpm --filter @workspace/api-server run seed:taskforce
 *
 * Se preferir não usar env var, edite a constante PASSWORD abaixo (não comite isso).
 */
import { db, usersTable, agentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

async function main() {
  const username = "leticia";
  const password = process.env.SEED_PASSWORD_LETICIA;
  if (!password) {
    console.error("SEED_PASSWORD_LETICIA não configurada. Defina a env var antes de rodar.");
    process.exit(1);
  }

  // Localizar agent da Letícia
  const [agent] = await db
    .select({ id: agentsTable.id })
    .from(agentsTable)
    .where(eq(agentsTable.name, "Letícia"))
    .limit(1);

  if (!agent) {
    console.error('Agent "Letícia" não encontrado. Rode primeiro: pnpm --filter @workspace/api-server run seed:agents');
    process.exit(1);
  }

  // Já existe?
  const existing = await db
    .select({ id: usersTable.id, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.username, username))
    .limit(1);

  if (existing.length > 0) {
    // Atualiza pra garantir role e agentId corretos
    await db
      .update(usersTable)
      .set({
        passwordHash: hashPassword(password),
        role: "agent_taskforce",
        agentId: agent.id,
        active: true,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, existing[0].id));
    console.log(`  ↻ user "${username}" atualizado (role=agent_taskforce, agentId=${agent.id})`);
  } else {
    await db.insert(usersTable).values({
      username,
      passwordHash: hashPassword(password),
      role: "agent_taskforce",
      agentId: agent.id,
      active: true,
    });
    console.log(`  ✓ user "${username}" criado (role=agent_taskforce, agentId=${agent.id})`);
  }

  console.log("\nPronto! Letícia pode logar com:");
  console.log(`  usuário: ${username}`);
  console.log(`  senha: <a que você definiu em SEED_PASSWORD_LETICIA>`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
