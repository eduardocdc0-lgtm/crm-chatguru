export type QualResult = {
  hasLaudo: boolean;
  noAdvogado: boolean;
  intentResolve: boolean;
  isQualified: boolean;
};

// ── has_laudo: lead confirma que tem laudo/exame/atestado ──────────────────
const LAUDO_POS = [
  /\btenho\b.{0,30}\b(laudo|exame|relat[oó]rio m[eé]dico|atestado|diagn[oó]stico)\b/i,
  /\b(laudo|atestado|exame)\b.{0,15}\bsim\b/i,
  /\bsim\b.{0,15}\b(laudo|atestado|exame)\b/i,
  /\bj[aá] fiz\b.{0,25}\b(exame|laudo)\b/i,
  /\btenho (os |meus )?(laudos|exames|atestados)\b/i,
  /\bpossuo (laudo|exame|atestado|relat[oó]rio)\b/i,
  /\btenho o laudo\b/i,
  /\blaudo sim\b/i,
  /\btenho o exame\b/i,
];
const LAUDO_NEG = [
  /n[aã]o (tenho|possuo|tô com|to com|estou com)\b.{0,25}\b(laudo|exame|atestado)\b/i,
  /\bsem (laudo|exame|atestado)\b/i,
  /\bpreciso (de|do|obter|fazer|tirar)\b.{0,25}\b(laudo|exame|atestado)\b/i,
  /\bnão fiz\b.{0,20}\b(exame|laudo)\b/i,
  /\b(laudo|exame|atestado)\b.{0,25}\bn[aã]o (tenho|possuo|fiz)\b/i,
];

// ── no_advogado: lead confirma que NÃO tem advogado ───────────────────────
const ADV_POS = [
  /n[aã]o (tenho|possuo|tô com|to com|estou com)\b.{0,25}\badvogado\b/i,
  /\bsem advogado\b/i,
  /\bnenhum advogado\b/i,
  /ainda n[aã]o (tenho|tô com|to com|estou)\b.{0,20}\b(advogado|representante)?\b/i,
  /n[aã]o tenho (um |o )?representante (jur[ií]dico)?\b/i,
  /n[aã]o tô com advogado\b/i,
];
const ADV_NEG = [
  /\b(tenho|j[aá] tenho|tô com|to com|estou com)\b.{0,25}\badvogado\b/i,
  /\bj[aá] tenho (um |o )?(advogado|representante)\b/i,
  /\badvogado\b.{0,35}\b(me (representa|acompanha|atende|defende))\b/i,
  /\bj[aá] estou sendo representado\b/i,
];

// ── intent_resolve: lead demonstra intenção de avançar ────────────────────
const INTENT_POS = [
  /\bquero resolver\b/i,
  /\bquero entrar com\b/i,
  /\bquero saber mais\b/i,
  /\bvamos fechar\b/i,
  /\bcomo (fa[cç]o|posso) (pra |para )?(come[cç]ar|entrar|dar entrada|solicitar|pedir)\b/i,
  /\bcomo funciona\b/i,
  /\bpreciso (desse|do|deste) benef[ií]cio\b/i,
  /\bquanto tempo (demora|leva)\b/i,
  /\bquero dar entrada\b/i,
  /\bquero requerer\b/i,
  /\bquero (fazer|abrir|entrar com) (o |um )?(pedido|processo|recurso|requerimento)\b/i,
  /\bme interessa\b/i,
  /\bquero sim\b/i,
  /\bpode me ajudar\b/i,
  /\bquero (contratar|o servi[cç]o)\b/i,
  /\bquero (tentar|pedir|receber|solicitar)\b.{0,35}\b(aux[ií]lio|benef[ií]cio|inss|aposentadoria|seguro)\b/i,
  /\bvou (prosseguir|aceitar|tentar)\b/i,
  /\bquero (come[cç]ar|iniciar|prosseguir)\b/i,
  /\bcomo eu fa[cç]o\b/i,
  /\bquero tentar\b/i,
  /\bquero pedir\b/i,
];

// Padrão nome + fone (lead enviou dados para fechar)
const NAME_PHONE = /[A-ZÀ-ÜÃÕa-zà-üãõ]{3,}[\s]+[A-ZÀ-ÜÃÕa-zà-üãõ]{3,}[\s,]*[\d\s\-\(\)]{8,}/;

export function detectarQualificacao(msgs: (string | null | undefined)[]): QualResult {
  const texts = msgs.filter((m): m is string => !!m && m.trim().length > 2);
  if (texts.length === 0) {
    return { hasLaudo: false, noAdvogado: false, intentResolve: false, isQualified: false };
  }

  const combined = texts.join(" ");

  const hasLaudo =
    LAUDO_POS.some((p) => p.test(combined)) &&
    !LAUDO_NEG.some((p) => p.test(combined));

  const noAdvogado =
    ADV_POS.some((p) => p.test(combined)) &&
    !ADV_NEG.some((p) => p.test(combined));

  const intentResolve =
    INTENT_POS.some((p) => p.test(combined)) ||
    NAME_PHONE.test(combined);

  return {
    hasLaudo,
    noAdvogado,
    intentResolve,
    isQualified: hasLaudo && noAdvogado && intentResolve,
  };
}
