import React, { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatPhone } from "@/lib/utils";
import { Send, Search, CheckSquare, Square, AlertCircle, Clock, Loader2, CheckCircle2, XCircle, Key, Users, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useOrigem, ORIGEM_WA_ID } from "@/hooks/use-origem";
import { OrigemFilterBar } from "@/components/origem-filter";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

interface WaNumber {
  id: number;
  number: string;
  label: string;
  team: string;
  chatguruPhoneId?: string | null;
}

type SendStatus = "idle" | "sending" | "ok" | "error";

interface ReengLead {
  id: number;
  chatNumber: string;
  contactName?: string | null;
  assignedAgent?: string | null;
  agentId?: number | null;
  status: string;
  campaign?: string | null;
  lastMessageAt?: string | null;
  lastReengagementAt?: string | null;
  reengagementCount: number;
  lastAttemptResponded: boolean | null;
  createdAt: string;
  whatsappNumberId?: number | null;
}

interface LeadRow extends ReengLead {
  sendStatus: SendStatus;
  errorMsg?: string;
}

interface Sender {
  userId: number;
  name: string;
  total: number;
}

const WINDOW_OPTIONS = [
  { days: 3,  label: "3 dias" },
  { days: 7,  label: "7 dias" },
  { days: 15, label: "15 dias" },
  { days: 30, label: "30 dias" },
];

const ATTEMPT_STATE_OPTIONS: { value: string; label: string; emoji: string }[] = [
  { value: "",            label: "Todos",                       emoji: "" },
  { value: "never",       label: "Nunca tocado",                emoji: "🆕" },
  { value: "once",        label: "1 tentativa",                 emoji: "⏰" },
  { value: "twice",       label: "2 tentativas",                emoji: "🔥" },
  { value: "three_plus",  label: "3+ tentativas",               emoji: "☠️" },
  { value: "responded",   label: "Já respondeu reengajamento",  emoji: "✅" },
];

const LAST_ATTEMPT_OPTIONS: { value: string; label: string }[] = [
  { value: "",        label: "Qualquer" },
  { value: "today",   label: "Hoje" },
  { value: "2_3d",    label: "2-3 dias" },
  { value: "4_7d",    label: "4-7 dias" },
  { value: "8_14d",   label: "8-14 dias" },
  { value: "15_30d",  label: "15-30 dias" },
  { value: "30_plus", label: "30+ dias" },
];

const STATUS_LABELS: Record<string, string> = {
  lead_novo:        "Lead Novo",
  lead_qualificado: "Qualificado",
  follow_up:        "Follow Up",
};

function getInitials(name: string) {
  return name.replace(/[^\w\s]/g, "").split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("") || "?";
}

const COLORS = ["#3b82f6","#8b5cf6","#06b6d4","#f59e0b","#10b981","#ef4444","#ec4899"];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % COLORS.length;
  return COLORS[Math.abs(h)];
}

function silenceDuration(dateStr?: string | null, fallback?: string | null) {
  const d = dateStr ?? fallback;
  if (!d) return "data desconhecida";
  const diff = (Date.now() - new Date(d).getTime()) / 1000 / 3600;
  if (diff < 24) return `${Math.floor(diff)}h em silêncio`;
  const days = Math.floor(diff / 24);
  return `${days}d em silêncio`;
}

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

