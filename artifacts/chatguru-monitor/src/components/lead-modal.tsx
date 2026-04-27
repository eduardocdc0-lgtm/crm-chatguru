import React, { useState, useEffect, useCallback } from "react";
import { X, ExternalLink, Clock, Save, ChevronRight } from "lucide-react";
import { getCampaign, CampaignTag } from "@/lib/campaignColors";
import { StatusBadge } from "@/components/status-badge";
import { formatPhone } from "@/lib/utils";
import { timeAgo } from "@/lib/time";
import { useDebounce } from "@/hooks/use-debounce";
import { DISEASE_LABELS, DISEASE_OPTIONS, getDiseaseColor } from "@/lib/diseaseUtils";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
const CHATGURU_WEB = "https://app.zap.guru";

interface HistoryEntry {
  id: number;
  fromStatus?: string | null;
  toStatus: string;
  changedBy?: string;
  notes?: string | null;
  createdAt: string;
}

interface ConvDetail {
  id: number;
  chatNumber: string;
  contactName?: string | null;
  status: string;
  campaign?: string | null;
  assignedAgent?: string | null;
  firstMessage?: string | null;
  lastMessage?: string | null;
  notes?: string | null;
  disease?: string | null;
  diseaseNote?: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt?: string | null;
  coolingAlert?: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  lead_novo: "Lead Novo",
  lead_qualificado: "Lead Qualificado",
  em_atendimento: "Em Atendimento",
  follow_up: "Follow Up",
  contrato_assinado: "Contrato Assinado",
  cliente_ativo: "Cliente Ativo",
  cliente_procedente: "Cliente Procedente",
  lead_descartado: "Lead Descartado",
  // legado
  open: "Lead Novo", in_progress: "Em Atendimento", waiting: "Lead Qualificado",
  resolved: "Contrato Assinado", closed: "Lead Descartado",
};
const STATUS_COLORS: Record<string, string> = {
  lead_novo: "#64748b",
  lead_qualificado: "#3b82f6",
  em_atendimento: "#06b6d4",
  follow_up: "#f59e0b",
  contrato_assinado: "#16a34a",
  cliente_ativo: "#10b981",
  cliente_procedente: "#14b8a6",
  lead_descartado: "#f87171",
  // legado
  open: "#64748b", in_progress: "#06b6d4", waiting: "#3b82f6",
  resolved: "#16a34a", closed: "#f87171",
};

interface LeadModalProps {
  leadId: number | null;
  onClose: () => void;
}

