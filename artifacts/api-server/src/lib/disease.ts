/**
 * Disease detection and constants for CRM leads.
 */

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

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
  AVC: "AVC / Sequelas neurológicas",
  OUTRA: "Outra",
};

const DISEASE_RULES: Array<{ key: string; test: (msg: string) => boolean }> = [
  { key: "FIBROMIALGIA", test: (m) => m.includes("fibromialgia") || m.includes("fibro") },
  { key: "TDAH", test: (m) => m.includes("tdah") || m.includes("deficit de atencao") || m.includes("hiperativ") },
  { key: "TEA", test: (m) => m.includes(" tea") || m.startsWith("tea ") || m === "tea" || m.includes("autismo") || m.includes("autista") || m.includes("espectro") },
  { key: "DEPRESSAO_ANSIEDADE", test: (m) => m.includes("depressao") || m.includes("ansiedade") || m.includes("transtorno de ansiedade") },
  { key: "ESQUIZOFRENIA_BIPOLAR", test: (m) => m.includes("esquizofren") || m.includes("bipolar") || m.includes("transtorno bipolar") },
  { key: "HERNIA_LOMBALGIA", test: (m) => m.includes("hernia") || m.includes("lombar") || m.includes("coluna") || m.includes("disco intervertebral") },
  { key: "PINO_PLACA_PARAFUSO", test: (m) => m.includes("pino") || m.includes("placa") || m.includes("parafuso") },
  { key: "OMBRO_LER", test: (m) => m.includes("ombro") || m.includes("manguito") || m.includes("rotador") || (m.includes("ler") && !m.includes("quero ler")) || m.includes("tendinite") },
  { key: "ARTROSE_ARTRITE", test: (m) => m.includes("artrose") || m.includes("artrite") || m.includes("reumatoide") },
  { key: "CANCER", test: (m) => m.includes("cancer") || m.includes("tumor") || m.includes("neoplasia") },
  { key: "CARDIOPATIA", test: (m) => m.includes("coracao") || m.includes("cardiopatia") || m.includes("infarto") || m.includes("miocardio") },
  { key: "AVC", test: (m) => m.includes("avc") || m.includes("derrame") || m.includes("sequela neurologica") },
];

/**
 * Detects disease from one or more messages (e.g. first 5 messages).
 * Returns the disease key or null.
 */
export function detectDisease(messages: (string | null | undefined)[]): string | null {
  const combined = norm(messages.filter(Boolean).join(" "));
  for (const rule of DISEASE_RULES) {
    if (rule.test(combined)) return rule.key;
  }
  return null;
}
