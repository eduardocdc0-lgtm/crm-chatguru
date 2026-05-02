import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RefreshCw, DollarSign, Eye, Users, MessageSquare,
  MousePointer, TrendingUp, BarChart2, AlertCircle, Search,
  Star, Settings, ChevronDown, AlertTriangle,
} from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
const CACHE_15MIN = 15 * 60 * 1000;

// ─── Types ───────────────────────────────────────────────────────────────────

interface CampaignData {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
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

interface TokenStatus {
  valid: boolean;
  expiresAt: number | null;
  daysLeft: number | null;
  scopes: string[];
  error?: string;
}

// ─── Settings store (localStorage) ──────────────────────────────────────────

interface MetaSettings {
  cplGood: number;
  cplBad: number;
  favorites: string[];
  aliases: Record<string, string>;
}

function loadSettings(): MetaSettings {
  try {
    const raw = localStorage.getItem("meta-ads-settings");
    if (raw) return JSON.parse(raw) as MetaSettings;
  } catch { /* ignore */ }
  return { cplGood: 30, cplBad: 80, favorites: [], aliases: {} };
}

function saveSettings(s: MetaSettings) {
  localStorage.setItem("meta-ads-settings", JSON.stringify(s));
}

// ─── Period options ──────────────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { value: "today",      label: "Hoje" },
  { value: "yesterday",  label: "Ontem" },
  { value: "last_3d",    label: "Últimos 3 dias" },
  { value: "last_7d",    label: "Últimos 7 dias" },
  { value: "this_month", label: "Este mês" },
  { value: "last_month", label: "Mês passado" },
  { value: "last_30d",   label: "Últimos 30 dias" },
];

// ─── Formatters ──────────────────────────────────────────────────────────────

const fmtBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(n);

const fmtNum = (n: number) =>
  new Intl.NumberFormat("pt-BR").format(Math.round(n));

const fmtPct = (n: number | null) =>
  n != null ? `${Number(n).toFixed(2)}%` : "—";

const fmtBRLOrDash = (n: number | null) =>
  n != null ? fmtBRL(n) : "—";

function cplSemaforo(cpl: number | null, good: number, bad: number): {
  dot: string; badge: string; text: string;
} {
  if (cpl === null) return { dot: "bg-gray-300", badge: "text-gray-500 bg-gray-50", text: "—" };
  if (cpl <= good) return { dot: "bg-green-500", badge: "text-green-700 bg-green-50", text: fmtBRL(cpl) };
  if (cpl >= bad)  return { dot: "bg-red-500",   badge: "text-red-700 bg-red-50",   text: fmtBRL(cpl) };
  return { dot: "bg-yellow-400", badge: "text-yellow-700 bg-yellow-50", text: fmtBRL(cpl) };
}

function statusLabel(s: string): { label: string; color: string } {
  switch (s.toUpperCase()) {
    case "ACTIVE":        return { label: "Ativa",          color: "text-green-600 bg-green-50 dark:bg-green-950/30" };
    case "PAUSED":        return { label: "Pausada",        color: "text-orange-600 bg-orange-50 dark:bg-orange-950/30" };
    case "DELETED":       return { label: "Removida",       color: "text-red-500 bg-red-50" };
    case "ARCHIVED":      return { label: "Arquivada",      color: "text-gray-500 bg-gray-100 dark:bg-gray-800" };
    case "WITH_ISSUES":   return { label: "Com problemas",  color: "text-red-600 bg-red-50 dark:bg-red-950/30" };
    case "DISAPPROVED":   return { label: "Reprovada",      color: "text-red-600 bg-red-50 dark:bg-red-950/30" };
    case "PENDING_REVIEW":return { label: "Em revisão",     color: "text-yellow-600 bg-yellow-50 dark:bg-yellow-950/30" };
    default:              return { label: s,                color: "text-gray-500 bg-gray-100" };
  }
}

