import React, { useState } from "react";
import { AlertTriangle, Flame, Clock, ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { formatPhone } from "@/lib/utils";
import { timeAgo } from "@/lib/time";
import { CampaignTag } from "@/lib/campaignColors";
import { LeadModal } from "@/components/lead-modal";
import { SendTemplateButton } from "@/components/send-template-button";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
const CHATGURU_WEB = "https://app.zap.guru";

interface AlertLead {
  id: number;
  chatNumber: string;
  contactName?: string | null;
  status: string;
  campaign?: string | null;
  assignedAgent?: string | null;
  updatedAt: string;
  coolingAlert?: string | null;
  coolingAlertAt?: string | null;
}

function useAlerts() {
  const [data, setData] = React.useState<{ alerts: AlertLead[]; counts: { urgent: number; cooling: number } } | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE_URL}/api/conversations/alerts/list`);
      const d = await r.json();
      setData(d);
    } finally { setLoading(false); }
  }, []);

  React.useEffect(() => { load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);
  return { data, loading, reload: load };
}

export function Alerts() {
  const { data, loading } = useAlerts();
  const [leadId, setLeadId] = useState<number | null>(null);

  const urgent = (data?.alerts ?? []).filter(a => a.coolingAlert === "urgente");
  const cooling = (data?.alerts ?? []).filter(a => a.coolingAlert === "esfriando");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <AlertTriangle className="h-6 w-6 text-amber-500" />
          Alertas de Leads
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Leads que precisam de atenção imediata.</p>
      </div>

      {/* Contadores */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Flame className="h-4 w-4 text-red-500" />
            <span className="text-xs font-semibold text-red-600 dark:text-red-400">URGENTE</span>
          </div>
          <p className="text-3xl font-bold text-red-600 dark:text-red-400">{loading ? "—" : data?.counts.urgent ?? 0}</p>
          <p className="text-xs text-red-500 mt-0.5">Lead aberto +2h sem resposta</p>
        </div>
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">ESFRIANDO</span>
          </div>
          <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{loading ? "—" : data?.counts.cooling ?? 0}</p>
          <p className="text-xs text-amber-500 mt-0.5">Em atendimento +24h sem mudança</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-36 w-full" />)}</div>
      ) : (
        <>
          {urgent.length > 0 && (
            <div className="bg-card border border-red-200 dark:border-red-900 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-3 flex items-center gap-2">
                <Flame className="h-4 w-4" /> Urgente ({urgent.length})
              </h2>
              <div className="space-y-3">
                {urgent.map(a => <AlertCard key={a.id} alert={a} onOpen={() => setLeadId(a.id)} />)}
              </div>
            </div>
          )}

          {cooling.length > 0 && (
            <div className="bg-card border border-amber-200 dark:border-amber-900 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-amber-600 dark:text-amber-400 mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4" /> Esfriando ({cooling.length})
              </h2>
              <div className="space-y-3">
                {cooling.map(a => <AlertCard key={a.id} alert={a} onOpen={() => setLeadId(a.id)} />)}
              </div>
            </div>
          )}

          {urgent.length === 0 && cooling.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum alerta ativo no momento. 🎉</p>
            </div>
          )}
        </>
      )}

      <LeadModal leadId={leadId} onClose={() => setLeadId(null)} />
    </div>
  );
}

function AlertCard({ alert, onOpen }: { alert: AlertLead; onOpen: () => void }) {
  const name = alert.contactName || formatPhone(alert.chatNumber);
  const phone = alert.chatNumber.replace(/\D/g, "");

  return (
    <div className="p-4 bg-muted/20 rounded-xl border border-border hover:bg-muted/30 transition-colors">
      {/* Top row: name + time + chatguru */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onOpen}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{name}</span>
            {alert.contactName && (
              <span className="text-xs text-muted-foreground">{formatPhone(alert.chatNumber)}</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <StatusBadge status={alert.status} />
            <CampaignTag campaign={alert.campaign} size="xs" />
            {alert.assignedAgent && (
              <span className="text-xs text-muted-foreground">• {alert.assignedAgent}</span>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 flex items-center gap-2">
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">última atividade</p>
            <p className="text-xs font-semibold">{timeAgo(alert.updatedAt)}</p>
          </div>
          <button
            onClick={e => { e.stopPropagation(); window.open(`${CHATGURU_WEB}/chats/${phone}`, "_blank"); }}
            title="Ver no ChatGuru"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-background transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-2.5 flex items-center gap-2 flex-wrap">
        <SendTemplateButton
          chatNumber={alert.chatNumber}
          contactName={alert.contactName}
          campaign={alert.campaign}
          size="sm"
        />
        <button
          onClick={onOpen}
          className="text-xs px-2.5 py-1.5 border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
        >
          Ver ficha
        </button>
      </div>
    </div>
  );
}
