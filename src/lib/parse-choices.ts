/**
 * Extrai opções de uma pergunta escrita em PROSA — o caso em que o assistente
 * não usou `AskUserQuestion` e só numerou alternativas no fim da mensagem.
 *
 * É heurística, e heurística erra: por isso os filtros são estreitos e o
 * chamador usa o resultado para PREENCHER o campo de resposta, nunca para
 * enviar sozinho. Pergunta estruturada não passa por aqui — ela chega pelo
 * `meta.ask` e tem prioridade.
 */

const ITEM = /^\s{0,3}(\d{1,2})[).]\s+(.+?)\s*$/;
const MAX_ITEM_LEN = 120;
const MIN_ITEMS = 2;
const MAX_ITEMS = 6;

export function parseChoices(content: string): string[] | null {
  // Sem interrogação não é pergunta: lista numerada é a forma normal de
  // enumerar passos, e virar botão ali seria só ruído.
  if (!content.includes("?")) return null;

  const lines = content.split("\n");
  const items: string[] = [];
  let expected = 0;

  // Varre de trás para frente: a lista precisa ENCERRAR a mensagem, senão é
  // enumeração no meio do texto seguida de outro assunto.
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] ?? "";
    if (!line.trim()) {
      if (items.length) break;
      continue;
    }
    const match = ITEM.exec(line);
    if (!match) break;
    const num = Number(match[1]);
    const text = match[2] ?? "";
    if (!text || text.length > MAX_ITEM_LEN) return null;
    // Lendo ao contrário, a numeração tem que decrescer de 1 em 1 e fechar no 1.
    if (expected && num !== expected) return null;
    items.unshift(text);
    expected = num - 1;
    if (items.length > MAX_ITEMS) return null;
  }

  if (items.length < MIN_ITEMS || expected !== 0) return null;
  return items;
}
