import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { installerHeaders, renderAgentInstaller } from "@/lib/agent-installer";

/**
 * E2E do comando único, com o executável compilado de verdade.
 *
 * O que os outros testes de installer provam é o instalador; aqui o que roda é
 * o produto: binário Bun compilado, credencial protegida por DPAPI no perfil
 * real do Windows, launcher iniciado pelo instalador, agente autenticando com o
 * token que ele mesmo descriptografou, sincronizando uma sessão e recebendo de
 * volta uma resposta endereçada àquela sessão. O valor gravado em Run é
 * executado literalmente para simular o logon.
 *
 * Isolamento: USERPROFILE aponta para um perfil descartável, então o agente não
 * enxerga as sessões reais de Claude Code e Kiro desta máquina — o que também
 * mantém o teste rápido e determinístico. APPDATA fica intacto porque é de lá
 * que o DPAPI carrega a chave-mestra do usuário.
 *
 * Fora do alcance da automação, e por isso ainda manual no critério de aceite 5:
 * baixar do release real do GitHub (SmartScreen, URL do asset) e o round-trip
 * dentro do Claude Code, que depende do plugin da task 3.
 */

const tempRoot = resolve("docs/active/SPEC-20260905-2251-instalacao-simples/tmp/windows-e2e");
const realAgentPath = join(tempRoot, "release", "conect-agent.exe");
const isolatedHome = join(tempRoot, "profile");
const installRoot = join(tempRoot, "Conect Sessions");
const testRunRoot = "HKCU:\\Software\\ConectSessionsE2E";
const testRunKey = `${testRunRoot}\\Run`;

const pairingCode = "e".repeat(64);
const permanentToken = `lrc_${"f".repeat(48)}`;
const manifestVersion = "0.1.0-e2e";
const replyContent = "resposta do painel para a sessão certa";

let agentBytes = new Uint8Array();
let agentSha256 = "";
let server: ReturnType<typeof Bun.serve>;
let commandSequence = 0;

type SyncRecord = { token: string; version: string; platform: string; externalId: string };
const syncs: SyncRecord[] = [];
let replyDelivered = false;

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Mesmo motivo do outro arquivo: o agente iniciado por Start-Process herda os
 * handles do pai, então um pipe do Bun não chega a EOF enquanto ele viver.
 * Saída vai para arquivo (UTF-16LE, padrão do redirecionamento do PowerShell).
 */
async function runPowerShell(command: string) {
  const logPath = join(tempRoot, `powershell-${++commandSequence}.log`);
  const child = Bun.spawn(
    [
      "powershell.exe",
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `& { try { ${command} } catch { Write-Output ('ERRO: ' + $_.Exception.Message); throw } } *> '${logPath}'`,
    ],
    {
      stdout: "ignore",
      stderr: "ignore",
      stdin: "ignore",
      env: { ...process.env, USERPROFILE: isolatedHome },
    },
  );
  const exitCode = await child.exited;
  const output = existsSync(logPath) ? readFileSync(logPath, "utf16le").replace(/^\uFEFF/, "") : "";
  return { exitCode, output };
}

async function countProcessesAt(exePath: string) {
  const result = await runPowerShell(
    `@(Get-Process | Where-Object { try { $_.Path -eq '${exePath}' } catch { $false } }).Count`,
  );
  return Number(result.output.trim());
}

async function waitFor<T>(what: string, probe: () => T | null | undefined, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = probe();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`tempo esgotado esperando por ${what}`);
    await Bun.sleep(500);
  }
}

async function waitForProcessCount(exePath: string, expected: number, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const count = await countProcessesAt(exePath);
    if (count === expected) return count;
    if (Date.now() > deadline) {
      throw new Error(`esperava ${expected} processo(s) em ${exePath}, achei ${count}`);
    }
    await Bun.sleep(500);
  }
}

/**
 * Executa o valor de Run como o Windows executa: criando o processo direto a
 * partir da linha de comando gravada, sem shell intermediário.
 *
 * Medido: aninhar `powershell.exe` dentro de outro PowerShell trava. A chamada
 * de comando nativo espera EOF dos fluxos do filho, e o agente — que herda
 * esses handles — os mantém abertos enquanto viver. O logon de verdade não tem
 * esse shell no meio, então simular com shell seria inventar um problema que o
 * usuário não tem.
 */
