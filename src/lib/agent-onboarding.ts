export const currentAgentVersion = "0.1.0";
export const agentOfflineAfterMilliseconds = 2 * 60 * 1000;

/**
 * Janela em que uma máquina recém-pareada ainda pode não ter sincronizado.
 *
 * O agente só aparece no banco quando o instalador troca o código, e o primeiro
 * `/sync` vem alguns segundos depois — mas o download, o SHA-256 e o diagnóstico
 * podem esticar isso. Sem a janela, o cartão gritava "com atenção" no meio de
 * uma instalação que estava indo bem.
 */
export const machineFirstSyncGraceMilliseconds = 5 * 60 * 1000;

/** Passo suportado para ativar o plugin numa sessão do Claude Code já aberta. */
export const claudeReloadCommand = "/reload-plugins";

export type MachineTelemetry = {
  agent_version: string | null;
  install_error: string | null;
  installed_at: string | null;
  last_seen_at: string | null;
  plugin_status: string | null;
  revoked_at: string | null;
};

export type MachineStatus = "pending" | "connected" | "outdated" | "attention" | "revoked";

function timeOf(value: string | null) {
  if (!value) return null;
  const milliseconds = new Date(value).getTime();
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

/**
 * Estado da máquina a partir do que o banco PROVA, na ordem do que é acionável.
 *
 * A ordem é o contrato: revogação primeiro (o usuário decidiu), depois erro
 * relatado pela própria instalação, depois a espera pela primeira conexão,
 * depois silêncio, e só então versão. Um agente calado E desatualizado mostra o
 * silêncio, porque atualizar não resolve uma máquina que não responde.
 */
export function deriveMachineStatus(
  machine: MachineTelemetry,
  nowMilliseconds = Date.now(),
): MachineStatus {
  if (machine.revoked_at) return "revoked";
  if (machine.install_error || machine.plugin_status === "attention") return "attention";

  const lastSeen = timeOf(machine.last_seen_at);
  if (lastSeen === null) {
    const installed = timeOf(machine.installed_at);
    const installing =
      installed !== null && nowMilliseconds - installed <= machineFirstSyncGraceMilliseconds;
    return installing ? "pending" : "attention";
  }
  if (nowMilliseconds - lastSeen > agentOfflineAfterMilliseconds) return "attention";
  if (machine.agent_version && machine.agent_version !== currentAgentVersion) return "outdated";
  return "connected";
}

export function describeMachineStatus(status: MachineStatus) {
  const labels: Record<MachineStatus, string> = {
    pending: "Aguardando instalação",
    connected: "Conectada",
    outdated: "Desatualizada",
    attention: "Com atenção",
    revoked: "Revogada",
  };
  return labels[status];
}

export type MachineAdvice = { message: string; action: string } | null;

/**
 * O que houve e o que fazer — texto, não cor. Fica na lib e não no componente
 * porque é ele que carrega a promessa do PRD ("todo erro oferece ação concreta")
 * e é isso que o teste precisa poder ler sem montar a árvore React.
 */
export function describeMachineAdvice(
  machine: MachineTelemetry,
  status = deriveMachineStatus(machine),
): MachineAdvice {
  if (status === "connected") return null;
  if (status === "revoked") {
    return {
      message: "Esta máquina não sincroniza mais. O histórico continua aqui.",
      action: "Reconectar",
    };
  }
  if (status === "pending") {
    return {
      message:
        "A instalação começou nesta máquina. Assim que o agente conectar, o estado muda sozinho.",
      action: "Refazer instalação",
    };
  }
  if (status === "outdated") {
    return {
      message: `O agente está na versão ${machine.agent_version} e a atual é ${currentAgentVersion}.`,
      action: "Atualizar",
    };
  }
  if (machine.install_error) {
    return { message: `A instalação informou: ${machine.install_error}`, action: "Reparar" };
  }
  if (machine.plugin_status === "attention") {
    return {
      message: "O agente está de pé, mas o plugin do Claude Code não foi instalado.",
      action: "Reparar",
    };
  }
  if (!machine.last_seen_at) {
    return { message: "Esta máquina nunca conectou ao painel.", action: "Reparar" };
  }
  return { message: "A máquina não responde há alguns minutos.", action: "Reparar" };
}

/**
 * Nome já usado por outra máquina da conta.
 *
 * Nada no banco impede dois agentes homônimos — a identidade é o `id`. Mas a
 * lista ficaria com dois cartões distinguíveis só por versão e última conexão, e
 * escolher qual reparar viraria adivinhação. Compara sem diferenciar caixa nem
 * espaço de sobra, que é como uma pessoa lê "Notebook" e "notebook ".
 */
export function isDuplicateMachineName(name: string, existingNames: readonly string[]) {
  const candidate = name.trim().toLowerCase();
  if (!candidate) return false;
  return existingNames.some((existing) => existing.trim().toLowerCase() === candidate);
}

/**
 * Traduz a falha de criação de pareamento para a ação que resolve AQUELA falha.
 *
 * Um "tente novamente" genérico é ação errada para nome inválido (tentar de novo
 * dá o mesmo erro) e para sessão expirada (tentar de novo não reautentica). As
 * chaves vêm das exceções de `create_agent_pairing` e do validador do server fn.
 */
export function describePairingError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("PAIRING_NAME_INVALID") || message.includes("Nome inválido")) {
    return "Esse nome não serve. Use entre 1 e 80 caracteres e tente de novo.";
  }
  if (message.includes("PAIRING_TARGET_INVALID") || message.includes("Máquina inválida")) {
    return "Essa máquina não está mais na sua conta. Recarregue a página para ver a lista atual.";
  }
  // Na prática quem barra a sessão expirada é `requireSupabaseAuth`, com
  // "Unauthorized: Invalid token", antes de a RPC ser chamada. O
  // PAIRING_AUTH_REQUIRED do banco é a segunda linha de defesa — casar só ele
  // deixava a expiração cair no genérico "verifique sua conexão", que manda a
  // pessoa olhar a rede quando o problema é o login.
  if (message.includes("PAIRING_AUTH_REQUIRED") || message.includes("Unauthorized")) {
    return "Sua sessão expirou. Entre novamente para continuar.";
  }
  return "Não foi possível preparar a instalação. Verifique sua conexão e tente de novo.";
}

export function buildInstallCommand(baseUrl: string, pairingCode: string) {
  const origin = new URL(baseUrl).origin;
  if (!/^https?:\/\//.test(origin)) throw new Error("Origem inválida");
  if (!/^[0-9a-f]{64}$/i.test(pairingCode)) throw new Error("Código inválido");
  const installerUrl = `${origin}/api/public/agent/install.ps1`;
  return `& ([scriptblock]::Create((irm '${installerUrl}'))) -Code '${pairingCode}'`;
}

export function buildUninstallCommand() {
  return `& "$env:LOCALAPPDATA\\Conect Sessions\\uninstall.ps1"`;
}

export function formatLastSeen(value: string | null) {
  if (!value) return "ainda não conectou";
  return `vista em ${new Date(value).toLocaleString("pt-BR")}`;
}

/**
 * Tempo restante do código, em `m:ss`. `null` quando já expirou — quem chama
 * mostra a saída de erro no lugar do contador em vez de exibir "0:00" parado.
 */
export function formatPairingCountdown(expiresAt: string, nowMilliseconds = Date.now()) {
  const expires = timeOf(expiresAt);
  if (expires === null) return null;
  const remaining = expires - nowMilliseconds;
  if (remaining <= 0) return null;
  const totalSeconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
