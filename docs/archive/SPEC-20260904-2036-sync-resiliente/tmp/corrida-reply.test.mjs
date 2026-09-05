// A corrida que o usuario viu: a MESMA resposta remota entregue varias vezes.
//
// Dispara N syncs simultaneos da mesma sessao — que e o que acontecia sozinho,
// porque o tick nao esperava o anterior — e conta quantos levaram o reply.
// O correto e 1. Contra o deploy antigo isto da 3.
//
// Uso: node corrida-reply.test.mjs <baseUrl> <token>
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

const BASE = process.argv[2] ?? "http://localhost:8080";
const TOKEN = process.argv[3];
const PARALELAS = 3;
if (!TOKEN) throw new Error("uso: node corrida-reply.test.mjs <baseUrl> <token>");

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

const hash = createHash("sha256").update(TOKEN).digest("hex");
const { data: agent } = await db.from("agents").select("id, user_id").eq("token_hash", hash).maybeSingle();
if (!agent) throw new Error("token nao encontrado neste banco");

const EXTERNAL_ID = "diag:corrida-2036";
const { data: sessao } = await db
  .from("sessions")
  .upsert(
    {
      user_id: agent.user_id,
      agent_id: agent.id,
      external_id: EXTERNAL_ID,
      source: "kiro",
      title: "harness de corrida",
      status: "active",
    },
    { onConflict: "agent_id,external_id" },
  )
  .select("id")
  .single();

// Limpa restos de execucoes anteriores para a contagem ser sobre UM reply.
await db.from("replies").delete().eq("session_id", sessao.id);
await db.from("replies").insert({
  session_id: sessao.id,
  user_id: agent.user_id,
  content: "DIAG corrida SPEC-2036",
});

const corpo = JSON.stringify({
  token: TOKEN,
  session: {
    external_id: EXTERNAL_ID,
    source: "kiro",
    title: "harness de corrida",
    status: "active",
    last_activity_at: new Date().toISOString(),
    detection_source: "harness",
    detection_confidence: "unknown",
  },
  messages: [],
});

const respostas = await Promise.all(
  Array.from({ length: PARALELAS }, () =>
    fetch(`${BASE}/api/public/agent/sync`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: corpo,
    }).then((r) => r.json()),
  ),
);

let entregas = 0;
respostas.forEach((r, i) => {
  const n = (r.replies ?? []).length;
  entregas += n;
  console.log(`  requisicao ${i}: ${n} reply(s)`);
});

// A linha tem que ter ficado `delivered` de qualquer jeito — entregar zero vezes
// seria um defeito novo, nao uma correcao.
const { data: final } = await db
  .from("replies")
  .select("status")
  .eq("session_id", sessao.id);
const pendentes = (final ?? []).filter((r) => r.status === "pending").length;

await db.from("sessions").delete().eq("id", sessao.id);

console.log(`\nalvo: ${BASE}`);
console.log(`o MESMO reply foi entregue ${entregas}x (correto: 1)`);
console.log(`replies ainda pendentes apos a entrega: ${pendentes} (correto: 0)`);
console.log(entregas === 1 && pendentes === 0 ? "\nPASS" : "\nFALHOU");
