import { describe, expect, test } from "bun:test";
import * as agentFunctions from "@/lib/agents.functions";

/*
 * O RF-3 é sobre superfície, não sobre uso.
 *
 * Tirar o botão da tela não basta: cada `createServerFn` exportado por este
 * módulo vira um handler registrado no bundle do servidor, alcançável por quem
 * estiver autenticado, com ou sem interface. O fluxo antigo `createAgent`
 * devolvia o token permanente em texto puro ao navegador e ficou órfão quando a
 * jornada nova entrou — este teste falha se ele (ou um irmão) voltar.
 */

describe("superfície autenticada de credencial", () => {
  test("nenhum server fn de agente além dos três da jornada", () => {
    expect(Object.keys(agentFunctions).sort()).toEqual([
      "cancelAgentPairing",
      "createAgentPairing",
      "revokeAgent",
    ]);
  });

  test("o fluxo de token em texto puro não existe mais", () => {
    expect("createAgent" in agentFunctions).toBe(false);
  });
});
