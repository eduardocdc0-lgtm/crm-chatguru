import React, { useState, useEffect, useRef } from "react";
import { useListConversations, useDeleteConversation, getListConversationsQueryKey, type ListConversationsStatus } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CAMPAIGN_MAP } from "@/lib/campaignColors";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StatusBadge } from "@/components/status-badge";
import { formatPhone } from "@/lib/utils";
import { timeAgo, silenceLevel } from "@/lib/time";
import { Search, Loader2, FileText, Trash2, ExternalLink, Clock, ChevronDown, X, Send } from "lucide-react";
import { SendTemplateButton } from "@/components/send-template-button";
import { Button } from "@/components/ui/button";
import { useDebounce } from "@/hooks/use-debounce";
import { toast } from "sonner";
import { DISEASE_OPTIONS, getDiseaseColor, getDiseaseLabel } from "@/lib/diseaseUtils";

const CHATGURU_WEB = "https://app.zap.guru";

function openInChatGuru(chatNumber: string) {
  const phone = chatNumber.replace(/\D/g, "");
  window.open(`${CHATGURU_WEB}/chats/${phone}`, "_blank", "noopener,noreferrer");
}

function SilenceBadge({ lastMessageAt, status }: { lastMessageAt?: string | null; status: string }) {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => forceUpdate(n => n + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  if (!lastMessageAt || status === "resolved" || status === "closed") return null;

  const level = silenceLevel(lastMessageAt);
  const ago = timeAgo(lastMessageAt);

  if (level === "ok") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Clock className="w-3 h-3" />{ago}
      </span>
    );
  }

  const colors = {
    warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    critical: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 font-semibold",
  } as const;

  return (
    <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md ${colors[level]}`}>
      <Clock className="w-3 h-3" />
      {ago} sem resposta
    </span>
  );
}

function ContextDataPopover({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data);
  if (entries.length === 0) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-primary px-2">
          <FileText className="w-3 h-3" />
          {entries.length} dado{entries.length > 1 ? "s" : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Dados do Atendimento</p>
        <div className="space-y-1.5">
          {entries.map(([k, v]) => (
            <div key={k} className="flex items-start gap-2 text-sm">
              <span className="text-muted-foreground shrink-0 min-w-[80px] capitalize">{k.replace(/_/g, " ")}:</span>
              <span className="font-medium break-all">{String(v)}</span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DiseaseMultiSelect({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = (val: string) => {
    onChange(selected.includes(val) ? selected.filter(x => x !== val) : [...selected, val]);
  };

  const label = selected.length === 0
    ? "Todas as Doenças"
    : selected.length === 1
    ? getDiseaseLabel(selected[0])
    : `${selected.length} doenças`;

  return (
    <div className="relative w-full sm:w-56" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 border border-input bg-background rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted/50 transition-colors"
      >
        <span className="truncate">{label}</span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {selected.length > 0 && (
            <span
              onClick={e => { e.stopPropagation(); onChange([]); }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </div>
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 w-56 bg-popover border border-border rounded-lg shadow-lg overflow-y-auto max-h-72 p-1">
          {DISEASE_OPTIONS.map(opt => {
            const c = getDiseaseColor(opt.value);
            const isSelected = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-sm text-left transition-colors ${isSelected ? "bg-muted" : "hover:bg-muted/50"}`}
              >
                <span className={`w-3.5 h-3.5 rounded border flex-shrink-0 ${isSelected ? "bg-primary border-primary" : "border-border"}`} />
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full border font-medium flex-1 text-left"
                  style={{ background: c.bg, color: c.text, borderColor: c.border }}
                >
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Conversations() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ListConversationsStatus | "all">("all");
  const [campaign, setCampaign] = useState<string>("all");
  const [diseases, setDiseases] = useState<string[]>([]);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const debouncedSearch = useDebounce(search, 500);
  const queryClient = useQueryClient();

  const params = {
    search: debouncedSearch || undefined,
    status: status === "all" ? undefined : status as ListConversationsStatus,
    campaign: campaign === "all" ? undefined : campaign,
    disease: diseases.length > 0 ? diseases.join(",") : undefined,
    limit: 50,
  };

  const { data, isLoading, isFetching } = useListConversations(
    params as any,
    {
      query: {
        queryKey: getListConversationsQueryKey(params as any),
        keepPreviousData: true,
        refetchInterval: 60_000,
      },
    }
  );

  const { mutate: deleteConv } = useDeleteConversation({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries();
        toast.success("Conversa removida.");
        setDeletingId(null);
      },
      onError: () => {
        toast.error("Erro ao remover conversa.");
        setDeletingId(null);
      }
    }
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Conversas</h1>
        <p className="text-muted-foreground text-sm mt-1">Lista completa de atendimentos.</p>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-4 pt-5 px-5">
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por número ou nome..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="w-full sm:w-48">
              <Select value={status} onValueChange={(val: any) => setStatus(val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Filtrar por status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Status</SelectItem>
                  <SelectItem value="lead_novo">Lead Novo</SelectItem>
                  <SelectItem value="lead_qualificado">Lead Qualificado</SelectItem>
                  <SelectItem value="em_atendimento">Em Atendimento</SelectItem>
                  <SelectItem value="follow_up">Follow Up</SelectItem>
                  <SelectItem value="contrato_assinado">Contrato Assinado</SelectItem>
                  <SelectItem value="cliente_ativo">Cliente Ativo</SelectItem>
                  <SelectItem value="cliente_procedente">Cliente Procedente</SelectItem>
                  <SelectItem value="lead_descartado">Lead Descartado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-52">
              <Select value={campaign} onValueChange={setCampaign}>
                <SelectTrigger>
                  <SelectValue placeholder="Filtrar por campanha" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Campanhas</SelectItem>
                  {Object.entries(CAMPAIGN_MAP).map(([key, meta]) => (
                    <SelectItem key={key} value={key}>
                      {meta.emoji} {meta.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DiseaseMultiSelect selected={diseases} onChange={setDiseases} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border relative">
            {isFetching && !isLoading && (
              <div className="absolute inset-0 bg-background/50 backdrop-blur-sm z-10 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contato</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Agente</TableHead>
                  <TableHead>Última Mensagem</TableHead>
                  <TableHead>Espera</TableHead>
                  <TableHead>Dados</TableHead>
                  <TableHead className="text-right pr-2">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : data?.conversations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhuma conversa encontrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.conversations.map((conv) => (
                    <TableRow key={conv.id}>
                      <TableCell>
                        <div className="font-medium text-foreground">
                          {conv.contactName || formatPhone(conv.chatNumber)}
                        </div>
                        {conv.contactName && (
                          <div className="text-xs text-muted-foreground">
                            {formatPhone(conv.chatNumber)}
                          </div>
                        )}
                        {(conv as any).disease && (() => {
                          const c = getDiseaseColor((conv as any).disease);
                          return (
                            <span
                              className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full border font-medium"
                              style={{ background: c.bg, color: c.text, borderColor: c.border }}
                            >
                              {getDiseaseLabel((conv as any).disease)}
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={conv.status} />
                      </TableCell>
                      <TableCell>
                        {conv.assignedAgent || <span className="text-muted-foreground italic text-xs">Não atribuído</span>}
                      </TableCell>
                      <TableCell className="max-w-[180px]">
                        <span className="truncate block text-sm text-muted-foreground">
                          {conv.lastMessage || "-"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <SilenceBadge lastMessageAt={conv.lastMessageAt} status={conv.status} />
                      </TableCell>
                      <TableCell>
                        {conv.contextData && Object.keys(conv.contextData).length > 0
                          ? <ContextDataPopover data={conv.contextData as Record<string, unknown>} />
                          : <span className="text-muted-foreground text-xs italic">—</span>
                        }
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          <SendTemplateButton
                            chatNumber={conv.chatNumber}
                            contactName={conv.contactName}
                            campaign={(conv as any).campaign}
                            size="sm"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                            title="Abrir no ChatGuru"
                            onClick={() => openInChatGuru(conv.chatNumber)}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            disabled={deletingId === conv.id}
                            onClick={() => {
                              if (confirm(`Remover conversa de ${conv.contactName || conv.chatNumber}?`)) {
                                setDeletingId(conv.id);
                                deleteConv({ id: conv.id });
                              }
                            }}
                          >
                            {deletingId === conv.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Trash2 className="w-3.5 h-3.5" />
                            }
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {data?.total !== undefined && (
            <div className="mt-4 text-sm text-muted-foreground text-right">
              Mostrando {data.conversations.length} de {data.total} conversas
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