export function Reengagement() {
  const { toast } = useToast();
  const { origem } = useOrigem();
  const waId = ORIGEM_WA_ID[origem];

  const [windowDays, setWindowDays] = useState(3);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rows, setRows] = useState<LeadRow[] | null>(null);
  const [sending, setSending] = useState(false);
  const [numbers, setNumbers] = useState<WaNumber[]>([]);
  const [selectedNumberId, setSelectedNumberId] = useState<number | null>(null);

  // Novos filtros
  const [attemptState, setAttemptState] = useState<string>("");
  const [lastAttempt, setLastAttempt] = useState<string>("");
  const [senderFilter, setSenderFilter] = useState<number | "">("");

  useEffect(() => {
    fetch(`${BASE_URL}/api/whatsapp-numbers`)
      .then(r => r.json())
      .then(d => {
        const nums: WaNumber[] = d.numbers ?? [];
        setNumbers(nums);
        const withId = nums.find(n => n.chatguruPhoneId);
        if (withId) setSelectedNumberId(withId.id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (waId && numbers.length > 0) {
      const match = numbers.find(n => n.id === waId);
      if (match) setSelectedNumberId(match.id);
    }
  }, [waId, numbers]);

  useEffect(() => {
    setRows(null);
    setSelected(new Set());
  }, [origem, windowDays, attemptState, lastAttempt, senderFilter]);

  // ── Lista de quem já disparou (pra dropdown "Quem disparou") ──
  const { data: sendersData } = useQuery<{ senders: Sender[] }>({
    queryKey: ["reengagement-senders"],
    queryFn: () => fetch(`${BASE_URL}/api/reengagement/senders`).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  // ── Lista principal de leads ──
  const queryParams = new URLSearchParams();
  queryParams.set("days", String(windowDays));
  if (waId) queryParams.set("whatsappNumberId", String(waId));
  if (attemptState) queryParams.set("attemptState", attemptState);
  if (lastAttempt) queryParams.set("lastAttempt", lastAttempt);
  if (senderFilter) queryParams.set("sentByUserId", String(senderFilter));
  const queryUrl = `${BASE_URL}/api/reengagement/list?${queryParams.toString()}`;

  const { data, isLoading, isError } = useQuery<{ leads: ReengLead[]; days: number; total: number }>({
    queryKey: ["reengagement-list", windowDays, waId ?? "all", attemptState, lastAttempt, senderFilter],
    queryFn: () => fetch(queryUrl).then(r => r.json()),
    staleTime: 2 * 60 * 1000,
  });

  const allLeads: LeadRow[] = useMemo(() => {
    if (!data?.leads) return [];
    return data.leads.map(c => ({ ...c, sendStatus: "idle" as SendStatus }));
  }, [data]);

  const displayRows = rows ?? allLeads;

  const filtered = displayRows.filter(l => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.contactName?.toLowerCase().includes(q) ||
      l.chatNumber.includes(q) ||
      l.assignedAgent?.toLowerCase().includes(q)
    );
  });

  const toggle = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(l => l.id)));
    }
  };

  const sendMessages = async () => {
    if (!message.trim()) {
      toast({ title: "Escreva a mensagem antes de enviar.", variant: "destructive" });
      return;
    }
    if (selected.size === 0) {
      toast({ title: "Selecione pelo menos um lead.", variant: "destructive" });
      return;
    }

    setSending(true);
    const targets = filtered.filter(l => selected.has(l.id));

    const updateRow = (id: number, patch: Partial<LeadRow>) =>
      setRows(prev => {
        const base = prev ?? allLeads;
        return base.map(r => (r.id === id ? { ...r, ...patch } : r));
      });

    let okCount = 0;
    let transferSkippedCount = 0;
    for (const lead of targets) {
      updateRow(lead.id, { sendStatus: "sending" });
      try {
        const resp = await fetch(`${BASE_URL}/api/reengagement/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            conversationId: lead.id,
            message: message.trim(),
            whatsappNumberId: selectedNumberId ?? undefined,
          }),
        });
        const json = await resp.json();
        if (json.ok) {
          okCount++;
          if (json.transfer?.skipped) transferSkippedCount++;
          updateRow(lead.id, {
            sendStatus: "ok",
            reengagementCount: (lead.reengagementCount ?? 0) + 1,
            lastReengagementAt: new Date().toISOString(),
          });
        } else {
          updateRow(lead.id, { sendStatus: "error", errorMsg: json.error ?? "Erro" });
        }
      } catch {
        updateRow(lead.id, { sendStatus: "error", errorMsg: "Falha de rede" });
      }
      await new Promise(r => setTimeout(r, 400));
    }

    setSending(false);
    setSelected(new Set());
    if (transferSkippedCount > 0) {
      toast({
        title: `${okCount} enviada(s). ${transferSkippedCount} sem sync ChatGuru — configure CHATGURU_TRANSFER_ACTION.`,
      });
    } else {
      toast({ title: `Mensagens enviadas para ${okCount} lead(s)!` });
    }
  };

  const selectedFiltered = filtered.filter(l => selected.has(l.id));
  const totalCount = data?.total ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reengajamento</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Leads que pararam de responder. Cada disparo é registrado — você sabe quem foi tocado, quantas vezes e se respondeu.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/limpeza" className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors flex items-center gap-1.5">
            <Trash2 className="h-3.5 w-3.5" /> Limpeza
          </Link>
          <OrigemFilterBar />
        </div>
      </div>

      {/* Janela + filtros */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-foreground">Sem resposta há mais de:</span>
          <div className="flex gap-1.5">
            {WINDOW_OPTIONS.map(opt => (
              <button
                key={opt.days}
                onClick={() => setWindowDays(opt.days)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors",
                  windowDays === opt.days
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {!isLoading && (
            <div className="ml-auto flex items-center gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-1.5">
              <Users className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                {totalCount} lead{totalCount !== 1 ? "s" : ""} nesta janela
              </span>
            </div>
          )}
        </div>

        {/* Filtros adicionais */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Estado da tentativa</label>
            <select
              value={attemptState}
              onChange={e => setAttemptState(e.target.value)}
              className="px-3 py-1.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {ATTEMPT_STATE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.emoji && `${opt.emoji} `}{opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Última tentativa</label>
            <select
              value={lastAttempt}
              onChange={e => setLastAttempt(e.target.value)}
              className="px-3 py-1.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {LAST_ATTEMPT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Quem disparou</label>
            <select
              value={senderFilter}
              onChange={e => setSenderFilter(e.target.value === "" ? "" : Number(e.target.value))}
              className="px-3 py-1.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Todos</option>
              {sendersData?.senders.map(s => (
                <option key={s.userId} value={s.userId}>{s.name} ({s.total})</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Não foi possível carregar os leads.</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lead List */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar por nome ou número..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {isLoading ? "—" : `${filtered.length} exibidos`}
            </span>
            <button
              onClick={toggleAll}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              title="Selecionar todos"
            >
              {selected.size === filtered.length && filtered.length > 0
                ? <CheckSquare className="h-4 w-4" />
                : <Square className="h-4 w-4" />}
            </button>
          </div>

          <div className="divide-y divide-border max-h-[520px] overflow-y-auto">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground text-sm">
                <Users className="h-8 w-8 mx-auto mb-3 opacity-30" />
                Nenhum lead nesta janela com os filtros atuais.
              </div>
            ) : (
              filtered.map(lead => (
                <ReengagementRow
                  key={lead.id}
                  lead={lead}
                  isSelected={selected.has(lead.id)}
                  onToggle={() => lead.sendStatus === "idle" && toggle(lead.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Compose Panel */}
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-4 h-fit">
          <div>
            <h2 className="text-sm font-semibold mb-1">Mensagem</h2>
            <p className="text-xs text-muted-foreground">
              Cada envio é contabilizado e atribuído a você. Se você for da força-tarefa, o lead é transferido pra você no ChatGuru também.
            </p>
          </div>

          <div className="rounded-lg bg-muted/40 border border-border p-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Selecionados</p>
            <p className="text-2xl font-bold text-foreground">{selectedFiltered.length}</p>
            {selectedFiltered.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1 truncate">
                {selectedFiltered.slice(0, 3).map(l => l.contactName || formatPhone(l.chatNumber)).join(", ")}
                {selectedFiltered.length > 3 ? ` +${selectedFiltered.length - 3}` : ""}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">Número de origem</label>
            {numbers.length === 0 ? (
              <div className="text-xs text-muted-foreground">Carregando números...</div>
            ) : (
              <select
                value={selectedNumberId ?? ""}
                onChange={e => setSelectedNumberId(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">— usar padrão do sistema —</option>
                {numbers.map(n => (
                  <option key={n.id} value={n.id} disabled={!n.chatguruPhoneId}>
                    {n.label} {n.chatguruPhoneId ? "✓" : "(ID não configurado)"}
                  </option>
                ))}
              </select>
            )}
            {selectedNumberId && numbers.find(n => n.id === selectedNumberId && !n.chatguruPhoneId) && (
              <div className="flex items-start gap-2 p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 rounded-lg">
                <Key className="h-3.5 w-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Este número não tem ID ChatGuru. Configure em <strong>Números de WhatsApp</strong>.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">Texto da mensagem</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={6}
              placeholder="Ex: Olá! Vimos que você entrou em contato com nosso escritório. Ainda posso te ajudar? 😊"
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
            <p className="text-xs text-muted-foreground text-right">{message.length} caracteres</p>
          </div>

          <button
            onClick={sendMessages}
            disabled={sending || selected.size === 0 || !message.trim()}
            className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {sending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</>
            ) : (
              <><Send className="h-4 w-4" /> Enviar para {selected.size > 0 ? selected.size : "—"} lead{selected.size !== 1 ? "s" : ""}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function AttemptDots({ count }: { count: number }) {
  const filled = Math.min(count, 3);
  const total = 3;
  return (
    <span className="inline-flex gap-0.5" title={`${count} tentativa(s)`}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "inline-block w-2 h-2 rounded-full",
            i < filled ? (count >= 3 ? "bg-red-500" : count === 2 ? "bg-orange-500" : "bg-amber-500") : "bg-muted-foreground/30",
          )}
        />
      ))}
      {count > 3 && <span className="text-xs text-red-600 ml-1">+{count - 3}</span>}
    </span>
  );
}

function ReengagementRow({ lead, isSelected, onToggle }: {
  lead: LeadRow;
  isSelected: boolean;
  onToggle: () => void;
}) {
  const name = lead.contactName || formatPhone(lead.chatNumber);
  const statusLabel = STATUS_LABELS[lead.status] ?? lead.status;
  const respondedBadge = lead.lastAttemptResponded === true
    ? { label: "Respondeu", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" }
    : lead.lastAttemptResponded === false
      ? { label: "Aguardando resposta", color: "bg-muted text-muted-foreground" }
      : null;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors",
        isSelected ? "bg-primary/5" : "hover:bg-muted/20",
        lead.sendStatus !== "idle" && "opacity-70"
      )}
      onClick={() => lead.sendStatus === "idle" && onToggle()}
    >
      <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
        {lead.sendStatus === "sending" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        {lead.sendStatus === "ok" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
        {lead.sendStatus === "error" && <XCircle className="h-4 w-4 text-red-500" />}
        {lead.sendStatus === "idle" && (
          isSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-muted-foreground" />
        )}
      </div>

      <div style={{ width: 32, height: 32, borderRadius: "50%", background: avatarColor(name), display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: 11, flexShrink: 0 }}>
        {getInitials(name)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{name}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
            {statusLabel}
          </span>
          <AttemptDots count={lead.reengagementCount ?? 0} />
          {respondedBadge && (
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", respondedBadge.color)}>
              {respondedBadge.label}
            </span>
          )}
          {lead.sendStatus === "error" && <span className="text-xs text-red-500">{lead.errorMsg}</span>}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-muted-foreground">{formatPhone(lead.chatNumber)}</span>
          {lead.assignedAgent && <span className="text-xs text-muted-foreground">• {lead.assignedAgent}</span>}
          {lead.campaign && <span className="text-xs text-muted-foreground">• {lead.campaign}</span>}
        </div>
      </div>

      <div className="flex-shrink-0 text-right">
        <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 whitespace-nowrap">
          <Clock className="h-3 w-3" />
          {silenceDuration(lead.lastMessageAt, lead.createdAt)}
        </span>
        {lead.lastReengagementAt && (
          <div className="text-[10px] text-muted-foreground mt-0.5">
            Último disparo: {silenceDuration(lead.lastReengagementAt)}
          </div>
        )}
      </div>
    </div>
  );
}
