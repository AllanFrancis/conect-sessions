// O contrato do `tool_result` do Kiro, medido em dado REAL:
// associação com a chamada, ordem preservada, e o corte de saída declarado.
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

let total = 0, comNome = 0, comTitulo = 0, comAlvo = 0, truncados = 0, falhas = 0, vazios = 0;
let foraDeOrdem = 0, resultadoAntesDaChamada = 0, semChamada = 0;
let asksCasados = 0;
const porFerramenta = new Map();
const amostras = [];

for (const f of files) {
  const all = readFileSync(f, "utf8").split("\n").filter((l) => l.trim());
  const ctx = { toolCalls: kiroToolCalls(all) };

  // Índice de onde cada tool_call aparece no arquivo, para conferir a ordem.
  const linhaDaChamada = new Map();
  const idsDeAprovacao = new Set();
  all.forEach((line, i) => {
    let o;
    try { o = JSON.parse(line); } catch { return; }
    const p = o?.payload;
    if (p?.type === "tool_call" && !linhaDaChamada.has(p.toolCallId)) linhaDaChamada.set(p.toolCallId, i);
    if (p?.type === "pending_interaction" && typeof p.toolCallId === "string") idsDeAprovacao.add(p.toolCallId);
  });

  let seqAnterior = -1;
  all.forEach((line, i) => {
    let o;
    try { o = JSON.parse(line); } catch { return; }
    const n = normalize(o, ctx);
    if (!n) return;

    // A ordem do arquivo é a ordem das mensagens: `seq` é o índice da linha.
    if (i <= seqAnterior) foraDeOrdem++;
    seqAnterior = i;

    const t = n.meta?.tool;
    if (!t) return;
    total++;
    if (t.name) comNome++;
    if (t.title) comTitulo++;
    if (t.target) comAlvo++;
    if (t.truncated) truncados++;
    if (t.ok === false) falhas++;
    if (!n.content) vazios++;
    if (!linhaDaChamada.has(t.call_id)) semChamada++;
    else if (linhaDaChamada.get(t.call_id) > i) resultadoAntesDaChamada++;
    // O id da aprovação é o MESMO da chamada: é isso que amarra os dois blocos.
    if (idsDeAprovacao.has(t.call_id)) asksCasados++;

    porFerramenta.set(t.name ?? "(sem nome)", (porFerramenta.get(t.name ?? "(sem nome)") ?? 0) + 1);
    if (amostras.length < 4 && t.target && n.content) amostras.push({ t, chars: n.content.length });
  });
}

const pct = (n) => `${n}/${total} (${((n / total) * 100).toFixed(1)}%)`;
console.log(`tool_result que viraram mensagem: ${total}`);
console.log(`  com nome da ferramenta:        ${pct(comNome)}`);
console.log(`  com título legível:            ${pct(comTitulo)}`);
console.log(`  com alvo (path/comando/query): ${pct(comAlvo)}`);
console.log(`  sem tool_call correspondente:  ${semChamada}`);
console.log(`  resultado ANTES da chamada:    ${resultadoAntesDaChamada}`);
console.log(`  mensagens fora da ordem:       ${foraDeOrdem}`);
console.log(`  saída truncada:                ${truncados}`);
console.log(`  sem saída ({} vira vazio):     ${vazios}`);
console.log(`  falhas (success:false):        ${falhas}`);
console.log(`  chamadas que passaram por aprovação: ${asksCasados}`);
console.log(`  ferramentas distintas:         ${porFerramenta.size}`);
for (const a of amostras) console.log(`  ex: ${a.t.title} · ${a.t.target.slice(0, 60)} · ${a.chars} chars`);

const ok = semChamada === 0 && resultadoAntesDaChamada === 0 && foraDeOrdem === 0 && comNome === total;
console.log(ok ? "\nOK — todo resultado tem sua chamada, na ordem certa" : "\nFALHOU");
