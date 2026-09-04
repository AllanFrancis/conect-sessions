import { parseChoices } from "../../../../src/lib/parse-choices";

const cases: [string, string, boolean][] = [
  ["2 itens ponto", "Qual caminho?\n\n1. Refatorar agora\n2. Deixar como está", true],
  ["3 itens parentese", "O que fazer?\n1) Sim\n2) Nao\n3) Talvez", true],
  ["fecha com linha em branco", "Qual?\n1. a\n2. b\n\n", true],
  ["sem interrogacao", "Passos:\n1. um\n2. dois", false],
  ["so 1 item", "E ai?\n1. so um", false],
  ["7 itens", "E ai?\n" + Array.from({ length: 7 }, (_, i) => `${i + 1}. op${i + 1}`).join("\n"), false],
  ["lista no meio do texto", "E ai?\n1. um\n2. dois\n\nMas continuo falando aqui.", false],
  ["item longo demais", "E ai?\n1. " + "x".repeat(130) + "\n2. curto", false],
  ["numeracao quebrada", "E ai?\n1. um\n3. tres", false],
  ["nao comeca no 1", "E ai?\n2. dois\n3. tres", false],
  ["prosa pura", "Fiz o deploy e deu certo.", false],
];

let fail = 0;
for (const [name, input, shouldMatch] of cases) {
  const got = parseChoices(input);
  const ok = shouldMatch ? got !== null : got === null;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(26)} -> ${JSON.stringify(got)}`);
}
console.log(fail === 0 ? "\nTODOS OS CASOS PASSARAM" : `\n${fail} CASO(S) FALHARAM`);
