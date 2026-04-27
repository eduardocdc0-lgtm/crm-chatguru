import React, { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Send, ChevronDown, Edit2, X, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

interface Template {
  id: string;
  label: string;
  emoji: string;
  description: string;
}

const TEMPLATES: Template[] = [
  { id: "A", emoji: "💬", label: "Cobrança suave", description: "Lead que sumiu — chamar de volta com leveza" },
  { id: "B", emoji: "🔄", label: "Reativação de antigo", description: "Lead +7 dias parado — pegar de volta" },
  { id: "C", emoji: "✅", label: "Aviso de implantação", description: "Cliente implantado — boa notícia" },
  { id: "D", emoji: "💰", label: "Cobrança de mensalidade", description: "Cliente parcelado sem lançamento" },
];

function primeiroNome(nome: string): string {
  if (!nome?.trim()) return "você";
  return nome.trim().split(/\s+/)[0];
}

function campaignLabel(campaign: string | null | undefined): string {
  const MAP: Record<string, string> = {
    LAUDO_SUS_PE: "Laudo SUS PE", LAUDO_SUS_GERAL: "Laudo SUS Geral",
    AUX_DOENCA: "Auxílio Doença", AUX_ACIDENTE: "Auxílio Acidente",
    FIBROMIALGIA: "Fibromialgia", BPC: "BPC/LOAS",
    PERICIA_NEGADA: "Perícia Negada", PINO_PLACA_PARAFUSO: "Pino/Placa/Parafuso",
    INDEFINIDA: "seu caso",
  };
  return MAP[campaign ?? ""] ?? campaign ?? "seu caso";
}

function renderTemplate(id: string, nome: string, campaign: string | null | undefined): string {
  const n = primeiroNome(nome);
  const camp = campaignLabel(campaign);
  switch (id) {
    case "A": return `Oi ${n}, tudo bem? Vi que ficou pendente nossa conversa sobre ${camp}. Ainda posso te ajudar? 🙏`;
    case "B": return `Oi ${n}, aqui é do escritório do Dr. Eduardo. Tava te chamando pra saber se ainda tem interesse no ${camp}. Se preferir, posso ligar 🙏`;
    case "C": return `Boa notícia, ${n}! Seu benefício foi implantado. Estamos acompanhando a data de pagamento e te avisaremos assim que sair 🙏`;
    case "D": return `Oi ${n}, tudo bem? Notamos que a parcela do mês ainda não consta. Pode verificar pra gente? 🙏`;
    default: return "";
  }
}

interface ConfirmModalProps {
  chatNumber: string;
  contactName: string;
  campaign?: string | null;
  templateId: string | null;
  isCustom: boolean;
  initialText: string;
  onClose: () => void;
  onSent: () => void;
}

function ConfirmModal({ chatNumber, contactName, campaign, templateId, isCustom, initialText, onClose, onSent }: ConfirmModalProps) {
  const [text, setText] = useState(initialText);
  const [editing, setEditing] = useState(isCustom);
  const [sending, setSending] = useState(false);

  const displayName = contactName || chatNumber;
  const phone = chatNumber.replace(/\D/g, "");
  const formatted = phone.length >= 11
    ? `(${phone.slice(2, 4)}) ${phone.slice(4, 9)}-${phone.slice(9)}`
    : chatNumber;

  async function handleSend() {
    setSending(true);
    try {
      const body = isCustom || editing
        ? { customMessage: text }
        : { templateId: templateId! };

      const r = await fetch(`${BASE_URL}/api/conversations/${encodeURIComponent(chatNumber)}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json() as { ok: boolean; error?: string; rateLimit?: boolean };

      if (d.ok) {
        toast.success("Mensagem enviada ✓");
        onSent();
        onClose();
      } else {
        toast.error(d.error ?? "Erro ao enviar mensagem");
      }
    } catch {
      toast.error("Falha de conexão ao enviar");
    } finally {
      setSending(false);
    }
  }

  return createPortal(
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border">
          <div>
            <p className="font-semibold text-foreground">{displayName}</p>
            <p className="text-xs text-muted-foreground">{formatted}</p>
          </div>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message preview */}
        <div className="p-5 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Mensagem</p>
          {editing ? (
            <textarea
              className="w-full bg-muted/30 border border-border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
              rows={5}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={isCustom ? "Digite sua mensagem. Use {nome} para inserir o primeiro nome." : ""}
              autoFocus
            />
          ) : (
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900 rounded-xl px-3 py-2.5 text-sm whitespace-pre-wrap">
              {text}
            </div>
          )}

          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <Edit2 className="w-3 h-3" /> Editar antes de enviar
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-5 pb-5">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-border rounded-xl text-sm text-muted-foreground hover:bg-muted/30 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !text.trim()}
            className="flex-1 flex items-center justify-center gap-2 btn-primary-gradient text-primary-foreground rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {sending ? "Enviando…" : "Enviar agora"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

interface LastSentInfo {
  templateId: string;
  messageText: string;
  sentBy: string;
  sentAt: string;
  recentCount: number;
}

interface SendTemplateButtonProps {
  chatNumber: string;
  contactName?: string | null;
  campaign?: string | null;
  size?: "sm" | "md";
  onSent?: () => void;
}

export function SendTemplateButton({
  chatNumber,
  contactName = "",
  campaign,
  size = "sm",
  onSent,
}: SendTemplateButtonProps) {
  const { role } = useAuth();
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<{ templateId: string | null; isCustom: boolean; text: string } | null>(null);
  const [lastSent, setLastSent] = useState<LastSentInfo | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const name = contactName ?? "";

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Fetch last sent info on mount
  useEffect(() => {
    fetch(`${BASE_URL}/api/conversations/${encodeURIComponent(chatNumber)}/sent`)
      .then(r => r.json())
      .then(d => { if (d.sent) setLastSent(d.sent); })
      .catch(() => {});
  }, [chatNumber]);

  if (role !== "admin") return null;

  function openTemplate(tpl: Template) {
    setOpen(false);
    const text = renderTemplate(tpl.id, name, campaign);
    setModal({ templateId: tpl.id, isCustom: false, text });
  }

  function openCustom() {
    setOpen(false);
    setModal({ templateId: null, isCustom: true, text: "" });
  }

  const btnClass = size === "sm"
    ? "flex items-center gap-1 text-xs px-2.5 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg transition-colors font-medium"
    : "flex items-center gap-1.5 text-sm px-3 py-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl transition-colors font-medium";

  return (
    <>
      <div ref={dropRef} className="relative">
        <button
          onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
          className={btnClass}
        >
          <Send className={size === "sm" ? "w-3 h-3" : "w-4 h-4"} />
          Enviar
          <ChevronDown className={`${size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5"} ${open ? "rotate-180" : ""} transition-transform`} />
        </button>

        {open && (
          <div className="absolute top-full mt-1 right-0 z-[200] bg-popover border border-border rounded-xl shadow-xl w-72 overflow-hidden">
            {TEMPLATES.map((tpl, i) => {
              const preview = renderTemplate(tpl.id, name, campaign);
              return (
                <button
                  key={tpl.id}
                  onClick={() => openTemplate(tpl)}
                  className={`w-full text-left px-3.5 py-3 hover:bg-muted/50 transition-colors ${i < TEMPLATES.length - 1 ? "border-b border-border" : ""}`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span>{tpl.emoji}</span>
                    <span className="text-xs font-semibold text-foreground">{tpl.id} — {tpl.label}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">{preview}</p>
                </button>
              );
            })}
            <button
              onClick={openCustom}
              className="w-full text-left px-3.5 py-3 border-t border-border hover:bg-muted/50 transition-colors flex items-center gap-2"
            >
              <span>✏️</span>
              <span className="text-xs font-medium text-foreground">Mensagem customizada…</span>
            </button>
          </div>
        )}
      </div>

      {/* Last sent badge */}
      {lastSent && (() => {
        const diffMs = Date.now() - new Date(lastSent.sentAt).getTime();
        const diffH = diffMs / 3600000;
        const label = diffH < 1
          ? `há ${Math.floor(diffMs / 60000)}min`
          : diffH < 24 ? `há ${Math.floor(diffH)}h` : `há ${Math.floor(diffH / 24)}d`;
        const LABELS: Record<string, string> = {
          A: "Cobrança suave", B: "Reativação", C: "Implantação", D: "Mensalidade", custom: "Customizada",
        };
        return (
          <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
            <span className="text-emerald-500">✓</span>
            {lastSent.sentBy} enviou "{LABELS[lastSent.templateId] ?? lastSent.templateId}" {label}
          </p>
        );
      })()}

      {modal && (
        <ConfirmModal
          chatNumber={chatNumber}
          contactName={name}
          campaign={campaign}
          templateId={modal.templateId}
          isCustom={modal.isCustom}
          initialText={modal.text}
          onClose={() => setModal(null)}
          onSent={() => {
            setLastSent({ templateId: modal.templateId ?? "custom", messageText: modal.text, sentBy: "Eduardo", sentAt: new Date().toISOString(), recentCount: (lastSent?.recentCount ?? 0) + 1 });
            onSent?.();
          }}
        />
      )}
    </>
  );
}
