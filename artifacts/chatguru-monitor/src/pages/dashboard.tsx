import React, { useState } from "react";
import { useGetStats, getGetStatsQueryKey, useGetWebhookUrl, getGetWebhookUrlQueryKey } from "@workspace/api-client-react";
import { StatusBadge } from "@/components/status-badge";
import { formatPhone, formatDate } from "@/lib/utils";
import { RefreshCw, Copy, AlertCircle, Download, AlertTriangle, Flame } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { getCampaign, CampaignTag } from "@/lib/campaignColors";
import { timeAgo, silenceLevel } from "@/lib/time";
import { LeadModal } from "@/components/lead-modal";
import { getDiseaseColor, getDiseaseLabel } from "@/lib/diseaseUtils";
import { SendTemplateButton } from "@/components/send-template-button";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

function getInitials(name: string) {
  return name.replace(/[^\w\s]/g, "").split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
}

const AVATAR_COLORS = ["#3b82f6","#8b5cf6","#06b6d4","#f59e0b","#10b981","#ef4444","#ec4899","#6366f1"];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[Math.abs(h)];
}

function NewBadge({ createdAt }: { createdAt?: string | null }) {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (!createdAt) return;
    const age = Date.now() - new Date(createdAt).getTime();
    const isNew = age < 30 * 60 * 1000; // 30 min
    setVisible(isNew);
    if (isNew) {
      const timeout = setTimeout(() => setVisible(false), 30 * 60 * 1000 - age);
      return () => clearTimeout(timeout);
    }
  }, [createdAt]);

  if (!visible) return null;
  return (
    <span className="inline-flex items-center gap-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse shadow-sm shadow-red-400/50" title={`Lead recebido há ${timeAgo(createdAt)}`}>
      NOVO
    </span>
  );
}

function CoolingBadge({ alert }: { alert?: string | null }) {
  if (!alert) return null;
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${alert === "urgente" ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400" : "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"}`}>
      {alert === "urgente" ? "🚨" : "🥶"}
    </span>
  );
}

function useAlertCounts() {
  const [counts, setCounts] = React.useState({ urgent: 0, cooling: 0 });
  React.useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(`${BASE_URL}/api/conversations/alerts/list`);
        const d = await r.json();
        setCounts(d.counts ?? { urgent: 0, cooling: 0 });
      } catch {}
    };
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);
  return counts;
}

function useLatestSummary() {
  const [summary, setSummary] = React.useState<any>(null);
  React.useEffect(() => {
    fetch(`${BASE_URL}/api/summaries/latest`)
      .then(r => r.json())
      .then(d => setSummary(d.summary ?? null))
      .catch(() => {});
  }, []);
  return summary;
}

function useDiseaseStats() {
  const [stats, setStats] = React.useState<{ disease: string | null; count: number }[]>([]);
  React.useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(`${BASE_URL}/api/conversations/disease/stats`);
        const d = await r.json();
        setStats(d.stats ?? []);
      } catch {}
    };
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);
  return stats;
}

interface ProcessosMetricas {
  totalProcessos: number;
  tarefasPendentes: number;
  honorariosAReceber: number;
  despesasProximos30: number;
}

function useProcessosMetricas() {
  const [data, setData] = React.useState<ProcessosMetricas | null>(null);
  React.useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(`${BASE_URL}/api/processos/metricas`);
        const d = await r.json();
        setData(d);
      } catch {}
    };
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);
  return data;
}

interface AtividadeEquipe {
  id: number;
  nome: string;
  tarefasPendentes: number;
  totalProcessos: number;
}

function useEquipeAtividade() {
  const [data, setData] = React.useState<AtividadeEquipe[]>([]);
  React.useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(`${BASE_URL}/api/processos/equipe/atividade`);
        const d = await r.json();
        setData(Array.isArray(d) ? d : []);
      } catch {}
    };
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);
  return data;
}

