import { describe, expect, test } from "bun:test";
import {
  agentOfflineAfterMilliseconds,
  buildInstallCommand,
  buildUninstallCommand,
  claudeReloadCommand,
  currentAgentVersion,
  deriveMachineStatus,
  describeMachineAdvice,
  describeMachineStatus,
  describePairingError,
  formatLastSeen,
  formatPairingCountdown,
  isDuplicateMachineName,
  machineFirstSyncGraceMilliseconds,
  type MachineStatus,
  type MachineTelemetry,
} from "../../src/lib/agent-onboarding";

const now = new Date("2026-09-06T12:00:00.000Z").getTime();
const iso = (offsetMilliseconds: number) => new Date(now + offsetMilliseconds).toISOString();

// `plugin_status` só aceita 'unknown' | 'ready' | 'attention' (CHECK em
// agents_plugin_status_check): a fixture usa um valor que o banco de fato grava.
const connected: MachineTelemetry = {
  agent_version: currentAgentVersion,
  install_error: null,
  installed_at: iso(-60 * 60 * 1000),
  last_seen_at: iso(-5_000),
  plugin_status: "ready",
  revoked_at: null,
};

describe("estado da máquina", () => {
  test("distingue os quatro estados do RF-10 sem depender de cor", () => {
    expect(deriveMachineStatus(connected, now)).toBe("connected");
    // Pareamento consumido agora: o instalador está baixando/verificando e o
    // primeiro sync ainda não veio.
    expect(
      deriveMachineStatus({ ...connected, installed_at: iso(-10_000), last_seen_at: null }, now),
    ).toBe("pending");
    expect(deriveMachineStatus({ ...connected, install_error: "falhou" }, now)).toBe("attention");
    expect(deriveMachineStatus({ ...connected, revoked_at: iso(-1_000) }, now)).toBe("revoked");

    const rotulos: Record<MachineStatus, string> = {
      pending: "Aguardando instalação",
      connected: "Conectada",
      outdated: "Desatualizada",
      attention: "Com atenção",
      revoked: "Revogada",
    };
    for (const [status, rotulo] of Object.entries(rotulos)) {
      expect(describeMachineStatus(status as MachineStatus)).toBe(rotulo);
    }
  });

  test("espera pela primeira conexão só dentro da janela da instalação", () => {
    const semSync = { ...connected, last_seen_at: null };
    expect(
      deriveMachineStatus(
        { ...semSync, installed_at: iso(-machineFirstSyncGraceMilliseconds + 1_000) },
        now,
      ),
    ).toBe("pending");
    expect(
      deriveMachineStatus(
        { ...semSync, installed_at: iso(-machineFirstSyncGraceMilliseconds - 1_000) },
        now,
      ),
    ).toBe("attention");
    // Agente antigo (criado antes desta SPEC) não tem installed_at: sem prova
    // de instalação recente, calado é calado.
    expect(deriveMachineStatus({ ...semSync, installed_at: null }, now)).toBe("attention");
  });

  test("silêncio pesa mais que versão antiga, e plugin sem instalar pede atenção", () => {
    const antiga = { ...connected, agent_version: "0.0.9" };
    expect(deriveMachineStatus(antiga, now)).toBe("outdated");
    expect(
      deriveMachineStatus(
        { ...antiga, last_seen_at: iso(-agentOfflineAfterMilliseconds - 1_000) },
        now,
      ),
    ).toBe("attention");
    expect(deriveMachineStatus({ ...connected, plugin_status: "attention" }, now)).toBe(
      "attention",
    );
    expect(deriveMachineStatus({ ...connected, plugin_status: "unknown" }, now)).toBe("connected");
    expect(deriveMachineStatus({ ...connected, last_seen_at: "inválida" }, now)).toBe("attention");
  });

  test("revogação vence qualquer outro sinal", () => {
    const revogadaComErro = {
      ...connected,
      install_error: "falhou",
      last_seen_at: null,
      revoked_at: iso(-1_000),
    };
    expect(deriveMachineStatus(revogadaComErro, now)).toBe("revoked");
  });
});

