import React, { useState } from "react";
import { BarChart2, RefreshCw, TrendingUp, DollarSign, MessageSquare, MousePointer } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { getCampaign } from "@/lib/campaignColors";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

// ─── CRM Summary types ────────────────────────────────────────────────────────

interface SummaryData {
  date: string;
  newLeadsTotal: number;
  byCampaign: Array<{ campaign: string; count: number }>;
  byNumber: Array<{ whatsappNumberId: number | null; count: number }>;
  movement: { inProgress: number; resolved: number; closed: number };
  alerts: { urgent: number; cooling: number };
}

interface Summary {
  id: number;
  date: string;
  data: SummaryData;
  generatedAt: string;
}

// ─── Meta Ads types ───────────────────────────────────────────────────────────

interface CampaignMeta {
  id: string;
  name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number | null;
  cpm: number | null;
  conversations: number;
}

interface MetaSummary {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number | null;
  cpm: number | null;
  conversations: number;
}

interface MetaAdsData {
  summary: MetaSummary;
  campaigns: CampaignMeta[];
  cachedAt: string;
  fromCache: boolean;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(n);

const fmtNum = (n: number) =>
  new Intl.NumberFormat("pt-BR").format(Math.round(n));

const fmtPct = (n: number | null) =>
  n != null ? `${Number(n).toFixed(2)}%` : "—";

// ─── Meta Ads section ─────────────────────────────────────────────────────────

function MetaAdsSection() {
  const { data, isLoading, isError } = useQuery<MetaAdsData>({
    queryKey: ["meta-ads-summary"],
    queryFn: async () => {
      const r = await fetch(`${BASE_URL}/api/meta-ads`);
      if (!r.ok) throw new Error("Erro ao carregar Meta Ads");
      return r.json();
    },
    staleTime: 15 * 60 * 1000,
  });

  const cpl =
    data && data.summary.conversations > 0
      ? data.summary.spend / data.summary.conversations
      : null;

  const kpis = data
    ? [
        {
          label: "Gasto (30d)",
          value: fmtBRL(data.summary.spend),
          icon: DollarSign,
          color: "text-emerald-600 dark:text-emerald-400",
          bg: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900",
        },
        {
          label: "Conversas",
          value: fmtNum(data.summary.conversations),
          icon: MessageSquare,
          color: "text-blue-600 dark:text-blue-400",
          bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900",
        },
        {
          label: "CPL",
          value: cpl != null ? fmtBRL(cpl) : "—",
          icon: TrendingUp,
          color: "text-violet-600 dark:text-violet-400",
          bg: "bg-violet-50 dark:bg-violet-950/30 border-violet-100 dark:border-violet-900",
        },
        {
          label: "Cliques",
          value: fmtNum(data.summary.clicks),
          icon: MousePointer,
          color: "text-orange-600 dark:text-orange-400",
          bg: "bg-orange-50 dark:bg-orange-950/30 border-orange-100 dark:border-orange-900",
        },
        {
          label: "CTR",
          value: fmtPct(data.summary.ctr),
          icon: TrendingUp,
          color: "text-pink-600 dark:text-pink-400",
          bg: "bg-pink-50 dark:bg-pink-950/30 border-pink-100 dark:border-pink-900",
        },
      ]
    : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Meta Ads — últimos 30 dias</h2>
        {data && (
          <span className="text-xs text-muted-foreground ml-auto">
            {data.fromCache ? "cache" : "ao vivo"} ·{" "}
            {new Date(data.cachedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      )}

      {isError && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3">
          Erro ao carregar dados do Meta Ads.
        </div>
      )}

      {data && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {kpis.map((k) => (
              <div key={k.label} className={`rounded-xl border p-3 ${k.bg}`}>
                <p className={`text-xs font-medium ${k.color} mb-1`}>{k.label}</p>
                <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* Campaigns table */}
          {data.campaigns.length > 0 && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Campanha</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Gasto</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Conversas</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">CPL</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">CTR</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Cliques</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.campaigns
                      .filter((c) => c.spend > 0)
                      .sort((a, b) => b.spend - a.spend)
                      .map((c) => {
                        const campCpl =
                          c.conversations > 0 ? c.spend / c.conversations : null;
                        return (
                          <tr key={c.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-2.5 max-w-[240px]">
                              <span className="truncate block text-xs font-medium">{c.name}</span>
                              <span
                                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full inline-block mt-0.5"
                                style={{
                                  background: c.status === "ACTIVE" ? "#dcfce7" : "#f3f4f6",
                                  color: c.status === "ACTIVE" ? "#16a34a" : "#6b7280",
                                }}
                              >
                                {c.status === "ACTIVE" ? "Ativa" : "Pausada"}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                              {fmtBRL(c.spend)}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums">
                              {fmtNum(c.conversations)}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                              {campCpl != null ? fmtBRL(campCpl) : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                              {fmtPct(c.ctr)}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                              {fmtNum(c.clicks)}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── CRM Summary hooks & components ──────────────────────────────────────────

function useSummaries() {
  const [summaries, setSummaries] = React.useState<Summary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE_URL}/api/summaries`);
      const d = await r.json();
      setSummaries(d.summaries ?? []);
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => {
    load();
  }, [load]);
  return { summaries, loading, reload: load };
}

function SummaryCard({ summary }: { summary: Summary }) {
  const d = summary.data;
  const dateLabel = new Date(summary.date + "T12:00:00").toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
  const maxCampaign = Math.max(...d.byCampaign.map((c) => c.count), 1);

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold capitalize">{dateLabel}</h3>
        <span className="text-xs text-muted-foreground">
          {new Date(summary.generatedAt).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{d.newLeadsTotal}</p>
          <p className="text-xs text-blue-500 mt-0.5">Novos leads</p>
        </div>
        <div className="bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-900 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">
            {d.movement.resolved + d.movement.closed}
          </p>
          <p className="text-xs text-green-500 mt-0.5">Resolvidos</p>
        </div>
        <div
          className={`rounded-xl p-3 text-center border ${
            d.alerts.urgent + d.alerts.cooling > 0
              ? "bg-amber-50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900"
              : "bg-muted/30 border-border"
          }`}
        >
          <p
            className={`text-2xl font-bold ${
              d.alerts.urgent + d.alerts.cooling > 0
                ? "text-amber-600 dark:text-amber-400"
                : "text-muted-foreground"
            }`}
          >
            {d.alerts.urgent + d.alerts.cooling}
          </p>
          <p
            className={`text-xs mt-0.5 ${
              d.alerts.urgent + d.alerts.cooling > 0 ? "text-amber-500" : "text-muted-foreground"
            }`}
          >
            Alertas
          </p>
        </div>
      </div>

      {d.byCampaign.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Por campanha</p>
          <div className="space-y-1.5">
            {d.byCampaign
              .sort((a, b) => b.count - a.count)
              .map((c) => {
                const meta = getCampaign(c.campaign);
                return (
                  <div key={c.campaign} className="flex items-center gap-2">
                    <span className="text-xs truncate flex-1">
                      {meta.emoji} {meta.label}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <div
                        className="h-1.5 rounded-full bg-muted overflow-hidden"
                        style={{ width: 60 }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${(c.count / maxCampaign) * 100}%`,
                            background: meta.color,
                            borderRadius: 99,
                          }}
                        />
                      </div>
                      <span className="text-xs font-semibold w-4 text-right">{c.count}</span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function Summaries() {
  const { toast } = useToast();
  const { summaries, loading, reload } = useSummaries();
  const [generating, setGenerating] = useState(false);

  const generate = async () => {
    setGenerating(true);
    try {
      await fetch(`${BASE_URL}/api/summaries/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      toast({ title: "Resumo gerado!" });
      reload();
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart2 className="h-6 w-6 text-primary" />
            Resumos
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Visão consolidada: Meta Ads + CRM diário
          </p>
        </div>
        <button
          onClick={generate}
          disabled={generating}
          className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground text-sm rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${generating ? "animate-spin" : ""}`} />
          Gerar Agora
        </button>
      </div>

      {/* Meta Ads section */}
      <MetaAdsSection />

      {/* Divider */}
      <div className="border-t border-border" />

      {/* CRM daily summaries */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <BarChart2 className="h-5 w-5 text-primary" />
          Resumos Diários CRM
        </h2>
        <p className="text-xs text-muted-foreground -mt-2">
          Gerado todo dia às 20h. Histórico dos últimos 30 dias.
        </p>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-64 w-full rounded-xl" />
            ))}
          </div>
        ) : summaries.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <BarChart2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum resumo gerado ainda.</p>
            <p className="text-xs mt-1">Clique em "Gerar Agora" para criar o resumo de hoje.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {summaries.map((s) => (
              <SummaryCard key={s.id} summary={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