async function runStoredCommand(commandLine: string) {
  const argv = (commandLine.match(/"[^"]*"|\S+/g) ?? []).map((token) =>
    token.replace(/^"|"$/g, ""),
  );
  const child = Bun.spawn(argv, {
    stdout: "ignore",
    stderr: "ignore",
    stdin: "ignore",
    env: { ...process.env, USERPROFILE: isolatedHome },
  });
  return { argv, exitCode: await child.exited };
}

const readRecord = () => JSON.parse(readFileSync(join(installRoot, "agent.pid"), "utf8"));

beforeAll(async () => {
  rmSync(tempRoot, { recursive: true, force: true });
  mkdirSync(join(realAgentPath, ".."), { recursive: true });
  mkdirSync(isolatedHome, { recursive: true });

  const build = Bun.spawn([process.execPath, "run", "scripts/build-agent.mjs"], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, AGENT_OUTFILE: realAgentPath },
  });
  const [buildCode, buildOut] = await Promise.all([
    build.exited,
    new Response(build.stderr).text(),
  ]);
  if (buildCode !== 0 || !existsSync(realAgentPath)) {
    throw new Error(`falha ao compilar o agente real: ${buildOut}`);
  }
  agentBytes = new Uint8Array(readFileSync(realAgentPath));
  agentSha256 = await sha256(agentBytes);

  server = Bun.serve({
    port: 0,
    maxRequestBodySize: 256 * 1024 * 1024,
    async fetch(request) {
      const url = new URL(request.url);
      // O bootstrap sai pelo MESMO caminho e com os MESMOS headers da produção:
      // é daqui que o `irm` do comando único vai buscá-lo.
      if (url.pathname === "/api/public/agent/install.ps1") {
        return new Response(renderAgentInstaller(server.url.origin), {
          headers: installerHeaders,
        });
      }
      if (url.pathname === "/manifest.json") {
        return Response.json({
          version: manifestVersion,
          remoteAgent: {
            url: new URL("conect-agent.exe", server.url).href,
            sha256: agentSha256,
            platform: "windows-x64",
          },
          claudeHook: {
            url: new URL("conect-agent.exe", server.url).href,
            sha256: agentSha256,
            platform: "windows-x64",
          },
        });
      }
      if (url.pathname === "/conect-agent.exe") return new Response(agentBytes);
      if (url.pathname === "/api/public/agent/pair") {
        const body = (await request.json()) as { code?: string };
        if (body.code !== pairingCode) return Response.json({ error: "invalid" }, { status: 400 });
        return Response.json({ token: permanentToken, agentId: "agent-e2e" });
      }
      if (url.pathname === "/api/public/agent/sync") {
        const body = (await request.json()) as {
          token?: string;
          agent?: { version?: string; platform?: string };
          session?: { external_id?: string };
        };
        const externalId = body.session?.external_id ?? "";
        syncs.push({
          token: body.token ?? "",
          version: body.agent?.version ?? "",
          platform: body.agent?.platform ?? "",
          externalId,
        });
        // A resposta é endereçada por external_id, então só sai para a sessão
        // que a pediu — é esse endereçamento que o teste precisa provar.
        if (externalId.startsWith("claude-code:") && !replyDelivered) {
          replyDelivered = true;
          return Response.json({
            session_id: "00000000-0000-4000-8000-000000000000",
            external_id: externalId,
            replies: [
              {
                id: "reply-e2e",
                content: replyContent,
                session_id: "00000000-0000-4000-8000-000000000000",
                external_id: externalId,
              },
            ],
          });
        }
        return Response.json({ session_id: null, external_id: externalId, replies: [] });
      }
      return new Response("not found", { status: 404 });
    },
  });
});

