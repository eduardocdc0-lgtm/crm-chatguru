/**
 * Normaliza string para comparação:
 * - lowercase
 * - remove acentos (NFD + strip combining marks)
 * - colapsa múltiplos espaços
 */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove diacríticos
    .replace(/\s+/g, " ")
    .trim();
}

const RULES: Array<{ campaign: string; test: (msg: string) => boolean }> = [
  // ── LAUDO SUS PE ──────────────────────────────────────────────────────
  // "laudo do SUS aqui em PE" / "laudo sus pernambuco" / "laudo sus pe"
  {
    campaign: "LAUDO_SUS_PE",
    test: (msg) =>
      msg.includes("laudo") &&
      msg.includes("sus") &&
      (msg.includes(" pe") ||
        msg.includes("em pe") ||
        msg.includes("aqui pe") ||
        msg.includes("pernambuco")),
  },

  // ── PINO / PLACA / PARAFUSO ───────────────────────────────────────────
  // Antes de aux-acidente (mais específico)
  {
    campaign: "PINO_PLACA_PARAFUSO",
    test: (msg) =>
      msg.includes("pino") ||
      msg.includes("placa") ||
      msg.includes("parafuso"),
  },

  // ── AUXÍLIO ACIDENTE ──────────────────────────────────────────────────
  {
    campaign: "AUX_ACIDENTE",
    test: (msg) =>
      msg.includes("auxilio acidente") ||
      msg.includes("auxilio-acidente") ||
      (msg.includes("auxilio") && msg.includes("acidente")),
  },

  // ── FIBROMIALGIA ──────────────────────────────────────────────────────
  // Antes de aux-doença
  {
    campaign: "FIBROMIALGIA",
    test: (msg) => msg.includes("fibromialgia"),
  },

  // ── AUXÍLIO DOENÇA ────────────────────────────────────────────────────
  {
    campaign: "AUX_DOENCA",
    test: (msg) =>
      msg.includes("auxilio doenca") ||
      msg.includes("auxilio-doenca") ||
      (msg.includes("auxilio") && msg.includes("doenca")),
  },

  // ── BPC / LOAS ────────────────────────────────────────────────────────
  {
    campaign: "BPC",
    test: (msg) => msg.includes("bpc") || msg.includes("loas"),
  },

  // ── PERÍCIA NEGADA ────────────────────────────────────────────────────
  {
    campaign: "PERICIA_NEGADA",
    test: (msg) =>
      msg.includes("passei pela pericia") ||
      msg.includes("negaram meu beneficio") ||
      msg.includes("negaram o beneficio") ||
      msg.includes("pericia negada") ||
      msg.includes("pericia foi negada") ||
      msg.includes("beneficio negado") ||
      msg.includes("negaram") ||
      msg.includes("pericia"),
  },

  // ── LAUDO SUS GERAL ───────────────────────────────────────────────────
  {
    campaign: "LAUDO_SUS_GERAL",
    test: (msg) =>
      (msg.includes("tenho interesse") && msg.includes("informac")) ||
      (msg.includes("tenho interesse") && msg.includes("laudo")) ||
      (msg.includes("mais informacoes") && msg.includes("laudo")) ||
      (msg.includes("mais informacoes") && msg.includes("sus")) ||
      msg.includes("laudo sus"),
  },
];

export function identifyCampaign(firstMessage: string | null | undefined): string {
  if (!firstMessage) return "INDEFINIDA";
  const msg = norm(firstMessage);
  for (const rule of RULES) {
    if (rule.test(msg)) return rule.campaign;
  }
  return "INDEFINIDA";
}
