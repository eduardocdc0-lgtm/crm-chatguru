import React, { useEffect, useState, useCallback } from "react";
import { ExternalLink, RefreshCw, FileCheck, UserX, Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatPhone } from "@/lib/utils";
import { timeAgo } from "@/lib/time";
import { getCampaign } from "@/lib/campaignColors";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
const CHATGURU_WEB = "https://app.zap.guru";

interface QualLead {
  id: number;
  chatNumber: string;
  contactName: string | null;
  status: string;
  campaign: string | null;
  hasLaudo: boolean;
  noAdvogado: boolean;
  intentResolve: boolean;
  createdAt: string;
  lastMessageAt: string | null;
  whatsappNumberId: number | null;
}

function FlagBadge({ active, label, icon: Icon }: { active: boolean; label: string; icon: React.ElementType }) {
  return (
    <span
      title={label}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border ${
        active
          ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-950/40 dark:border-green-800 dark:text-green-400"
          : "bg-muted border-border text-muted-foreground opacity-40"
      }`}
    >
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

export function Qualificados() {
  const [leads, setLeads] = useState<QualLead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const r = await fetch(`${BASE_URL}/api/conversations/qualificados`);
      if (!r.ok) throw new Error("Falha ao carregar");
      const d = await r.json();
      setLeads(d.leads ?? []);
      setTotal(d.total ?? 0);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leads Qualificados</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Leads que confirmaram: têm laudo, não têm advogado e têm intenção de resolver.
          </p>
          <p className="text-muted-foreground/60 text-xs mt-0.5">
            Critério diferente do funil — o funil mostra leads que passaram pro atendimento humano.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {loading ? "..." : `${total} lead${total !== 1 ? "s" : ""}`}
          </span>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 btn-primary-gradient text-primary-foreground rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
        <span className="font-medium">Critérios:</span>
        <FlagBadge active icon={FileCheck} label="Tem laudo" />
        <FlagBadge active icon={UserX} label="Sem advogado" />
        <FlagBadge active icon={Zap} label="Quer resolver" />
        <span className="text-muted-foreground/60 ml-1">— todos 3 precisam ser ✓ para qualificar</span>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-400">
          Não foi possível carregar os leads qualificados.
        </div>
      )}

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lead</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Campanha</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Critérios</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Entrada</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ação</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-3 px-4"><Skeleton className="h-4 w-36" /></td>
                      <td className="py-3 px-4"><Skeleton className="h-4 w-24" /></td>
                      <td className="py-3 px-4"><Skeleton className="h-5 w-48" /></td>
                      <td className="py-3 px-4"><Skeleton className="h-4 w-20" /></td>
                      <td className="py-3 px-4"><Skeleton className="h-7 w-16" /></td>
                    </tr>
                  ))
                : leads.length === 0
                ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-muted-foreground text-sm">
                      Nenhum lead qualificado encontrado ainda.<br />
                      <span className="text-xs opacity-60">Os leads são qualificados automaticamente quando o sistema detecta os 3 critérios nas mensagens.</span>
                    </td>
                  </tr>
                )
                : leads.map((lead) => {
                    const name = lead.contactName || formatPhone(lead.chatNumber);
                    const phone = formatPhone(lead.chatNumber);
                    const meta = getCampaign(lead.campaign ?? "");
                    const chatguruUrl = `${CHATGURU_WEB}/chats/${lead.chatNumber.replace(/\D/g, "")}`;
                    return (
                      <tr key={lead.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        {/* Lead */}
                        <td className="py-3 px-4">
                          <div className="font-medium text-foreground truncate max-w-[160px]" title={name}>{name}</div>
                          <div className="text-xs text-muted-foreground">{phone}</div>
                        </td>

                        {/* Campanha */}
                        <td className="py-3 px-4">
                          <span
                            className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold"
                            style={{ background: meta.color + "22", color: meta.color }}
                          >
                            {meta.label}
                          </span>
                        </td>

                        {/* Critérios */}
                        <td className="py-3 px-4">
                          <div className="flex gap-1.5 flex-wrap">
                            <FlagBadge active={lead.hasLaudo} icon={FileCheck} label="Laudo" />
                            <FlagBadge active={lead.noAdvogado} icon={UserX} label="Sem adv." />
                            <FlagBadge active={lead.intentResolve} icon={Zap} label="Intenção" />
                          </div>
                        </td>

                        {/* Data */}
                        <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
                          {timeAgo(lead.createdAt)}
                        </td>

                        {/* Ação */}
                        <td className="py-3 px-4">
                          <a
                            href={chatguruUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                          >
                            <ExternalLink className="w-3 h-3" />
                            ChatGuru
                          </a>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
