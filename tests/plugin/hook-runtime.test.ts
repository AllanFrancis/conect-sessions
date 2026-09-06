import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const hookPath = resolve("public/agent/claude-hook.mjs");
const stateDirectory = resolve(
  "docs/active/SPEC-20260905-2251-instalacao-simples/tmp/plugin-runtime-test",
);
const wrapperPath = resolve("plugins/conect-sessions/scripts/invoke-hook.ps1");
const wrapperProfile = join(stateDirectory, "wrapper-profile");
const timeoutProfile = join(stateDirectory, "timeout-profile");

async function buildExecutable(source: string, destination: string, hideConsole = false) {
  mkdirSync(join(destination, ".."), { recursive: true });
  const child = Bun.spawn([
    process.execPath,
    "build",
    source,
    "--compile",
    "--target=bun-windows-x64-baseline",
    ...(hideConsole ? ["--windows-hide-console"] : []),
    "--outfile",
    destination,
  ]);
  const exitCode = await child.exited;
  if (exitCode !== 0) throw new Error(`falha ao compilar ${source}`);
}

async function runWrapper(localAppData: string, input: unknown, timeoutMilliseconds = 5000) {
  const startedAt = performance.now();
  const child = Bun.spawn(
    [
      "powershell.exe",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      wrapperPath,
    ],
    {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        LOCALAPPDATA: localAppData,
        LRC_HOOK_DEBUG: "1",
        LRC_HOOK_TIMEOUT_MS: String(timeoutMilliseconds),
      },
    },
  );
  child.stdin.write(JSON.stringify(input));
  child.stdin.end();
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr, elapsed: performance.now() - startedAt };
}

async function runHook(input: unknown, extraArguments: string[] = []) {
  const child = Bun.spawn([process.execPath, hookPath, ...extraArguments], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, LRC_STATE_DIR: stateDirectory, LRC_PERM: "0" },
  });
  if (input !== undefined) child.stdin.write(JSON.stringify(input));
  child.stdin.end();
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

beforeAll(async () => {
  rmSync(stateDirectory, { recursive: true, force: true });
  mkdirSync(join(stateDirectory, "sessions"), { recursive: true });
  mkdirSync(join(stateDirectory, "inbox"), { recursive: true });
  await buildExecutable(hookPath, join(wrapperProfile, "Conect Sessions", "conect-hook.exe"));
});

afterAll(() => rmSync(stateDirectory, { recursive: true, force: true }));

describe("compiled Claude hook contract", () => {
  test("responde a --version sem ler stdin", async () => {
    const result = await runHook(undefined, ["--version"]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  test("qualquer entrada inválida falha aberta e silenciosamente", async () => {
    const child = Bun.spawn([process.execPath, hookPath], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, LRC_STATE_DIR: stateDirectory },
    });
    child.stdin.write("{invalid");
    child.stdin.end();
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toBe("");
  });

  test("Stop entrega apenas o inbox da própria sessão", async () => {
    const sessionId = "session-target";
    const otherSessionId = "session-other";
    writeFileSync(
      join(stateDirectory, "sessions", `claude-${sessionId}.json`),
      JSON.stringify({ session_id: sessionId }),
    );
    writeFileSync(
      join(stateDirectory, "inbox", `claude-${sessionId}.jsonl`),
      `${JSON.stringify({ content: "resposta correta" })}\n`,
    );
    writeFileSync(
      join(stateDirectory, "inbox", `claude-${otherSessionId}.jsonl`),
      `${JSON.stringify({ content: "não entregar" })}\n`,
    );

    const result = await runHook({ hook_event_name: "Stop", session_id: sessionId });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(
      expect.objectContaining({
        decision: "block",
        reason: expect.stringContaining("resposta correta"),
      }),
    );
    expect(result.stdout).not.toContain("não entregar");
    expect(
      readFileSync(join(stateDirectory, "inbox", `claude-${otherSessionId}.jsonl`), "utf8"),
    ).toContain("não entregar");
  });

  test("wrapper e agente compartilham o estado da instalação", async () => {
    const sessionId = "wrapper-session";
    const installState = join(wrapperProfile, "Conect Sessions", "state");
    const started = await runWrapper(wrapperProfile, {
      hook_event_name: "SessionStart",
      session_id: sessionId,
      cwd: process.cwd(),
    });
    expect(started.exitCode, started.stderr).toBe(0);
    expect(
      readFileSync(join(installState, "sessions", `claude-${sessionId}.json`), "utf8"),
    ).toContain(sessionId);

    mkdirSync(join(installState, "inbox"), { recursive: true });
    writeFileSync(
      join(installState, "inbox", `claude-${sessionId}.jsonl`),
      `${JSON.stringify({ content: "via wrapper" })}\n`,
    );
    const stopped = await runWrapper(wrapperProfile, {
      hook_event_name: "Stop",
      session_id: sessionId,
    });
    expect(stopped.exitCode, stopped.stderr).toBe(0);
    expect(JSON.parse(stopped.stdout).reason).toContain("via wrapper");
  }, 30000);

  test("wrapper encerra hook travado mesmo com stderr cheio", async () => {
    const slowSource = join(stateDirectory, "slow-hook.mjs");
    writeFileSync(
      slowSource,
      'process.stdin.resume(); process.stderr.write("x".repeat(5 * 1024 * 1024)); setTimeout(() => {}, 60000);',
    );
    await buildExecutable(slowSource, join(timeoutProfile, "Conect Sessions", "conect-hook.exe"));
    const result = await runWrapper(
      timeoutProfile,
      { hook_event_name: "Stop", session_id: "slow" },
      250,
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.elapsed).toBeLessThan(5000);
  }, 30000);
});