describe("ação concreta para cada erro", () => {
  test("todo estado fora de conectada explica o que houve e o que fazer", () => {
    const casos: Array<[MachineTelemetry, string, string]> = [
      [{ ...connected, revoked_at: iso(-1_000) }, "não sincroniza mais", "Reconectar"],
      [
        { ...connected, installed_at: iso(-10_000), last_seen_at: null },
        "A instalação começou",
        "Refazer instalação",
      ],
      [{ ...connected, agent_version: "0.0.9" }, "0.0.9", "Atualizar"],
      [{ ...connected, install_error: "SmartScreen bloqueou" }, "SmartScreen bloqueou", "Reparar"],
      [
        { ...connected, plugin_status: "attention" },
        "plugin do Claude Code não foi instalado",
        "Reparar",
      ],
      [
        { ...connected, last_seen_at: iso(-agentOfflineAfterMilliseconds - 1_000) },
        "não responde há alguns minutos",
        "Reparar",
      ],
      [{ ...connected, installed_at: null, last_seen_at: null }, "nunca conectou", "Reparar"],
    ];
    for (const [machine, trecho, acao] of casos) {
      const advice = describeMachineAdvice(machine, deriveMachineStatus(machine, now));
      expect(advice).not.toBeNull();
      expect(advice!.message).toContain(trecho);
      expect(advice!.action).toBe(acao);
    }
    expect(describeMachineAdvice(connected, "connected")).toBeNull();
  });

  test("a versão atual aparece no texto de desatualizada, não só a antiga", () => {
    const advice = describeMachineAdvice({ ...connected, agent_version: "0.0.9" }, "outdated");
    expect(advice!.message).toContain(currentAgentVersion);
  });
});

describe("comandos guiados", () => {
  test("gera instalação por código temporário sem expor token ou JSON", () => {
    const code = "a".repeat(64);
    const command = buildInstallCommand("https://painel.example/app", code);
    expect(command).toContain("https://painel.example/api/public/agent/install.ps1");
    expect(command).toContain(`-Code '${code}'`);
    expect(command).not.toContain("LRC_TOKEN");
    expect(command).not.toContain("JSON");
  });

  test("recusa código fora do contrato e oferece desinstalação local", () => {
    expect(() => buildInstallCommand("https://painel.example", "curto")).toThrow("Código inválido");
    expect(buildUninstallCommand()).toContain("Conect Sessions\\uninstall.ps1");
    expect(claudeReloadCommand).toBe("/reload-plugins");
  });
});

describe("nome de máquina repetido", () => {
  test("compara como uma pessoa lê: sem caixa e sem espaço de sobra", () => {
    const existentes = ["Notebook do trabalho", "Desktop"];
    expect(isDuplicateMachineName("Notebook do trabalho", existentes)).toBe(true);
    expect(isDuplicateMachineName("  notebook DO trabalho ", existentes)).toBe(true);
    expect(isDuplicateMachineName("Notebook de casa", existentes)).toBe(false);
  });

  test("campo vazio não é duplicata — senão o botão nasceria bloqueado", () => {
    expect(isDuplicateMachineName("", ["Desktop"])).toBe(false);
    expect(isDuplicateMachineName("   ", ["Desktop"])).toBe(false);
    // Lista com entrada vazia (linha estranha no banco) não pode bloquear tudo.
    expect(isDuplicateMachineName("", [""])).toBe(false);
    expect(isDuplicateMachineName("Desktop", [])).toBe(false);
  });
});

describe("erro de pareamento vira a ação que resolve aquele erro", () => {
  test("nome, máquina sumida e sessão expirada não colapsam em 'tente novamente'", () => {
    expect(describePairingError(new Error("Nome inválido"))).toContain("1 e 80 caracteres");
    expect(describePairingError(new Error("PAIRING_NAME_INVALID"))).toContain("1 e 80 caracteres");
    expect(describePairingError(new Error("Máquina inválida"))).toContain("Recarregue a página");
    expect(describePairingError(new Error("PAIRING_TARGET_INVALID"))).toContain(
      "Recarregue a página",
    );
    expect(describePairingError(new Error("PAIRING_AUTH_REQUIRED"))).toContain("Entre novamente");
    // O que de fato chega quando a sessão expira: o middleware barra antes da
    // RPC. Sem casar esta mensagem, a expiração pedia para "verificar a
    // conexão" — a pessoa olharia a rede em vez de entrar de novo.
    expect(describePairingError(new Error("Unauthorized: Invalid token"))).toContain(
      "Entre novamente",
    );
  });

  test("falha desconhecida ainda oferece o que tentar", () => {
    const generico = describePairingError(new Error("fetch failed"));
    expect(generico).toContain("conexão");
    expect(describePairingError(null)).toBe(generico);
    expect(describePairingError("boom")).toBe(generico);
  });
});

describe("contagem regressiva do código", () => {
  test("mostra o tempo restante e some ao expirar", () => {
    expect(formatPairingCountdown(iso(10 * 60 * 1000), now)).toBe("10:00");
    expect(formatPairingCountdown(iso(65_500), now)).toBe("1:06");
    expect(formatPairingCountdown(iso(9_000), now)).toBe("0:09");
    expect(formatPairingCountdown(iso(0), now)).toBeNull();
    expect(formatPairingCountdown(iso(-1_000), now)).toBeNull();
    expect(formatPairingCountdown("inválida", now)).toBeNull();
  });

  test("máquina sem heartbeat não inventa uma data", () => {
    expect(formatLastSeen(null)).toBe("ainda não conectou");
    expect(formatLastSeen(connected.last_seen_at)).toStartWith("vista em ");
  });
});
