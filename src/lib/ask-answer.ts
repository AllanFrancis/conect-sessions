/**
 * Descobre QUAIS opções o usuário escolheu, a partir da resposta que o CLI
 * gravou como texto único.
 *
 * Em multiSelect o Claude Code junta as escolhas por `", "`. O problema é que
 * um rótulo também pode conter `", "` — visto em transcrição real:
 * `"Ok, usar esses valores"`. Quebrar a resposta cegamente por `", "` estilhaça
 * esse rótulo em pedaços que não casam com opção nenhuma, e a escolha deixa de
 * aparecer marcada.
 *
 * Então o teste é por segmento: o rótulo tem que ocorrer inteiro, encostado no
 * começo, no fim, ou num separador `", "` de verdade. Isso aceita rótulo com
 * vírgula e continua rejeitando casamento parcial no meio de outro rótulo.
 */
export function chosenLabels(answer: string, labels: string[]): string[] {
  return labels.filter((label) => isSegment(answer, label));
}

function isSegment(answer: string, label: string): boolean {
  if (!label) return false;
  if (answer === label) return true;
  const SEP = ", ";
  for (let i = answer.indexOf(label); i !== -1; i = answer.indexOf(label, i + 1)) {
    const end = i + label.length;
    const startOk = i === 0 || answer.slice(i - SEP.length, i) === SEP;
    const endOk = end === answer.length || answer.slice(end, end + SEP.length) === SEP;
    if (startOk && endOk) return true;
  }
  return false;
}

/**
 * Os rótulos escolhidos, aceitando as duas provas que os agentes deixam.
 *
 * O Claude Code devolve o RÓTULO (e junta múltiplos por `", "`), então o
 * casamento é por segmento — é o `chosenLabels` acima. O Kiro devolve o rótulo
 * na pergunta ao usuário, mas o `optionId` ("accept", "always-accept") na
 * aprovação de ferramenta; nesse caso só o id casa. Aceitar os dois é o que faz
 * a opção certa aparecer marcada nas duas origens.
 */
export function chosenFor(answer: string, options: { label: string; id?: string }[]): string[] {
  return [
    ...new Set([
      ...chosenLabels(
        answer,
        options.map((o) => o.label),
      ),
      ...options.filter((o) => o.id !== undefined && o.id === answer).map((o) => o.label),
    ]),
  ];
}
