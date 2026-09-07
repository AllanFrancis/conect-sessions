import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { renderAgentInstaller } from "@/lib/agent-installer";

/**
 * A suíte roda o instalador de verdade: PowerShell real, DPAPI real, registro
 * real e um agente falso que é um executável real. Sem isso os caminhos que
 * quebram na mão do usuário — launcher, autostart, PID reciclado, remoção —
 * ficariam cobertos apenas por `expect(script).toContain(...)`, que não prova
 * comportamento nenhum.
 *
 * Isolamento: `-InstallRoot` no lugar de %LOCALAPPDATA% e `-RunKeyPath` no
 * lugar da chave Run do usuário, sob HKCU\Software\ConectSessionsTests.
 */

const installerPath = resolve("public/agent/install-agent.ps1");
const canonicalLauncherPath = resolve("public/agent/launcher.ps1");
const canonicalUninstallerPath = resolve("public/agent/uninstall-agent.ps1");
const canonicalProcessLibPath = resolve("public/agent/agent-process.ps1");
const canonicalLauncher = readFileSync(canonicalLauncherPath, "utf8");
const canonicalUninstaller = readFileSync(canonicalUninstallerPath, "utf8");
const canonicalProcessLib = readFileSync(canonicalProcessLibPath, "utf8");
const installerScript = readFileSync(installerPath, "utf8");

// `.scratch/` e não `docs/active/<SPEC>/tmp/`: a SPEC que originou este teste já
// foi arquivada, e o `mkdirSync` recursivo recriava a pasta em `docs/active/` a
// cada execução — violando "docs/active vazio em main" sem o git ver, porque
// diretório vazio não entra no índice. Sem SPEC ativa, descartável mora em
// `.scratch/`.
const tempRoot = resolve(".scratch/windows-installer-test");
const fakeAgentPath = join(tempRoot, "release", "conect-agent.exe");
const decoyAgentPath = join(tempRoot, "decoy", "decoy-agent.exe");
const testRunRoot = "HKCU:\\Software\\ConectSessionsTests";
const testRunKey = `${testRunRoot}\\Run`;

const pairingCode = "c".repeat(64);
const permanentToken = `lrc_${"d".repeat(48)}`;
let fakeAgentBytes = new Uint8Array();
let expectedHash = "";
let badHash = false;
let pairCalls = 0;
let commandSequence = 0;
let server: ReturnType<typeof Bun.serve>;

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * PowerShell roda sem pipe de saída, com todos os fluxos redirecionados para
 * arquivo. Medido: o agente iniciado por Start-Process herda os handles do
 * processo pai, então o pipe do Bun não chega a EOF enquanto o agente viver e
 * ler stdout travaria o teste até o agente morrer. O redirecionamento do
 * PowerShell 5.1 grava UTF-16LE, daí a decodificação explícita.
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
      // O try/catch existe para capturar a mensagem: um erro terminante que sai
      // do script é escrito pelo host FORA do escopo do redirecionamento, e sem
      // isso a asserção sobre a causa da falha não teria o que ler.
      `& { try { ${command} } catch { Write-Output ('ERRO: ' + $_.Exception.Message); throw } } *> '${logPath}'`,
    ],
    { stdout: "ignore", stderr: "ignore", stdin: "ignore" },
  );
  const exitCode = await child.exited;
  const output = existsSync(logPath) ? readFileSync(logPath, "utf16le").replace(/^\uFEFF/, "") : "";
  return { exitCode, output };
}

/** Conta processos rodando exatamente este executável (identidade por caminho). */
async function countProcessesAt(exePath: string) {
  const result = await runPowerShell(
    `@(Get-Process | Where-Object { try { $_.Path -eq '${exePath}' } catch { $false } }).Count`,
  );
  return Number(result.output.trim());
}

const stopProcessesUnder = (directory: string) =>
  runPowerShell(
    `Get-Process | Where-Object { try { $_.Path -like '${directory}\\*' } catch { $false } } | Stop-Process -Force -ErrorAction SilentlyContinue`,
  );

/**
 * Agente falso: executável real, porque o instalador agora valida o artefato
 * com --version antes de consumir o pareamento e confirma o processo vivo
 * depois de iniciar. Arquivo de texto renomeado para .exe não passa por
 * nenhuma das duas coisas — e era justamente o que a versão anterior usava.
 */
