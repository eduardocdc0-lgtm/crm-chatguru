import React, { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, ExternalLink } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { getCampaign } from "@/lib/campaignColors";
import { formatPhone } from "@/lib/utils";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

interface SearchResult {
  id: number;
  chatNumber: string;
  contactName?: string | null;
  status: string;
  campaign?: string | null;
  assignedAgent?: string | null;
  lastMessage?: string | null;
  firstMessage?: string | null;
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
  open: "Lead Novo", in_progress: "Em Atendimento", waiting: "Aguardando",
  resolved: "Contrato Assinado", closed: "Lead Descartado",
};

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
  onSelect?: (id: number) => void;
}

export function SearchModal({ open, onClose, onSelect }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    if (open) {
      setQuery(""); setResults([]); setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) { setResults([]); return; }
    setLoading(true);
    fetch(`${BASE_URL}/api/conversations/search?q=${encodeURIComponent(debouncedQuery)}`)
      .then(r => r.json())
      .then(d => setResults(d.results ?? []))
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, [debouncedQuery]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    if (e.key === "Enter" && results[selected]) {
      onSelect?.(results[selected].id);
      onClose();
    }
  }, [results, selected, onClose, onSelect]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(0); }}
            placeholder="Buscar por nome, telefone, mensagem..."
            className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
          />
          {query && (
            <button onClick={() => { setQuery(""); setResults([]); }} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto">
          {loading && (
            <div className="py-6 text-center text-sm text-muted-foreground animate-pulse">Buscando...</div>
          )}
          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">Nenhum resultado para "{query}"</div>
          )}
          {!loading && results.length === 0 && !query && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
              Digite para buscar leads
            </div>
          )}
          {results.map((r, i) => {
            const meta = getCampaign(r.campaign);
            const name = r.contactName || formatPhone(r.chatNumber);
            const isActive = i === selected;
            return (
              <div
                key={r.id}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${isActive ? "bg-muted" : "hover:bg-muted/50"}`}
                onClick={() => { onSelect?.(r.id); onClose(); }}
                onMouseEnter={() => setSelected(i)}
              >
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: meta.color, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                  {name.substring(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{name}</span>
                    {r.contactName && <span className="text-xs text-muted-foreground">{formatPhone(r.chatNumber)}</span>}
                  </div>
                  {r.lastMessage && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{r.lastMessage}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span style={{ background: meta.bg, color: meta.text, border: `1px solid ${meta.border}`, borderRadius: 20, padding: "1px 7px", fontSize: 10, fontWeight: 500 }}>
                    {meta.emoji} {meta.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{STATUS_LABELS[r.status] ?? r.status}</span>
                </div>
              </div>
            );
          })}
        </div>

        {results.length > 0 && (
          <div className="px-4 py-2 border-t border-border flex items-center gap-3 text-xs text-muted-foreground">
            <span>↑↓ navegar</span>
            <span>↵ abrir</span>
            <span>Esc fechar</span>
            <span className="ml-auto">{results.length} resultado{results.length !== 1 ? "s" : ""}</span>
          </div>
        )}
      </div>
    </div>
  );
}
