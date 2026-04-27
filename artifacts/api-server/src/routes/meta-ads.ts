import { Router } from "express";
import { logger } from "../lib/logger";

const router = Router();

const META_BASE = "https://graph.facebook.com/v22.0";
const AD_ACCOUNT = "act_654132083965752";

function getToken(): string {
  const t = process.env["META_ACCESS_TOKEN"];
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
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

function extractConversations(actions: Array<{ action_type: string; value: string }> = []): number {
  const targets = [
    "onsite_conversion.messaging_conversation_started_7d",
    "messaging_conversation_started",
    "lead",
  ];
  for (const t of targets) {
    const found = actions.find(a => a.action_type === t);
    if (found) return Number(found.value) || 0;
  }
  return 0;
}

interface CampaignMeta {
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
  conversations: number;
}

interface Summary {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number | null;
  cpm: number | null;
  conversations: number;
  cachedAt: string;
}

interface MetaAdsData {
  summary: Summary;
  campaigns: CampaignMeta[];
  cachedAt: string;
  fromCache: boolean;
}

// GET /api/meta-ads — summary + campaigns (30d)
router.get("/", async (_req, res) => {
  const cacheKey = "meta-ads-full";
  const cached = getCached<MetaAdsData>(cacheKey);
  if (cached) {
    res.json({ ...cached, fromCache: true });
    return;
  }

  try {
    const insightFields = "spend,impressions,reach,clicks,ctr,cpm,actions";

    // Account-level summary
    const accountInsights = await metaGet(`/${AD_ACCOUNT}/insights`, {
      fields: insightFields,
      date_preset: "last_30d",
    }) as { data: Array<Record<string, unknown>> };

    const agg = accountInsights.data?.[0] ?? {};
    const summary: Summary = {
      spend: Number(agg.spend ?? 0),
      impressions: Number(agg.impressions ?? 0),
      reach: Number(agg.reach ?? 0),
      clicks: Number(agg.clicks ?? 0),
      ctr: agg.ctr != null ? Number(agg.ctr) : null,
      cpm: agg.cpm != null ? Number(agg.cpm) : null,
      conversations: extractConversations((agg.actions ?? []) as Array<{ action_type: string; value: string }>),
      cachedAt: new Date().toISOString(),
    };

    // Campaigns list with insights
    const campaignsRaw = await metaGet(`/${AD_ACCOUNT}/campaigns`, {
      fields: `name,status,objective,insights.date_preset(last_30d){${insightFields}}`,
      limit: "100",
    }) as { data: Array<Record<string, unknown>> };

    const campaigns: CampaignMeta[] = (campaignsRaw.data ?? []).map((c) => {
      const ins = (c.insights as { data?: Array<Record<string, unknown>> } | undefined)?.data?.[0] ?? {};
      return {
        id: String(c.id),
        name: String(c.name ?? ""),
        status: String(c.status ?? ""),
        objective: c.objective != null ? String(c.objective) : null,
        spend: Number(ins.spend ?? 0),
        impressions: Number(ins.impressions ?? 0),
        reach: Number(ins.reach ?? 0),
        clicks: Number(ins.clicks ?? 0),
        ctr: ins.ctr != null ? Number(ins.ctr) : null,
        cpm: ins.cpm != null ? Number(ins.cpm) : null,
        conversations: extractConversations((ins.actions ?? []) as Array<{ action_type: string; value: string }>),
      };
    });

    const result: MetaAdsData = {
      summary,
      campaigns,
      cachedAt: new Date().toISOString(),
      fromCache: false,
    };

    setCached(cacheKey, result);
    logger.info({ campaigns: campaigns.length }, "Meta Ads data fetched");
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "GET /meta-ads failed");
    res.status(502).json({ error: msg });
  }
});

// GET /api/meta-ads/refresh — force refresh
router.get("/refresh", async (_req, res) => {
  cache.clear();
  res.json({ ok: true, message: "Cache limpo. Próxima requisição busca dados frescos." });
});

export default router;