function timeAgoFromISO(iso: string): string {
  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "agora mesmo";
  if (diff < 3600) return `há ${Math.round(diff / 60)}min`;
  return `há ${Math.round(diff / 3600)}h`;
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, icon: Icon, sub, color = "blue",
}: {
  label: string; value: string; icon: React.ElementType;
  sub?: string; color?: "blue"|"green"|"purple"|"orange"|"pink"|"indigo"|"red";
}) {
  const colors: Record<string, { bg: string; icon: string }> = {
    blue:   { bg: "bg-blue-50 dark:bg-blue-950/30",   icon: "text-blue-500" },
    green:  { bg: "bg-green-50 dark:bg-green-950/30",  icon: "text-green-500" },
    purple: { bg: "bg-purple-50 dark:bg-purple-950/30",icon: "text-purple-500" },
    orange: { bg: "bg-orange-50 dark:bg-orange-950/30",icon: "text-orange-500" },
    pink:   { bg: "bg-pink-50 dark:bg-pink-950/30",   icon: "text-pink-500" },
    indigo: { bg: "bg-indigo-50 dark:bg-indigo-950/30",icon: "text-indigo-500" },
    red:    { bg: "bg-red-50 dark:bg-red-950/30",     icon: "text-red-500" },
  };
  const c = colors[color] ?? colors.blue;
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
      <div className={`${c.bg} p-2.5 rounded-lg flex-shrink-0`}>
        <Icon className={`h-5 w-5 ${c.icon}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
        <p className="text-xl font-bold text-foreground mt-0.5 leading-none">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
      <Skeleton className="w-10 h-10 rounded-lg flex-shrink-0" />
      <div className="flex-1 space-y-2 pt-1">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-6 w-28" />
      </div>
    </div>
  );
}

// ─── Settings Panel ──────────────────────────────────────────────────────────

function SettingsPanel({
  settings,
  onChange,
  campaigns,
}: {
  settings: MetaSettings;
  onChange: (s: MetaSettings) => void;
  campaigns: CampaignData[];
}) {
  const [goodVal, setGoodVal] = useState(String(settings.cplGood));
  const [badVal, setBadVal]   = useState(String(settings.cplBad));

  function apply() {
    const good = parseFloat(goodVal);
    const bad  = parseFloat(badVal);
    if (!isNaN(good) && !isNaN(bad) && good < bad) {
      onChange({ ...settings, cplGood: good, cplBad: bad });
    }
  }

  function toggleFav(id: string) {
    const favs = settings.favorites.includes(id)
      ? settings.favorites.filter(f => f !== id)
      : [...settings.favorites, id];
    onChange({ ...settings, favorites: favs });
  }

  function setAlias(id: string, alias: string) {
    const aliases = { ...settings.aliases, [id]: alias };
    if (!alias) delete aliases[id];
    onChange({ ...settings, aliases });
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-6">
      <h3 className="font-semibold text-sm">Configurações Meta Ads</h3>

      {/* CPL Thresholds */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
          Thresholds de CPL (Custo por Lead)
        </p>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">🟢 Bom — CPL até R$</label>
            <input
              type="number"
              value={goodVal}
              onChange={e => setGoodVal(e.target.value)}
              className="w-24 px-2.5 py-1.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">🔴 Ruim — CPL acima de R$</label>
            <input
              type="number"
              value={badVal}
              onChange={e => setBadVal(e.target.value)}
              className="w-24 px-2.5 py-1.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <button
            onClick={apply}
            className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Salvar
          </button>
          <p className="text-xs text-muted-foreground self-center">
            🟡 Médio: R${settings.cplGood}–R${settings.cplBad}
          </p>
        </div>
      </div>

      {/* Campaigns: favorites + aliases */}
      {campaigns.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Favoritos e apelidos das campanhas
          </p>
          <div className="space-y-2">
            {campaigns.map(c => (
              <div key={c.id} className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => toggleFav(c.id)}
                  className={`flex-shrink-0 ${settings.favorites.includes(c.id) ? "text-yellow-400" : "text-gray-300 hover:text-yellow-300"}`}
                  title="Marcar como favorita"
                >
                  <Star className="h-4 w-4" fill={settings.favorites.includes(c.id) ? "currentColor" : "none"} />
                </button>
                <span className="text-xs text-muted-foreground flex-shrink-0 w-4">
                  {(c.effectiveStatus || c.status) === "ACTIVE" ? "🟢" : (c.effectiveStatus || c.status) === "PAUSED" ? "⏸" : (c.effectiveStatus || c.status) === "WITH_ISSUES" ? "⚠️" : "⬜"}
                </span>
                <span className="text-xs text-foreground flex-1 min-w-0 truncate" title={c.name}>{c.name}</span>
                <input
                  type="text"
                  placeholder="Apelido..."
                  value={settings.aliases[c.id] ?? ""}
                  onChange={e => setAlias(c.id, e.target.value)}
                  className="w-36 px-2 py-1 text-xs rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type SortCol = "name" | "spend" | "leads" | "cpl" | "clicks" | "impressions" | "ctr" | "cpm";
type StatusFilter = "active" | "paused" | "issues" | "all";

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "active",  label: "Só ativas" },
  { value: "paused",  label: "Pausadas" },
  { value: "issues",  label: "Com problemas" },
  { value: "all",     label: "Todas" },
];

export function TrafficPerformance() {
  const qc = useQueryClient();
  const [datePreset, setDatePreset] = useState("last_30d");
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<SortCol>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showSettings, setShowSettings] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [settings, setSettings] = useState<MetaSettings>(loadSettings);

  useEffect(() => { saveSettings(settings); }, [settings]);

  const { data, isLoading, isError, error } = useQuery<AdsData>({
    queryKey: ["meta-ads", datePreset],
    queryFn: async () => {
      const r = await fetch(`${BASE_URL}/api/meta-ads?date_preset=${datePreset}`, { credentials: "include" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      return r.json() as Promise<AdsData>;
    },
    staleTime: CACHE_15MIN,
    retry: 1,
  });

  const { data: tokenStatus } = useQuery<TokenStatus>({
    queryKey: ["meta-token-status"],
    queryFn: async () => {
      const r = await fetch(`${BASE_URL}/api/meta-ads/token-status`, { credentials: "include" });
      return r.json() as Promise<TokenStatus>;
    },
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  function handleRefresh() {
    void qc.invalidateQueries({ queryKey: ["meta-ads"] });
    void fetch(`${BASE_URL}/api/meta-ads/refresh`, { credentials: "include" });
  }

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortCol(col); setSortDir("desc"); }
  }

  const filteredCampaigns = useMemo(() => {
    if (!data?.campaigns) return [];
    let rows = [...data.campaigns];

    // Filter by effective_status — use effectiveStatus if present, fall back to status
    const getES = (c: CampaignData) => (c.effectiveStatus || c.status || "").toUpperCase();
    switch (statusFilter) {
      case "active":
        rows = rows.filter(c => getES(c) === "ACTIVE");
        break;
      case "paused":
        rows = rows.filter(c => getES(c) === "PAUSED");
        break;
      case "issues":
        rows = rows.filter(c => ["WITH_ISSUES", "DISAPPROVED"].includes(getES(c)));
        break;
      case "all":
        // Hide ARCHIVED in "all" view to reduce noise; they're gone for practical purposes
        rows = rows.filter(c => getES(c) !== "ARCHIVED");
        break;
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(c => {
        const alias = settings.aliases[c.id] ?? "";
        return c.name.toLowerCase().includes(q) || alias.toLowerCase().includes(q);
      });
    }
    rows.sort((a, b) => {
      const favA = settings.favorites.includes(a.id) ? 1 : 0;
      const favB = settings.favorites.includes(b.id) ? 1 : 0;
      if (favA !== favB) return favB - favA;
      let av: number | string = 0, bv: number | string = 0;
      switch (sortCol) {
        case "name":       av = a.name;        bv = b.name; break;
        case "spend":      av = a.spend;       bv = b.spend; break;
        case "leads":      av = a.leads;       bv = b.leads; break;
        case "cpl":        av = a.cpl ?? 9999; bv = b.cpl ?? 9999; break;
        case "clicks":     av = a.clicks;      bv = b.clicks; break;
        case "impressions":av = a.impressions; bv = b.impressions; break;
        case "ctr":        av = a.ctr ?? 0;   bv = b.ctr ?? 0; break;
        case "cpm":        av = a.cpm ?? 0;   bv = b.cpm ?? 0; break;
      }
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : Number(av) - Number(bv);
      return sortDir === "desc" ? -cmp : cmp;
    });
    return rows;
  }, [data?.campaigns, search, sortCol, sortDir, statusFilter, settings]);

  const s = data?.summary;
  const periodLabel = PERIOD_OPTIONS.find(o => o.value === datePreset)?.label ?? datePreset;

  function ThBtn({ col, label }: { col: SortCol; label: string }) {
    return (
      <button
        onClick={() => toggleSort(col)}
        className="flex items-center gap-1 hover:text-primary transition-colors font-medium whitespace-nowrap"
      >
        {label}
        {sortCol === col && (
          <span className="text-xs opacity-60">{sortDir === "desc" ? "↓" : "↑"}</span>
        )}
      </button>
    );
  }

  const showTokenWarning = tokenStatus?.valid && tokenStatus.daysLeft != null && tokenStatus.daysLeft <= 7;
  const showTokenExpired = tokenStatus?.valid === false;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-6xl mx-auto">
      {/* Token warning */}
      {(showTokenWarning || showTokenExpired) && (
        <div className={`flex items-start gap-3 p-4 rounded-xl border ${showTokenExpired ? "bg-red-50 border-red-300 text-red-800 dark:bg-red-950/30 dark:border-red-700" : "bg-yellow-50 border-yellow-300 text-yellow-800 dark:bg-yellow-950/30 dark:border-yellow-700"}`}>
          <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            {showTokenExpired ? (
              <p className="font-medium text-sm">Token Meta expirado. Gere um novo em <a href="https://developers.facebook.com/tools/explorer" target="_blank" rel="noopener noreferrer" className="underline">developers.facebook.com/tools/explorer</a> e atualize a Secret <code className="bg-black/10 px-1 rounded">META_ACCESS_TOKEN</code>.</p>
            ) : (
              <p className="font-medium text-sm">⚠️ Token Meta expira em <strong>{tokenStatus!.daysLeft} dias</strong>. Renove em <a href="https://developers.facebook.com/tools/explorer" target="_blank" rel="noopener noreferrer" className="underline">developers.facebook.com/tools/explorer</a> e atualize <code className="bg-black/10 px-1 rounded">META_ACCESS_TOKEN</code> nas Secrets.</p>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">📊 Meta Ads</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Anuncio - Eduardo Rodrigues · {periodLabel}
            {tokenStatus?.daysLeft != null && tokenStatus.valid && (
              <span className="ml-2 text-xs text-green-600">· token válido ({tokenStatus.daysLeft}d)</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {data?.cachedAt && (
            <span className="text-xs text-muted-foreground">
              Atualizado {timeAgoFromISO(data.cachedAt)}
              {data.fromCache && " · cache"}
            </span>
          )}
          <button
            onClick={() => setShowSettings(v => !v)}
            className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-border transition-colors ${showSettings ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}
          >
            <Settings className="h-3.5 w-3.5" />
            Config
          </button>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Period Selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground font-medium">Período:</span>
        {PERIOD_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setDatePreset(opt.value)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${datePreset === opt.value ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-muted text-foreground"}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Settings panel */}
      {showSettings && (
        <SettingsPanel
          settings={settings}
          onChange={setSettings}
          campaigns={data?.campaigns ?? []}
        />
      )}

      {/* Error */}
      {isError && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 dark:bg-red-950/30 dark:border-red-700 dark:text-red-400">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <div>
            <p className="font-medium text-sm">Erro ao carregar dados da Meta API</p>
            <p className="text-xs mt-0.5 opacity-80">{(error as Error)?.message}</p>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <KpiSkeleton key={i} />)
        ) : s ? (
          <>
            <KpiCard
              label="💰 Gasto Total"
              value={fmtBRL(s.spend)}
              icon={DollarSign}
              color="green"
              sub={periodLabel}
            />
            <KpiCard
              label="👥 Leads"
              value={fmtNum(s.leads)}
              icon={MessageSquare}
              color="purple"
              sub="conversas WhatsApp"
            />
            <KpiCard
              label="💵 CPL Médio"
              value={fmtBRLOrDash(s.cpl)}
              icon={TrendingUp}
              color={s.cpl == null ? "blue" : s.cpl <= settings.cplGood ? "green" : s.cpl >= settings.cplBad ? "red" : "orange"}
              sub="custo por lead"
            />
            <KpiCard
              label="👁 Impressões"
              value={fmtNum(s.impressions)}
              icon={Eye}
              color="blue"
            />
            <KpiCard
              label="👤 Alcance"
              value={fmtNum(s.reach)}
              icon={Users}
              color="indigo"
            />
            <KpiCard
              label="🖱 Cliques"
              value={fmtNum(s.clicks)}
              icon={MousePointer}
              color="orange"
            />
            <KpiCard
              label="CTR"
              value={fmtPct(s.ctr)}
              icon={TrendingUp}
              color="pink"
              sub="taxa de clique"
            />
            <KpiCard
              label="CPM"
              value={fmtBRLOrDash(s.cpm)}
              icon={BarChart2}
              color="blue"
              sub="custo por mil imp."
            />
          </>
        ) : null}
      </div>

      {/* Campaign Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-semibold text-sm mr-1">Performance por Campanha</h2>
            {STATUS_FILTER_OPTIONS.map(opt => {
              const isActive = statusFilter === opt.value;
              let activeClass = "bg-primary text-primary-foreground border-primary";
              if (isActive) {
                if (opt.value === "active")  activeClass = "bg-green-100 border-green-300 text-green-700 dark:bg-green-950/40 dark:border-green-700 dark:text-green-400";
                if (opt.value === "paused")  activeClass = "bg-orange-100 border-orange-300 text-orange-700 dark:bg-orange-950/40 dark:border-orange-700 dark:text-orange-400";
                if (opt.value === "issues")  activeClass = "bg-red-100 border-red-300 text-red-700 dark:bg-red-950/40 dark:border-red-700 dark:text-red-400";
                if (opt.value === "all")     activeClass = "bg-muted border-border text-foreground";
              }
              return (
                <button
                  key={opt.value}
                  onClick={() => setStatusFilter(opt.value)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${isActive ? activeClass : "border-border bg-muted/30 text-muted-foreground hover:bg-muted"}`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Filtrar..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 w-44"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground w-6"></th>
                <th className="text-left px-2 py-2.5 text-xs text-muted-foreground">
                  <ThBtn col="name" label="Campanha" />
                </th>
                <th className="px-3 py-2.5 text-xs text-muted-foreground text-center">Status</th>
                <th className="px-3 py-2.5 text-xs text-muted-foreground text-right">
                  <ThBtn col="spend" label="Gasto" />
                </th>
                <th className="px-3 py-2.5 text-xs text-muted-foreground text-right">
                  <ThBtn col="leads" label="Leads" />
                </th>
                <th className="px-3 py-2.5 text-xs text-muted-foreground text-right">
                  <ThBtn col="cpl" label="CPL" />
                </th>
                <th className="px-3 py-2.5 text-xs text-muted-foreground text-right hidden lg:table-cell">
                  <ThBtn col="impressions" label="Impressões" />
                </th>
                <th className="px-3 py-2.5 text-xs text-muted-foreground text-right hidden lg:table-cell">
                  <ThBtn col="clicks" label="Cliques" />
                </th>
                <th className="px-3 py-2.5 text-xs text-muted-foreground text-right hidden xl:table-cell">
                  <ThBtn col="ctr" label="CTR" />
                </th>
                <th className="px-3 py-2.5 text-xs text-muted-foreground text-right hidden xl:table-cell">
                  <ThBtn col="cpm" label="CPM" />
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    {Array.from({ length: 10 }).map((__, j) => (
                      <td key={j} className="px-3 py-3"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : filteredCampaigns.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-10 text-muted-foreground text-sm">
                    {search ? "Nenhuma campanha encontrada." : "Sem dados para este período."}
                  </td>
                </tr>
              ) : (
                filteredCampaigns.map(c => {
                  const { label, color } = statusLabel(c.effectiveStatus || c.status);
                  const cpl = cplSemaforo(c.cpl, settings.cplGood, settings.cplBad);
                  const isFav = settings.favorites.includes(c.id);
                  const alias = settings.aliases[c.id];
                  return (
                    <tr key={c.id} className={`border-b border-border hover:bg-muted/20 transition-colors ${isFav ? "bg-yellow-50/30 dark:bg-yellow-950/10" : ""}`}>
                      <td className="px-4 py-3 text-center">
                        {isFav && <Star className="h-3.5 w-3.5 text-yellow-400 inline" fill="currentColor" />}
                      </td>
                      <td className="px-2 py-3">
                        <div className="font-medium text-foreground leading-snug max-w-[220px]" title={c.name}>
                          {alias ?? c.name}
                          {alias && <span className="text-xs text-muted-foreground ml-1 hidden xl:inline">({c.name.slice(0, 20)}…)</span>}
                        </div>
                        {c.objective && (
                          <div className="text-xs text-muted-foreground capitalize mt-0.5">
                            {c.objective.toLowerCase().replace(/_/g, " ").replace("outcome ", "")}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>{label}</span>
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-sm">{fmtBRL(c.spend)}</td>
                      <td className="px-3 py-3 text-right font-mono text-sm font-semibold">{fmtNum(c.leads)}</td>
                      <td className="px-3 py-3 text-right">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${cpl.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cpl.dot} flex-shrink-0`}></span>
                          {cpl.text}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-sm hidden lg:table-cell">{fmtNum(c.impressions)}</td>
                      <td className="px-3 py-3 text-right font-mono text-sm hidden lg:table-cell">{fmtNum(c.clicks)}</td>
                      <td className="px-3 py-3 text-right font-mono text-sm hidden xl:table-cell">{fmtPct(c.ctr)}</td>
                      <td className="px-3 py-3 text-right font-mono text-sm hidden xl:table-cell">{fmtBRLOrDash(c.cpm)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!isLoading && filteredCampaigns.length > 0 && (
          <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground flex items-center justify-between">
            <span>
              {filteredCampaigns.length} de {data?.campaigns.length ?? 0} campanhas
              {statusFilter !== "all" && ` · ${STATUS_FILTER_OPTIONS.find(o => o.value === statusFilter)?.label ?? ""}`}
            </span>
            <span className="text-xs text-muted-foreground">
              🟢 CPL ≤ R${settings.cplGood} · 🟡 R${settings.cplGood}–{settings.cplBad} · 🔴 ≥ R${settings.cplBad}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
