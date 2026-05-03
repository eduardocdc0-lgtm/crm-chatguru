// Nova regra de qualificação (a partir de 02/05/2026):
// O bot do GPT Maker envia "já tem advogado cuidando do caso" SOMENTE após
// validar INSS + afastamento + laudo + frase "ao que tudo indica tem caminho".
// Quando essa frase aparece numa mensagem, o lead já passou por toda a qualificação.

const BOT_QUALIFYING_PHRASE = "já tem advogado cuidando do caso";

export function isBotQualifyingMessage(msg: string | null | undefined): boolean {
  if (!msg || msg.trim().length === 0) return false;
  return msg.toLowerCase().includes(BOT_QUALIFYING_PHRASE);
}
