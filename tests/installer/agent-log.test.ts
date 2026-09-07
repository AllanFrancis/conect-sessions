import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * O log do agente, provado por execução.
 *
 * A SPEC nasceu de `agent.log` com 0 byte depois de 7h30 de agente vivo: as
 * linhas de diagnóstico existiam no fonte e em lugar nenhum na máquina. Um teste
 * que só olhasse o fonte (`expect(source).toContain("log(")`) reproduziria
 * exatamente o defeito que estamos consertando — código presente, arquivo vazio.
 * Então aqui o agente RODA, contra um servidor de mentira, e a asserção é sobre o
 * arquivo que ele deixou em disco.
 *
 * Roda sobre o fonte e não sobre o binário compilado, pelo mesmo motivo de
 * `agent-build.test.ts`: `bun build --compile` leva dezenas de segundos e produz
 * ~100MB. O que muda no binário é o subsistema (sem console), e é justamente por
 * isso que a escrita testada aqui não depende de stdout.
 *
 * `.scratch/` e não `docs/active/<SPEC>/tmp/`: o `close` move a pasta da SPEC e o
 * `mkdirSync` recursivo a recriaria a cada run, violando "docs/active vazio em
 * main" sem o git ver.
 */

const agentPath = resolve("public/agent/remote-agent.mjs");
const workRoot = resolve(".scratch/agent-log-test");

/** Valor sentinela: se ele aparecer no log, o critério do token caiu. */
const TOKEN = "lrc_tok_SENTINELA_NAO_PODE_VAZAR_1234567890";
/** Texto da "resposta do usuário": não pode existir em disco fora do inbox. */
const REPLY_TEXT = "TEXTO-SECRETO-DA-RESPOSTA-DO-USUARIO";

const SESSION_ID = "11111111-2222-4333-8444-555555555555";
const EXTERNAL_ID = `claude-code:${SESSION_ID}`;

type ServerReply = { status: number; body: unknown };
type Instalacao = ReturnType<typeof semear>;

/**
 * Uma instalação de mentira: transcrição do Claude Code semeada onde o agente
 * procura, `state/` para o inbox e o caminho do log. Cada caso tem a sua, para
 * que o arquivo lido seja o daquele caso e de mais nenhum.
 */
function semear(nome: string) {
  const root = join(workRoot, nome);
  rmSync(root, { recursive: true, force: true });
  const claudeHome = join(root, "claude");
  const transcriptDir = join(claudeHome, "projects", "D--projeto");
  mkdirSync(transcriptDir, { recursive: true });
  writeFileSync(
    join(transcriptDir, `${SESSION_ID}.jsonl`),
    `${JSON.stringify({
      type: "user",
      uuid: "msg-1",
      message: { role: "user", content: "oi" },
      timestamp: new Date().toISOString(),
    })}\n`,
    "utf8",
  );
  return {
    root,
    claudeHome,
    stateDir: join(root, "state"),
    logFile: join(root, "agent.log"),
    inboxFile: join(root, "state", "inbox", `claude-${SESSION_ID}.jsonl`),
  };
}

/** Servidor de sync que devolve o que o caso pedir. Conta os POSTs recebidos. */
function servidor(responder: () => ServerReply) {
  let posts = 0;
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      if (!new URL(request.url).pathname.endsWith("/api/public/agent/sync")) {
        return new Response("não encontrado", { status: 404 });
      }
      posts += 1;
      await request.json();
      const { status, body } = responder();
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    },
  });
  return { url: server.url.origin, stop: () => server.stop(true), posts: () => posts };
}

function iniciarAgente(instalacao: Instalacao, env: Record<string, string> = {}) {
  return Bun.spawn([process.execPath, agentPath], {
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      // Perfil redirecionado, sem o qual o caso não é hermético: `CLAUDE_HOMES`
      // sempre acrescenta `~/.claude` e `DEFAULT_DIRS` inclui `~/.kiro`. Medido na
      // primeira execução — o agente do teste listou as transcrições REAIS da
      // máquina e passou a mandá-las ao servidor de mentira.
      USERPROFILE: instalacao.root,
      HOME: instalacao.root,
      CLAUDE_CONFIG_DIR: instalacao.claudeHome,
      // O monitor sonda processos via WMI: é lento, é ruidoso e não é o que está
      // sob teste. Desligado, a fase de transcrição do tick continua rodando.
      LRC_MONITOR: "0",
      LRC_INTERVAL: "250",
      LRC_TOKEN: TOKEN,
      LRC_STATE_DIR: instalacao.stateDir,
      ...env,
    },
  });
}

/** Espera o arquivo satisfazer a condição, ou devolve o que houver no limite. */
async function esperarLog(
  arquivo: string,
  condicao: (conteudo: string) => boolean,
  limiteMs = 20000,
) {
  const fim = Date.now() + limiteMs;
  let conteudo = "";
  while (Date.now() < fim) {
    conteudo = existsSync(arquivo) ? readFileSync(arquivo, "utf8") : "";
    if (condicao(conteudo)) return conteudo;
    await Bun.sleep(100);
  }
  return conteudo;
}

afterAll(() => rmSync(workRoot, { recursive: true, force: true }));

