/**
 * Seed inicial de usuários do CRM.
 * Cria: Eduardo (admin), Thiago (agent, agentId=1), Tammyres (agent, agentId=2)
 *
 * Execução:
 *   pnpm --filter @workspace/api-server run seed:users
 */
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

async function upsertUser(data: {
  username: string;
  password: string;
  role: string;
  agentId?: number | null;
}) {
  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.username, data.username))
    .limit(1);

  if (existing.length > 0) {
    console.log(`  → user "${data.username}" já existe, pulando.`);
    return;
  }

  await db.insert(usersTable).values({
    username: data.username,
    passwordHash: hashPassword(data.password),
    role: data.role,
    agentId: data.agentId ?? null,
    active: true,
  });
  console.log(`  ✓ user "${data.username}" criado (role: ${data.role}${data.agentId ? `, agentId: ${data.agentId}` : ""})`);
}

async function main() {
  console.log("Seeding usuários...\n");

  const adminUser = process.env.ADMIN_USER || "eduardo";
  const adminPass = process.env.ADMIN_PASSWORD || process.env.ADMIN_PASS || "";

  if (!adminPass) {
    console.error("ADMIN_PASS env var não encontrada — Eduardo não será criado no DB.");
  } else {
    await upsertUser({ username: adminUser, password: adminPass, role: "admin" });
  }

  const thiagoPass = process.env.SEED_PASSWORD_THIAGO;
  const tammyresPass = process.env.SEED_PASSWORD_TAMMYRES;

  if (!thiagoPass) {
    console.error("SEED_PASSWORD_THIAGO env var não encontrada — thiago não será criado.");
  } else {
    await upsertUser({ username: "thiago", password: thiagoPass, role: "agent", agentId: 1 });
  }

  if (!tammyresPass) {
    console.error("SEED_PASSWORD_TAMMYRES env var não encontrada — tammyres não será criado.");
  } else {
    await upsertUser({ username: "tammyres", password: tammyresPass, role: "agent", agentId: 2 });
  }

  console.log("\nPronto!");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
