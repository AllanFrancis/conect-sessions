import { normalize } from "./load-normalize.mjs";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Roda o normalize() sobre transcrições REAIS do Claude Code nesta máquina —
// não sobre fixture minha. É a prova de que o formato que eu assumi é o formato
// que o CLI de fato grava.
const dir = join(process.env.USERPROFILE ?? process.env.HOME, ".claude/projects/c--dev-meus-projetos-conect-sessions");
let asks = 0, answers = 0, texts = 0, nulls = 0, lines = 0;
const samples = [];

for (const f of readdirSync(dir).filter((f) => f.endsWith(".jsonl"))) {
  for (const line of readFileSync(join(dir, f), "utf8").split("\n")) {
    if (!line.trim()) continue;
    lines++;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    const n = normalize(obj);
    if (!n) { nulls++; continue; }
    if (n.meta?.ask) { asks++; if (samples.length < 2) samples.push(n); }
    else if (n.meta?.answers_tool_use_id) { answers++; if (samples.length < 4) samples.push(n); }
    else texts++;
  }
}

console.log(`linhas lidas: ${lines}`);
console.log(`  meta.ask (pergunta estruturada): ${asks}`);
console.log(`  meta.answers_tool_use_id (resposta): ${answers}`);
console.log(`  texto comum (sem meta): ${texts}`);
console.log(`  descartadas (null): ${nulls}`);
console.log("\n--- amostras ---");
for (const s of samples) {
  console.log(JSON.stringify({ role: s.role, content: s.content.slice(0, 60), meta: s.meta }).slice(0, 620));
}
