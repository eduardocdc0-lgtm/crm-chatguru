import React, { useState, useMemo } from "react";
import { useListConversations, getListConversationsQueryKey } from "@workspace/api-client-react";
import { formatPhone, formatDate } from "@/lib/utils";
import { Send, Search, CheckSquare, Square, AlertCircle, Clock, Loader2, CheckCircle2, XCircle, ChevronDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MessagePreview } from "@/components/message-preview";
import { SendTemplateButton } from "@/components/send-template-button";

type SendStatus = "idle" | "sending" | "ok" | "error";

interface LeadRow {
  id: number;
  chatNumber: string;
  contactName?: string | null;
  assignedAgent?: string | null;
  lastMessageAt?: string | null;
  updatedAt: string;
  origem?: string;
  sendStatus: SendStatus;
  errorMsg?: string;
}

function getInitials(name: string) {
  return name.replace(/[^\w\s]/g, "").split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("") || "?";
}

const COLORS = ["#3b82f6","#8b5cf6","#06b6d4","#f59e0b","#10b981","#ef4444","#ec4899"];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % COLORS.length;
  return COLORS[Math.abs(h)];
}

function hoursAgo(dateStr?: string | null) {
  if (!dateStr) return null;
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000 / 3600;
  if (diff < 1) return "há menos de 1h";
  if (diff < 24) return `há ${Math.floor(diff)}h`;
  return `há ${Math.floor(diff / 24)}d`;
}

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

export function Reengagement() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rows, setRows] = useState<LeadRow[] | null>(null);
  const [sending, setSending] = useState(false);

  const { data, isLoading, isError } = useListConversations(
    { status: "open", limit: 200 },
    {
      query: {
        queryKey: getListConversationsQueryKey({ status: "open", limit: 200 }),
      },
    }
  );

  const allLeads: LeadRow[] = useMemo(() => {
    if (!data?.conversations) return [];
    return data.conversations.map(c => ({
      id: c.id,
      chatNumber: c.chatNumber,
      contactName: c.contactName,
      assignedAgent: c.assignedAgent,
      lastMessageAt: c.lastMessageAt,
      updatedAt: c.updatedAt,
      origem: (c.contextData as any)?.campanha_nome ?? (c.contextData as any)?.origem ?? undefined,
      sendStatus: "idle" as SendStatus,
    }));
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

    for (const lead of targets) {
      updateRow(lead.id, { sendStatus: "sending" });
      try {
        const resp = await fetch(`${BASE_URL}/api/chatguru/send-message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatNumber: lead.chatNumber, message: message.trim() }),
        });
        const json = await resp.json();
        if (json.ok) {
          updateRow(lead.id, { sendStatus: "ok" });
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
    toast({ title: `Mensagens enviadas para ${targets.length} lead(s)!` });
  };

  const selectedFiltered = filtered.filter(l => selected.has(l.id));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reengajamento</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Envie mensagens pelo número de Thiago para leads que ainda não responderam.
        </p>
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
          {/* Toolbar */}
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
              {isLoading ? "—" : `${filtered.length} leads`}
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

          {/* Rows */}
          <div className="divide-y divide-border max-h-[480px] overflow-y-auto">
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
                Nenhum lead em aberto encontrado.
              </div>
            ) : (
              filtered.map(lead => <ReengagementRow
                key={lead.id}
                lead={lead}
                isSelected={selected.has(lead.id)}
                onToggle={() => lead.sendStatus === "idle" && toggle(lead.id)}
              />)
            )}
          </div>
        </div>

        {/* Compose Panel */}
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-4 h-fit">
          <div>
            <h2 className="text-sm font-semibold mb-1">Mensagem</h2>
            <p className="text-xs text-muted-foreground">
              Será enviada pelo número de Thiago (0647) para os leads selecionados.
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

          <p className="text-xs text-muted-foreground text-center">
            As mensagens são agendadas para envio imediato pelo ChatGuru.
          </p>
        </div>
      </div>
    </div>
  );
}

function ReengagementRow({ lead, isSelected, onToggle }: {
  lead: LeadRow;
  isSelected: boolean;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const name = lead.contactName || formatPhone(lead.chatNumber);

  return (
    <div className={`border-b border-border transition-colors ${isSelected ? "bg-primary/5" : "hover:bg-muted/20"} ${lead.sendStatus !== "idle" ? "opacity-70" : ""}`}>
      {/* Main row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
        onClick={() => lead.sendStatus === "idle" && onToggle()}
      >
        {/* Checkbox / Status */}
        <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
          {lead.sendStatus === "sending" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          {lead.sendStatus === "ok" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
          {lead.sendStatus === "error" && <XCircle className="h-4 w-4 text-red-500" />}
          {lead.sendStatus === "idle" && (
            isSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-muted-foreground" />
          )}
        </div>

        {/* Avatar */}
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: avatarColor(name), display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: 11, flexShrink: 0 }}>
          {getInitials(name)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{name}</span>
            {lead.sendStatus === "error" && <span className="text-xs text-red-500">{lead.errorMsg}</span>}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-muted-foreground">{formatPhone(lead.chatNumber)}</span>
            {lead.assignedAgent && <span className="text-xs text-muted-foreground">• {lead.assignedAgent}</span>}
          </div>
        </div>

        {/* Time + expand */}
        <div className="flex-shrink-0 flex items-center gap-2">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {hoursAgo(lead.lastMessageAt || lead.updatedAt)}
          </span>
          <button
            onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
            className="p-1 rounded text-muted-foreground hover:text-primary transition-colors"
            title="Ver mensagens"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {/* Expandable: preview + send */}
      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          <MessagePreview chatNumber={lead.chatNumber} maxMessages={3} />
          <div className="flex items-center gap-2 mt-1">
            <SendTemplateButton
              chatNumber={lead.chatNumber}
              contactName={lead.contactName}
              campaign={undefined}
              size="sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}
