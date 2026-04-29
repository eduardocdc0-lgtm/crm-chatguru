import React, { useEffect, useRef, useState, useCallback } from "react";
import { X, Send, Loader2, Mic, ImageIcon, FileText, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatPhone } from "@/lib/utils";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

interface ChatMessage {
  text: string;
  direction: "incoming" | "outgoing";
  author: string;
  timestamp: string;
  type: "text" | "audio" | "image" | "file";
}

interface ConversationMessages {
  chatNumber: string;
  contactName: string | null;
  messages: ChatMessage[];
  source: "chatguru" | "local";
}

export interface QuickReplyTarget {
  chatNumber: string;
  contactName?: string | null;
  assignedAgent?: string | null;
  whatsappNumberId?: number | null;
}

interface Props {
  target: QuickReplyTarget | null;
  onClose: () => void;
  onSent?: (chatNumber: string) => void;
}

function formatTime(ts: string): string {
  try {
    const d = new Date(
      /^\d{10}$/.test(ts) ? Number(ts) * 1000 :
      /^\d{13}$/.test(ts) ? Number(ts) :
      ts
    );
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isOut = msg.direction === "outgoing";
  const time = formatTime(msg.timestamp);

  const content = () => {
    if (msg.type === "audio") {
      return (
        <span className="flex items-center gap-1.5 text-sm italic opacity-80">
          <Mic className="w-3.5 h-3.5 flex-shrink-0" />
          Áudio recebido
        </span>
      );
    }
    if (msg.type === "image") {
      return (
        <span className="flex items-center gap-1.5 text-sm italic opacity-80">
          <ImageIcon className="w-3.5 h-3.5 flex-shrink-0" />
          Imagem recebida
        </span>
      );
    }
    if (msg.type === "file") {
      return (
        <span className="flex items-center gap-1.5 text-sm italic opacity-80">
          <FileText className="w-3.5 h-3.5 flex-shrink-0" />
          {msg.text || "Documento"}
        </span>
      );
    }
    return <span className="text-sm whitespace-pre-wrap break-words">{msg.text}</span>;
  };

  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"} mb-2`}>
      <div
        className={`max-w-[78%] rounded-2xl px-3.5 py-2 shadow-sm ${
          isOut
            ? "bg-green-500 text-white rounded-br-sm"
            : "bg-white dark:bg-zinc-700 text-foreground dark:text-white rounded-bl-sm border border-border/50"
        }`}
      >
        {msg.author && (
          <p className={`text-[10px] font-semibold mb-0.5 ${isOut ? "text-green-100" : "text-muted-foreground"}`}>
            {msg.author}
          </p>
        )}
        {content()}
        {time && (
          <p className={`text-[10px] mt-1 text-right ${isOut ? "text-green-100" : "text-muted-foreground"}`}>
            {time}
          </p>
        )}
      </div>
    </div>
  );
}

export function QuickReplyModal({ target, onClose, onSent }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [msgSource, setMsgSource] = useState<"chatguru" | "local" | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async (chatNumber: string) => {
    setLoadingMsgs(true);
    setMessages([]);
    try {
      const r = await fetch(`${BASE_URL}/api/conversations/${encodeURIComponent(chatNumber)}/messages`);
      if (r.ok) {
        const d: ConversationMessages = await r.json();
        setMessages(d.messages.slice(-3));
        setMsgSource(d.source);
      }
    } catch {
      // silently ignore
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  useEffect(() => {
    if (!target) return;
    setText("");
    setMessages([]);
    setMsgSource(null);
    fetchMessages(target.chatNumber);
  }, [target, fetchMessages]);

  useEffect(() => {
    if (target) {
      setTimeout(() => textareaRef.current?.focus(), 80);
    }
  }, [target]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSend = async () => {
    if (!target || !text.trim() || sending) return;
    setSending(true);
    try {
      const body: Record<string, unknown> = {
        chatNumber: target.chatNumber,
        message: text.trim(),
      };
      if (target.whatsappNumberId) body.whatsappNumberId = target.whatsappNumberId;

      const r = await fetch(`${BASE_URL}/api/chatguru/send-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const res = await r.json();
      if (res.ok) {
        toast.success("Mensagem enviada com sucesso!");
        onSent?.(target.chatNumber);
        onClose();
      } else {
        toast.error(`Erro ao enviar: ${res.error ?? "Tente novamente."}`);
      }
    } catch {
      toast.error("Erro de conexão. Tente novamente.");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!target) return null;

  const name = target.contactName || formatPhone(target.chatNumber);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="w-full max-w-md bg-background rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-border">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{name}</p>
            <p className="text-xs text-muted-foreground">
              {formatPhone(target.chatNumber)}
              {target.assignedAgent ? ` · ${target.assignedAgent}` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4 bg-zinc-100/60 dark:bg-zinc-800/40 min-h-[180px] max-h-[260px]">
          {loadingMsgs ? (
            <div className="flex items-center justify-center h-full py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-8 gap-2 text-muted-foreground">
              <AlertCircle className="w-5 h-5 opacity-40" />
              <p className="text-xs">Histórico não disponível</p>
            </div>
          ) : (
            <>
              {msgSource === "local" && (
                <p className="text-center text-[10px] text-muted-foreground mb-3 italic">
                  ⚠️ Histórico parcial (via webhook local)
                </p>
              )}
              {messages.map((m, i) => (
                <MessageBubble key={i} msg={m} />
              ))}
            </>
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-border p-3 flex gap-2 items-end bg-background">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            placeholder="Digite sua resposta… (Enter envia, Shift+Enter quebra linha)"
            className="flex-1 resize-none rounded-xl border border-input bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all placeholder:text-muted-foreground"
          />
          <div className="flex flex-col gap-2">
            <Button
              onClick={handleSend}
              disabled={!text.trim() || sending}
              size="sm"
              className="h-9 px-3 gap-1.5"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? "Enviando" : "Enviar"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-9 px-3 text-muted-foreground text-xs"
            >
              Cancelar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