async function buildFakeAgent(destination: string) {
  const sourcePath = join(tempRoot, "fake-agent.cs");
  const compilerPath = join(tempRoot, "compile-fake-agent.ps1");
  mkdirSync(join(destination, ".."), { recursive: true });
  writeFileSync(
    sourcePath,
    [
      "using System;",
      "using System.Threading;",
      "public static class FakeAgent {",
      "  public static int Main(string[] args) {",
      "    foreach (string arg in args) {",
      '      if (arg == "--version") { Console.WriteLine("9.9.9-fake"); return 0; }',
      '      if (arg == "--probe") { Console.WriteLine("[]"); return 0; }',
      "    }",
      "    Thread.Sleep(15 * 60 * 1000);",
      "    return 0;",
      "  }",
      "}",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    compilerPath,
    [
      "param([string]$Source, [string]$Out)",
      "$ErrorActionPreference = 'Stop'",
      "Add-Type -TypeDefinition (Get-Content -LiteralPath $Source -Raw) -OutputAssembly $Out -OutputType ConsoleApplication",
    ].join("\n"),
    "utf8",
  );
  const built = await runPowerShell(
    `& '${compilerPath}' -Source '${sourcePath}' -Out '${destination}'`,
  );
  if (built.exitCode !== 0 || !existsSync(destination)) {
    throw new Error(`não foi possível compilar o agente falso: ${built.output}`);
  }
}

function runInstaller(installRoot: string, options: { autostart?: boolean; start?: boolean } = {}) {
  const flags = [options.autostart ? "" : "-NoAutostart", options.start ? "" : "-NoStart"].filter(
    Boolean,
  );
  return runPowerShell(
    [
      `& '${installerPath}'`,
      `-Code '${pairingCode}'`,
      `-ApiUrl '${server.url.origin}'`,
      `-ReleaseManifestUrl '${new URL("manifest.json", server.url).href}'`,
      `-InstallRoot '${installRoot}'`,
      `-RunKeyPath '${testRunKey}'`,
      "-SkipPlugin",
      ...flags,
    ].join(" "),
  );
}

const runInstalledLauncher = (installRoot: string) =>
  runPowerShell(`& '${join(installRoot, "launcher.ps1")}'`);

const runInstalledUninstaller = (installRoot: string) =>
  runPowerShell(
    `& '${join(installRoot, "uninstall.ps1")}' -RunKeyPath '${testRunKey}' -SkipPlugin`,
  );

const runCanonicalUninstaller = (installRoot: string) =>
  runPowerShell(
    `& '${canonicalUninstallerPath}' -InstallRoot '${installRoot}' -RunKeyPath '${testRunKey}'`,
  );

beforeAll(async () => {
  await stopProcessesUnder(tempRoot);
  rmSync(tempRoot, { recursive: true, force: true });
  mkdirSync(tempRoot, { recursive: true });
  await buildFakeAgent(fakeAgentPath);
  mkdirSync(join(decoyAgentPath, ".."), { recursive: true });
  writeFileSync(decoyAgentPath, readFileSync(fakeAgentPath));
  fakeAgentBytes = new Uint8Array(readFileSync(fakeAgentPath));
  expectedHash = await sha256(fakeAgentBytes);

  server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/api/public/agent/pair") {
        const body = (await request.json()) as { code?: string };
        if (body.code !== pairingCode) return Response.json({ error: "invalid" }, { status: 400 });
        pairCalls += 1;
        return Response.json({
          token: permanentToken,
          agentId: "agent-test",
          repaired: pairCalls > 1,
        });
      }
      if (url.pathname === "/manifest.json") {
        return Response.json({
          version: "0.1.0-test",
          remoteAgent: {
            url: new URL("conect-agent.exe", server.url).href,
            sha256: badHash ? "0".repeat(64) : expectedHash,
            platform: "windows-x64",
          },
          claudeHook: {
            url: new URL("conect-hook.exe", server.url).href,
            sha256: expectedHash,
            platform: "windows-x64",
          },
        });
      }
      if (url.pathname === "/conect-agent.exe") return new Response(fakeAgentBytes);
      if (url.pathname === "/conect-hook.exe") return new Response(fakeAgentBytes);
      return new Response("not found", { status: 404 });
    },
  });
});

