// Valida o payload REAL do Kiro contra o zod REAL do endpoint.
// O schema é fatiado de src/routes/api/public/agent/sync.ts (não é cópia), para
// o teste falhar se alguém apertar a validação sem pensar no Kiro.
import { normalize, kiroToolCalls } from "./load-normalize.mjs";
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const file = new URL("../../../../src/routes/api/public/agent/sync.ts", import.meta.url);
const src = readFileSync(file, "utf8");
const start = src.indexOf("const bodySchema");
const end = src.indexOf("const cors");
if (start < 0 || end < 0) throw new Error("bodySchema não localizado em sync.ts");
const slice = `import { z } from "zod";\n` + src.slice(start, end) + "\nexport { bodySchema };\n";
// Arquivo de verdade, e não data: URL: o schema importa "zod" e um módulo
// data: não resolve especificador de pacote.
const tmp = new URL("./.body-schema.gen.mjs", import.meta.url);
writeFileSync(tmp, slice);
const { bodySchema } = await import(tmp.href);

const root = join(process.env.USERPROFILE ?? process.env.HOME, ".kiro", "sessions");
const messages = [];
for (const ws of readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory())) {
  for (const s of readdirSync(join(root, ws.name), { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const f = join(root, ws.name, s.name, "messages.jsonl");
    if (!existsSync(f)) continue;
    let seq = 0;
    const all = readFileSync(f, "utf8").split("\n").filter((l) => l.trim());
    const ctx = { toolCalls: kiroToolCalls(all) };
    for (const line of all) {
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }
      const n = normalize(obj, ctx);
      if (n) messages.push({ ...n, seq: seq++ });
    }
  }
}

const session = {
  external_id: "kiro:sess_teste",
  source: "kiro",
  title: "sessão do Kiro",
  cwd: "c:/dev/x",
  status: "active",
  ide: "Kiro",
  pid: null,
  started_at: new Date().toISOString(),
  last_activity_at: new Date().toISOString(),
  ended_at: null,
  detection_source: "kiro:session-file",
  detection_confidence: "confirmed",
};

let ok = 0, bad = 0;
const erros = [];
for (let i = 0; i < messages.length; i += 200) {
  const batch = messages.slice(i, i + 200);
  const r = bodySchema.safeParse({ token: "x".repeat(20), session, messages: batch });
  if (r.success) ok += batch.length;
  else { bad += batch.length; if (erros.length < 3) erros.push(r.error.issues.slice(0, 3)); }
}

// A prova de que `meta` sobreviveu ao parse: o zod não pode ter comido o ask.
const parsed = bodySchema.parse({ token: "x".repeat(20), session, messages: messages.slice(0, 200) });
const asks = parsed.messages.filter((m) => m.meta?.ask).length;
const answers = parsed.messages.filter((m) => m.meta?.answers_tool_use_id).length;
const reasoning = parsed.messages.filter((m) => m.meta?.kind === "reasoning").length;
const idsLongos = messages.filter((m) => (m.external_id ?? "").length > 200).length;

console.log(`mensagens do Kiro: ${messages.length}`);
console.log(`  aceitas pelo zod do endpoint: ${ok}   rejeitadas: ${bad}`);
console.log(`  external_id acima do limite de 200: ${idsLongos}`);
console.log(`  no 1º lote, meta preservada -> ask: ${asks} · resposta: ${answers} · raciocínio: ${reasoning}`);
for (const e of erros) console.log("  erro:", JSON.stringify(e));
console.log(bad === 0 ? "\nOK — o endpoint aceita a transcrição do Kiro" : "\nFALHOU");