describe("log do agente em disco", () => {
  test("grava o arranque e a falha de sync com status e motivo, sem o token", async () => {
    const fs = semear("sync-401");
    const server = servidor(() => ({ status: 401, body: { error: "token inválido" } }));
    const agente = iniciarAgente(fs, { LRC_URL: server.url, LRC_LOG_FILE: fs.logFile });

    try {
      // `tick 1` é escrito DEPOIS do tick inteiro, então esperar por ele garante
      // que a falha de sync daquele tick já está no arquivo.
      const log = await esperarLog(fs.logFile, (c) => c.includes("tick 1"));

      // Critério: `agent.log` tem conteúdo depois do primeiro tick.
      expect(log).toContain("agente");
      expect(log).toContain("iniciado");
      expect(log).toContain("tick 1");
      // Critério: a falha de sync aparece com o status HTTP e o motivo.
      expect(log).toContain("sync recusado: 401");
      expect(log).toContain("token inválido");
      // Critério: o token não aparece em claro.
      expect(log).not.toContain(TOKEN);
      // Formato: uma linha por evento, timestamp ISO em UTC na frente.
      expect(log.split("\n")[0]).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z (INFO |ERROR|DEBUG) /);
      expect(
        log
          .trimEnd()
          .split("\n")
          .every((linha) => linha.startsWith("20")),
      ).toBe(true);
    } finally {
      agente.kill();
      server.stop();
    }
  }, 40000);

  test("registra a entrega no inbox por sessão e id, e nunca o texto da resposta", async () => {
    const fs = semear("entrega");
    const server = servidor(() => ({
      status: 200,
      body: {
        session_id: "uuid-do-banco",
        external_id: EXTERNAL_ID,
        replies: [
          { id: "reply-entregue", content: REPLY_TEXT, external_id: EXTERNAL_ID },
          // Sem canal de entrega: era um `return` mudo e é o buraco que fez o
          // diagnóstico não saber se a resposta havia chegado ao agente.
          { id: "reply-sem-canal", content: REPLY_TEXT, external_id: "kiro:sess_abc" },
        ],
      },
    }));
    const agente = iniciarAgente(fs, { LRC_URL: server.url, LRC_LOG_FILE: fs.logFile });

    try {
      const log = await esperarLog(
        fs.logFile,
        (c) => c.includes("reply-entregue") && c.includes("reply-sem-canal"),
      );

      // A entrega aconteceu de verdade — o log não está descrevendo ficção.
      expect(existsSync(fs.inboxFile)).toBe(true);
      expect(readFileSync(fs.inboxFile, "utf8")).toContain(REPLY_TEXT);

      // Critério: a resposta escrita no inbox aparece com sessão de destino e id.
      expect(log).toContain("resposta reply-entregue enfileirada");
      expect(log).toContain(`sessão=${SESSION_ID}`);
      expect(log).toContain(`bytes=${REPLY_TEXT.length}`);
      // O descarte deixa rastro em vez de sumir em silêncio.
      expect(log).toContain("reply-sem-canal descartada");
      expect(log).toContain("sem canal de entrega");
      // Critério: o texto da resposta NÃO aparece no log.
      expect(log).not.toContain(REPLY_TEXT);
      expect(log).not.toContain(TOKEN);
    } finally {
      agente.kill();
      server.stop();
    }
  }, 40000);

  test("rotaciona ao passar de 2MB e continua rodando", async () => {
    const fs = semear("rotacao");
    const server = servidor(() => ({ status: 401, body: { error: "token inválido" } }));
    // Um byte a menos que o limite: a primeira linha escrita já obriga o giro.
    writeFileSync(fs.logFile, "x".repeat(2 * 1024 * 1024 - 1), "utf8");

    const agente = iniciarAgente(fs, { LRC_URL: server.url, LRC_LOG_FILE: fs.logFile });

    try {
      const log = await esperarLog(
        fs.logFile,
        (c) => c.includes("sync recusado") && c.length < 4096,
      );

      // Uma geração só, com o conteúdo velho preservado, igual ao que o launcher
      // fazia — a diferença é que agora gira durante a execução, não só no start.
      expect(existsSync(`${fs.logFile}.1`)).toBe(true);
      expect(statSync(`${fs.logFile}.1`).size).toBe(2 * 1024 * 1024 - 1);
      expect(statSync(fs.logFile).size).toBeLessThan(4096);
      expect(log).toContain("sync recusado: 401");

      // E o agente seguiu vivo: ainda está sincronizando depois do giro.
      const antes = server.posts();
      await Bun.sleep(1200);
      expect(server.posts()).toBeGreaterThan(antes);
      expect(agente.killed).toBe(false);
    } finally {
      agente.kill();
      server.stop();
    }
  }, 40000);

  test("sem LRC_LOG_FILE, deriva o caminho do state dir que o launcher passa", async () => {
    const fs = semear("fallback");
    const server = servidor(() => ({ status: 401, body: { error: "token inválido" } }));
    const agente = iniciarAgente(fs, { LRC_URL: server.url });

    try {
      // `<installRoot>/state` é irmão de `<installRoot>/agent.log`.
      const log = await esperarLog(fs.logFile, (c) => c.includes("tick 1"));
      expect(log).toContain("tick 1");
    } finally {
      agente.kill();
      server.stop();
    }
  }, 40000);

  test("LRC_LOG=0 desliga o arquivo sem calar o console", async () => {
    const fs = semear("desligado");
    const server = servidor(() => ({ status: 401, body: { error: "token inválido" } }));
    const agente = iniciarAgente(fs, {
      LRC_URL: server.url,
      LRC_LOG_FILE: fs.logFile,
      LRC_LOG: "0",
    });

    try {
      const saida = agente.stdout ? new Response(agente.stdout).text() : Promise.resolve("");
      // Tempo suficiente para vários ticks: se fosse gravar, teria gravado.
      await Bun.sleep(2500);
      expect(existsSync(fs.logFile)).toBe(false);
      agente.kill();
      expect(await saida).toContain("só console");
    } finally {
      agente.kill();
      server.stop();
    }
  }, 40000);
});