afterAll(async () => {
  server.stop(true);
  await stopProcessesUnder(tempRoot);
  await runPowerShell(
    `Remove-Item -Path '${testRunRoot}' -Recurse -Force -ErrorAction SilentlyContinue`,
  );
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("Windows one-command installer", () => {
  test("guarda a credencial no perfil do usuário e delega processo à identidade verificada", () => {
    expect(installerScript).toContain("DataProtectionScope]::CurrentUser");
    expect(installerScript).toContain("[Security.Cryptography.SHA256]::Create()");
    expect(installerScript).toContain("Set-ItemProperty");
    expect(installerScript).not.toContain(permanentToken);

    // Encerrar processo é decisão de agent-process.ps1, que confere caminho e
    // horário de criação. Stop-Process solto em qualquer um destes scripts é
    // regressão do PID reciclado.
    for (const source of [installerScript, canonicalLauncher]) {
      expect(source).not.toContain("Stop-Process");
    }
    expect(canonicalProcessLib).toContain("Get-AgentPathKey $facts.Path");
    expect(canonicalLauncher).toContain("Resolve-AgentProcess");
  });

  test("consome o pareamento só depois de validar SHA-256 e --version do artefato", () => {
    const hashIndex = installerScript.indexOf("Save-VerifiedDownload -Url");
    const versionIndex = installerScript.indexOf("-Arguments '--version'");
    const pairIndex = installerScript.indexOf("/api/public/agent/pair");
    const stopIndex = installerScript.indexOf("Stop-AgentProcess -InstallRoot");
    expect(hashIndex).toBeGreaterThan(0);
    expect(versionIndex).toBeGreaterThan(hashIndex);
    expect(pairIndex).toBeGreaterThan(versionIndex);
    expect(stopIndex).toBeGreaterThan(pairIndex);
  });

  test("instala duas vezes sem duplicar autostart nem expor segredo", async () => {
    const installRoot = join(tempRoot, "Conect Sessions");
    const callsBefore = pairCalls;
    const first = await runInstaller(installRoot, { autostart: true });
    expect(first.exitCode, first.output).toBe(0);
    const second = await runInstaller(installRoot, { autostart: true });
    expect(second.exitCode, second.output).toBe(0);
    expect(pairCalls).toBe(callsBefore + 2);

    const config = readFileSync(join(installRoot, "config.json"), "utf8");
    const log = readFileSync(join(installRoot, "install.log"), "utf8");
    expect(config).toContain("protectedToken");
    expect(config).not.toContain(permanentToken);
    expect(config).not.toContain(pairingCode);
    expect(log).not.toContain(permanentToken);
    expect(log).not.toContain(pairingCode);
    expect(readFileSync(join(installRoot, "conect-agent.exe"))).toEqual(
      Buffer.from(fakeAgentBytes),
    );

    // Fonte única: o que foi instalado é byte a byte o arquivo versionado.
    expect(readFileSync(join(installRoot, "launcher.ps1"), "utf8")).toBe(canonicalLauncher);
    expect(readFileSync(join(installRoot, "uninstall.ps1"), "utf8")).toBe(canonicalUninstaller);
    expect(readFileSync(join(installRoot, "agent-process.ps1"), "utf8")).toBe(canonicalProcessLib);
    expect(existsSync(join(installRoot, ".staging"))).toBe(false);

    // Diagnóstico executado, não presumido.
    expect(log).toContain("Diagnóstico concluído");
    expect(log).toContain("versão 9.9.9-fake");

    const values = await runPowerShell(
      `@((Get-Item -LiteralPath '${testRunKey}').Property) -join ','`,
    );
    expect(values.output.trim()).toBe("ConectSessionsAgent");

    const command = await runPowerShell(
      `(Get-ItemProperty -LiteralPath '${testRunKey}').ConectSessionsAgent`,
    );
    expect(command.output).toContain(join(installRoot, "launcher.ps1"));
  }, 120000);

  test("reparo com SHA-256 inválido preserva binário, credencial e o pareamento", async () => {
    const installRoot = join(tempRoot, "Hash Failure");
    const healthy = await runInstaller(installRoot);
    expect(healthy.exitCode, healthy.output).toBe(0);

    const agentBefore = readFileSync(join(installRoot, "conect-agent.exe"));
    const configBefore = readFileSync(join(installRoot, "config.json"), "utf8");
    const callsBefore = pairCalls;

    badHash = true;
    const repair = await runInstaller(installRoot);
    badHash = false;

    expect(repair.exitCode).not.toBe(0);
    expect(repair.output).toContain("SHA-256");
    // O que prova que a instalação saudável sobreviveu: o código não foi
    // trocado, então o token gravado continua sendo o que o servidor aceita.
    expect(pairCalls).toBe(callsBefore);
    expect(readFileSync(join(installRoot, "config.json"), "utf8")).toBe(configBefore);
    expect(readFileSync(join(installRoot, "conect-agent.exe"))).toEqual(agentBefore);
  }, 120000);

  test("launcher inicia o agente uma vez e registra identidade verificável", async () => {
    const installRoot = join(tempRoot, "Launcher");
    const agentPath = join(installRoot, "conect-agent.exe");
    const installed = await runInstaller(installRoot);
    expect(installed.exitCode, installed.output).toBe(0);
    expect(existsSync(join(installRoot, "agent.pid"))).toBe(false);

    const firstRun = await runInstalledLauncher(installRoot);
    expect(firstRun.exitCode, firstRun.output).toBe(0);
    expect(await countProcessesAt(agentPath)).toBe(1);

    const record = JSON.parse(readFileSync(join(installRoot, "agent.pid"), "utf8"));
    expect(record.path).toBe(agentPath);
    expect(String(record.start)).toMatch(/^\d+$/);

    const secondRun = await runInstalledLauncher(installRoot);
    expect(secondRun.exitCode, secondRun.output).toBe(0);
    expect(secondRun.output).toContain("já em execução");
    expect(await countProcessesAt(agentPath)).toBe(1);
    expect(JSON.parse(readFileSync(join(installRoot, "agent.pid"), "utf8")).pid).toBe(record.pid);

    const removed = await runInstalledUninstaller(installRoot);
    expect(removed.exitCode, removed.output).toBe(0);
    expect(await countProcessesAt(agentPath)).toBe(0);
    expect(existsSync(installRoot)).toBe(false);
  }, 120000);

  test("PID reciclado por outro programa não é encerrado nem confundido com o agente", async () => {
    const installRoot = join(tempRoot, "Recycled Pid");
    const agentPath = join(installRoot, "conect-agent.exe");
    const installed = await runInstaller(installRoot);
    expect(installed.exitCode, installed.output).toBe(0);

    const decoy = await runPowerShell(
      `$p = Start-Process -FilePath '${decoyAgentPath}' -WindowStyle Hidden -PassThru; Write-Output ('{0};{1}' -f $p.Id, $p.StartTime.ToFileTime())`,
    );
    const [decoyPid, decoyStart] = decoy.output.trim().split(";");
    expect(Number(decoyPid)).toBeGreaterThan(0);

    const staleRecord = JSON.stringify({
      pid: Number(decoyPid),
      path: agentPath,
      start: decoyStart,
    });

    // Cenário exato do PID reciclado: o registro guarda o número de um processo
    // vivo que não é o nosso executável.
    writeFileSync(join(installRoot, "agent.pid"), staleRecord, "utf8");

    const launched = await runInstalledLauncher(installRoot);
    expect(launched.exitCode, launched.output).toBe(0);
    expect(await countProcessesAt(decoyAgentPath)).toBe(1);
    expect(await countProcessesAt(agentPath)).toBe(1);
    expect(JSON.parse(readFileSync(join(installRoot, "agent.pid"), "utf8")).pid).not.toBe(
      Number(decoyPid),
    );

    // Mesma proteção na remoção, que é onde ninguém está olhando.
    writeFileSync(join(installRoot, "agent.pid"), staleRecord, "utf8");
    const removed = await runInstalledUninstaller(installRoot);
    expect(removed.exitCode, removed.output).toBe(0);
    expect(await countProcessesAt(decoyAgentPath)).toBe(1);
    expect(await countProcessesAt(agentPath)).toBe(0);
    expect(existsSync(installRoot)).toBe(false);

    await runPowerShell(
      `Stop-Process -Id ${Number(decoyPid)} -Force -ErrorAction SilentlyContinue`,
    );
  }, 120000);

  test("repara com o agente em execução sem deixar processo duplicado", async () => {
    const installRoot = join(tempRoot, "Repair Running");
    const agentPath = join(installRoot, "conect-agent.exe");
    const installed = await runInstaller(installRoot, { start: true });
    expect(installed.exitCode, installed.output).toBe(0);
    expect(await countProcessesAt(agentPath)).toBe(1);
    const firstPid = JSON.parse(readFileSync(join(installRoot, "agent.pid"), "utf8")).pid;

    const repaired = await runInstaller(installRoot, { start: true });
    expect(repaired.exitCode, repaired.output).toBe(0);
    expect(repaired.output).toContain("Agente anterior encerrado");
    expect(await countProcessesAt(agentPath)).toBe(1);
    expect(JSON.parse(readFileSync(join(installRoot, "agent.pid"), "utf8")).pid).not.toBe(firstPid);

    const removed = await runInstalledUninstaller(installRoot);
    expect(removed.exitCode, removed.output).toBe(0);
    expect(await countProcessesAt(agentPath)).toBe(0);
  }, 120000);

  test("o bootstrap servido instala sozinho, sem os arquivos irmãos", async () => {
    // O usuário baixa um arquivo só. Aqui ele é gerado pelo mesmo renderizador
    // do endpoint e gravado numa pasta sem nenhum outro script, o que força o
    // caminho das fontes embutidas em base64 — o único que roda em produção.
    const installRoot = join(tempRoot, "Served Bootstrap");
    const servedPath = join(tempRoot, "served", "install-agent.ps1");
    mkdirSync(join(servedPath, ".."), { recursive: true });
    writeFileSync(servedPath, renderAgentInstaller(server.url.origin), "utf8");

    const result = await runPowerShell(
      [
        `& '${servedPath}'`,
        `-Code '${pairingCode}'`,
        `-ReleaseManifestUrl '${new URL("manifest.json", server.url).href}'`,
        `-InstallRoot '${installRoot}'`,
        `-RunKeyPath '${testRunKey}'`,
        "-SkipPlugin",
        "-NoAutostart",
        "-NoStart",
      ].join(" "),
    );
    expect(result.exitCode, result.output).toBe(0);

    // A origem embutida é usada sem -ApiUrl, e os scripts instalados são os
    // versionados byte a byte, BOM incluído.
    expect(readFileSync(join(installRoot, "config.json"), "utf8")).toContain(server.url.origin);
    expect(readFileSync(join(installRoot, "launcher.ps1"), "utf8")).toBe(canonicalLauncher);
    expect(readFileSync(join(installRoot, "uninstall.ps1"), "utf8")).toBe(canonicalUninstaller);
    expect(readFileSync(join(installRoot, "agent-process.ps1"), "utf8")).toBe(canonicalProcessLib);

    const launched = await runInstalledLauncher(installRoot);
    expect(launched.exitCode, launched.output).toBe(0);
    expect(await countProcessesAt(join(installRoot, "conect-agent.exe"))).toBe(1);
    const removed = await runInstalledUninstaller(installRoot);
    expect(removed.exitCode, removed.output).toBe(0);
    expect(existsSync(installRoot)).toBe(false);
  }, 120000);

  test("remoção é idempotente e limpa o início automático", async () => {
    const installRoot = join(tempRoot, "Uninstall Twice");
    const installed = await runInstaller(installRoot, { autostart: true, start: true });
    expect(installed.exitCode, installed.output).toBe(0);
    expect(await countProcessesAt(join(installRoot, "conect-agent.exe"))).toBe(1);

    const first = await runInstalledUninstaller(installRoot);
    expect(first.exitCode, first.output).toBe(0);
    expect(existsSync(installRoot)).toBe(false);

    const second = await runCanonicalUninstaller(installRoot);
    expect(second.exitCode, second.output).toBe(0);
    expect(second.output).toContain("já não está instalado");

    const values = await runPowerShell(
      `@((Get-Item -LiteralPath '${testRunKey}').Property) -join ','`,
    );
    expect(values.output.trim()).not.toContain("ConectSessionsAgent");
  }, 120000);
});