export function Dashboard() {
  const { toast } = useToast();
  const [selectedLead, setSelectedLead] = useState<number | null>(null);
  const alertCounts = useAlertCounts();
  const latestSummary = useLatestSummary();
  const diseaseStats = useDiseaseStats();
  const processosMetricas = useProcessosMetricas();
  const equipeAtividade = useEquipeAtividade();

  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
    refetch: refetchStats,
    isFetching,
  } = useGetStats({
    query: { queryKey: getGetStatsQueryKey(), refetchInterval: 30000 },
  });

  const { data: webhookInfo } = useGetWebhookUrl({
    query: { queryKey: getGetWebhookUrlQueryKey() },
  });

  const copyWebhook = () => {
    if (webhookInfo?.url) {
      navigator.clipboard.writeText(webhookInfo.url);
      toast({ title: "Copiado!", description: "URL do Webhook copiada." });
    }
  };

  const exportCsv = () => {
    window.open(`${BASE_URL}/api/conversations/export`, "_blank");
  };

  const today = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  const p = stats?.pipeline;
  const statCards = [
    { label: "Total Hoje",       value: stats?.todayTotal ?? 0,        icon: "👥", bg: "#eff6ff", border: "#bfdbfe", valColor: "#1d4ed8" },
    { label: "Lead Novo",        value: p?.lead_novo ?? 0,             icon: "🔔", bg: "#f8fafc", border: "#e2e8f0", valColor: "#475569" },
    { label: "Lead Qualificado", value: p?.lead_qualificado ?? 0,      icon: "⚡", bg: "#eff6ff", border: "#bfdbfe", valColor: "#1d4ed8" },
    { label: "Em Atendimento",   value: p?.em_atendimento ?? 0,        icon: "💬", bg: "#ecfeff", border: "#a5f3fc", valColor: "#0e7490" },
    { label: "Contratos",        value: p?.contrato_assinado ?? 0,     icon: "✅", bg: "#f0fdf4", border: "#bbf7d0", valColor: "#065f46" },
    { label: "Descartados",      value: p?.lead_descartado ?? 0,       icon: "🗑️", bg: "#fef2f2", border: "#fecaca", valColor: "#991b1b" },
  ];

  const totalLeads = stats?.total ?? 0;
  const funnelSteps = [
    { label: "Lead Novo",         value: p?.lead_novo ?? 0,            color: "#64748b" },
    { label: "Lead Qualificado",  value: p?.lead_qualificado ?? 0,     color: "#3b82f6" },
    { label: "Em Atendimento",    value: p?.em_atendimento ?? 0,       color: "#06b6d4" },
    { label: "Follow Up",         value: p?.follow_up ?? 0,            color: "#f59e0b" },
    { label: "Contrato Assinado", value: p?.contrato_assinado ?? 0,    color: "#16a34a" },
    { label: "Cliente Ativo",     value: p?.cliente_ativo ?? 0,        color: "#10b981" },
    { label: "Cliente Procedente",value: p?.cliente_procedente ?? 0,   color: "#14b8a6" },
    { label: "Lead Descartado",   value: p?.lead_descartado ?? 0,      color: "#f87171" },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1 capitalize">{today}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            className="flex items-center gap-2 border border-border rounded-xl px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/60 transition-colors shadow-sm"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar CSV
          </button>
          <button
            onClick={() => refetchStats()}
            disabled={isFetching}
            className="flex items-center gap-2 btn-primary-gradient text-primary-foreground rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      </div>

      {statsError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription>Não foi possível carregar as estatísticas.</AlertDescription>
        </Alert>
      )}

      {/* Alert banner */}
      {(alertCounts.urgent > 0 || alertCounts.cooling > 0) && (
        <a
          href="/alerts"
          className="group flex items-center gap-4 rounded-xl border border-red-200/80 dark:border-red-800/50 bg-gradient-to-r from-red-50 to-orange-50/60 dark:from-red-950/40 dark:to-red-900/20 px-5 py-3.5 hover:from-red-100 hover:to-orange-100/60 dark:hover:from-red-950/60 dark:hover:to-red-900/30 transition-all duration-200 shadow-sm"
          style={{ textDecoration: "none" }}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/40 flex-shrink-0">
            <AlertTriangle className="h-5 w-5 text-red-500 dark:text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-800 dark:text-red-300">Atenção necessária</p>
            <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-0.5">
              {alertCounts.urgent > 0 && <><Flame className="inline w-3 h-3 mr-0.5" />{alertCounts.urgent} urgente{alertCounts.urgent !== 1 ? "s" : ""}</>}
              {alertCounts.urgent > 0 && alertCounts.cooling > 0 && <span className="mx-1.5 opacity-40">·</span>}
              {alertCounts.cooling > 0 && <>{alertCounts.cooling} esfriando</>}
            </p>
          </div>
          <span className="text-xs font-medium text-red-600 dark:text-red-400 group-hover:translate-x-0.5 transition-transform">Ver →</span>
        </a>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {statsLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl border p-5 space-y-2 shadow-sm"><Skeleton className="h-3 w-20" /><Skeleton className="h-8 w-12" /></div>
            ))
          : statCards.map((c) => (
              <div key={c.label} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 14, padding: "16px 18px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                <div className="flex justify-between items-start mb-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground leading-tight">{c.label}</span>
                  <span className="text-xl leading-none">{c.icon}</span>
                </div>
                <div style={{ fontSize: 32, fontWeight: 800, color: c.valColor, lineHeight: 1, letterSpacing: "-0.02em" }}>{c.value}</div>
              </div>
            ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Funil + Webhook */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-sm">
          <h2 className="text-sm font-semibold tracking-wide">Funil de Leads</h2>
          {statsLoading ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
          ) : (
            <div className="space-y-3">
              {funnelSteps.map((s) => (
                <div key={s.label}>
                  <div className="flex justify-between mb-1">
                    <span className="text-xs text-muted-foreground">{s.label}</span>
                    <span className="text-xs font-semibold">{s.value}</span>
                  </div>
                  <div className="bg-muted rounded-full h-2 overflow-hidden">
                    <div style={{ height: "100%", width: totalLeads > 0 ? `${(s.value / totalLeads) * 100}%` : "0%", background: s.color, borderRadius: 99, minWidth: s.value > 0 ? 8 : 0, transition: "width 0.5s" }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Legenda de campanhas com contagem */}
          {!statsLoading && stats?.byCampaign && (
            <div className="pt-3 border-t border-border">
              <p className="text-xs font-medium text-muted-foreground mb-2">Campanhas</p>
              <div className="space-y-1.5">
                {Object.entries((stats as any).byCampaign as Record<string, number>)
                  .sort(([, a], [, b]) => b - a)
                  .map(([k, cnt]) => {
                    const m = getCampaign(k);
                    return (
                      <div key={k} className="flex items-center gap-1.5">
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
                        <span className="text-xs text-muted-foreground truncate">
                          {m.label}{" "}
                          <strong style={{ color: m.color }}>({cnt})</strong>
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {webhookInfo?.url && (
            <div className="pt-3 border-t border-border space-y-2">
              <p className="text-xs font-medium text-muted-foreground">URL do Webhook</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-2 py-1.5 bg-muted rounded text-xs truncate font-mono text-muted-foreground border border-border">{webhookInfo.url}</code>
                <button onClick={copyWebhook} className="p-1.5 rounded bg-muted hover:bg-muted/80 border border-border transition-colors" title="Copiar">
                  <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Leads Recentes */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold tracking-wide">Leads Recentes</h2>
            <a href="/conversations" className="text-xs text-primary hover:underline">Ver todos →</a>
          </div>

          {statsLoading ? (
            <div className="space-y-4">{Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3"><Skeleton className="h-9 w-9 rounded-full" /><div className="flex-1 space-y-1.5"><Skeleton className="h-3 w-32" /><Skeleton className="h-3 w-48" /></div><Skeleton className="h-5 w-20 rounded-full" /></div>
            ))}</div>
          ) : stats?.recentActivity && stats.recentActivity.length > 0 ? (
            <div>
              {stats.recentActivity.map((activity, i) => {
                const name = activity.contactName || formatPhone(activity.chatNumber);
                const meta = getCampaign((activity as any).campaign);
                const silLvl = silenceLevel(activity.lastMessageAt || activity.updatedAt);
                return (
                  <div
                    key={activity.id}
                    className="flex items-center gap-3 py-3 cursor-pointer hover:bg-muted/30 rounded-lg px-1 transition-colors -mx-1"
                    style={{ borderBottom: i < stats.recentActivity!.length - 1 ? "1px solid hsl(var(--border))" : "none", borderLeft: `3px solid ${meta.color}`, paddingLeft: 8 }}
                    onClick={() => setSelectedLead(activity.id)}
                  >
                    {/* Avatar */}
                    <div style={{ width: 34, height: 34, borderRadius: "50%", background: avatarColor(name), display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                      {getInitials(name) || "?"}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-sm">{name}</span>
                        <NewBadge createdAt={(activity as any).createdAt} />
                        <CoolingBadge alert={(activity as any).coolingAlert} />
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <CampaignTag campaign={(activity as any).campaign} size="xs" />
                        {activity.assignedAgent && (
                          <span className="text-xs text-muted-foreground">• {activity.assignedAgent}</span>
                        )}
                      </div>
                    </div>

                    {/* Status + time + send */}
                    <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
                      <StatusBadge status={activity.status} />
                      <p className={`text-xs ${silLvl === "critical" ? "text-red-500 font-semibold" : silLvl === "warning" ? "text-amber-500" : "text-muted-foreground"}`}>
                        {timeAgo(activity.lastMessageAt || activity.updatedAt)}
                      </p>
                      <SendTemplateButton
                        chatNumber={activity.chatNumber}
                        contactName={activity.contactName}
                        campaign={(activity as any).campaign}
                        size="sm"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground text-sm">Nenhuma atividade recente registrada.</div>
          )}
        </div>
      </div>

      {/* Top Doenças */}
      {diseaseStats.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">Top Doenças</h2>
            <a href="/conversations" className="text-xs text-primary hover:underline">Filtrar →</a>
          </div>
          <div className="space-y-2.5">
            {diseaseStats.slice(0, 8).map(row => {
              const key = row.disease ?? "OUTRA";
              const c = getDiseaseColor(key);
              const max = diseaseStats[0]?.count ?? 1;
              const pct = Math.round((row.count / max) * 100);
              return (
                <div key={key}>
                  <div className="flex justify-between mb-1">
                    <span
                      className="text-xs px-1.5 py-0.5 rounded-full border font-medium"
                      style={{ background: c.bg, color: c.text, borderColor: c.border }}
                    >
                      {getDiseaseLabel(key)}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground">{row.count}</span>
                  </div>
                  <div className="bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      style={{ height: "100%", width: `${pct}%`, background: c.text, opacity: 0.7, borderRadius: 99, minWidth: 8, transition: "width 0.5s" }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Daily Summary card */}
      {latestSummary && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Resumo de Ontem</h2>
            <a href="/summaries" className="text-xs text-primary hover:underline">Ver histórico →</a>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Novos leads", value: latestSummary.data.newLeadsTotal, color: "#3b82f6" },
              { label: "Resolvidos", value: (latestSummary.data.movement?.resolved ?? 0) + (latestSummary.data.movement?.closed ?? 0), color: "#10b981" },
              { label: "Alertas", value: (latestSummary.data.alerts?.urgent ?? 0) + (latestSummary.data.alerts?.cooling ?? 0), color: "#f59e0b" },
              { label: "Em atendimento", value: latestSummary.data.movement?.inProgress ?? 0, color: "#06b6d4" },
            ].map(s => (
              <div key={s.label} className="bg-muted/30 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Processos & Equipe */}
      {processosMetricas !== null && (
        <div className="space-y-4">
          {/* Métricas de Processos */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Processos</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{processosMetricas.totalProcessos}</p>
                <p className="text-xs text-blue-500 mt-0.5">Total de Processos</p>
              </div>
              <div className={`rounded-xl border p-3 text-center ${processosMetricas.tarefasPendentes > 0 ? "bg-amber-50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900" : "bg-muted/30 border-border"}`}>
                <p className={`text-2xl font-bold ${processosMetricas.tarefasPendentes > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                  {processosMetricas.tarefasPendentes}
                </p>
                <p className={`text-xs mt-0.5 ${processosMetricas.tarefasPendentes > 0 ? "text-amber-500" : "text-muted-foreground"}`}>Tarefas Pendentes</p>
              </div>
              <div className="bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-900 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(processosMetricas.honorariosAReceber)}
                </p>
                <p className="text-xs text-green-500 mt-0.5">A Receber</p>
              </div>
              <div className={`rounded-xl border p-3 text-center ${processosMetricas.despesasProximos30 > 0 ? "bg-red-50 dark:bg-red-950/30 border-red-100 dark:border-red-900" : "bg-muted/30 border-border"}`}>
                <p className={`text-2xl font-bold ${processosMetricas.despesasProximos30 > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                  {processosMetricas.despesasProximos30}
                </p>
                <p className={`text-xs mt-0.5 ${processosMetricas.despesasProximos30 > 0 ? "text-red-500" : "text-muted-foreground"}`}>Tarefas vencendo (30d)</p>
              </div>
            </div>
          </div>

          {/* Atividade da Equipe */}
          {equipeAtividade.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="text-sm font-semibold mb-3">Atividade da Equipe</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {equipeAtividade.map(membro => (
                  <div key={membro.id} className="flex items-center gap-3 p-3 border border-border rounded-xl bg-muted/20">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
                      style={{ background: avatarColor(membro.nome) }}
                    >
                      {membro.nome.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{membro.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {membro.tarefasPendentes} tarefa{membro.tarefasPendentes !== 1 ? "s" : ""} pendente{membro.tarefasPendentes !== 1 ? "s" : ""}
                        {membro.totalProcessos > 0 && <> · {membro.totalProcessos} processo{membro.totalProcessos !== 1 ? "s" : ""}</>}
                      </p>
                    </div>
                    {membro.tarefasPendentes > 0 && (
                      <span className="text-sm font-bold text-amber-600 dark:text-amber-400 flex-shrink-0">{membro.tarefasPendentes}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <LeadModal leadId={selectedLead} onClose={() => setSelectedLead(null)} />
    </div>
  );
}
