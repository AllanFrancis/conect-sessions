// Roda o normalize() REAL sobre TODAS as transcrições do Kiro desta máquina.
// Prova (ou refuta) que a mensagem do Kiro chega ao painel.
import { normalize, kiroToolCalls } from "./load-normalize.mjs";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(process.env.USERPROFILE ?? process.env.HOME, ".kiro", "sessions");
const files = [];
for (const ws of readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory())) {
  for (const s of readdirSync(join(root, ws.name), { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const f = join(root, ws.name, s.name, "messages.jsonl");
    if (existsSync(f)) files.push(f);
  }
}

let lines = 0, nulls = 0;
const byType = new Map();   // payload.type -> { total, kept }
const kept = [];

for (const f of files) {
  // Mesmo contexto que o readNew monta: o tool_result não carrega o nome da
  // ferramenta, quem sabe é o tool_call que veio antes no arquivo.
  const all = readFileSync(f, "utf8").split("\n").filter((l) => l.trim());
  const ctx = { toolCalls: kiroToolCalls(all) };
  for (const line of all) {
    lines++;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    const t = obj?.payload?.type ?? "(sem payload.type)";
    const acc = byType.get(t) ?? { total: 0, kept: 0 };
    acc.total++;
    const n = normalize(obj, ctx);
    if (n) { acc.kept++; if (kept.length < 6) kept.push({ t, n }); } else nulls++;
    byType.set(t, acc);
  }
}

console.log(`arquivos: ${files.length}  linhas: ${lines}  descartadas (null): ${nulls}`);
console.log(`aproveitadas: ${lines - nulls}`);
console.log("\npayload.type            total   virou mensagem");
for (const [t, a] of [...byType].sort((x, y) => y[1].total - x[1].total)) {
  console.log(`  ${t.padEnd(22)} ${String(a.total).padStart(5)}   ${a.kept}`);
}
console.log("\n--- amostras aproveitadas ---");
for (const { t, n } of kept) {
  console.log(t, "|", JSON.stringify({ role: n.role, content: n.content.slice(0, 70), meta: n.meta }).slice(0, 400));
}
