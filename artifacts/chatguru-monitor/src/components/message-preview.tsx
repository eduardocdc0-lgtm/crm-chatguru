import React, { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

interface ChatMessage {
  text: string;
  direction: "incoming" | "outgoing";
  author: string;
  timestamp: string;
  type: "text" | "audio" | "image" | "file";
}

interface MessagesData {
  chatNumber: string;
  contactName: string | null;
  messages: ChatMessage[];
  source: "chatguru" | "local";
}

const TYPE_LABELS: Record<string, string> = {
  audio: "🎤 [áudio]",
  image: "🖼️ [imagem]",
  file: "📎 [arquivo]",
};

function truncate(text: string, max = 100): { short: string; full: string; truncated: boolean } {
  const trimmed = text.trim();
  if (trimmed.length <= max) return { short: trimmed, full: trimmed, truncated: false };
  return { short: trimmed.slice(0, max) + "…", full: trimmed, truncated: true };
}

function relativeTime(ts: string): string {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `há ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `há ${Math.floor(diff / 86400)}d`;
  return `há ${Math.floor(diff / 604800)}sem`;
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const isOut = msg.direction === "outgoing";

  let displayText: string;
  let isMedia = false;
  if (msg.type !== "text") {
    displayText = TYPE_LABELS[msg.type] ?? `📎 [${msg.type}]`;
    isMedia = true;
  } else {
    displayText = msg.text;
  }

  const { short, full, truncated } = truncate(displayText, 100);

  return (
    <div className={`flex gap-1.5 ${isOut ? "flex-row-reverse" : "flex-row"}`}>
      <span className="text-[13px] flex-shrink-0 mt-0.5">{isOut ? "💼" : "👤"}</span>
      <div className="flex-1 min-w-0">
        <div
          className={`relative inline-block max-w-full rounded-xl px-2.5 py-1.5 text-[12px] leading-snug cursor-default
            ${isOut
              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100 border border-emerald-100 dark:border-emerald-900"
              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700"
            }
            ${isMedia ? "italic text-muted-foreground" : ""}`}
          onMouseEnter={() => truncated && setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          {isOut && msg.author && msg.author !== "Equipe" && (
            <span className="block text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mb-0.5">{msg.author}</span>
          )}
          <span>{short}</span>
          {showTooltip && (
            <div className="absolute bottom-full left-0 mb-1.5 z-50 bg-popover border border-border rounded-lg shadow-lg p-2.5 text-xs text-popover-foreground max-w-xs whitespace-pre-wrap break-words pointer-events-none">
              {full}
            </div>
          )}
        </div>
        <div className={`text-[10px] text-muted-foreground mt-0.5 ${isOut ? "text-right" : "text-left"}`}>
          {relativeTime(msg.timestamp)}
        </div>
      </div>
    </div>
  );
}

interface MessagePreviewProps {
  chatNumber: string;
  maxMessages?: number;
}

export function MessagePreview({ chatNumber, maxMessages = 3 }: MessagePreviewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [data, setData] = useState<MessagesData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // IntersectionObserver: load only when visible
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { rootMargin: "100px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || data || loading) return;
    setLoading(true);
    fetch(`${BASE_URL}/api/conversations/${encodeURIComponent(chatNumber)}/messages`)
      .then(r => r.json())
      .then(d => { setData(d); setError(false); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [visible, chatNumber, data, loading]);

  const messages = (data?.messages ?? []).slice(-maxMessages);

  return (
    <div ref={ref} className="mt-2.5 rounded-xl border border-border bg-background/60 overflow-hidden">
      <div className="px-3 py-1.5 bg-muted/40 border-b border-border">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          Últimas mensagens
          {data?.source === "local" && (
            <span className="ml-1 opacity-60">(histórico local)</span>
          )}
        </span>
      </div>
      <div className="px-3 py-2 space-y-2">
        {loading ? (
          <>
            <Skeleton className="h-8 w-4/5 rounded-xl" />
            <Skeleton className="h-8 w-3/5 rounded-xl ml-auto" />
            <Skeleton className="h-8 w-4/5 rounded-xl" />
          </>
        ) : error ? (
          <p className="text-[11px] text-muted-foreground italic py-1">Erro ao carregar mensagens.</p>
        ) : messages.length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic py-1">Sem mensagens disponíveis.</p>
        ) : (
          messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)
        )}
      </div>
    </div>
  );
}
