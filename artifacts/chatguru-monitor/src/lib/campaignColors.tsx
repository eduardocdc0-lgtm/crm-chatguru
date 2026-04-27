export interface CampaignMeta {
  label: string;
  color: string;       // hex principal
  bg: string;          // background badge light
  bgDark: string;      // background badge dark
  text: string;        // text badge light
  border: string;      // border badge
  emoji: string;
}

export const CAMPAIGN_MAP: Record<string, CampaignMeta> = {
  LAUDO_SUS_PE: {
    label: "Laudo SUS PE",
    color: "#16a34a",
    bg: "#dcfce7",
    bgDark: "#14532d",
    text: "#166534",
    border: "#86efac",
    emoji: "🟢",
  },
  LAUDO_SUS_GERAL: {
    label: "Laudo SUS Geral",
    color: "#22c55e",
    bg: "#f0fdf4",
    bgDark: "#14532d",
    text: "#15803d",
    border: "#bbf7d0",
    emoji: "🌿",
  },
  AUX_DOENCA: {
    label: "Auxílio Doença",
    color: "#7c3aed",
    bg: "#ede9fe",
    bgDark: "#4c1d95",
    text: "#5b21b6",
    border: "#c4b5fd",
    emoji: "🟣",
  },
  AUX_ACIDENTE: {
    label: "Auxílio Acidente",
    color: "#ea580c",
    bg: "#fff7ed",
    bgDark: "#7c2d12",
    text: "#c2410c",
    border: "#fdba74",
    emoji: "🟠",
  },
  PERICIA_NEGADA: {
    label: "Perícia Negada",
    color: "#dc2626",
    bg: "#fef2f2",
    bgDark: "#7f1d1d",
    text: "#b91c1c",
    border: "#fca5a5",
    emoji: "🔴",
  },
  BPC: {
    label: "BPC / LOAS",
    color: "#3b82f6",
    bg: "#eff6ff",
    bgDark: "#1e3a8a",
    text: "#1d4ed8",
    border: "#93c5fd",
    emoji: "🔵",
  },
  FIBROMIALGIA: {
    label: "Fibromialgia",
    color: "#ec4899",
    bg: "#fdf2f8",
    bgDark: "#831843",
    text: "#be185d",
    border: "#f9a8d4",
    emoji: "💗",
  },
  PINO_PLACA_PARAFUSO: {
    label: "Pino/Placa/Parafuso",
    color: "#eab308",
    bg: "#fefce8",
    bgDark: "#713f12",
    text: "#a16207",
    border: "#fde047",
    emoji: "🟡",
  },
  INDEFINIDA: {
    label: "Indefinida",
    color: "#64748b",
    bg: "#f1f5f9",
    bgDark: "#1e293b",
    text: "#475569",
    border: "#cbd5e1",
    emoji: "⚪",
  },
};

export function getCampaign(key?: string | null): CampaignMeta {
  if (!key) return CAMPAIGN_MAP.INDEFINIDA;
  return CAMPAIGN_MAP[key] ?? CAMPAIGN_MAP.INDEFINIDA;
}

export function CampaignBadge({ campaign, size = "sm" }: { campaign?: string | null; size?: "xs" | "sm" }) {
  const meta = getCampaign(campaign);
  const pad = size === "xs" ? "1px 6px" : "2px 8px";
  const fs = size === "xs" ? 10 : 11;
  return (
    `<span style="background:${meta.bg};color:${meta.text};border:1px solid ${meta.border};border-radius:20px;padding:${pad};font-size:${fs}px;font-weight:500;white-space:nowrap;">${meta.emoji} ${meta.label}</span>`
  );
}

// React component version — use this in JSX
import React from "react";

export function CampaignTag({ campaign, size = "sm" }: { campaign?: string | null; size?: "xs" | "sm" }) {
  const meta = getCampaign(campaign);
  const padding = size === "xs" ? "1px 6px" : "2px 9px";
  const fontSize = size === "xs" ? 10 : 11;
  return (
    <span style={{
      background: meta.bg,
      color: meta.text,
      border: `1px solid ${meta.border}`,
      borderRadius: 20,
      padding,
      fontSize,
      fontWeight: 500,
      whiteSpace: "nowrap" as const,
      display: "inline-flex",
      alignItems: "center",
      gap: 3,
    }}>
      {meta.emoji} {meta.label}
    </span>
  );
}
