#!/usr/bin/env node
/**
 * Remote Session Monitor — hook do Claude Code.
 *
 * É a ponta que faltava: a resposta que o usuário manda do celular chega ao
 * agente local, mas o agente não tem como digitar numa sessão de Claude Code.
 * Ele não tem onde digitar — a sessão roda como `claude.exe --input-format
 * stream-json`, filha do host da IDE, sem console e sem janela. Não existe
 * teclado para simular (medido em 2026-09-04, ver SPEC-20260904-2135).
 *
 * Quem consegue falar dentro da sessão é a própria sessão. Este arquivo roda
 * COMO HOOK do Claude Code, dentro do processo que o usuário está olhando, e
 * por isso:
 *
 *  - `Stop` — ao fim de cada turno, drena o inbox daquela sessão. Se o usuário
 *    respondeu pelo painel, devolvemos `decision: "block"` com o texto dele em
 *    `reason`: a sessão NÃO para e recebe a fala como instrução. É a entrega.
 *  - `SessionStart` / `SessionEnd` — registram a sessão em disco com PID e
 *    start-time, que é o que o monitor precisa para provar vida. A partir da
 *    versão 2.1.x o Claude Code não escreve mais `~/.claude/sessions/<pid>.json`,
 *    e sem esse registro o monitor não enxergava sessão de Claude nenhuma.
 *
 * O `session_id` vem do próprio Claude Code no stdin do hook. Por isso o
 * invariante "nunca escrever na sessão errada" deixa de ser risco a mitigar:
 * o hook roda DENTRO da sessão de destino, não há para onde errar.
 *
 * Instalação (settings.json do Claude Code — `--settings` NÃO carrega hook):
 *
 *   "hooks": {
 *     "SessionStart": [{ "hooks": [{ "type": "command",
 *        "command": "node \"C:/caminho/claude-hook.mjs\"" }] }],
 *     "Stop":         [{ "hooks": [{ "type": "command",
 *        "command": "node \"C:/caminho/claude-hook.mjs\"" }] }],
 *     "SessionEnd":   [{ "hooks": [{ "type": "command",
 *        "command": "node \"C:/caminho/claude-hook.mjs\"" }] }]
 *   }
 *
 * Variáveis (as mesmas do agente):
 *   LRC_STATE_DIR=~/.lrc     onde ficam registro e inbox; o agente lê daqui
 *   LRC_HOOK=0               desliga o hook sem desinstalar (fica inerte)
 *
 * REGRA DE OURO deste arquivo: ele roda em TODA sessão de Claude Code da
 * máquina, a cada turno. Um erro aqui quebra o trabalho do usuário em todos os
 * repositórios dele. Por isso qualquer falha termina em `exit 0` sem saída —
 * o pior caso é a resposta não chegar, nunca a sessão travar.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const STATE_DIR = process.env["LRC_STATE_DIR"] || path.join(os.homedir(), ".lrc");
const SESSIONS_DIR = path.join(STATE_DIR, "sessions");
const INBOX_DIR = path.join(STATE_DIR, "inbox");
const LIGADO = process.env["LRC_HOOK"] !== "0";
const PENDING_DIR = path.join(STATE_DIR, "pending");
/**
 * Canal de permissao: DESLIGADO por padrao, e de proposito.
 *
 * Para destravar um prompt de permissao nao basta responder depois: quando o
 * modal abre, o turno nao acabou e o `Stop` nunca chega. Quem pode decidir e o
 * `PreToolUse`, que roda ANTES do modal — mas so consegue usar a escolha do
 * painel se ESPERAR por ela. Esperar e o custo, e o custo cai em quem estiver
 * sentado na maquina. Por isso o padrao e nao esperar nada: `LRC_PERM=1` arma,
 * e quem arma e alguem que sabe que vai sair de perto.
 */
const PERM_LIGADO = process.env["LRC_PERM"] === "1";
const PERM_ESPERA_MS = Math.max(0, Number(process.env["LRC_PERM_WAIT"] || 120)) * 1000;
const PERM_PASSO_MS = 500;
const IS_WIN = process.platform === "win32";

