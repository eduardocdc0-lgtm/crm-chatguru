import { Router } from "express";
import { logger } from "../lib/logger";

const router = Router();

const META_BASE = "https://graph.facebook.com/v22.0";

function getAdAccount(): string {
  const raw = process.env["META_AD_ACCOUNT_ID"] ?? "654132083965752";
  const numeric = raw.replace(/^act_/, "");
  return `act_${numeric}`;
}

function getToken(): string {
  // META_TOKEN_OVERRIDE permite atualizar o token sem depender do sistema de Secrets
  const t = process.env["META_TOKEN_OVERRIDE"] || process.env["META_ACCESS_TOKEN"];
  if (!t) throw new Error("META_ACCESS_TOKEN não configurado");
  return t;
}

// Server-side cache: 15 minutes
interface CacheEntry<T> { data: T; ts: number }
const cache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL = 15 * 60 * 1000;

function getCached<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(key); return null; }
  return entry.data;
}
function setCached<T>(key: string, data: T): void {
  cache.set(key, { data, ts: Date.now() });
}

async function metaGet(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(`${META_BASE}${path}`);
  url.searchParams.set("access_token", getToken());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta API ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

function extractLeads(actions: Array<{ action_type: string; value: string }> = []): number {
  const targets = [
    "onsite_conversion.messaging_conversation_started_7d",
    "messaging_conversation_started",
    "lead",
    "onsite_conversion.lead_grouped",
  ];
  for (const t of targets) {
    const found = actions.find(a => a.action_type === t);
    if (found) return Number(found.value) || 0;
  }
  return 0;
}

// Valid date_preset values for Meta API
const VALID_PRESETS = new Set([
  "today", "yesterday", "last_7d", "last_30d",
  "this_month", "last_month", "last_3d",
]);

function getDatePreset(raw: string | undefined): string {
  if (raw && VALID_PRESETS.has(raw)) return raw;
  return "last_30d";
}

interface CampaignData {
  id: string;
  name: string;
  status: string;
  objective: string | null;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number | null;
  cpm: number | null;
  cpc: number | null;
  leads: number;
  cpl: number | null;
}

interface AdsData {
  summary: {
    spend: number;
    impressions: number;
    reach: number;
    clicks: number;
    ctr: number | null;
    cpm: number | null;
    leads: number;
    cpl: number | null;
  };
  campaigns: CampaignData[];
  datePreset: string;
  cachedAt: string;
  fromCache: boolean;
}

// GET /api/meta-ads?date_preset=today|yesterday|last_7d|this_month|last_month|last_30d
router.get("/", async (req, res) => {
  const datePreset = getDatePreset(req.query.date_preset as string | undefined);
  const forceRefresh = req.query.refresh === "1";
  const cacheKey = `meta-ads-${datePreset}`;

  if (!forceRefresh) {
    const cached = getCached<AdsData>(cacheKey);
    if (cached) {
      res.json({ ...cached, fromCache: true });
      return;
    }
  } else {
    cache.delete(cacheKey);
  }

  try {
    const insightFields = "spend,impressions,reach,clicks,ctr,cpm,cpc,actions";
    const AD_ACCOUNT = getAdAccount();

    // Account-level summary
    const accountInsights = await metaGet(`/${AD_ACCOUNT}/insights`, {
      fields: insightFields,
      date_preset: datePreset,
    }) as { data: Array<Record<string, unknown>> };

    const agg = accountInsights.data?.[0] ?? {};
    const summaryLeads = extractLeads((agg.actions ?? []) as Array<{ action_type: string; value: string }>);
    const summarySpend = Number(agg.spend ?? 0);

    const summary = {
      spend: summarySpend,
      impressions: Number(agg.impressions ?? 0),
      reach: Number(agg.reach ?? 0),
      clicks: Number(agg.clicks ?? 0),
      ctr: agg.ctr != null ? Number(agg.ctr) : null,
      cpm: agg.cpm != null ? Number(agg.cpm) : null,
      leads: summaryLeads,
      cpl: summaryLeads > 0 ? summarySpend / summaryLeads : null,
    };

    // Campaigns with insights
    const campaignsRaw = await metaGet(`/${AD_ACCOUNT}/campaigns`, {
      fields: `name,status,objective,insights.date_preset(${datePreset}){${insightFields}}`,
      limit: "100",
    }) as { data: Array<Record<string, unknown>> };

    const campaigns: CampaignData[] = (campaignsRaw.data ?? []).map((c) => {
      const ins = (c.insights as { data?: Array<Record<string, unknown>> } | undefined)?.data?.[0] ?? {};
      const spend = Number(ins.spend ?? 0);
      const leads = extractLeads((ins.actions ?? []) as Array<{ action_type: string; value: string }>);
      return {
        id: String(c.id),
        name: String(c.name ?? ""),
        status: String(c.status ?? ""),
        objective: c.objective != null ? String(c.objective) : null,
        spend,
        impressions: Number(ins.impressions ?? 0),
        reach: Number(ins.reach ?? 0),
        clicks: Number(ins.clicks ?? 0),
        ctr: ins.ctr != null ? Number(ins.ctr) : null,
        cpm: ins.cpm != null ? Number(ins.cpm) : null,
        cpc: ins.cpc != null ? Number(ins.cpc) : null,
        leads,
        cpl: leads > 0 ? spend / leads : null,
      };
    });

    const result: AdsData = {
      summary,
      campaigns,
      datePreset,
      cachedAt: new Date().toISOString(),
      fromCache: false,
    };

    setCached(cacheKey, result);
    logger.info({ campaigns: campaigns.length, datePreset }, "Meta Ads data fetched");
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "GET /meta-ads failed");
    res.status(502).json({ error: msg });
  }
});

// GET /api/meta-ads/token-status — verifica expiração do token
router.get("/token-status", async (_req, res) => {
  const appId = process.env["META_APP_ID"];
  const appSecret = process.env["META_APP_SECRET"];
  const token = process.env["META_TOKEN_OVERRIDE"] || process.env["META_ACCESS_TOKEN"];

  if (!appId || !appSecret || !token) {
    res.json({ valid: false, error: "Credenciais incompletas" });
    return;
  }

  try {
    const url = new URL(`${META_BASE}/debug_token`);
    url.searchParams.set("input_token", token);
    url.searchParams.set("access_token", `${appId}|${appSecret}`);
    const r = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
    const json = await r.json() as { data?: { is_valid?: boolean; expires_at?: number; scopes?: string[] } };
    const data = json.data ?? {};
    const expiresAt = data.expires_at ?? null;
    const daysLeft = expiresAt ? Math.ceil((expiresAt * 1000 - Date.now()) / 86400000) : null;
    res.json({
      valid: data.is_valid ?? false,
      expiresAt,
      daysLeft,
      scopes: data.scopes ?? [],
    });
  } catch (err) {
    logger.error({ err }, "Token status check failed");
    res.status(502).json({ valid: false, error: "Erro ao verificar token" });
  }
});

// GET /api/meta-ads/refresh — limpa cache
router.get("/refresh", async (_req, res) => {
  cache.clear();
  res.json({ ok: true });
});

export default router;
