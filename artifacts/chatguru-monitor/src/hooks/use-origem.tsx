import React, { createContext, useContext, useState, useEffect } from "react";

export type OrigemFilter = "all" | "trafego" | "base";

export const ORIGEM_WA_ID: Record<OrigemFilter, number | null> = {
  all: null,
  trafego: 1,
  base: 2,
};

export const ORIGEM_META: Record<OrigemFilter, { label: string; emoji: string; color: string; bg: string; border: string }> = {
  all: { label: "Todos", emoji: "📋", color: "#6b7280", bg: "#f3f4f6", border: "#e5e7eb" },
  trafego: { label: "Tráfego Pago", emoji: "🎯", color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
  base: { label: "Base", emoji: "👥", color: "#059669", bg: "#ecfdf5", border: "#a7f3d0" },
};

export function origemFromWaId(id: number | null | undefined): OrigemFilter | null {
  if (id === 1) return "trafego";
  if (id === 2) return "base";
  return null;
}

interface OrigemContextValue {
  origem: OrigemFilter;
  setOrigem: (v: OrigemFilter) => void;
}

const OrigemContext = createContext<OrigemContextValue>({
  origem: "all",
  setOrigem: () => {},
});

const STORAGE_KEY = "crm_origem_filter";

export function OrigemProvider({ children }: { children: React.ReactNode }) {
  const [origem, setOrigemState] = useState<OrigemFilter>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "trafego" || stored === "base" || stored === "all") return stored;
    } catch {}
    return "all";
  });

  const setOrigem = (v: OrigemFilter) => {
    setOrigemState(v);
    try { localStorage.setItem(STORAGE_KEY, v); } catch {}
  };

  return (
    <OrigemContext.Provider value={{ origem, setOrigem }}>
      {children}
    </OrigemContext.Provider>
  );
}

export function useOrigem() {
  return useContext(OrigemContext);
}