/** Nomes de processo que são casca, não a sessão: pulamos ao subir a árvore. */
const CASCAS = new Set([
  "cmd.exe",
  "conhost.exe",
  "powershell.exe",
  "pwsh.exe",
  "bash.exe",
  "sh.exe",
  "sh",
  "bash",
  "zsh",
  "dash",
  "env",
]);

/** Um id de sessão vem de fora; nunca deixamos virar caminho. */
function nomeSeguro(id) {
  return String(id)
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .slice(0, 120);
}

const arquivoDeRegistro = (sid) => path.join(SESSIONS_DIR, `claude-${nomeSeguro(sid)}.json`);
const arquivoDeInbox = (sid) => path.join(INBOX_DIR, `claude-${nomeSeguro(sid)}.jsonl`);

function lerJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/** Escrita atômica: o agente lê esse arquivo a cada 2s e não pode pegar meio JSON. */
function gravarJson(file, dados) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(dados));
  fs.renameSync(tmp, file);
}

/**
 * Sobe a árvore de processos a partir deste hook até achar a sessão que o
 * disparou, e devolve PID + start-time em FILETIME — o mesmo par que o monitor
 * já usa para provar vida e descartar reuso de PID.
 *
 * Custa um disparo de PowerShell (~300ms), então só roda no SessionStart, uma
 * vez por sessão. Falhou? Devolve null, o registro fica sem PID e o monitor
 * trata a sessão como `unknown` — que é a verdade, não um chute.
 */
function processoDaSessao() {
  if (!IS_WIN) return null;
  const cascas = [...CASCAS].map((n) => `'${n}'`).join(",");
  const script = `
$ErrorActionPreference='SilentlyContinue'
$ppid=@{}; $nome=@{}
foreach($c in Get-CimInstance Win32_Process){ $i=[int]$c.ProcessId; $ppid[$i]=[int]$c.ParentProcessId; $nome[$i]=[string]$c.Name }
$cascas=@(${cascas})
$cur=[int]${process.pid}
$achado=$null
for($i=0; $i -lt 12 -and $cur; $i++){
  $cur=$ppid[$cur]
  if(-not $cur){ break }
  $n=$nome[$cur]
  if($n -and ($cascas -notcontains $n)){ $achado=$cur; break }
}
if($achado){
  $p=Get-Process -Id $achado
  [PSCustomObject]@{ pid=$achado; nome=$nome[$achado]; start=[string]$p.StartTime.ToFileTime() } | ConvertTo-Json -Compress
}
`;
  try {
    const raw = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { encoding: "utf8", windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024 },
    ).trim();
    if (!raw) return null;
    const p = JSON.parse(raw);
    return typeof p?.pid === "number" ? p : null;
  } catch {
    return null;
  }
}

/**
 * Tira do inbox tudo que estiver lá, de uma vez.
 *
 * O rename é o ponto todo: o agente escreve com append e nós não podemos ler e
 * depois apagar — uma resposta que chegasse no meio disso sumiria sem nunca ter
 * sido entregue, e o painel já teria dito ao usuário que foi. Renomear é atômico
 * no mesmo volume: o que estava, veio inteiro; o que chegar depois, o agente
 * grava num arquivo novo e o próximo turno leva.
 */
function drenarInboxBruto(sid) {
  const inbox = arquivoDeInbox(sid);
  const tomado = `${inbox}.${process.pid}.taking`;
  try {
    fs.renameSync(inbox, tomado);
  } catch {
    return []; // não existe = nada pendente, que é o caso normal
  }
  let linhas = [];
  try {
    linhas = fs.readFileSync(tomado, "utf8").split("\n");
  } catch {
    return [];
  } finally {
    try {
      fs.unlinkSync(tomado);
    } catch {
      /* já foi */
    }
  }
  const itens = [];
  for (const linha of linhas) {
    if (!linha.trim()) continue;
    try {
      const r = JSON.parse(linha);
      if (typeof r?.content === "string" && r.content.trim()) itens.push(r);
    } catch {
      /* linha corrompida não derruba as outras */
    }
  }
  return itens;
}

