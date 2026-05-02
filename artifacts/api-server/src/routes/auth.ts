import { Router, Request, Response } from "express";
import {
  createSessionCookie,
  validateCredentialsEnv,
  getSessionData,
  hashPassword,
  verifyPassword,
  SessionData,
} from "../lib/auth";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const IS_PROD = process.env.NODE_ENV === "production";
const COOKIE_OPTS = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: "lax" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

async function validateCredentialsDB(
  username: string,
  password: string,
): Promise<SessionData | null> {
  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, username))
      .limit(1);

    if (!user || !user.active) return null;
    if (!verifyPassword(password, user.passwordHash)) return null;

    return {
      role: user.role as "admin" | "agent",
      agentId: user.agentId ?? undefined,
      username: user.username,
    };
  } catch {
    return null;
  }
}

router.post("/login", async (req: Request, res: Response) => {
  const { username, password } = req.body as {
    username?: string;
    password?: string;
  };
  if (!username || !password) {
    res.status(400).json({ error: "Usuário e senha são obrigatórios" });
    return;
  }

  const trimmed = username.trim();

  // DB-based validation first
  let sessionData: SessionData | null = await validateCredentialsDB(trimmed, password);

  // Fallback to env vars (backwards compat for admin login)
  if (!sessionData) {
    const envResult = validateCredentialsEnv(trimmed, password);
    if (envResult) {
      sessionData = { role: envResult.role, username: envResult.username };
    }
  }

  if (!sessionData) {
    res.status(401).json({ error: "Usuário ou senha incorretos" });
    return;
  }

  const cookie = createSessionCookie(sessionData);
  res.cookie("crm_session", cookie, COOKIE_OPTS);
  res.json({
    role: sessionData.role,
    agentId: sessionData.agentId ?? null,
    username: sessionData.username,
  });
});

router.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie("crm_session");
  res.json({ ok: true });
});

router.get("/me", (req: Request, res: Response) => {
  const session = getSessionData(req);
  if (!session) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  res.json({
    role: session.role,
    agentId: session.agentId ?? null,
    username: session.username,
  });
});

// ── Admin: manage users ────────────────────────────────────────────────────────
router.post("/users", async (req: Request, res: Response) => {
  const session = getSessionData(req);
  if (session?.role !== "admin") {
    res.status(403).json({ error: "Apenas o administrador pode criar usuários" });
    return;
  }
  const { username, password, role, agentId } = req.body as {
    username?: string;
    password?: string;
    role?: string;
    agentId?: number | null;
  };
  if (!username || !password || !role) {
    res.status(400).json({ error: "username, password e role são obrigatórios" });
    return;
  }
  if (role !== "admin" && role !== "agent") {
    res.status(400).json({ error: "role deve ser 'admin' ou 'agent'" });
    return;
  }
  const passwordHash = hashPassword(password);
  const [user] = await db
    .insert(usersTable)
    .values({ username, passwordHash, role, agentId: agentId ?? null })
    .returning();
  res.json({ id: user.id, username: user.username, role: user.role });
});

router.get("/users", async (req: Request, res: Response) => {
  const session = getSessionData(req);
  if (session?.role !== "admin") {
    res.status(403).json({ error: "Apenas o administrador" });
    return;
  }
  const users = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      role: usersTable.role,
      agentId: usersTable.agentId,
      active: usersTable.active,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .orderBy(usersTable.createdAt);
  res.json({ users });
});

router.patch("/users/:id", async (req: Request, res: Response) => {
  const session = getSessionData(req);
  if (session?.role !== "admin") {
    res.status(403).json({ error: "Apenas o administrador" });
    return;
  }
  const id = parseInt(req.params.id, 10);
  const { password, active } = req.body as { password?: string; active?: boolean };
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (password) updates.passwordHash = hashPassword(password);
  if (active !== undefined) updates.active = active;
  const [user] = await db
    .update(usersTable)
    .set(updates as any)
    .where(eq(usersTable.id, id))
    .returning();
  res.json({ id: user.id, username: user.username, active: user.active });
});

export default router;
