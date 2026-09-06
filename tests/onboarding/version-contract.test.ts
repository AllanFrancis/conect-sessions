import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { currentAgentVersion } from "../../src/lib/agent-onboarding";

/*
 * A versão do agente vive em três arquivos que ninguém edita junto.
 *
 * O painel compara `currentAgentVersion` com o que a máquina reporta para
 * decidir "Desatualizada". Subir a versão do agente sem subir a constante do
 * painel faz TODA máquina saudável virar desatualizada de uma vez; o inverso
 * esconde uma atualização que existe. Nenhum dos dois quebra teste algum — por
 * isso este arquivo, que falha alto no momento do bump.
 */

const agentSource = readFileSync("public/agent/remote-agent.mjs", "utf8");
const pluginManifest = JSON.parse(
  readFileSync("plugins/conect-sessions/.claude-plugin/plugin.json", "utf8"),
) as { version: string };

describe("versão do agente", () => {
  test("painel, agente e plugin declaram a mesma versão", () => {
    const declared = agentSource.match(
      /const AGENT_VERSION = process\.env\.LRC_AGENT_VERSION \|\| "([^"]+)"/,
    );
    expect(declared).not.toBeNull();
    expect(declared![1]).toBe(currentAgentVersion);
    expect(pluginManifest.version).toBe(currentAgentVersion);
  });

  test("a constante do painel é uma versão semântica, não um rótulo solto", () => {
    expect(currentAgentVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
