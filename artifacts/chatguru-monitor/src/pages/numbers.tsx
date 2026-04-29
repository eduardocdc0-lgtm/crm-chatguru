import React, { useState } from "react";
import { Smartphone, Users, Key, Check, Pencil, X, Save } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

interface WaNumber {
  id: number;
  number: string;
  label: string;
  team: string;
  active: boolean;
  leadsTotal: number;
  chatguruPhoneId?: string | null;
}

const TEAM_LABELS: Record<string, string> = {
  COMERCIAL_TRAFEGO: "Comercial Tráfego",
  ATENDIMENTO: "Atendimento",
};

function formatNumber(n: string) {
  const d = n.replace(/\D/g, "");
  if (d.length >= 12) return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  return n;
}

function PhoneIdEditor({ number, onSaved }: { number: WaNumber; onSaved: (id: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(number.chatguruPhoneId ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const resp = await fetch(`${BASE_URL}/api/whatsapp-numbers/${number.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatguruPhoneId: value.trim() || null }),
    });
    const d = await resp.json();
    setSaving(false);
    if (d.ok) {
      onSaved(value.trim() || null);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <div className="mt-3 border border-border rounded-lg p-3 space-y-2 bg-muted/20">
        <p className="text-xs font-medium text-muted-foreground">ID ChatGuru do número</p>
        <p className="text-xs text-muted-foreground/70">
          Encontre em: ChatGuru → Configurações → Números → copie o ID interno do número.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="ex: 69499a1760fb30c550cd39b7"
            className="flex-1 text-xs font-mono px-2 py-1.5 border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            <Save className="h-3 w-3" />
            {saving ? "Salvando..." : "Salvar"}
          </button>
          <button
            onClick={() => { setValue(number.chatguruPhoneId ?? ""); setEditing(false); }}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/30"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 flex items-center gap-2">
      <div className="flex-1 flex items-center gap-2">
        <Key className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        {number.chatguruPhoneId ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-mono text-muted-foreground truncate max-w-[160px]">{number.chatguruPhoneId}</span>
            <Check className="h-3 w-3 text-green-500 flex-shrink-0" />
          </div>
        ) : (
          <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">ID ChatGuru não configurado</span>
        )}
      </div>
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
      >
        <Pencil className="h-3 w-3" />
        {number.chatguruPhoneId ? "Editar" : "Configurar"}
      </button>
    </div>
  );
}

export function Numbers() {
  const [numbers, setNumbers] = React.useState<WaNumber[]>([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(() => {
    fetch(`${BASE_URL}/api/whatsapp-numbers`)
      .then(r => r.json())
      .then(d => setNumbers(d.numbers ?? []))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const updatePhoneId = (id: number, phoneId: string | null) => {
    setNumbers(prev => prev.map(n => n.id === id ? { ...n, chatguruPhoneId: phoneId } : n));
  };

  const unconfigured = numbers.filter(n => !n.chatguruPhoneId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Números de WhatsApp</h1>
        <p className="text-muted-foreground text-sm mt-1">Origens de atendimento do escritório.</p>
      </div>

      {!loading && unconfigured.length > 0 && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl">
          <Key className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              {unconfigured.length} número{unconfigured.length > 1 ? "s" : ""} sem ID ChatGuru
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              Sem o ID ChatGuru configurado, o envio de mensagens via Reengajamento não funcionará.
              Clique em "Configurar" abaixo para adicionar o ID de cada número.
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map(i => <Skeleton key={i} className="h-52 w-full rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {numbers.map(num => {
            const isComercial = num.team === "COMERCIAL_TRAFEGO";
            return (
              <div key={num.id} className="bg-card border border-border rounded-xl p-6 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: isComercial ? "#ede9fe" : "#e0f2fe", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Smartphone className="h-5 w-5" style={{ color: isComercial ? "#7c3aed" : "#0284c7" }} />
                    </div>
                    <div>
                      <p className="font-semibold text-base">{num.label}</p>
                      <p className="text-sm text-muted-foreground font-mono">{formatNumber(num.number)}</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${num.active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                    {num.active ? "Ativo" : "Inativo"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div style={{ background: isComercial ? "#f5f3ff" : "#f0f9ff", borderRadius: 10, padding: "12px 16px" }}>
                    <p className="text-xs text-muted-foreground">Total de Leads</p>
                    <p className="text-2xl font-bold mt-0.5" style={{ color: isComercial ? "#7c3aed" : "#0284c7" }}>{num.leadsTotal}</p>
                  </div>
                  <div className="bg-muted/40 rounded-xl p-3">
                    <p className="text-xs text-muted-foreground">Equipe</p>
                    <p className="text-sm font-medium mt-0.5">{TEAM_LABELS[num.team] ?? num.team}</p>
                  </div>
                </div>

                <div className="border-t border-border pt-3">
                  <PhoneIdEditor
                    number={num}
                    onSaved={(id) => updatePhoneId(num.id, id)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-muted/30 border border-dashed border-border rounded-xl p-6 text-center">
        <p className="text-sm text-muted-foreground">Para adicionar um novo número de WhatsApp, entre em contato com o administrador do sistema.</p>
      </div>
    </div>
  );
}
