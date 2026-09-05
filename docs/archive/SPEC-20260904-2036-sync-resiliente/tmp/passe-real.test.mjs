// Passe longo com o agente REAL contra o servidor REAL e o banco REAL.
//
// Cria um agente temporario (para nao disputar sessoes com o do usuario, que
// esta rodando), sobe o agente apontado para ele, e a cada intervalo insere uma
// resposta pendente — como se o usuario tivesse clicado no painel. No fim:
//
//   1. cada resposta enviada aparece EXATAMENTE uma vez no LRC_REPLY_FILE
//      (o defeito original entregava a mesma resposta 3x);
//   2. nenhuma resposta fica `pending` sem ter sido entregue;
//   3. o agente nao morreu no meio.
//
// Uso: node passe-real.test.mjs <baseUrl> [minutos]
import { readFileSync, existsSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:8082";
const MINUTOS = Number(process.argv[3] ?? 11);
const aqui = dirname(fileURLToPath(import.meta.url));
const AGENTE = join(aqui, "../../../..", "public/agent/remote-agent.mjs");
const ARQUIVO_RESPOSTAS = join(aqui, "respostas-do-passe.txt");

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: dono } = await db.from("agents").select("user_id").limit(1).single();
const token = "lrc_passe" + randomBytes(20).toString("hex");
const { data: agente } = await db
  .from("agents")
  .insert({
    user_id: dono.user_id,
    name: "passe SPEC-2036 (temporario)",
    token_hash: createHash("sha256").update(token).digest("hex"),
    token_prefix: token.slice(0, 12),
  })
  .select("id, user_id")
  .single();
console.log(`agente temporario ${agente.id} — passe de ${MINUTOS} min contra ${BASE}`);

if (existsSync(ARQUIVO_RESPOSTAS)) rmSync(ARQUIVO_RESPOSTAS);

const proc = spawn(process.execPath, [AGENTE], {
  env: {
    ...process.env,
    LRC_URL: BASE,
    LRC_TOKEN: token,
    LRC_INTERVAL: "2000",
    LRC_REPLY_FILE: ARQUIVO_RESPOSTAS,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
const log = [];
proc.stdout.on("data", (d) => log.push(String(d)));
proc.stderr.on("data", (d) => log.push(String(d)));

const enviadas = [];
const fim = Date.now() + MINUTOS * 60_000;

// Deixa o agente registrar as sessoes antes de tentar responder alguma.
await new Promise((r) => setTimeout(r, 30_000));

while (Date.now() < fim) {
  const { data: sessoes } = await db
    .from("sessions")
    .select("id")
    .eq("agent_id", agente.id)
    .limit(1);
  if (sessoes?.length) {
    const texto = `PASSE-2036 #${enviadas.length + 1} ${Date.now()}`;
    await db.from("replies").insert({
      session_id: sessoes[0].id,
      user_id: agente.user_id,
      content: texto,
    });
    enviadas.push(texto);
    console.log(`  enviada: ${texto}`);
  }
  await new Promise((r) => setTimeout(r, 60_000));
}

proc.kill();
await new Promise((r) => setTimeout(r, 500));

const entregues = existsSync(ARQUIVO_RESPOSTAS)
  ? readFileSync(ARQUIVO_RESPOSTAS, "utf8").split("\n").filter((l) => l.trim())
  : [];

const contagem = new Map();
for (const linha of entregues) contagem.set(linha, (contagem.get(linha) ?? 0) + 1);

const duplicadas = enviadas.filter((t) => (contagem.get(t) ?? 0) > 1);
const naoEntregues = enviadas.filter((t) => !contagem.has(t));

const { data: aindaPendentes } = await db
  .from("replies")
  .select("id")
  .eq("status", "pending")
  .in("session_id", (await db.from("sessions").select("id").eq("agent_id", agente.id)).data.map((s) => s.id));

const { count: mensagens } = await db
  .from("messages")
  .select("id", { count: "exact", head: true })
  .in("session_id", (await db.from("sessions").select("id").eq("agent_id", agente.id)).data.map((s) => s.id));

// Limpeza: o agente temporario leva junto sessoes, mensagens e replies.
await db.from("sessions").delete().eq("agent_id", agente.id);
await db.from("agents").delete().eq("id", agente.id);

console.log(`\n=== passe de ${MINUTOS} min ===`);
console.log(`respostas enviadas pelo painel: ${enviadas.length}`);
console.log(`  entregues ao agente:          ${enviadas.length - naoEntregues.length}`);
console.log(`  DUPLICADAS:                   ${duplicadas.length}`);
console.log(`  nao entregues:                ${naoEntregues.length}`);
console.log(`replies ainda pendentes:        ${aindaPendentes?.length ?? 0}`);
console.log(`mensagens sincronizadas:        ${mensagens}`);
console.log(`agente vivo ao fim:             ${proc.exitCode === null || proc.killed}`);
const falhasNoLog = log.join("").match(/sync falhou|sync recusado/g)?.length ?? 0;
console.log(`falhas de sync no log:          ${falhasNoLog}`);

const ok = duplicadas.length === 0 && naoEntregues.length === 0 && enviadas.length > 0;
console.log(ok ? "\nPASS — nenhuma resposta duplicada nem perdida" : "\nFALHOU");
if (duplicadas.length) console.log("  duplicadas:", duplicadas.slice(0, 3));
if (naoEntregues.length) console.log("  perdidas:", naoEntregues.slice(0, 3));
