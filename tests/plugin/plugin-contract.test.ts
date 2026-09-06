import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const marketplace = JSON.parse(readFileSync(resolve(".claude-plugin/marketplace.json"), "utf8"));
const manifest = JSON.parse(
  readFileSync(resolve("plugins/conect-sessions/.claude-plugin/plugin.json"), "utf8"),
);
const hooks = JSON.parse(readFileSync(resolve("plugins/conect-sessions/hooks/hooks.json"), "utf8"));
const wrapper = readFileSync(resolve("plugins/conect-sessions/scripts/invoke-hook.ps1"), "utf8");
const installer = readFileSync(resolve("public/agent/install-agent.ps1"), "utf8");
const uninstaller = readFileSync(resolve("public/agent/uninstall-agent.ps1"), "utf8");
const workflow = readFileSync(resolve(".github/workflows/agent-release.yml"), "utf8");

describe("Claude Code plugin package", () => {
  test("declara marketplace e plugin portável", () => {
    expect(marketplace.name).toBe("conect-sessions");
    expect(marketplace.plugins).toContainEqual(
      expect.objectContaining({ name: "conect-sessions", source: "./plugins/conect-sessions" }),
    );
    expect(manifest).toEqual(
      expect.objectContaining({ name: "conect-sessions", version: "0.1.0" }),
    );
  });

  test("registra todos os eventos sem apontar para o checkout ou settings.json", () => {
    expect(Object.keys(hooks.hooks).sort()).toEqual(
      ["PreToolUse", "SessionEnd", "SessionStart", "Stop"].sort(),
    );
    const serialized = JSON.stringify(hooks);
    expect(serialized).toContain("${CLAUDE_PLUGIN_ROOT}/scripts/invoke-hook.ps1");
    expect(serialized).not.toContain("settings.json");
    expect(serialized).not.toContain(process.cwd().replaceAll("\\", "/"));
  });

  test("wrapper é fail-open e localiza o executável instalado", () => {
    expect(wrapper).toContain("Join-Path $installRoot 'conect-hook.exe'");
    expect(wrapper).toContain("$env:LRC_STATE_DIR = Join-Path $installRoot 'state'");
    expect(wrapper.indexOf("ReadToEndAsync()")).toBeLessThan(wrapper.indexOf("WaitForExit("));
    expect(wrapper).toContain("catch { }");
    expect(wrapper.trimEnd().endsWith("exit 0")).toBe(true);
  });

  test("instalador gerencia marketplace e plugin no escopo do usuário", () => {
    expect(installer).toContain("plugin marketplace add 'AllanFrancis/conect-sessions'");
    expect(installer).toContain("plugin install 'conect-sessions@conect-sessions' --scope user");
    expect(installer).toContain("/reload-plugins");
    expect(installer).not.toContain("settings.json");
    expect(uninstaller).toContain(
      "plugin uninstall 'conect-sessions@conect-sessions' --scope user",
    );
  });

  test("valida agente e hook antes de consumir o pareamento", () => {
    const agentHash = installer.indexOf("$manifest.remoteAgent.sha256");
    const hookHash = installer.indexOf("$manifest.claudeHook.sha256");
    const hookVersion = installer.indexOf("$hookVersionCheck");
    const pairing = installer.indexOf("/api/public/agent/pair");
    expect(agentHash).toBeGreaterThan(0);
    expect(hookHash).toBeGreaterThan(agentHash);
    expect(hookVersion).toBeGreaterThan(hookHash);
    expect(pairing).toBeGreaterThan(hookVersion);
  });

  test("workflow publica dois executáveis e manifesto com hashes", () => {
    expect(workflow).toContain("conect-agent.exe");
    expect(workflow).toContain("conect-hook.exe");
    expect(workflow).toContain("Get-FileHash");
    expect(workflow).toContain("agent-manifest.json");
    expect(workflow).toContain("ref: ${{ env.RELEASE_TAG }}");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("contents: write");
    expect(workflow).not.toMatch(/uses:\s+[^\s]+@v\d/);
  });
});
