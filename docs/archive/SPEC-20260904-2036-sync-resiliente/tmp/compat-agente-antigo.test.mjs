// A API mudou; o agente instalado nas maquinas do usuario, nao. Este teste sobe
// o agente ANTERIOR a esta SPEC contra o servidor NOVO e confirma que ele
// continua gravando sessao e mensagem — o invariante de nao quebrar quem nao
// atualizou.
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:8082";
const aqui = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(".env", "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: dono } = await db.from("agents").select("user_id").limit(1).single();
const token = "lrc_compat" + randomBytes(20).toString("hex");
const { data: agente } = await db.from("agents").insert({
  user_id: dono.user_id, name: "compat SPEC-2036 (temporario)",
  token_hash: createHash("sha256").update(token).digest("hex"), token_prefix: token.slice(0, 12),
}).select("id").single();

const proc = spawn(process.execPath, [join(aqui, "agente-antes.mjs")], {
  env: { ...process.env, LRC_URL: BASE, LRC_TOKEN: token, LRC_INTERVAL: "2000" },
  stdio: ["ignore", "pipe", "pipe"],
});
const log = [];
proc.stdout.on("data", (d) => log.push(String(d)));
proc.stderr.on("data", (d) => log.push(String(d)));

await new Promise((r) => setTimeout(r, 30_000));
proc.kill();

const { data: sessoes } = await db.from("sessions").select("id").eq("agent_id", agente.id);
const ids = (sessoes ?? []).map((s) => s.id);
const { count: mensagens } = ids.length
  ? await db.from("messages").select("id", { count: "exact", head: true }).in("session_id", ids)
  : { count: 0 };

await db.from("sessions").delete().eq("agent_id", agente.id);
await db.from("agents").delete().eq("id", agente.id);

const texto = log.join("");
const recusas = texto.match(/sync falhou|sync recusado|Payload inválido/g)?.length ?? 0;
console.log(`agente ANTERIOR a esta SPEC contra a API nova (${BASE})`);
console.log(`  sessoes gravadas:  ${ids.length}`);
console.log(`  mensagens gravadas: ${mensagens}`);
console.log(`  recusas da API:     ${recusas}`);
console.log(ids.length > 0 && mensagens > 0 && recusas === 0 ? "\nPASS" : "\nFALHOU");
if (recusas) console.log(texto.split("\n").filter((l) => /falhou|recusado|inválido/.test(l)).slice(0, 3).join("\n"));
