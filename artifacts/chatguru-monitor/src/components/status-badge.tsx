import React from "react";

interface StatusBadgeProps {
  status: string;
}

export const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string; color: string }> = {
  lead_novo:          { label: "Lead Novo",          bg: "#f1f5f9", text: "#475569", border: "#cbd5e1", color: "#64748b" },
  lead_qualificado:   { label: "Lead Qualificado",   bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe", color: "#3b82f6" },
  em_atendimento:     { label: "Em Atendimento",     bg: "#ecfeff", text: "#0e7490", border: "#a5f3fc", color: "#06b6d4" },
  follow_up:          { label: "Follow Up",          bg: "#fffbeb", text: "#92400e", border: "#fde68a", color: "#f59e0b" },
  contrato_assinado:  { label: "Contrato Assinado",  bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0", color: "#16a34a" },
  cliente_ativo:      { label: "Cliente Ativo",      bg: "#ecfdf5", text: "#065f46", border: "#a7f3d0", color: "#10b981" },
  cliente_procedente: { label: "Cliente Procedente", bg: "#f0fdfa", text: "#0f766e", border: "#99f6e4", color: "#14b8a6" },
  lead_descartado:    { label: "Lead Descartado",    bg: "#fef2f2", text: "#b91c1c", border: "#fecaca", color: "#f87171" },
  // Legado
  open:               { label: "Lead Novo",          bg: "#f1f5f9", text: "#475569", border: "#cbd5e1", color: "#64748b" },
  in_progress:        { label: "Em Atendimento",     bg: "#ecfeff", text: "#0e7490", border: "#a5f3fc", color: "#06b6d4" },
  waiting:            { label: "Lead Qualificado",   bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe", color: "#3b82f6" },
  resolved:           { label: "Contrato Assinado",  bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0", color: "#16a34a" },
  closed:             { label: "Lead Descartado",    bg: "#fef2f2", text: "#b91c1c", border: "#fecaca", color: "#f87171" },
  unknown:            { label: "Lead Novo",          bg: "#f8fafc", text: "#64748b", border: "#e2e8f0", color: "#94a3b8" },
};

const FALLBACK = { label: "Desconhecido", bg: "#f8fafc", text: "#64748b", border: "#e2e8f0", color: "#94a3b8" };

export function StatusBadge({ status }: StatusBadgeProps) {
  const c = STATUS_CONFIG[status] ?? FALLBACK;
  return (
    <span
      className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap"
      style={{ background: c.bg, color: c.text, borderColor: c.border }}
    >
      {c.label}
    </span>
  );
}
