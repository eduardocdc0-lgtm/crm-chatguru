import { useOrigem, ORIGEM_META, type OrigemFilter } from "@/hooks/use-origem";

const OPTIONS: OrigemFilter[] = ["all", "trafego", "base"];

export function OrigemFilterBar() {
  const { origem, setOrigem } = useOrigem();

  return (
    <div className="flex items-center gap-1 bg-muted/50 border border-border rounded-xl p-1">
      {OPTIONS.map((opt) => {
        const meta = ORIGEM_META[opt];
        const active = origem === opt;
        return (
          <button
            key={opt}
            onClick={() => setOrigem(opt)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
              active
                ? "bg-background shadow-sm border border-border text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            <span>{meta.emoji}</span>
            <span>{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function OrigemBadge({ waId }: { waId?: number | null }) {
  if (!waId) return null;
  const opt: OrigemFilter = waId === 1 ? "trafego" : waId === 2 ? "base" : "all";
  if (opt === "all") return null;
  const meta = ORIGEM_META[opt];
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border"
      style={{ background: meta.bg, color: meta.color, borderColor: meta.border }}
    >
      {meta.emoji} {meta.label}
    </span>
  );
}
