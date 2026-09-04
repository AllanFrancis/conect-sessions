// Cruza pergunta com escolha em dado REAL do Kiro, usando as DUAS funções de
// produção: o normalize() do agente e o chosenFor() da UI. Se a opção não ficar
// marcada no painel, falha aqui.
import { normalize, kiroToolCalls } from "./load-normalize.mjs";
import { chosenFor } from "@/lib/ask-answer";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

type Option = { label: string; description?: string; id?: string };
type Ask = { question: string; header?: string; options?: Option[] };

const root = join(process.env["USERPROFILE"] ?? process.env["HOME"] ?? "", ".kiro", "sessions");
const asks = new Map<string, Ask>();
const resolved: { id: string; answer: string | null; outcome: string | null }[] = [];

for (const ws of readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory())) {
  const wsDir = join(root, ws.name);
  for (const s of readdirSync(wsDir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const f = join(wsDir, s.name, "messages.jsonl");
    if (!existsSync(f)) continue;
    const all = readFileSync(f, "utf8").split("\n").filter((l) => l.trim());
    const ctx = { toolCalls: kiroToolCalls(all) };
    for (const line of all) {
      let obj: unknown;
      try { obj = JSON.parse(line); } catch { continue; }
      const n = normalize(obj, ctx);
      const meta = n?.meta;
      if (meta?.ask) asks.set(meta.tool_use_id, meta.ask[0]);
      else if (meta?.answers_tool_use_id)
        resolved.push({ id: meta.answers_tool_use_id, answer: meta.answer, outcome: meta.outcome });
    }
  }
}

let marcadas = 0, canceladas = 0, semMarca = 0, orfas = 0;
const falhas: unknown[] = [];
for (const r of resolved) {
  const q = asks.get(r.id);
  if (!q) { orfas++; continue; }
  if (!r.answer) { canceladas++; continue; }
  const chosen = chosenFor(r.answer, q.options ?? []);
  if (chosen.length === 1) marcadas++;
  else { semMarca++; if (falhas.length < 5) falhas.push({ answer: r.answer, chosen, options: q.options }); }
}

const pendentes = [...asks.keys()].filter((id) => !resolved.some((r) => r.id === id));
console.log(`perguntas: ${asks.size}  resoluções: ${resolved.length}`);
console.log(`  opção marcada corretamente:      ${marcadas}`);
console.log(`  cancelada (tranca sem marcar):   ${canceladas}`);
console.log(`  tranca mas NÃO marca (defeito):  ${semMarca}`);
console.log(`  resolução sem pergunta:          ${orfas}`);
console.log(`  perguntas ainda pendentes:       ${pendentes.length}`);
for (const f of falhas) console.log("  falha:", JSON.stringify(f).slice(0, 300));

const headers: Record<string, number> = {};
for (const q of asks.values()) headers[q.header ?? "(sem)"] = (headers[q.header ?? "(sem)"] ?? 0) + 1;
console.log("headers:", headers);
console.log(semMarca === 0 && orfas === 0 ? "\nOK — toda escolha do Kiro marca a opção certa" : "\nFALHOU");
