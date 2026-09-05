// Duas metades do mesmo critério:
//
//   A) ENTREGA — resposta para sessão que o monitor NÃO enxerga (gravada só pela
//      transcrição) tem que chegar mesmo assim. Antes ficava `pending` para
//      sempre: foi o que reprovou o primeiro passe de 11 min, 6 de 11 perdidas.
//   B) ISOLAMENTO — a correção drena as respostas de todas as sessões do agente,
//      então é obrigatório provar que ela NÃO drena as de outro agente. O mesmo
//      usuário tem várias máquinas; resposta escrita para a sessão de uma não
//      pode sair no terminal da outra.
import { readFileSync, existsSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:8082";
const aqui = dirname(fileURLToPath(import.meta.url));
const AGENTE = join(aqui, "../../../..", "public/agent/remote-agent.mjs");
const ARQ = join(aqui, "respostas-orfa.txt");

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

async function criaAgente(nome) {
  const token = "lrc_orfa" + randomBytes(20).toString("hex");
  const { data } = await db
    .from("agents")
    .insert({
      user_id: dono.user_id,
      name: nome,
      token_hash: createHash("sha256").update(token).digest("hex"),
      token_prefix: token.slice(0, 12),
    })
    .select("id, user_id")
    .single();
  return { ...data, token };
}

// A: o agente que vai rodar. B: o vizinho, que nunca roda — as respostas dele
// tem que continuar intocadas.
const A = await criaAgente("orfa A (temporario)");
const B = await criaAgente("orfa B (temporario)");

// O vizinho precisa de uma sessao com resposta pendente, criada a mao.
const { data: sessaoB } = await db
  .from("sessions")
  .insert({
    user_id: B.user_id,
    agent_id: B.id,
    external_id: "diag:vizinho",
    source: "kiro",
    title: "sessao do vizinho",
    status: "active",
  })
  .select("id")
  .single();
await db.from("replies").insert({
  session_id: sessaoB.id,
  user_id: B.user_id,
  content: "DIAG VIZINHO nao pode vazar",
});

if (existsSync(ARQ)) rmSync(ARQ);
const proc = spawn(process.execPath, [AGENTE], {
  env: { ...process.env, LRC_URL: BASE, LRC_TOKEN: A.token, LRC_INTERVAL: "2000", LRC_REPLY_FILE: ARQ },
  stdio: "ignore",
});

// Deixa o agente A registrar as sessoes dele.
await new Promise((r) => setTimeout(r, 45_000));

const { data: sessoesA } = await db
  .from("sessions")
  .select("id, title, detection_source")
  .eq("agent_id", A.id);
const orfa = sessoesA.find((s) => s.detection_source === "transcript-only");
const monitorada = sessoesA.find((s) => s.detection_source !== "transcript-only");

if (orfa) {
  await db.from("replies").insert({ session_id: orfa.id, user_id: A.user_id, content: "DIAG ORFA" });
}
if (monitorada) {
  await db.from("replies").insert({ session_id: monitorada.id, user_id: A.user_id, content: "DIAG MONITORADA" });
}

await new Promise((r) => setTimeout(r, 25_000));
proc.kill();

const entregue = existsSync(ARQ) ? readFileSync(ARQ, "utf8") : "";
const { data: doVizinho } = await db.from("replies").select("status").eq("session_id", sessaoB.id);

for (const ag of [A, B]) {
  await db.from("sessions").delete().eq("agent_id", ag.id);
  await db.from("agents").delete().eq("id", ag.id);
}

const orfaOk = entregue.includes("DIAG ORFA");
const monitoradaOk = entregue.includes("DIAG MONITORADA");
const vizinhoIntacto = !entregue.includes("VIZINHO") && doVizinho?.[0]?.status === "pending";

console.log(`sessoes do agente A: ${sessoesA.length} (orfas: ${sessoesA.filter((s) => s.detection_source === "transcript-only").length})`);
console.log(`A) resposta em sessao orfa entregue:        ${orfaOk ? "PASS" : "FAIL"}`);
console.log(`   resposta em sessao monitorada entregue:  ${monitoradaOk ? "PASS" : "FAIL"}`);
console.log(`B) resposta do agente vizinho NAO vazou:    ${vizinhoIntacto ? "PASS" : "FAIL"}`);
console.log(`   (status da resposta do vizinho: ${doVizinho?.[0]?.status})`);
console.log(orfaOk && monitoradaOk && vizinhoIntacto ? "\nOK" : "\nFALHOU");
