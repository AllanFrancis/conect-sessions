import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * O instalador passou a depender de comportamento, não de texto: ele valida o
 * artefato com --version antes de consumir o pareamento e confirma o
 * diagnóstico com --probe --json depois de instalar. Então estes testes
 * executam o agente de verdade. Rodam sobre o fonte, e não sobre o binário
 * compilado, porque `bun build --compile` leva dezenas de segundos e produz
 * ~100MB; o binário é validado pela pipeline de release.
 */

const agentPath = resolve("public/agent/remote-agent.mjs");
const source = readFileSync(agentPath, "utf8");

async function runAgent(args: string[], env: Record<string, string> = {}) {
  const child = Bun.spawn([process.execPath, agentPath, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env },
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

describe("compiled agent contract", () => {
  test("responde a --version sem credencial e honra a versão da instalação", async () => {
    const padrao = await runAgent(["--version"], { LRC_URL: "", LRC_TOKEN: "" });
    expect(padrao.exitCode, padrao.stderr).toBe(0);
    expect(padrao.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);

    const instalado = await runAgent(["--version"], {
      LRC_URL: "",
      LRC_TOKEN: "",
      LRC_AGENT_VERSION: "9.9.9-fixture",
    });
    expect(instalado.stdout.trim()).toBe("9.9.9-fixture");
  }, 30000);

  test("responde a --probe --json com JSON utilizável pelo diagnóstico", async () => {
    const probe = await runAgent(["--probe", "--json"], { LRC_URL: "", LRC_TOKEN: "" });
    expect(probe.exitCode, probe.stderr).toBe(0);
    const parsed = JSON.parse(probe.stdout);
    expect(Array.isArray(parsed)).toBe(true);
  }, 60000);

  test("sem URL e token, falha de forma explícita em vez de rodar em silêncio", async () => {
    const semCredencial = await runAgent([], { LRC_URL: "", LRC_TOKEN: "" });
    expect(semCredencial.exitCode).toBe(1);
    expect(semCredencial.stderr).toContain("LRC_URL");
  }, 30000);

  test("envia telemetria de instalação sem alterar o payload de sessão", () => {
    expect(source).toContain("version: AGENT_VERSION");
    expect(source).toContain("platform: AGENT_PLATFORM");
    expect(source).toContain("plugin_status: PLUGIN_STATUS");
    expect(source).toContain("session,");
    expect(source).toContain("messages,");
  });
});