export function LeadModal({ leadId, onClose }: LeadModalProps) {
  const [conv, setConv] = useState<ConvDetail | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [notes, setNotes] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [loading, setLoading] = useState(false);

  // Disease editing state
  const [diseaseSelect, setDiseaseSelect] = useState<string>("");
  const [diseaseNote, setDiseaseNote] = useState<string>("");
  const [diseaseSaving, setDiseaseSaving] = useState(false);

  const debouncedNotes = useDebounce(notes, 1500);

  const load = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    try {
      const r = await fetch(`${BASE_URL}/api/conversations/${leadId}`);
      const d = await r.json();
      setConv(d.conversation);
      setHistory(d.history ?? []);
      setNotes(d.conversation?.notes ?? "");
      setDiseaseSelect(d.conversation?.disease ?? "");
      setDiseaseNote(d.conversation?.diseaseNote ?? "");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    if (leadId) load();
    else { setConv(null); setHistory([]); setNotes(""); setDiseaseSelect(""); setDiseaseNote(""); }
  }, [leadId, load]);

  // Auto-save notes
  useEffect(() => {
    if (!leadId || !conv) return;
    if (debouncedNotes === (conv.notes ?? "")) return;
    setSaveState("saving");
    fetch(`${BASE_URL}/api/conversations/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: debouncedNotes }),
    }).then(() => {
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    }).catch(() => setSaveState("idle"));
  }, [debouncedNotes, leadId, conv]);

  const saveDisease = async () => {
    if (!leadId) return;
    setDiseaseSaving(true);
    await fetch(`${BASE_URL}/api/conversations/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        disease: diseaseSelect || null,
        diseaseNote: diseaseSelect === "OUTRA" ? diseaseNote : null,
      }),
    });
    setDiseaseSaving(false);
    load();
  };

  if (!leadId) return null;

  const name = conv?.contactName || (conv ? formatPhone(conv.chatNumber) : "");
  const meta = getCampaign(conv?.campaign);

  const diseaseColor = conv?.disease ? getDiseaseColor(conv.disease) : null;
  const diseaseLabel = conv?.disease ? (DISEASE_LABELS[conv.disease] ?? conv.disease) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border flex-shrink-0">
          {loading ? (
            <div className="space-y-2">
              <div className="h-5 w-40 bg-muted animate-pulse rounded" />
              <div className="h-3 w-28 bg-muted animate-pulse rounded" />
            </div>
          ) : conv ? (
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold">{name}</h2>
                {conv.coolingAlert && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${conv.coolingAlert === "urgente" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"}`}>
                    {conv.coolingAlert === "urgente" ? "🚨 URGENTE" : "🥶 Esfriando"}
                  </span>
                )}
                {diseaseLabel && diseaseColor && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium border"
                    style={{ background: diseaseColor.bg, color: diseaseColor.text, borderColor: diseaseColor.border }}
                  >
                    {diseaseLabel}{conv.disease === "OUTRA" && conv.diseaseNote ? `: ${conv.diseaseNote}` : ""}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs text-muted-foreground">{formatPhone(conv.chatNumber)}</span>
                <StatusBadge status={conv.status} />
                <CampaignTag campaign={conv.campaign} size="xs" />
              </div>
            </div>
          ) : null}
          <div className="flex items-center gap-2 ml-2">
            {conv && (
              <button
                onClick={() => window.open(`${CHATGURU_WEB}/chats/${conv.chatNumber.replace(/\D/g, "")}`, "_blank")}
                className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                title="Abrir no ChatGuru"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading && <div className="py-8 text-center text-muted-foreground">Carregando...</div>}

          {conv && !loading && (
            <>
              {/* Info grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: "Atendente", value: conv.assignedAgent || "—" },
                  { label: "Criado", value: timeAgo(conv.createdAt) },
                  { label: "Última atividade", value: timeAgo(conv.updatedAt) },
                ].map(f => (
                  <div key={f.label} className="bg-muted/40 rounded-xl p-3">
                    <p className="text-xs text-muted-foreground">{f.label}</p>
                    <p className="text-sm font-medium mt-0.5">{f.value}</p>
                  </div>
                ))}
              </div>

              {/* Alteração manual de status */}
              <div className="bg-muted/30 rounded-xl p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Alterar Status</p>
                <div className="flex flex-wrap gap-2">
                  {(["lead_novo","lead_qualificado","em_atendimento","follow_up","contrato_assinado","cliente_ativo","cliente_procedente","lead_descartado"] as const).map(s => (
                    <button
                      key={s}
                      disabled={conv.status === s}
                      onClick={async () => {
                        await fetch(`${BASE_URL}/api/conversations/${leadId}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ status: s }),
                        });
                        load();
                      }}
                      className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-all font-medium ${
                        conv.status === s
                          ? "opacity-100 border-transparent text-white"
                          : "border-border hover:border-primary hover:text-primary opacity-60 hover:opacity-100"
                      }`}
                      style={conv.status === s ? { background: STATUS_COLORS[s], borderColor: STATUS_COLORS[s] } : {}}
                    >
                      {conv.status === s && <ChevronRight className="w-3 h-3" />}
                      {STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Campo Doença */}
              <div className="bg-muted/30 rounded-xl p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Doença / Condição</p>
                <div className="flex flex-col gap-2">
                  <select
                    value={diseaseSelect}
                    onChange={e => setDiseaseSelect(e.target.value)}
                    className="bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
                  >
                    <option value="">— Não identificada —</option>
                    {DISEASE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  {diseaseSelect === "OUTRA" && (
                    <input
                      type="text"
                      value={diseaseNote}
                      onChange={e => setDiseaseNote(e.target.value)}
                      placeholder="Descreva a condição..."
                      maxLength={200}
                      className="bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
                    />
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={saveDisease}
                      disabled={diseaseSaving}
                      className="text-xs px-3 py-1.5 rounded-xl btn-primary-gradient text-primary-foreground font-medium disabled:opacity-50"
                    >
                      {diseaseSaving ? "Salvando..." : "Salvar doença"}
                    </button>
                    {diseaseSelect && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full border font-medium"
                        style={(() => { const c = getDiseaseColor(diseaseSelect); return { background: c.bg, color: c.text, borderColor: c.border }; })()}
                      >
                        {DISEASE_LABELS[diseaseSelect] ?? diseaseSelect}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Primeira mensagem */}
              {conv.firstMessage && (
                <div className="bg-muted/30 rounded-xl p-4">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Primeira mensagem</p>
                  <p className="text-sm">{conv.firstMessage}</p>
                </div>
              )}

              {/* Anotações */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Anotações</p>
                  <span className={`text-xs flex items-center gap-1 transition-opacity ${saveState === "idle" ? "opacity-0" : "opacity-100"}`}>
                    {saveState === "saving" ? (
                      <><Save className="w-3 h-3 animate-pulse text-muted-foreground" /> Salvando...</>
                    ) : (
                      <span className="text-green-600 dark:text-green-400">✓ Salvo</span>
                    )}
                  </span>
                </div>
                <textarea
                  value={notes}
                  onChange={e => { setNotes(e.target.value); setSaveState("saving"); }}
                  placeholder="Observações sobre este lead..."
                  maxLength={2000}
                  className="w-full bg-muted/30 border border-border rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 transition min-h-[80px]"
                  rows={3}
                />
                <p className="text-xs text-muted-foreground text-right mt-1">{notes.length}/2000</p>
              </div>

              {/* Timeline */}
              {history.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Histórico de Status</p>
                  <div className="relative pl-4">
                    <div className="absolute left-1.5 top-0 bottom-0 w-px bg-border" />
                    {history.map((h) => (
                      <div key={h.id} className="relative flex items-start gap-3 mb-4 last:mb-0">
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: STATUS_COLORS[h.toStatus] ?? "#64748b", border: "2px solid var(--background)", flexShrink: 0, marginTop: 4, marginLeft: -1 }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {h.fromStatus && (
                              <span className="text-xs text-muted-foreground line-through">{STATUS_LABELS[h.fromStatus] ?? h.fromStatus}</span>
                            )}
                            {h.fromStatus && <span className="text-xs text-muted-foreground">→</span>}
                            <span className="text-xs font-medium" style={{ color: STATUS_COLORS[h.toStatus] ?? "#64748b" }}>{STATUS_LABELS[h.toStatus] ?? h.toStatus}</span>
                            <span className="text-xs text-muted-foreground ml-auto">{timeAgo(h.createdAt)}</span>
                          </div>
                          {h.notes && <p className="text-xs text-muted-foreground mt-0.5">{h.notes}</p>}
                          <p className="text-xs text-muted-foreground/50">{h.changedBy === "manual" ? "Manual" : "Sistema"}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {history.length === 0 && (
                <div className="bg-muted/20 rounded-xl p-4 text-center">
                  <Clock className="w-5 h-5 mx-auto mb-1 text-muted-foreground opacity-40" />
                  <p className="text-xs text-muted-foreground">Nenhuma mudança de status registrada ainda.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
