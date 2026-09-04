import { normalize } from "./load-normalize.mjs";
import { chosenLabels } from "../../../../src/lib/ask-answer.ts";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Reproduz EXATAMENTE a derivação da UI (answeredBy por tool_use_id) sobre
// transcrições reais, e confere se o rótulo resolvido é mesmo uma das opções.
const dir = join(process.env.USERPROFILE ?? process.env.HOME, ".claude/projects/c--dev-meus-projetos-conect-sessions");
const msgs = [];
for (const f of readdirSync(dir).filter((f) => f.endsWith(".jsonl"))) {
  for (const line of readFileSync(join(dir, f), "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const n = normalize(JSON.parse(line));
      if (n) msgs.push(n);
    } catch {}
  }
}

const answeredBy = new Map();
for (const m of msgs) {
  if (m.meta?.answers_tool_use_id) answeredBy.set(m.meta.answers_tool_use_id, m.meta.answers ?? {});
}

let perguntas = 0, trancadas = 0, comRotulo = 0, rotuloValido = 0, orfas = 0;
const problemas = [];

for (const m of msgs) {
  if (!m.meta?.ask?.length) continue;
  const answered = Boolean(m.meta.tool_use_id && answeredBy.has(m.meta.tool_use_id));
  const answers = m.meta.tool_use_id ? answeredBy.get(m.meta.tool_use_id) : undefined;
  if (!answered) { orfas++; continue; }
  for (const q of m.meta.ask) {
    perguntas++;
    trancadas++; // `locked` depende só de `answered` — vale para toda pergunta do bloco
    const label = answers?.[q.question];
    if (!label) { problemas.push(`sem rótulo: ${q.question.slice(0, 55)}`); continue; }
    comRotulo++;
    const labels = (q.options ?? []).map((o) => o.label);
    const marcadas = chosenLabels(label, labels);
    if (marcadas.length && marcadas.every((p) => labels.includes(p))) rotuloValido++;
    else problemas.push(`rótulo fora das opções: ${JSON.stringify(label)} não está em ${JSON.stringify(labels)}`);
  }
}

console.log(`perguntas em blocos já respondidos: ${perguntas}`);
console.log(`  trancadas (opções desabilitadas): ${trancadas}`);
console.log(`  com rótulo resolvido:             ${comRotulo}`);
console.log(`  rótulo casa com uma das opções:   ${rotuloValido}`);
console.log(`blocos de pergunta ainda sem resposta: ${orfas}`);
if (problemas.length) { console.log("\nPROBLEMAS:"); problemas.forEach((p) => console.log("  -", p)); }
else console.log("\nOK — toda pergunta respondida tranca E marca a opção correta");
