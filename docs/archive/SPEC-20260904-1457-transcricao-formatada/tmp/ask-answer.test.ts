import { chosenLabels } from "@/lib/ask-answer";

const cases: [string, string, string[], string[]][] = [
  ["single simples", "Refatorar", ["Refatorar", "Patch"], ["Refatorar"]],
  ["single com vírgula no rótulo (caso real)", "Ok, usar esses valores",
    ["Ok, usar esses valores", "Ok, mas policy=strict", "Ajustar algum campo"], ["Ok, usar esses valores"]],
  ["multi simples", "A, B", ["A", "B", "C"], ["A", "B"]],
  ["multi com rótulo que tem vírgula", "Ok, usar esses valores, Ajustar algum campo",
    ["Ok, usar esses valores", "Ajustar algum campo"], ["Ok, usar esses valores", "Ajustar algum campo"]],
  ["não casa parcial dentro de outro rótulo", "Refatorar tudo", ["Refatorar", "Refatorar tudo"], ["Refatorar tudo"]],
  ["resposta desconhecida não marca nada", "Outra coisa", ["A", "B"], []],
  ["rótulo vazio ignorado", "A", ["", "A"], ["A"]],
];

let fail = 0;
for (const [name, answer, labels, expected] of cases) {
  const got = chosenLabels(answer, labels);
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(42)} -> ${JSON.stringify(got)}`);
}
console.log(fail === 0 ? "\nTODOS OS CASOS PASSARAM" : `\n${fail} CASO(S) FALHARAM`);
