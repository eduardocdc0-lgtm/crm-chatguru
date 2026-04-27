import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

function getEnv(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback;
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export type UserRole = "admin" | "team";

function sign(value: string): string {
  return crypto
    .createHmac("sha256", getEnv("SESSION_SECRET"))
    .update(value)
    .digest("hex");
}

function verifyAndDecode(cookie: string): { role: UserRole } | null {
  const dotIdx = cookie.lastIndexOf(".");
  if (dotIdx === -1) return null;
  const payload = cookie.slice(0, dotIdx);
  const sig = cookie.slice(dotIdx + 1);
  if (sign(payload) !== sig) return null;
  try {
    const decoded = Buffer.from(payload, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded);
    if (parsed.role !== "admin" && parsed.role !== "team") return null;
    return parsed as { role: UserRole };
  } catch {
    return null;
  }
}

export function createSessionCookie(role: UserRole): string {
  const payload = Buffer.from(JSON.stringify({ role })).toString("base64url");
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export function getSessionRole(req: Request): UserRole | null {
  const cookie = (req.cookies as Record<string, string>)?.["crm_session"];
  if (!cookie) return null;
  return verifyAndDecode(cookie)?.role ?? null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // ChatGuru webhook must stay public
  if (
    req.path.startsWith("/chatguru/webhook") &&
    req.method === "POST"
  ) {
    next();
    return;
  }
  // Auth routes are public
  if (req.path.startsWith("/auth/")) {
    next();
    return;
  }

  const role = getSessionRole(req);
  if (!role) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  (req as Request & { userRole: UserRole }).userRole = role;
  next();
}

export function validateCredentials(
  username: string,
  password: string
): UserRole | null {
  const adminUser = getEnv("ADMIN_USER", "eduardo");
  // ADMIN_PASSWORD (env var) takes priority over ADMIN_PASS (secret)
  const adminPass = process.env["ADMIN_PASSWORD"] ?? getEnv("ADMIN_PASS");
  const teamUser = getEnv("TEAM_USER", "equipe");
  // TEAM_PASSWORD (env var) takes priority over TEAM_PASS (secret)
  const teamPass = process.env["TEAM_PASSWORD"] ?? getEnv("TEAM_PASS");
  if (username === adminUser && password === adminPass) return "admin";
  if (username === teamUser && password === teamPass) return "team";
  return null;
}
