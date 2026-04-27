import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RefreshCw, DollarSign, Eye, Users, MessageSquare,
  MousePointer, TrendingUp, BarChart2, AlertCircle, Search,
} from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
const CACHE_15MIN = 15 * 60 * 1000;

// ─── Types ───────────────────────────────────────────────────────────────────

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
}

interface MetaAdsData {
  summary: Summary;
  campaigns: CampaignMeta[];
  cachedAt: string;
  fromCache: boolean;
}

// ─── Formatters ──────────────────────────────────────────────────────────────

const fmtBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(n);

const fmtNum = (n: number) =>
  new Intl.NumberFormat("pt-BR").format(Math.round(n));

const fmtPct = (n: number | null) =>
  n != null ? `${Number(n).toFixed(2)}%` : "—";

const fmtBRLOrDash = (n: number | null) =>
  n != null ? fmtBRL(n) : "—";

function statusLabel(s: string): { label: string; color: string } {
  switch (s.toUpperCase()) {
    case "ACTIVE": return { label: "Ativa", color: "text-green-600 bg-green-50" };
    case "PAUSED": return { label: "Pausada", color: "text-yellow-600 bg-yellow-50" };
    case "DELETED": return { label: "Removida", color: "text-red-500 bg-red-50" };
    case "ARCHIVED": return { label: "Arquivada", color: "text-gray-500 bg-gray-100" };
    default: return { label: s, color: "text-gray-500 bg-gray-100" };
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
  label,
  value,
  icon: Icon,
  sub,
  color = "blue",
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  sub?: string;
  color?: "blue" | "green" | "purple" | "orange" | "pink" | "indigo";
}) {
  const colors: Record<string, { bg: string; icon: string }> = {
    blue:   { bg: "bg-blue-50",   icon: "text-blue-500" },
    green:  { bg: "bg-green-50",  icon: "text-green-500" },
    purple: { bg: "bg-purple-50", icon: "text-purple-500" },
    orange: { bg: "bg-orange-50", icon: "text-orange-500" },
    pink:   { bg: "bg-pink-50",   icon: "text-pink-500" },
    indigo: { bg: "bg-indigo-50", icon: "text-indigo-500" },
  };
  const c = colors[color];

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

// ─── Skeleton Cards ───────────────────────────────────────────────────────────

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

// ─── Main Component ──────────────────────────────────────────────────────────

export function TrafficPerformance() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<keyof CampaignMeta>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data, isLoading, isError, error, dataUpdatedAt } = useQuery<MetaAdsData>({
    queryKey: ["meta-ads"],
    queryFn: async () => {
      const r = await fetch(`${BASE_URL}/api/meta-ads`, { credentials: "include" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      return r.json() as Promise<MetaAdsData>;
    },
    staleTime: CACHE_15MIN,
    retry: 1,
  });

  function handleRefresh() {
    void qc.invalidateQueries({ queryKey: ["meta-ads"] });
    // Also tell server to clear its cache
    void fetch(`${BASE_URL}/api/meta-ads/refresh`, { credentials: "include" });
  }

  function toggleSort(col: keyof CampaignMeta) {
    if (sortCol === col) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortCol(col); setSortDir("desc"); }
  }

  const filteredCampaigns = useMemo(() => {
    if (!data?.campaigns) return [];
    let rows = [...data.campaigns];
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(c => c.name.toLowerCase().includes(q) || c.status.toLowerCase().includes(q));
    }
    rows.sort((a, b) => {
      const av = a[sortCol] ?? 0;
      const bv = b[sortCol] ?? 0;
      const cmp = typeof av === "string"
        ? (av as string).localeCompare(bv as string)
        : Number(av) - Number(bv);
      return sortDir === "desc" ? -cmp : cmp;
    });
    return rows;
  }, [data?.campaigns, search, sortCol, sortDir]);

  const s = data?.summary;

  const ThBtn = ({ col, label }: { col: keyof CampaignMeta; label: string }) => (
    <button
      onClick={() => toggleSort(col)}
      className="flex items-center gap-1 hover:text-primary transition-colors font-medium"
    >
      {label}
      {sortCol === col && (
        <span className="text-xs opacity-60">{sortDir === "desc" ? "↓" : "↑"}</span>
      )}
    </button>
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Meta Ads</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Desempenho dos últimos 30 dias · conta act_654132083965752
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data?.cachedAt && (
            <span className="text-xs text-muted-foreground">
              Atualizado {timeAgoFromISO(data.cachedAt)}
              {data.fromCache && " · cache"}
            </span>
          )}
          {dataUpdatedAt > 0 && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              · próximo em ~{Math.max(0, Math.round((CACHE_15MIN - (Date.now() - dataUpdatedAt)) / 60000))}min
            </span>
          )}
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

      {/* Error */}
      {isError && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
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
          Array.from({ length: 7 }).map((_, i) => <KpiSkeleton key={i} />)
        ) : s ? (
          <>
            <KpiCard
              label="Gasto Total"
              value={fmtBRL(s.spend)}
              icon={DollarSign}
              color="green"
              sub="últimos 30 dias"
            />
            <KpiCard
              label="Impressões"
              value={fmtNum(s.impressions)}
              icon={Eye}
              color="blue"
            />
            <KpiCard
              label="Alcance"
              value={fmtNum(s.reach)}
              icon={Users}
              color="indigo"
            />
            <KpiCard
              label="Conversas"
              value={fmtNum(s.conversations)}
              icon={MessageSquare}
              color="purple"
              sub="WhatsApp iniciados"
            />
            <KpiCard
              label="Cliques"
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
            {s.conversations > 0 && s.spend > 0 && (
              <KpiCard
                label="Custo por Conversa"
                value={fmtBRL(s.spend / s.conversations)}
                icon={DollarSign}
                color="orange"
                sub="CPL (Meta)"
              />
            )}
          </>
        ) : null}
      </div>

      {/* Campaigns Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border flex-wrap">
          <h2 className="font-semibold text-sm">Campanhas</h2>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Filtrar campanhas..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 w-48"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground">
                  <ThBtn col="name" label="Campanha" />
                </th>
                <th className="px-3 py-2.5 text-xs text-muted-foreground text-center">Status</th>
                <th className="px-3 py-2.5 text-xs text-muted-foreground text-right">
                  <ThBtn col="spend" label="Gasto" />
                </th>
                <th className="px-3 py-2.5 text-xs text-muted-foreground text-right">
                  <ThBtn col="impressions" label="Impressões" />
                </th>
                <th className="px-3 py-2.5 text-xs text-muted-foreground text-right">
                  <ThBtn col="reach" label="Alcance" />
                </th>
                <th className="px-3 py-2.5 text-xs text-muted-foreground text-right">
                  <ThBtn col="clicks" label="Cliques" />
                </th>
                <th className="px-3 py-2.5 text-xs text-muted-foreground text-right">
                  <ThBtn col="ctr" label="CTR" />
                </th>
                <th className="px-3 py-2.5 text-xs text-muted-foreground text-right">
                  <ThBtn col="cpm" label="CPM" />
                </th>
                <th className="px-3 py-2.5 text-xs text-muted-foreground text-right">
                  <ThBtn col="conversations" label="Conversas" />
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    {Array.from({ length: 9 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredCampaigns.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-muted-foreground text-sm">
                    {search ? "Nenhuma campanha encontrada para esse filtro." : "Nenhuma campanha encontrada."}
                  </td>
                </tr>
              ) : (
                filteredCampaigns.map(c => {
                  const { label, color } = statusLabel(c.status);
                  return (
                    <tr key={c.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground leading-snug max-w-[240px]">{c.name}</div>
                        {c.objective && (
                          <div className="text-xs text-muted-foreground capitalize mt-0.5">
                            {c.objective.toLowerCase().replace(/_/g, " ")}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>{label}</span>
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-sm">{fmtBRL(c.spend)}</td>
                      <td className="px-3 py-3 text-right font-mono text-sm">{fmtNum(c.impressions)}</td>
                      <td className="px-3 py-3 text-right font-mono text-sm">{fmtNum(c.reach)}</td>
                      <td className="px-3 py-3 text-right font-mono text-sm">{fmtNum(c.clicks)}</td>
                      <td className="px-3 py-3 text-right font-mono text-sm">{fmtPct(c.ctr)}</td>
                      <td className="px-3 py-3 text-right font-mono text-sm">{fmtBRLOrDash(c.cpm)}</td>
                      <td className="px-3 py-3 text-right font-mono text-sm">{fmtNum(c.conversations)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!isLoading && filteredCampaigns.length > 0 && (
          <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
            {filteredCampaigns.length} campanha{filteredCampaigns.length !== 1 ? "s" : ""}
            {search && ` de ${data?.campaigns.length ?? 0} total`}
          </div>
        )}
      </div>
    </div>
  );
}
