export interface MessageTemplate {
  id: string;
  label: string;
  emoji: string;
  description: string;
  text: (vars: { nome: string; campanha?: string | null }) => string;
}

function primeiroNome(nome: string): string {
  if (!nome || !nome.trim()) return "tudo bem";
  return nome.trim().split(/\s+/)[0];
}

export const TEMPLATES: MessageTemplate[] = [
  {
    id: "A",
    label: "Cobrança suave",
    emoji: "💬",
    description: "Lead que sumiu — chamar de volta com leveza",
    text: ({ nome, campanha }) =>
      `Oi ${primeiroNome(nome)}, tudo bem? Vi que ficou pendente nossa conversa sobre ${campanha || "seu caso"}. Ainda posso te ajudar? 🙏`,
  },
  {
    id: "B",
    label: "Reativação de antigo",
    emoji: "🔄",
    description: "Lead +7 dias parado — pegar de volta",
    text: ({ nome, campanha }) =>
      `Oi ${primeiroNome(nome)}, aqui é do escritório do Dr. Eduardo. Tava te chamando pra saber se ainda tem interesse no ${campanha || "atendimento"}. Se preferir, posso ligar 🙏`,
  },
  {
    id: "C",
    label: "Aviso de implantação",
    emoji: "✅",
    description: "Cliente em fase 'Implantado a Receber' — boa notícia",
    text: ({ nome }) =>
      `Boa notícia, ${primeiroNome(nome)}! Seu benefício foi implantado. Estamos acompanhando a data de pagamento e te avisaremos assim que sair 🙏`,
  },
  {
    id: "D",
    label: "Cobrança de mensalidade",
    emoji: "💰",
    description: "Cliente parcelado sem lançamento do mês",
    text: ({ nome }) =>
      `Oi ${primeiroNome(nome)}, tudo bem? Notamos que a parcela do mês ainda não consta. Pode verificar pra gente? 🙏`,
  },
];

export function getTemplate(id: string): MessageTemplate | undefined {
  return TEMPLATES.find(t => t.id === id);
}
