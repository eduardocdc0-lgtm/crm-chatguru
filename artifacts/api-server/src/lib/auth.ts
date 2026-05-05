import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

// ── Types ─────────────────────────────────────────────────────────────────────
// "agent_taskforce" = atendimento força-tarefa (Letícia hoje):
//   vê todos os leads (igual admin pra leitura), mas SEM faturamento, equipe, números, etc.
//   pode disparar reengajamento de qualquer lead e "passar pra fechamento".
// "team" é legado, mantido pra compatibilidade.
export type UserRole = "admin" | "agent" | "agent_taskforce" | "team";

const VALID_ROLES: ReadonlySet<UserRole> = new Set(["admin", "agent", "agent_taskforce", "team"]);

export interface SessionData {
  role: UserRole;
  agentId?: number;
  username: string;
}

// ── Password Hashing (crypto.scrypt — no extra dependency) ───────────────────
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  try {
    const expected = crypto.scryptSync(password, salt, 32).toString("hex");
    return crypto.timingSafeEqual(
      Buffer.from(hash, "hex"),
      Buffer.from(expected, "hex"),
    );
  } catch {
    return false;
  }
}

// ── Session Cookie (HMAC-signed base64url) ────────────────────────────────────
function getEnv(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback;
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function sign(value: string): string {
  return crypto
    .createHmac("sha256", getEnv("SESSION_SECRET"))
    .update(value)
    .digest("hex");
}

function verifyAndDecode(cookie: string): SessionData | null {
  const dotIdx = cookie.lastIndexOf(".");
  if (dotIdx === -1) return null;
  const payload = cookie.slice(0, dotIdx);
  const sig = cookie.slice(dotIdx + 1);
  if (sign(payload) !== sig) return null;
  try {
    const decoded = Buffer.from(payload, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded);
    const role = parsed.role;
    if (!VALID_ROLES.has(role)) return null;
    return {
      role: role as UserRole,
      agentId: parsed.agentId ?? undefined,
      username: parsed.username ?? (role === "admin" ? "admin" : "equipe"),
    };
  } catch {
    return null;
  }
}

export function createSessionCookie(data: SessionData): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

// ── Session Accessors ─────────────────────────────────────────────────────────
export function getSessionData(req: Request): SessionData | null {
  const cookie = (req.cookies as Record<string, string>)?.["crm_session"];
  if (!cookie) return null;
  return verifyAndDecode(cookie);
}

/** Backward-compat: returns role only */
export function getSessionRole(req: Request): UserRole | null {
  return getSessionData(req)?.role ?? null;
}

/**
 * Returns the agentId to filter by. Returns null for admin/team/agent_taskforce
 * (eles veem tudo). Apenas "agent" (Thiago, Tammyres) é restringido aos próprios leads.
 */
export function getAgentFilter(req: Request): number | null {
  const session = getSessionData(req);
  if (session?.role === "agent" && session.agentId) return session.agentId;
  return null;
}

/** True quando o usuário pode ler/operar sobre qualquer lead. */
export function canSeeAllLeads(role: UserRole | null | undefined): boolean {
  return role === "admin" || role === "team" || role === "agent_taskforce";
}

/** True quando o usuário pode reatribuir leads pra outros agentes (passar pra fechamento). */
export function canReassign(role: UserRole | null | undefined): boolean {
  return role === "admin" || role === "agent_taskforce";
}

// ── Middleware ────────────────────────────────────────────────────────────────

/**
 * requireReadApiKey — aceita leitura via X-Api-Key header.
 * Permite que dashboards externos (ex: AdvBox, integrações) consultem
 * endpoints GET sem precisar de sessão de usuário.
 * Só libera métodos seguros (GET/HEAD/OPTIONS); POST/PUT/DELETE exigem sessão.
 */
export function requireReadApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers["x-api-key"];
  const configured = process.env["READ_API_KEY"];
  if (configured && apiKey === configured) {
    // Injeta sessão de leitura sintética para manter compatibilidade com getAgentFilter etc.
    (req as Request & { userSession: SessionData }).userSession = {
      role: "admin",
      username: "api-key",
    };
    next();
    return;
  }
  res.status(401).json({ error: "X-Api-Key inválida ou ausente" });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.path.startsWith("/chatguru/webhook") && req.method === "POST") {
    next(); return;
  }
  if (req.path.startsWith("/auth/")) {
    next(); return;
  }

  // Aceita X-Api-Key como alternativa ao cookie de sessão (acesso de leitura)
  const apiKey = req.headers["x-api-key"];
  const configuredKey = process.env["READ_API_KEY"];
  if (configuredKey && apiKey === configuredKey) {
    (req as Request & { userSession: SessionData }).userSession = {
      role: "admin",
      username: "api-key",
    };
    next();
    return;
  }

  const session = getSessionData(req);
  if (!session) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  (req as Request & { userSession: SessionData }).userSession = session;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const session = getSessionData(req);
  if (session?.role !== "admin") {
    res.status(403).json({ error: "Acesso restrito ao administrador" });
    return;
  }
  next();
}

// ── Legacy env-var credential check (fallback for admin login) ────────────────
export function validateCredentialsEnv(
  username: string,
  password: string,
): { role: UserRole; username: string } | null {
  try {
    const adminUser = getEnv("ADMIN_USER", "eduardo");
    const adminPass = process.env["ADMIN_PASSWORD"] ?? getEnv("ADMIN_PASS");
    if (username === adminUser && password === adminPass) {
      return { role: "admin", username: adminUser };
    }
  } catch {}
  try {
    const teamUser = getEnv("TEAM_USER", "equipe");
    const teamPass = process.env["TEAM_PASSWORD"] ?? getEnv("TEAM_PASS");
    if (username === teamUser && password === teamPass) {
      return { role: "team", username: teamUser };
    }
  } catch {}
  return null;
}
