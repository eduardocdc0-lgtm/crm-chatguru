import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, AlertTriangle, Loader2, CheckSquare, Square, Eye } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { formatPhone } from "@/lib/utils";
import { cn } from "@/lib/utils";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

interface DiscardCandidate {
  id: number;
  chatNumber: string;
  contactName?: string | null;
  status: string;
  campaign?: string | null;
  reengagementCount: number;
  lastReengagementAt: string | null;
  assignedAgent?: string | null;
  whatsappNumberId?: number | null;
}

interface DiscardResp {
  leads: DiscardCandidate[];
  total: number;
  criteria: { minDaysSilence: number; minAttempts: number };
}

export function Limpeza() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [minDays, setMinDays] = useState(7);
  const [minAttempts, setMinAttempts] = useState(2);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery<DiscardResp>({
    queryKey: ["discard-candidates", minDays, minAttempts],
    queryFn: () =>
      fetch(`${BASE_URL}/api/reengagement/suggest-discards?minDays=${minDays}&minAttempts=${minAttempts}`)
        .then(r => r.json()),
    staleTime: 60 * 1000,
  });

  const leads = data?.leads ?? [];
  const total = data?.total ?? 0;

  const allSelected = leads.length > 0 && selected.size === leads.length;

  const toggle = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(leads.map(l => l.id)));
  };

  const sample = useMemo(() => {
    const arr = Array.from(selected);
    return arr.slice(0, 5).map(id => leads.find(l => l.id === id)).filter(Boolean) as DiscardCandidate[];
  }, [selected, leads]);

  const performDiscard = async () => {
    setDiscarding(true);
    try {
      const r = await fetch(`${BASE_URL}/api/reengagement/discard-bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ids: Array.from(selected),
          reason: `SUMIU_${minAttempts}+_TENTATIVAS`,
        }),
      });
      const j = await r.json();
      if (j.ok) {
        toast({ title: `${j.updated} lead(s) descartado(s).${j.skipped ? ` ${j.skipped} pulado(s) por permissão.` : ""}` });
        setSelected(new Set());
        setConfirmOpen(false);
        await refetch();
        queryClient.invalidateQueries({ queryKey: ["reengagement-list"] });
      } else {
        toast({ title: j.error ?? "Erro", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro de rede", variant: "destructive" });
    } finally {
      setDiscarding(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Trash2 className="h-6 w-6" /> Limpeza
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Leads que receberam reengajamento mas continuam sem resposta. Descarte em massa libera a base e foca o time no que tem chance.
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Mínimo de tentativas</label>
            <select
              value={minAttempts}
              onChange={e => { setMinAttempts(Number(e.target.value)); setSelected(new Set()); }}
              className="px-3 py-1.5 text-sm bg-background border border-border rounded-lg"
            >
              <option value={1}>1+ tentativas</option>
              <option value={2}>2+ tentativas</option>
              <option value={3}>3+ tentativas</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Dias sem resposta após último disparo</label>
            <select
              value={minDays}
              onChange={e => { setMinDays(Number(e.target.value)); setSelected(new Set()); }}
              className="px-3 py-1.5 text-sm bg-background border border-border rounded-lg"
            >
              <option value={3}>3 dias</option>
              <option value={7}>7 dias</option>
              <option value={14}>14 dias</option>
              <option value={30}>30 dias</option>
            </select>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {!isLoading && (
              <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                {total} candidato{total !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      </div>

      {isError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Não foi possível carregar candidatos.</AlertDescription>
        </Alert>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
          <button onClick={selectAll} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
            {allSelected ? "Desmarcar todos" : "Selecionar todos"}
          </button>
          <span className="text-xs text-muted-foreground">
            {selected.size} selecionado{selected.size !== 1 ? "s" : ""}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setReviewMode(v => !v)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
            >
              <Eye className="h-3.5 w-3.5" />
              {reviewMode ? "Ocultar mensagens" : "Revisar 1 a 1"}
            </button>
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={selected.size === 0}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Descartar selecionados ({selected.size})
            </button>
          </div>
        </div>

        <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="p-3"><Skeleton className="h-12 w-full" /></div>
            ))
          ) : leads.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              Nenhum lead atende aos critérios atuais. Operação está limpa! 🎉
            </div>
          ) : (
            leads.map(lead => (
              <CandidateRow
                key={lead.id}
                lead={lead}
                isSelected={selected.has(lead.id)}
                onToggle={() => toggle(lead.id)}
                showDetails={reviewMode}
              />
            ))
          )}
        </div>
      </div>

      {/* Modal de confirmação */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !discarding && setConfirmOpen(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <h3 className="text-lg font-bold">Descartar {selected.size} lead(s)?</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Esta ação marca os leads como <strong>lead_descartado</strong> com motivo <code>SUMIU_{minAttempts}+_TENTATIVAS</code>. Eles somem da lista de qualificados mas ficam no banco (não são deletados).
            </p>
            {sample.length > 0 && (
              <div className="bg-muted/40 rounded-lg p-3 mb-4">
                <p className="text-xs font-semibold mb-2">Amostra:</p>
                <ul className="text-xs space-y-1">
                  {sample.map(s => (
                    <li key={s.id} className="text-foreground/80">
                      • {s.contactName || formatPhone(s.chatNumber)} — {s.reengagementCount} tentativas
                    </li>
                  ))}
                  {selected.size > 5 && <li className="text-muted-foreground">… e mais {selected.size - 5}</li>}
                </ul>
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={discarding}
                className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={performDiscard}
                disabled={discarding}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {discarding && <Loader2 className="h-4 w-4 animate-spin" />}
                {discarding ? "Descartando..." : "Confirmar descarte"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CandidateRow({ lead, isSelected, onToggle, showDetails }: {
  lead: DiscardCandidate;
  isSelected: boolean;
  onToggle: () => void;
  showDetails: boolean;
}) {
  const name = lead.contactName || formatPhone(lead.chatNumber);
  const lastDate = lead.lastReengagementAt ? new Date(lead.lastReengagementAt).toLocaleDateString("pt-BR", { timeZone: "America/Recife" }) : "—";
  return (
    <div
      onClick={onToggle}
      className={cn(
        "flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors",
        isSelected ? "bg-primary/5" : "hover:bg-muted/20",
      )}
    >
      <div className="flex-shrink-0 mt-0.5">
        {isSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-muted-foreground" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{name}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-semibold">
            {lead.reengagementCount} tentativas
          </span>
          {lead.assignedAgent && <span className="text-xs text-muted-foreground">• {lead.assignedAgent}</span>}
          {lead.campaign && <span className="text-[10px] text-muted-foreground">• {lead.campaign}</span>}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {formatPhone(lead.chatNumber)} • Último disparo: {lastDate}
        </div>
        {showDetails && lead.lastReengagementAt && (
          <div className="text-[11px] text-muted-foreground/80 mt-1 italic">
            Sem resposta desde {lastDate}.
          </div>
        )}
      </div>
    </div>
  );
}