/** Só os textos — é o que o `Stop` precisa entregar. */
function drenarInbox(sid) {
  return drenarInboxBruto(sid).map((r) => r.content);
}

/**
 * Pausa sem async: o hook é síncrono do começo ao fim e trocar isso por
 * `await` obrigaria a reescrever a entrada inteira por uma espera de 500ms.
 */
function esperar(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// ---------------------------------------------------------------------------
// eventos
// ---------------------------------------------------------------------------

function aoIniciar(input) {
  const proc = processoDaSessao();
  gravarJson(arquivoDeRegistro(input.session_id), {
    agent: "claude-code",
    session_id: input.session_id,
    cwd: input.cwd ?? null,
    transcript_path: input.transcript_path ?? null,
    pid: proc?.pid ?? null,
    proc_name: proc?.nome ?? null,
    proc_start: proc?.start ?? null,
    started_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    ended_at: null,
    hook_version: 1,
  });
}

/**
 * Fim de turno: bate o ponto e entrega o que o usuário mandou do celular.
 *
 * `decision: "block"` aqui não é bloqueio no sentido de barrar — é o que impede
 * a sessão de parar, fazendo o `reason` entrar como fala do usuário. Sem
 * resposta pendente saímos calados, e o turno acaba como sempre acabou.
 */
function aoParar(input) {
  const registro = lerJson(arquivoDeRegistro(input.session_id));
  if (registro) {
    registro.last_seen_at = new Date().toISOString();
    gravarJson(arquivoDeRegistro(input.session_id), registro);
  } else {
    // Hook instalado com a sessão já aberta: registra agora, sem PID (não dá
    // para provar de onde veio um turno solto), e o monitor trata como unknown.
    aoIniciar(input);
  }

  const respostas = drenarInbox(input.session_id);
  if (respostas.length === 0) return null;

  const corpo = respostas.join("\n\n");
  // `decision`/`reason` são TOP-LEVEL no evento Stop. Medido em 2026-09-05: com o
  // par aninhado em `hookSpecificOutput` o Claude Code drena o inbox e IGNORA a
  // decisão - o turno encerra e a fala do usuário some. Aninhado é a forma do
  // PreToolUse, não a deste evento.
  return {
    decision: "block",
    reason:
      "Mensagem do usuário, enviada agora pelo painel remoto (Remote Session Monitor). " +
      "Trate como se ele tivesse digitado no terminal:\n\n" +
      corpo,
  };
}

/**
 * Le a escolha do painel como decisao de permissao.
 *
 * O painel manda o ROTULO do botao que o usuario tocou ("Sim, permitir",
 * "Always allow", "Nao"), porque o mesmo canal serve para texto solto. Aqui a
 * regra e conservadora: so vira `allow` o que for inequivocamente afirmativo, e
 * so vira `deny` o que for inequivocamente negativo. Qualquer outra coisa NAO e
 * decisao — e uma frase do usuario, que volta para o inbox e chega pelo `Stop`.
 * Chutar aqui seria autorizar uma acao que ninguem autorizou.
 */
function decisaoDe(texto) {
  const t = String(texto).trim().toLowerCase();
  // A fronteira de palavra e o que separa "sim" de "simplesmente" e "nao" de "nada".
  if (/^(sim|s|pode|permit\w*|autoriz\w*|aprov\w*|liber\w*|allow|always allow|yes|y|ok)\b/.test(t))
    return "allow";
  if (/^(n[aã]o|n|neg\w*|recus\w*|bloque\w*|cancel\w*|deny|don't|dont|no)\b/.test(t)) return "deny";
  return null;
}

const arquivoPendente = (sid) => path.join(PENDING_DIR, `claude-${nomeSeguro(sid)}.json`);

/** Devolve ao inbox, na frente, o que foi tirado e nao era decisao. */
function devolverAoInbox(sid, itens) {
  if (itens.length === 0) return;
  try {
    fs.mkdirSync(INBOX_DIR, { recursive: true });
    const arq = arquivoDeInbox(sid);
    const resto = fs.existsSync(arq) ? fs.readFileSync(arq, "utf8") : "";
    const linhas = itens.map((i) => JSON.stringify(i)).join("\n");
    fs.writeFileSync(arq, `${linhas}\n${resto}`);
  } catch {
    /* perder a ordem e ruim; perder a mensagem seria pior, mas nao ha o que fazer */
  }
}

/**
 * Espera a escolha do painel antes de o modal abrir.
 *
 * Publica o pedido em `pending/` (e o que permite ao agente e ao painel saberem
 * que ESTA sessao esta parada esperando uma escolha, sem depender de adivinhar
 * pela transcricao) e fica lendo o inbox ate a escolha chegar ou o prazo virar.
 * Prazo estourado = sai calado: o modal abre como sempre abriu, e quem estiver
 * na maquina decide. O pior caso continua sendo o comportamento de hoje.
 */
function aoUsarFerramenta(input) {
  if (!PERM_LIGADO || PERM_ESPERA_MS === 0) return null;
  // Sessao que ja nao pergunta nada nao tem prompt para destravar.
  if (input.permission_mode === "bypassPermissions") return null;

  const sid = input.session_id;
  const pend = arquivoPendente(sid);
  gravarJson(pend, {
    session_id: sid,
    tool_name: input.tool_name ?? null,
    tool_use_id: input.tool_use_id ?? null,
    cwd: input.cwd ?? null,
    since: new Date().toISOString(),
    espera_ate: new Date(Date.now() + PERM_ESPERA_MS).toISOString(),
  });

  try {
    const limite = Date.now() + PERM_ESPERA_MS;
    while (Date.now() < limite) {
      const itens = drenarInboxBruto(sid);
      if (itens.length > 0) {
        const decisao = decisaoDe(itens[0]?.content ?? "");
        if (decisao) {
          devolverAoInbox(sid, itens.slice(1));
          return {
            hookSpecificOutput: {
              hookEventName: "PreToolUse",
              permissionDecision: decisao,
              permissionDecisionReason: `Escolha do usuário no painel remoto: "${String(itens[0].content).slice(0, 200)}"`,
            },
          };
        }
        // Nao era decisao: e fala. Volta para o inbox e o Stop entrega.
        devolverAoInbox(sid, itens);
        return null;
      }
      esperar(PERM_PASSO_MS);
    }
    return null;
  } finally {
    try {
      fs.unlinkSync(pend);
    } catch {
      /* ja foi */
    }
  }
}

function aoEncerrar(input) {
  const file = arquivoDeRegistro(input.session_id);
  const registro = lerJson(file);
  if (!registro) return;
  registro.ended_at = new Date().toISOString();
  registro.end_reason = input.reason ?? null;
  gravarJson(file, registro);
}

// ---------------------------------------------------------------------------
// entrada
// ---------------------------------------------------------------------------

function main(raw) {
  if (!LIGADO) return;
  const input = JSON.parse(raw || "{}");
  if (!input || typeof input.session_id !== "string" || !input.session_id) return;

  let saida = null;
  switch (input.hook_event_name) {
    case "SessionStart":
      aoIniciar(input);
      break;
    case "Stop":
      saida = aoParar(input);
      break;
    case "PreToolUse":
      saida = aoUsarFerramenta(input);
      break;
    case "SessionEnd":
      aoEncerrar(input);
      break;
    default:
      break;
  }
  if (saida) process.stdout.write(JSON.stringify(saida));
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  try {
    main(raw);
  } catch {
    // Silêncio de propósito: ver a REGRA DE OURO no topo. Uma resposta perdida é
    // um incômodo; uma sessão de Claude Code travada por hook é o trabalho do
    // usuário parado em todas as máquinas dele.
  }
  process.exit(0);
});
