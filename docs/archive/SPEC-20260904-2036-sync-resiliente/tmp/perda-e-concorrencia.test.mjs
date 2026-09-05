// Roda o agente REAL contra um servidor que falha de proposito, e mede duas
// coisas que so aparecem de fora do processo:
//
//   A) PERDA — todo id de mensagem enviado durante a janela de 500 tem que
//      reaparecer num POST bem-sucedido depois. Antes da correcao o cursor
//      avancava antes do POST, entao esses ids sumiam para sempre.
//   B) CONCORRENCIA — com LRC_CONCURRENCY=1, no maximo UMA requisicao pode
//      estar em voo a qualquer instante. Duas provariam ticks sobrepostos,
//      que e o que o `setInterval` fazia.
//
// Nao toca no banco nem no deploy: o servidor falso responde tudo.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
// Aceita um agente alternativo no argv, para rodar o MESMO teste contra a
// versao anterior e provar que o harness enxerga o defeito.
const AGENTE = process.argv[2]
  ? join(process.cwd(), process.argv[2])
  : join(raiz, "public/agent/remote-agent.mjs");

const FALHAR_AS_PRIMEIRAS = Number(process.env.HARNESS_FALHAS ?? 6);
const SEGUNDOS = Number(process.env.HARNESS_SEGUNDOS ?? 22);
// Latencia por requisicao. O padrao imita a ida e volta real ate o Vercel
// (~800ms medidos): e ela que faz um tick estourar o intervalo e sobrepor. Com
// resposta instantanea o tick antigo cabia dentro dos 2s e o teste B nao
// conseguia falhar — teste que nao falha nao prova nada.
const LATENCIA_MS = Number(process.env.HARNESS_LATENCIA ?? 400);

let recebidas = 0;
let emVoo = 0;
let maxEmVoo = 0;
const idsVistosNaFalha = new Set();
const idsGravados = new Set();
const inicios = [];
const sessoesPorReq = [];

const server = createServer((req, res) => {
  emVoo++;
  maxEmVoo = Math.max(maxEmVoo, emVoo);
  inicios.push(Date.now());

  let corpo = "";
  req.on("data", (c) => (corpo += c));
  req.on("end", () => {
    const n = ++recebidas;
    let ids = [];
    try {
      const parsed = JSON.parse(corpo);
      ids = (parsed.messages ?? []).map((m) => m.external_id).filter(Boolean);
      sessoesPorReq.push(parsed.session?.external_id ?? "?");
    } catch {
      /* corpo ilegivel nao muda o que estamos medindo */
    }

    const vaiFalhar = n <= FALHAR_AS_PRIMEIRAS;
    if (vaiFalhar) ids.forEach((id) => idsVistosNaFalha.add(id));
    else ids.forEach((id) => idsGravados.add(id));

    // Atraso pequeno para a janela de sobreposicao existir de verdade: sem ele
    // a resposta e instantanea e dois ticks nunca se cruzariam nem quebrados.
    setTimeout(() => {
      emVoo--;
      if (vaiFalhar) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "falha proposital do harness" }));
      } else {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ session_id: "harness", replies: [] }));
      }
    }, LATENCIA_MS);
  });
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const porta = server.address().port;
console.log(`servidor falso em 127.0.0.1:${porta} — falhando as ${FALHAR_AS_PRIMEIRAS} primeiras`);

const agente = spawn(process.execPath, [AGENTE], {
  env: {
    ...process.env,
    LRC_URL: `http://127.0.0.1:${porta}`,
    LRC_TOKEN: "lrc_harness_token_qualquer",
    LRC_INTERVAL: "2000",
    LRC_CONCURRENCY: process.env.HARNESS_CONCURRENCY ?? "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
const logAgente = [];
agente.stdout.on("data", (d) => logAgente.push(String(d)));
agente.stderr.on("data", (d) => logAgente.push(String(d)));

await new Promise((r) => setTimeout(r, SEGUNDOS * 1000));
agente.kill();
server.close();

const perdidos = [...idsVistosNaFalha].filter((id) => !idsGravados.has(id));
const intervalos = inicios.slice(1).map((t, i) => t - inicios[i]);
// Fronteira de tick = a pausa longa entre requisicoes. O que interessa e o
// CICLO: de quanto em quanto tempo o painel recebe estado novo.
// Fronteira de tick: cada tick toca uma sessao no maximo uma vez, entao ver a
// MESMA sessao de novo significa que um tick novo comecou. Detectar por pausa
// nao serve — com o sleep restante os ticks emendam e nao ha pausa nenhuma.
const fronteiras = [];
let vistasNoTick = new Set();
sessoesPorReq.forEach((sid, i) => {
  if (vistasNoTick.has(sid)) { fronteiras.push(inicios[i]); vistasNoTick = new Set(); }
  vistasNoTick.add(sid);
});
const ciclos = fronteiras.slice(1).map((t, i) => t - fronteiras[i]);
const cicloMedio = ciclos.length ? Math.round(ciclos.reduce((a, b) => a + b, 0) / ciclos.length) : null;

console.log(`\nrequisicoes recebidas: ${recebidas}`);
console.log(`  ids enviados durante a falha: ${idsVistosNaFalha.size}`);
console.log(`  desses, reenviados e gravados: ${idsVistosNaFalha.size - perdidos.length}`);
console.log(`  PERDIDOS: ${perdidos.length}`);
console.log(`ciclos observados: ${ciclos.length} — periodo medio ${cicloMedio}ms (LRC_INTERVAL=2000)`);
// Os primeiros ciclos sao partida a frio (o agente reenvia o arquivo inteiro).
// O regime estavel — que e o que o usuario sente — sao os ultimos.
const cauda = ciclos.slice(-5);
if (cauda.length) console.log(`  ultimos ${cauda.length} ciclos (regime estavel): ${cauda.join(", ")}ms`);
console.log(`maximo de requisicoes em voo: ${maxEmVoo} (limite pedido: 1)`);
console.log(`mensagens de retentativa no log: ${logAgente.join("").match(/nova tentativa/g)?.length ?? 0}`);
if (perdidos.length) console.log("  exemplos:", perdidos.slice(0, 3));

const semPerda = perdidos.length === 0 && idsVistosNaFalha.size > 0;
const semSobreposicao = maxEmVoo <= Number(process.env.HARNESS_CONCURRENCY ?? 1);
console.log(`\nA) sem perda em falha de POST: ${semPerda ? "PASS" : "FAIL"}`);
console.log(`B) sem sobreposicao de tick:   ${semSobreposicao ? "PASS" : "FAIL"}`);
console.log(semPerda && semSobreposicao ? "\nOK" : "\nFALHOU");