afterAll(async () => {
  server?.stop(true);
  await runPowerShell(
    `Get-Process | Where-Object { try { $_.Path -like '${tempRoot}\\*' } catch { $false } } | Stop-Process -Force -ErrorAction SilentlyContinue`,
  );
  await runPowerShell(
    `Remove-Item -Path '${testRunRoot}' -Recurse -Force -ErrorAction SilentlyContinue`,
  );
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("E2E do comando único com o agente compilado", () => {
  test("um comando conecta o agente, entrega resposta na sessão certa e sobrevive ao logon", async () => {
    const agentPath = join(installRoot, "conect-agent.exe");

    // --- 1. o comando único, exatamente como o painel o entrega ------------
    //
    // `irm` + [scriptblock]::Create(), e NÃO um arquivo em disco com `-File`.
    // A diferença não é cosmética: no modo arquivo o BOM é obrigatório e no modo
    // string ele é fatal, e era justamente por testar o modo errado que a suíte
    // ficava verde com a produção quebrando no parse da primeira linha.
    const bootstrapUrl = new URL("/api/public/agent/install.ps1", server.url).href;
    const install = await runPowerShell(
      [
        `& ([scriptblock]::Create((irm '${bootstrapUrl}')))`,
        `-Code '${pairingCode}'`,
        `-ReleaseManifestUrl '${new URL("manifest.json", server.url).href}'`,
        `-InstallRoot '${installRoot}'`,
        `-RunKeyPath '${testRunKey}'`,
        "-SkipPlugin",
      ].join(" "),
    );
    expect(install.exitCode, install.output).toBe(0);
    expect(install.output).toContain("Diagnóstico concluído");
    expect(await countProcessesAt(agentPath)).toBe(1);

    const firstRecord = readRecord();
    expect(firstRecord.path).toBe(agentPath);

    // --- 2. uma sessão de Claude Code vista pelo hook -----------------------
    // O registro é o que o hook deixaria: id nativo, cwd e a prova de vida
    // (pid + horário de criação). Reaproveitar o próprio processo do agente é
    // suficiente porque o que está sob teste é o roteamento da resposta, não a
    // detecção — essa já tem cobertura própria.
    const sessionId = "e2e-11111111-2222-4333-8444-555555555555";
    const sessionsDir = join(installRoot, "state", "sessions");
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(
      join(sessionsDir, `claude-${sessionId}.json`),
      JSON.stringify({
        session_id: sessionId,
        cwd: installRoot,
        started_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        pid: firstRecord.pid,
        proc_start: String(firstRecord.start),
      }),
      "utf8",
    );

    const externalId = `claude-code:${sessionId}`;
    const synced = await waitFor("o sync da sessão semeada", () =>
      syncs.find((entry) => entry.externalId === externalId),
    );

    // A credencial fez o caminho completo: protegida pelo instalador,
    // descriptografada pelo launcher e usada pelo agente.
    expect(synced.token).toBe(permanentToken);
    expect(synced.version).toBe(manifestVersion);
    expect(synced.platform).toBe("windows-x64");

    // --- 3. a resposta chega à sessão que a originou -------------------------
    const inboxPath = join(installRoot, "state", "inbox", `claude-${sessionId}.jsonl`);
    const inbox = await waitFor("a resposta na caixa de entrada da sessão", () =>
      existsSync(inboxPath) ? readFileSync(inboxPath, "utf8") : null,
    );
    expect(inbox).toContain(replyContent);
    expect(JSON.parse(inbox.trim().split("\n")[0]).id).toBe("reply-e2e");

    // Nada de token em disco em claro, nem no log do instalador.
    expect(readFileSync(join(installRoot, "config.json"), "utf8")).not.toContain(permanentToken);
    expect(readFileSync(join(installRoot, "install.log"), "utf8")).not.toContain(permanentToken);

    // --- 4. logon: o valor gravado em Run é executado literalmente -----------
    const runCommand = (
      await runPowerShell(`(Get-ItemProperty -LiteralPath '${testRunKey}').ConectSessionsAgent`)
    ).output.trim();
    expect(runCommand).toContain("launcher.ps1");

    await runPowerShell(`Stop-Process -Id ${firstRecord.pid} -Force -ErrorAction SilentlyContinue`);
    await waitForProcessCount(agentPath, 0);

    const logon = await runStoredCommand(runCommand);
    expect(logon.argv[0]).toBe("powershell.exe");
    expect(logon.exitCode).toBe(0);
    await waitForProcessCount(agentPath, 1);
    expect(readRecord().pid).not.toBe(firstRecord.pid);

    // --- 5. remoção não deixa rastro ----------------------------------------
    const removed = await runPowerShell(
      `& '${join(installRoot, "uninstall.ps1")}' -RunKeyPath '${testRunKey}' -SkipPlugin`,
    );
    expect(removed.exitCode, removed.output).toBe(0);
    expect(await countProcessesAt(agentPath)).toBe(0);
    expect(existsSync(installRoot)).toBe(false);
    const leftover = await runPowerShell(
      `@((Get-Item -LiteralPath '${testRunKey}').Property) -join ','`,
    );
    expect(leftover.output).not.toContain("ConectSessionsAgent");
  }, 300000);
});
