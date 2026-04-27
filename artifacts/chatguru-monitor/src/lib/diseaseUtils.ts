export const DISEASE_LABELS: Record<string, string> = {
  FIBROMIALGIA: "Fibromialgia",
  TDAH: "TDAH",
  TEA: "TEA (Autismo)",
  DEPRESSAO_ANSIEDADE: "Depressão / Ansiedade",
  ESQUIZOFRENIA_BIPOLAR: "Esquizofrenia / Bipolar",
  HERNIA_LOMBALGIA: "Hérnia de Disco / Lombalgia",
  PINO_PLACA_PARAFUSO: "Pino / Placa / Parafuso",
  OMBRO_LER: "Lesão de Ombro / LER",
  ARTROSE_ARTRITE: "Artrose / Artrite",
  CANCER: "Câncer",
  CARDIOPATIA: "Cardiopatia",
  AVC: "AVC / Sequelas",
  OUTRA: "Outra",
};

export const DISEASE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  FIBROMIALGIA:         { bg: "#fdf2f8", text: "#be185d", border: "#f9a8d4" },
  TDAH:                 { bg: "#eff6ff", text: "#1d4ed8", border: "#93c5fd" },
  TEA:                  { bg: "#f0fdf4", text: "#15803d", border: "#86efac" },
  DEPRESSAO_ANSIEDADE:  { bg: "#faf5ff", text: "#6d28d9", border: "#c4b5fd" },
  ESQUIZOFRENIA_BIPOLAR:{ bg: "#fff7ed", text: "#b45309", border: "#fcd34d" },
  HERNIA_LOMBALGIA:     { bg: "#fff7ed", text: "#c2410c", border: "#fdba74" },
  PINO_PLACA_PARAFUSO:  { bg: "#fefce8", text: "#a16207", border: "#fde047" },
  OMBRO_LER:            { bg: "#ecfeff", text: "#0e7490", border: "#a5f3fc" },
  ARTROSE_ARTRITE:      { bg: "#fef2f2", text: "#b91c1c", border: "#fca5a5" },
  CANCER:               { bg: "#f8fafc", text: "#334155", border: "#cbd5e1" },
  CARDIOPATIA:          { bg: "#fef2f2", text: "#dc2626", border: "#fecaca" },
  AVC:                  { bg: "#ede9fe", text: "#5b21b6", border: "#c4b5fd" },
  OUTRA:                { bg: "#f1f5f9", text: "#475569", border: "#cbd5e1" },
};

export function getDiseaseColor(key: string) {
  return DISEASE_COLORS[key] ?? { bg: "#f1f5f9", text: "#475569", border: "#cbd5e1" };
}

export function getDiseaseLabel(key?: string | null): string {
  if (!key) return "";
  return DISEASE_LABELS[key] ?? key;
}

export const DISEASE_OPTIONS = Object.entries(DISEASE_LABELS).map(([value, label]) => ({ value, label }));
