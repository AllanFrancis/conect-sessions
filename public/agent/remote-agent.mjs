#!/usr/bin/env node
/**
 * Remote Session Monitor — agente local.
 *
 * Duas camadas:
 *
 *  1. SESSION MONITORING (novo) — descobre quais sessões de Claude Code e Kiro
 *     existem AGORA na máquina, com prova de vida. Não infere "processo existe
 *     logo sessão ativa": cada sessão só é dada como ativa quando há evidência
 *     cruzada (registro em disco + processo vivo + start-time batendo). O que
 *     não puder ser provado vira `unknown`, nunca um chute.
 *
 *  2. TAIL DE TRANSCRIÇÃO (existente) — lê as mensagens gravadas em disco e
 *     envia as novas para o painel, recebendo de volta as respostas remotas.
 *
 * Uso:
 *   LRC_URL=https://seu-painel.exemplo.com LRC_TOKEN=lrc_xxx node remote-agent.mjs
 *
 * Diagnóstico (não precisa de URL nem token) — imprime o que o monitor enxerga:
 *   node remote-agent.mjs --probe
 *   node remote-agent.mjs --probe --json
 *
 * Variáveis opcionais:
 *   LRC_INTERVAL=2000                    intervalo de polling em ms
 *   LRC_WATCH=/caminho1,/caminho2        pastas extras com arquivos .jsonl/.json de sessão
 *   LRC_REPLY_CMD='echo "{{reply}}"'     comando executado para cada resposta recebida
 *                                        ({{reply}} = texto, {{session}} = id da sessão)
 *   LRC_REPLY_FILE=/caminho/inbox.txt    além disso, grava cada resposta neste arquivo
 *   LRC_PROC_TTL=4000                    cache do snapshot de processos em ms
 *   LRC_MONITOR=0                        desliga a camada de session monitoring
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { exec, execFileSync } from "node:child_process";

const ARGV = process.argv.slice(2);
const PROBE = ARGV.includes("--probe");
const PROBE_JSON = ARGV.includes("--json");

const URL_BASE = (process.env.LRC_URL || "").replace(/\/$/, "");
const TOKEN = process.env.LRC_TOKEN || "";
const INTERVAL = Number(process.env.LRC_INTERVAL || 2000);
const REPLY_CMD = process.env.LRC_REPLY_CMD || "";
const REPLY_FILE = process.env.LRC_REPLY_FILE || "";
const PROC_TTL = Number(process.env.LRC_PROC_TTL || 4000);
const MONITOR_ON = process.env.LRC_MONITOR !== "0";

if (!PROBE && (!URL_BASE || !TOKEN)) {
  console.error("Defina LRC_URL e LRC_TOKEN (ou rode com --probe para só diagnosticar).");
  process.exit(1);
}

const HOME = os.homedir();
const APP_DATA = process.env.APPDATA || path.join(HOME, "AppData", "Roaming");
const IS_WIN = process.platform === "win32";

const CLAUDE_HOME = path.join(HOME, ".claude");
const CLAUDE_SESSIONS_DIR = path.join(CLAUDE_HOME, "sessions"); // <pid>.json
const CLAUDE_IDE_DIR = path.join(CLAUDE_HOME, "ide"); // <porta>.lock
const CLAUDE_PROJECTS_DIR = path.join(CLAUDE_HOME, "projects"); // <cwd-codificado>/<sessionId>.jsonl

const KIRO_HOME = path.join(HOME, ".kiro");
const KIRO_SESSIONS_DIR = path.join(KIRO_HOME, "sessions"); // <wsHash>/sess_<uuid>/
const KIRO_INDEX_DIR = path.join(KIRO_HOME, "session-index"); // <wsHash>.jsonl
const KIRO_LOGS_DIR = path.join(KIRO_HOME, "logs"); // <YYYYMMDDTHHmmssSSS>/kiro.log
const KIRO_USER_DATA = path.join(APP_DATA, "Kiro");

// ---------------------------------------------------------------------------
// utilidades
// ---------------------------------------------------------------------------

const iso = (ms) => (Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null);

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function statOf(file) {
  try {
    return fs.statSync(file);
  } catch {
    return null;
  }
}

function listDir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** FILETIME (100ns desde 1601) -> epoch ms. Usa BigInt: o valor estoura Number. */
function fileTimeToMs(ft) {
  try {
    return Number(BigInt(String(ft)) / 10000n - 11644473600000n);
  } catch {
    return null;
  }
}

/**
 * Compara dois FILETIME com tolerância de 1ms.
 * O valor exato bate quando lido via GetProcessTimes, mas o WMI trunca em
 * microssegundos. 1ms é folgado para a truncagem e impossível para reuso de PID.
 */
function sameProcStart(a, b) {
  if (a == null || b == null) return false;
  try {
    const d = BigInt(String(a)) - BigInt(String(b));
    return (d < 0n ? -d : d) <= 10000n;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// snapshot do sistema operacional (processos + locks), com cache
// ---------------------------------------------------------------------------

/**
 * Um único disparo de PowerShell traz tudo que precisamos do SO:
 *  - tabela de processos com pid/ppid/nome e o start-time em FILETIME de alta
 *    precisão (Get-Process.StartTime, não o CreationDate do WMI, que trunca);
 *  - quais kiro.log estão com handle exclusivo travado, o que identifica qual
 *    instância do Kiro está viva sem depender de heurística de horário.
 *
 * O FILETIME sai como string de propósito: 1.34e17 não cabe em Number sem perda.
 */
const PS_SNAPSHOT = `
$ErrorActionPreference='SilentlyContinue'
$start=@{}
foreach($p in Get-Process){ try{ $start[[int]$p.Id]=[string]$p.StartTime.ToFileTime() }catch{} }
$procs=@()
foreach($c in Get-CimInstance Win32_Process){
  $i=[int]$c.ProcessId
  $procs+=[PSCustomObject]@{ pid=$i; ppid=[int]$c.ParentProcessId; name=[string]$c.Name; start=$start[$i] }
}
$locked=@()
$ld=Join-Path $env:USERPROFILE '.kiro\\logs'
if(Test-Path $ld){
  foreach($d in (Get-ChildItem $ld -Directory | Sort-Object Name -Descending | Select-Object -First 8)){
    $f=Join-Path $d.FullName 'kiro.log'
    if(Test-Path $f){
      try{ $fs=[System.IO.File]::Open($f,'Open','Read','None'); $fs.Close() }
      catch{ $locked+=[string]$d.Name }
    }
  }
}
[PSCustomObject]@{ procs=$procs; kiroLockedLogs=$locked } | ConvertTo-Json -Compress -Depth 4
`;

let snapCache = { at: 0, data: null };

function osSnapshot() {
  const now = Date.now();
  if (snapCache.data && now - snapCache.at < PROC_TTL) return snapCache.data;

  let data = { procs: [], byPid: new Map(), kiroLockedLogs: [], degraded: true };
  if (IS_WIN) {
    try {
      const raw = execFileSync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", PS_SNAPSHOT],
        { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, windowsHide: true, timeout: 20000 },
      );
      const parsed = JSON.parse(raw);
      const procs = Array.isArray(parsed.procs) ? parsed.procs : [];
      const byPid = new Map();
      for (const p of procs) byPid.set(p.pid, p);
      data = {
        procs,
        byPid,
        kiroLockedLogs: [].concat(parsed.kiroLockedLogs ?? []).filter(Boolean),
        degraded: false,
      };
    } catch (err) {
      // Sem snapshot confiável nada é dado como ativo — o monitor cai para `unknown`.
      data.error = err.message;
    }
  }
  snapCache = { at: now, data };
  return data;
}

/** Pipes nomeados abertos — evidência corroborante do canal IPC do Claude Code. */
function openPipes() {
  if (!IS_WIN) return new Set();
  try {
    return new Set(fs.readdirSync("\\\\.\\pipe\\"));
  } catch {
    return new Set();
  }
}

/** Sobe a cadeia de pais a partir de um PID. Retorna a lista de PIDs ancestrais. */
function ancestorsOf(pid, byPid, limit = 12) {
  const out = [];
  let cur = byPid.get(pid);
  for (let i = 0; i < limit && cur; i++) {
    const parent = byPid.get(cur.ppid);
    if (!parent || parent.pid === cur.pid) break;
    out.push(parent.pid);
    cur = parent;
  }
  return out;
}

// ---------------------------------------------------------------------------
// modelo comum de sessão monitorada
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} MonitoredSession
 * @property {"claude-code"|"kiro"} agent
 * @property {string} session_id       id nativo do agente (não um caminho)
 * @property {"active"|"idle"|"finished"|"unknown"} status
 * @property {string|null} ide         nome da IDE, ou null quando indeterminado
 * @property {string|null} project     workspace/cwd, ou null
 * @property {number|null} pid
 * @property {string|null} started_at
 * @property {string|null} last_activity_at
 * @property {string|null} ended_at
 * @property {string} detection_source fontes usadas, separadas por "+"
 * @property {"confirmed"|"inferred"|"unknown"} confidence
 * @property {string[]} evidence       o que sustentou a conclusão
 * @property {string|null} title
 */

function emptySession(agent, sessionId) {
  return {
    agent,
    session_id: sessionId,
    status: "unknown",
    ide: null,
    project: null,
    pid: null,
    started_at: null,
    last_activity_at: null,
    ended_at: null,
    detection_source: "",
    confidence: "unknown",
    evidence: [],
    title: null,
  };
}

// ---------------------------------------------------------------------------
// adaptador: CLAUDE CODE
// ---------------------------------------------------------------------------

/**
 * O Claude Code registra cada processo em ~/.claude/sessions/<pid>.json com
 * sessionId, cwd, startedAt e procStart (FILETIME de criação do processo).
 *
 * O arquivo NÃO prova que a sessão existe: saída limpa remove o arquivo, mas
 * kill abrupto o deixa órfão no disco (verificado — ver docs/session-monitoring.md).
 * Por isso a vida é confirmada por PID vivo + procStart idêntico, o que também
 * elimina reuso de PID.
 */

/** Lê os locks de IDE: ~/.claude/ide/<porta>.lock -> pid da IDE, nome, workspaces. */
function claudeIdeLocks() {
  const out = [];
  for (const entry of listDir(CLAUDE_IDE_DIR)) {
    if (!entry.isFile() || !entry.name.endsWith(".lock")) continue;
    const data = readJson(path.join(CLAUDE_IDE_DIR, entry.name));
    if (!data || typeof data.pid !== "number") continue;
    out.push({
      port: entry.name.replace(/\.lock$/, ""),
      pid: data.pid,
      ideName: typeof data.ideName === "string" ? data.ideName : null,
      workspaceFolders: Array.isArray(data.workspaceFolders) ? data.workspaceFolders : [],
    });
  }
  return out;
}

/** Localiza a transcrição de uma sessão sem depender da codificação do nome da pasta. */
function claudeTranscriptFor(sessionId) {
  for (const entry of listDir(CLAUDE_PROJECTS_DIR)) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(CLAUDE_PROJECTS_DIR, entry.name, `${sessionId}.jsonl`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function detectClaudeSessions(snap, pipes) {
  const sessions = [];
  const locks = claudeIdeLocks();
  const liveLocks = locks.filter((l) => !snap.degraded && snap.byPid.has(l.pid));

  for (const entry of listDir(CLAUDE_SESSIONS_DIR)) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const file = path.join(CLAUDE_SESSIONS_DIR, entry.name);
    const reg = readJson(file);
    if (!reg || typeof reg.sessionId !== "string" || typeof reg.pid !== "number") continue;

    const s = emptySession("claude-code", reg.sessionId);
    const sources = ["claude:pid-registry"];
    s.pid = reg.pid;
    s.project = typeof reg.cwd === "string" ? reg.cwd : null;
    s.title = typeof reg.name === "string" ? reg.name : null;
    s.started_at = iso(reg.startedAt) ?? iso(fileTimeToMs(reg.procStart));

    // --- prova de vida ---------------------------------------------------
    const proc = snap.degraded ? null : snap.byPid.get(reg.pid);
    const startMatches = proc ? sameProcStart(proc.start, reg.procStart) : false;
    const isClaudeProc = proc ? /^claude(\.exe)?$/i.test(proc.name || "") : false;
    let alive = false;

    if (snap.degraded) {
      s.evidence.push("snapshot de processos indisponível: vida não verificável");
    } else if (!proc) {
      s.evidence.push(`PID ${reg.pid} não existe: registro órfão`);
    } else if (!startMatches) {
      s.evidence.push(
        `PID ${reg.pid} existe mas com outro start-time: PID reciclado, não é a sessão`,
      );
    } else if (!isClaudeProc) {
      s.evidence.push(`PID ${reg.pid} tem start-time igual mas nome "${proc.name}": inconsistente`);
    } else {
      alive = true;
      sources.push("claude:process");
      s.evidence.push(`PID ${reg.pid} vivo com procStart idêntico (${reg.procStart})`);
    }

    // Pipe IPC declarado pelo próprio registro — corrobora, não decide sozinho.
    if (typeof reg.messagingSocketPath === "string") {
      const pipeName = reg.messagingSocketPath.split("\\").pop();
      if (pipeName && pipes.has(pipeName)) {
        sources.push("claude:ipc-pipe");
        s.evidence.push(`pipe IPC ${pipeName} aberto`);
      }
    }

    // --- IDE de origem: cadeia de pais até um dono de lock ----------------
    if (alive) {
      const chain = ancestorsOf(reg.pid, snap.byPid);
      const owner = liveLocks.find((l) => chain.includes(l.pid));
      if (owner) {
        s.ide = owner.ideName;
        sources.push("claude:ide-lock");
        s.evidence.push(
          `ancestral PID ${owner.pid} é dono do lock ${owner.port} (${owner.ideName})`,
        );
        if (!s.project && owner.workspaceFolders.length === 1)
          s.project = owner.workspaceFolders[0];
      } else if (reg.entrypoint === "claude-cli") {
        s.ide = "CLI";
        s.evidence.push("entrypoint=claude-cli: sessão de terminal, sem IDE");
      } else {
        // entrypoint diz a família ("claude-vscode"), não qual IDE concreta.
        s.evidence.push(
          `sem lock de IDE viva na cadeia de pais (entrypoint=${reg.entrypoint ?? "?"})`,
        );
      }
    }

    // --- atividade --------------------------------------------------------
    const transcript = claudeTranscriptFor(reg.sessionId);
    if (transcript) {
      const st = statOf(transcript);
      if (st) {
        sources.push("claude:transcript");
        s.last_activity_at = iso(st.mtimeMs);
      }
    }

    // --- status -----------------------------------------------------------
    if (snap.degraded) {
      s.status = "unknown";
      s.confidence = "unknown";
    } else if (!alive) {
      // Sabemos que não está viva. Quando terminou, não sabemos: o registro
      // órfão não carrega horário de morte. Fica null, não um palpite.
      s.status = "finished";
      s.confidence = "confirmed";
    } else {
      const idleMs = s.last_activity_at ? Date.now() - Date.parse(s.last_activity_at) : Infinity;
      s.status = idleMs < 60000 ? "active" : "idle";
      s.confidence = transcript ? "confirmed" : "inferred";
      if (!transcript) s.evidence.push("transcrição não encontrada: atividade não medida");
    }

    s.detection_source = sources.join("+");
    sessions.push(s);
  }

  return sessions;
}

// ---------------------------------------------------------------------------
// adaptador: KIRO
// ---------------------------------------------------------------------------

/**
 * O Kiro grava ~/.kiro/sessions/<wsHash>/sess_<uuid>/session.json com um campo
 * `status` escrito pela própria aplicação (in_progress | idle | failed), mais
 * createdAt, lastModifiedAt e workspacePaths. O índice append-only
 * ~/.kiro/session-index/<wsHash>.jsonl registra criação e remoção.
 *
 * `status` sozinho não prova vida: se o Kiro morrer no meio de um turno, o
 * arquivo fica congelado em "in_progress". Por isso `in_progress` só vira
 * `active` quando existe uma instância do Kiro viva cujo kiro.log está com
 * handle travado E menciona aquele sessionId. Sem isso, vira `unknown`.
 */

/** Pastas abertas nas janelas do Kiro, lidas do storage.json do user-data-dir. */
function kiroOpenFolders() {
  const store = readJson(path.join(KIRO_USER_DATA, "User", "globalStorage", "storage.json"));
  if (!store) return null; // null = não determinável (≠ conjunto vazio)
  const uris = [];
  const ws = store.windowsState ?? {};
  if (ws.lastActiveWindow?.folder) uris.push(ws.lastActiveWindow.folder);
  for (const w of ws.openedWindows ?? []) if (w?.folder) uris.push(w.folder);
  for (const f of store.backupWorkspaces?.folders ?? []) if (f?.folderUri) uris.push(f.folderUri);

  const out = new Set();
  for (const uri of uris) {
    try {
      const p = decodeURIComponent(String(uri).replace(/^file:\/\/\//, ""));
      out.add(p.replace(/\//g, "\\").toLowerCase());
    } catch {
      /* uri ilegível: ignorada */
    }
  }
  return out;
}

function kiroLiveInstance(snap) {
  const lockFile = path.join(KIRO_USER_DATA, "code.lock");
  let mainPid = null;
  try {
    mainPid = Number(fs.readFileSync(lockFile, "utf8").trim()) || null;
  } catch {
    /* sem code.lock */
  }
  if (!mainPid || snap.degraded) return null;
  const proc = snap.byPid.get(mainPid);
  if (!proc || !/^kiro(\.exe)?$/i.test(proc.name || "")) return null;

  // Qual pasta de log pertence a esta instância: a que está com handle travado.
  const lockedDirs = snap.kiroLockedLogs;
  const logDir = lockedDirs.length > 0 ? path.join(KIRO_LOGS_DIR, lockedDirs[0]) : null;

  let logTail = "";
  if (logDir) {
    const logFile = path.join(logDir, "kiro.log");
    const st = statOf(logFile);
    if (st) {
      try {
        const size = Math.min(st.size, 512 * 1024);
        const fd = fs.openSync(logFile, "r");
        const buf = Buffer.alloc(size);
        fs.readSync(fd, buf, 0, size, st.size - size);
        fs.closeSync(fd);
        logTail = buf.toString("utf8");
      } catch {
        /* log ocupado: seguimos sem o refinamento */
      }
    }
  }

  return { pid: mainPid, logDir, logTail, lockedDirs, openFolders: kiroOpenFolders() };
}

/** Última linha do log que fala desta sessão — refina active vs waiting. */
function kiroLastEvent(logTail, sessionId) {
  if (!logTail || !sessionId) return null;
  const needle = `"rootConversationId":"${sessionId}"`;
  const lines = logTail.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes(needle)) return lines[i];
  }
  return null;
}

/** Lê o índice append-only e devolve o último op por sessão. */
function kiroIndexOps() {
  const map = new Map(); // sessionId -> { op, at }
  for (const entry of listDir(KIRO_INDEX_DIR)) {
    if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
    let raw;
    try {
      raw = fs.readFileSync(path.join(KIRO_INDEX_DIR, entry.name), "utf8");
    } catch {
      continue;
    }
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      let rec;
      try {
        rec = JSON.parse(line);
      } catch {
        continue;
      }
      const id = String(rec.sessionPath ?? "")
        .split("/")
        .pop();
      if (!id) continue;
      map.set(id, { op: rec.op, at: rec.at });
    }
  }
  return map;
}

function detectKiroSessions(snap) {
  const sessions = [];
  const live = kiroLiveInstance(snap);
  const indexOps = kiroIndexOps();

  for (const wsEntry of listDir(KIRO_SESSIONS_DIR)) {
    if (!wsEntry.isDirectory()) continue;
    const wsDir = path.join(KIRO_SESSIONS_DIR, wsEntry.name);

    for (const sessEntry of listDir(wsDir)) {
      if (!sessEntry.isDirectory()) continue;
      const sessDir = path.join(wsDir, sessEntry.name);
      const meta = readJson(path.join(sessDir, "session.json"));
      if (!meta || typeof meta.id !== "string") continue;

      const s = emptySession("kiro", meta.id);
      const sources = ["kiro:session-file"];
      s.title = typeof meta.title === "string" ? meta.title : null;
      s.project =
        Array.isArray(meta.workspacePaths) && meta.workspacePaths.length === 1
          ? meta.workspacePaths[0]
          : Array.isArray(meta.rootPaths) && meta.rootPaths.length === 1
            ? meta.rootPaths[0]
            : null;
      s.started_at = meta.createdAt ?? null;
      s.last_activity_at = meta.lastModifiedAt ?? null;

      const msgStat = statOf(path.join(sessDir, "messages.jsonl"));
      if (msgStat) {
        sources.push("kiro:messages");
        const fromFile = iso(msgStat.mtimeMs);
        if (fromFile && (!s.last_activity_at || fromFile > s.last_activity_at)) {
          s.last_activity_at = fromFile;
        }
      }

      const idx = indexOps.get(meta.id);
      if (idx) {
        sources.push("kiro:session-index");
        if (idx.op === "add" && !s.started_at) s.started_at = iso(idx.at);
        if (idx.op === "remove") {
          s.ended_at = iso(idx.at);
          s.evidence.push(`índice registra remoção em ${s.ended_at}`);
        }
      }

      // A IDE é o próprio Kiro; só afirmamos isso quando a sessão é dele.
      s.ide = "Kiro";
      // O Kiro não expõe PID por sessão — o processo é o da IDE inteira. Só o
      // anexamos quando a sessão pertence à instância viva (definido abaixo).

      const declared = typeof meta.status === "string" ? meta.status : null;
      s.evidence.push(`session.json status=${declared ?? "ausente"}`);

      if (idx && idx.op === "remove") {
        s.status = "finished";
        s.confidence = "confirmed";
      } else if (!live) {
        sources.push("kiro:process");
        if (snap.degraded) {
          s.status = "unknown";
          s.confidence = "unknown";
          s.evidence.push("snapshot indisponível: vida do Kiro não verificável");
        } else if (declared === "idle" || declared === "failed") {
          // A aplicação escreveu um estado terminal e não há Kiro rodando.
          s.status = "finished";
          s.confidence = "confirmed";
          s.evidence.push("nenhuma instância do Kiro viva");
        } else {
          // Congelou em in_progress (ou schema antigo sem status) sem processo:
          // o turno foi interrompido e o fim nunca foi gravado.
          s.status = "unknown";
          s.confidence = "unknown";
          s.evidence.push("sem Kiro vivo e sem estado terminal gravado: fim desconhecido");
        }
      } else {
        sources.push("kiro:process", "kiro:log-lock");
        const last = kiroLastEvent(live.logTail, meta.id);
        const inLiveLog = last !== null;
        const wsOpen =
          live.openFolders && s.project
            ? live.openFolders.has(s.project.replace(/\//g, "\\").toLowerCase())
            : null;

        if (!inLiveLog) {
          // O Kiro roda mas nunca tocou nesta sessão nesta execução. Se o
          // workspace dela nem está aberto, acabou. Se está aberto, a aba pode
          // estar aberta e intocada — e isso o disco não conta: fica unknown.
          sources.push("kiro:open-folders");
          if (wsOpen === false) {
            s.status = "finished";
            s.confidence = "confirmed";
            s.evidence.push("workspace não está aberto em nenhuma janela do Kiro");
          } else if (wsOpen === true) {
            s.status = "unknown";
            s.confidence = "unknown";
            s.evidence.push(
              "workspace aberto mas sessão ausente do log desta execução: aba aberta e intocada é indistinguível de aba fechada",
            );
          } else {
            s.status = "unknown";
            s.confidence = "unknown";
            s.evidence.push("não foi possível determinar as pastas abertas no Kiro");
          }
        } else if (declared === "in_progress") {
          s.pid = live.pid;
          s.status = "active";
          s.confidence = "confirmed";
          if (last.includes("ToolApproval] Requesting permission")) {
            s.evidence.push("último evento: aguardando aprovação de ferramenta pelo usuário");
          } else if (last.includes("model.invoke.start")) {
            s.evidence.push("último evento: turno em execução no modelo");
          }
          s.evidence.push("presente no log da instância viva do Kiro");
        } else if (declared === "idle") {
          s.pid = live.pid;
          s.status = "idle";
          s.confidence = "confirmed";
          s.evidence.push("aberta na instância viva, sem turno em andamento");
        } else if (declared === "failed") {
          s.status = "finished";
          s.confidence = "confirmed";
        } else {
          s.status = "unknown";
          s.confidence = "unknown";
        }
      }

      s.detection_source = sources.join("+");
      sessions.push(s);
    }
  }

  return sessions;
}

// ---------------------------------------------------------------------------
// monitor: junta os adaptadores e acompanha o encerramento
// ---------------------------------------------------------------------------

/**
 * Sessões vistas vivas antes. Quando uma some ou vira `finished` sem ended_at,
 * o horário da última observação viva é o melhor limite superior que temos —
 * e é marcado como `inferred`, nunca como fato.
 * @type {Map<string, {lastAliveAt: number}>}
 */
const seenAlive = new Map();

function monitorScan() {
  const snap = osSnapshot();
  const pipes = openPipes();
  const found = [...detectClaudeSessions(snap, pipes), ...detectKiroSessions(snap)];

  const now = Date.now();
  const present = new Set();

  for (const s of found) {
    const key = `${s.agent}:${s.session_id}`;
    present.add(key);
    if (s.status === "active" || s.status === "idle") {
      seenAlive.set(key, { lastAliveAt: now });
      s.ended_at = null;
    } else if (s.status === "finished" && !s.ended_at) {
      const prev = seenAlive.get(key);
      if (prev) {
        s.ended_at = iso(prev.lastAliveAt);
        s.evidence.push("fim estimado pela última observação viva deste agente");
        if (s.confidence === "confirmed") s.confidence = "inferred";
      }
    }
  }

  // Sessões que sumiram do disco entre dois scans: saída limpa remove o registro.
  for (const [key, prev] of seenAlive) {
    if (present.has(key)) continue;
    const [agent, ...rest] = key.split(":");
    const s = emptySession(agent, rest.join(":"));
    s.status = "finished";
    s.confidence = "inferred";
    s.ended_at = iso(prev.lastAliveAt);
    s.detection_source = "monitor:desaparecimento";
    s.evidence.push("registro removido do disco após ter sido observado vivo");
    found.push(s);
    seenAlive.delete(key);
  }

  return found;
}

// ---------------------------------------------------------------------------
// tail de transcrição (camada existente)
// ---------------------------------------------------------------------------

const EXTRA_DIRS = (process.env.LRC_WATCH || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const DEFAULT_DIRS = [
  CLAUDE_PROJECTS_DIR,
  KIRO_SESSIONS_DIR,
  path.join(KIRO_HOME, "spec-sessions"),
];

const DIRS = [...DEFAULT_DIRS, ...EXTRA_DIRS].filter((d) => fs.existsSync(d));

/** @type {Map<string, number>} arquivo -> quantas linhas/itens já enviados */
const sent = new Map();

function walk(dir, out = []) {
  for (const entry of listDir(dir)) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(jsonl|json|chat)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

function sourceOf(file) {
  if (file.startsWith(CLAUDE_PROJECTS_DIR)) return "claude-code";
  if (file.startsWith(KIRO_HOME)) return "kiro";
  return "unknown";
}

/**
 * Id nativo da sessão a partir do caminho do arquivo. É o que casa a transcrição
 * com o que o monitor descobriu — por isso não usamos mais o caminho como chave.
 *   Claude Code: ~/.claude/projects/<cwd-codificado>/<sessionId>.jsonl
 *   Kiro:        ~/.kiro/sessions/<wsHash>/sess_<uuid>/messages.jsonl
 */
function nativeIdOf(file) {
  const src = sourceOf(file);
  if (src === "claude-code") {
    const base = path.basename(file, path.extname(file));
    return /^[0-9a-f-]{36}$/i.test(base) ? { id: base, agent: src } : null;
  }
  if (src === "kiro") {
    const dir = path.basename(path.dirname(file));
    return dir.startsWith("sess_") ? { id: dir, agent: src } : null;
  }
  return null;
}

function projectOf(file) {
  const dir = path.dirname(file);
  const folder = path.basename(dir);
  if (sourceOf(file) === "claude-code" && /^[A-Za-z]-{1,2}/.test(folder)) {
    // Claude Code codifica o cwd no nome da pasta trocando separadores por "-".
    // A decodificação é ambígua (não dá pra distinguir "-" original de separador),
    // então isto é só um rótulo; o cwd confiável vem do registro por PID.
    const decoded = folder.replace(/^([A-Za-z])--/, "$1:/").replaceAll("-", "/");
    return { name: path.basename(decoded) || folder, cwd: decoded };
  }
  return { name: folder, cwd: dir };
}

/**
 * Prefixos com que o Claude Code devolve a escolha do AskUserQuestion.
 *
 * SAO DOIS, nao um. Contados nas transcricoes reais desta maquina:
 *   474x  "Your questions have been answered:"
 *    20x  "The user answered:"
 * Reconhecer so o primeiro tem custo duplo, e os dois apareceram no painel: a
 * frase em ingles vaza como fala do usuario, E a pergunta continua parecendo
 * sem resposta, convidando a responder de novo algo ja respondido no terminal.
 * Achado no passe de browser, nao no harness — a fixture so tinha o primeiro.
 */
const ANSWER_PREFIXES = ["Your questions have been answered:", "The user answered:"];

/** Se este texto de tool_result e o marcador de resposta do AskUserQuestion. */
function isAnswerText(text) {
  return ANSWER_PREFIXES.some((prefix) => text.startsWith(prefix));
}

/**
 * Pares `"pergunta"="resposta"` de dentro do tool_result do AskUserQuestion.
 * Em multiSelect a resposta ja vem com as opcoes separadas por virgula.
 *
 * ATENCAO: e o ultimo recurso. A frase do CLI NAO escapa aspas dentro do texto
 * da pergunta, entao um enunciado como
 *   "E o vazamento (416 msgs "queue-operation")?"="Corrigir junto"
 * e ambiguo por construcao e faz o regex escorregar, produzindo chave lixo.
 * Visto em transcricao real desta maquina. Prefira sempre `toolUseResult`.
 */
function parseAnswers(text) {
  const answers = {};
  for (const m of text.matchAll(/"((?:[^"\\]|\\.)*)"="((?:[^"\\]|\\.)*)"/g)) {
    answers[m[1]] = m[2];
  }
  return Object.keys(answers).length ? answers : null;
}

/**
 * As respostas do AskUserQuestion, preferindo a fonte estruturada.
 *
 * O Claude Code grava `toolUseResult.answers` como objeto JSON de verdade, na
 * mesma linha do tool_result — exato, sem ambiguidade de aspas. O regex sobre a
 * frase em ingles fica so para transcricao que nao traga esse campo.
 */
function answersOf(obj, text) {
  const structured = obj?.toolUseResult?.answers;
  if (structured && typeof structured === "object" && !Array.isArray(structured)) {
    return Object.keys(structured).length ? structured : null;
  }
  return parseAnswers(text);
}

// ---------------------------------------------------------------------------
// adaptador de transcricao: KIRO
// ---------------------------------------------------------------------------

/**
 * Rotulo, descricao e id de uma opcao do Kiro.
 *
 * Duas formas convivem no mesmo arquivo: a aprovacao de ferramenta grava
 * `{optionId, name, kind}` e a pergunta ao usuario grava
 * `{title, description, recommended}`. O `optionId` viaja junto porque e ele —
 * e nao o rotulo — que o `interaction_resolved` devolve na aprovacao.
 */
function kiroOption(opt) {
  if (!opt || typeof opt !== "object") return null;
  const label =
    typeof opt.name === "string" ? opt.name : typeof opt.title === "string" ? opt.title : null;
  if (!label) return null;
  return {
    label,
    ...(typeof opt.description === "string" && opt.description
      ? { description: opt.description }
      : {}),
    ...(typeof opt.optionId === "string" ? { id: opt.optionId } : {}),
  };
}

/**
 * Quantos caracteres de saída de ferramenta atravessam para o painel.
 *
 * A mediana real é 339 e o p90 é 5746, mas um `read_file` de arquivo grande
 * chega a 78 mil — e a transcrição inteira é repolida a cada 2s no celular.
 * O corte é declarado na UI ("saída (truncada)"), nunca silencioso.
 */
const KIRO_RESULT_MAX = 4000;

/** Chaves de `args` que identificam a chamada, da mais específica à mais geral. */
const KIRO_ARG_KEYS = [
  "path",
  "targetFile",
  "command",
  "query",
  "url",
  "requirementsFilePath",
  "files",
  "name",
  "action",
  "title",
];

/**
 * O QUE a ferramenta operou, em uma linha: o caminho do read_file, o comando do
 * execute_pwsh, a query do grep_search. Despejar `args` inteiro seria o ruido
 * bruto que nao queremos; sem nada, "Read File" repetido 145x nao diz nada.
 */
function kiroTarget(args) {
  if (!args || typeof args !== "object") return null;
  for (const key of KIRO_ARG_KEYS) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return value.slice(0, 300);
    if (Array.isArray(value) && value.every((v) => typeof v === "string") && value.length)
      return value.join(", ").slice(0, 300);
  }
  return null;
}

/**
 * Indice `toolCallId -> payload do tool_call` do arquivo INTEIRO.
 *
 * O `tool_result` do Kiro NAO carrega o nome da ferramenta — so `toolCallId`,
 * `content` e `success`. Quem sabe o que foi chamado e o `tool_call`, que veio
 * antes. Indexar o arquivo todo (e nao so as linhas novas do tick) e o que
 * garante a associacao mesmo quando a chamada foi lida num tick anterior: sem
 * isso o resultado chegaria orfao, sem dizer de que interacao ele e.
 */
function kiroToolCalls(lines) {
  const index = new Map();
  for (const line of lines) {
    // Filtro barato antes do JSON.parse: o arquivo inteiro passa aqui a cada tick.
    if (!line.includes('"tool_call"')) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const payload = obj?.payload;
    if (payload?.type === "tool_call" && typeof payload.toolCallId === "string") {
      index.set(payload.toolCallId, payload);
    }
  }
  return index;
}

/** Rotulo do tipo de interacao, para a UI dizer o que esta sendo perguntado. */
// Este texto vai para a TELA, entao leva acento — ao contrario dos comentarios
// deste arquivo, que sao ASCII por convencao dele.
const KIRO_ASK_HEADER = { tool_approval: "aprovar ação", user_input: "pergunta" };

/**
 * Traduz uma linha do `messages.jsonl` do Kiro.
 *
 * O Kiro NAO usa o envelope do Claude Code: cada linha e
 * `{id, timestamp, payload:{type, ...}}` e o texto mora em `payload.content`.
 * Sem este adaptador o `normalize()` procurava `obj.role`/`obj.content`, achava
 * `undefined` nos dois e descartava a linha — as 2761 linhas de transcricao do
 * Kiro desta maquina viravam ZERO mensagem, e o painel mostrava a sessao vazia.
 *
 * Vira mensagem o que e conversa mais o RESULTADO de ferramenta, dobrado com a
 * chamada que o originou. `turn_start/end`, `session_metadata`,
 * `usage_summary`, `sub_agent_*`, `steering_inclusion` e `session_start` sao
 * infraestrutura da IDE e seguem invisiveis; o `tool_call` sozinho tambem, por
 * viver dentro do `tool_result` que ele produziu.
 */
function normalizeKiro(obj, payload, ctx) {
  const externalId = typeof obj.id === "string" ? obj.id : null;
  const build = (role, text, meta) => {
    const content = typeof text === "string" ? text : "";
    if (!content.trim() && !meta) return null;
    return {
      role,
      content: content.slice(0, 100000),
      external_id: externalId,
      ...(meta ? { meta } : {}),
    };
  };

  if (payload.type === "user") return build("user", payload.content, null);

  if (payload.type === "assistant") {
    // `Say` e a fala e `Reasoning` e o pensamento. Os dois entram: no Kiro o
    // Say costuma ser so emenda ("Agora o servidor:") e a narrativa inteira
    // mora no Reasoning — 306 de 413 blocos nesta maquina. Vai marcado, para a
    // UI desenhar pensamento diferente de resposta em vez de misturar os dois.
    const meta = payload.operationType === "Reasoning" ? { kind: "reasoning" } : null;
    return build("assistant", payload.content, meta);
  }

  if (payload.type === "pending_interaction") {
    if (typeof payload.question !== "string" || !payload.question.trim()) return null;
    const options = (Array.isArray(payload.options) ? payload.options : [])
      .map(kiroOption)
      .filter(Boolean);
    if (!options.length) return null;
    // Reusa o mesmo `meta.ask` do AskUserQuestion: a UI ja sabe desenhar isto.
    // O Kiro nao tem multiSelect nesta estrutura — uma escolha por interacao.
    return build("assistant", "", {
      ask: [
        {
          question: payload.question,
          header: KIRO_ASK_HEADER[payload.interactionType] ?? payload.interactionType ?? null,
          multiSelect: false,
          options,
        },
      ],
      tool_use_id: typeof payload.toolCallId === "string" ? payload.toolCallId : null,
    });
  }

  if (payload.type === "interaction_resolved") {
    if (typeof payload.toolCallId !== "string") return null;
    // O Kiro nao repete o enunciado aqui, entao nao da para montar o mapa
    // `{pergunta: resposta}` do Claude Code. O que ele da e a escolha crua: o
    // rotulo na pergunta ao usuario, o `optionId` na aprovacao de ferramenta.
    // A UI casa por rotulo OU por id; `cancelled` vem sem escolha nenhuma e
    // tranca a pergunta sem marcar opcao, que e a verdade do que aconteceu.
    return build("user", "", {
      answers_tool_use_id: payload.toolCallId,
      answer: typeof payload.selectedOption === "string" ? payload.selectedOption : null,
      outcome: typeof payload.outcome === "string" ? payload.outcome : null,
    });
  }

  if (payload.type === "tool_result") {
    if (typeof payload.toolCallId !== "string") return null;
    // Chamada e resultado viram UMA mensagem, na posicao do resultado. O
    // `tool_call` sozinho nao vira nada: ele so anuncia "vou fazer", e a linha
    // seguinte ja diz o que aconteceu. Dobrar os dois preserva a ordem da sessao
    // e prende o resultado na interacao a que ele pertence — o `call_id` e o
    // MESMO id da aprovacao, quando a chamada precisou de uma.
    const call = ctx?.toolCalls?.get(payload.toolCallId);
    const raw = typeof payload.content === "string" ? payload.content : "";
    // `{}` e como o Kiro grava "sem saida"; nao e saida com chaves dentro.
    const text = raw.trim() === "{}" ? "" : raw;
    return build("assistant", text.slice(0, KIRO_RESULT_MAX), {
      tool: {
        call_id: payload.toolCallId,
        name: typeof call?.toolName === "string" ? call.toolName : null,
        title: typeof call?.title === "string" ? call.title : null,
        kind: typeof call?.kind === "string" ? call.kind : null,
        target: kiroTarget(call?.args),
        ok: payload.success !== false,
        truncated: text.length > KIRO_RESULT_MAX,
      },
    });
  }

  return null;
}

/**
 * Varre o array de content em vez de achata-lo.
 *
 * O achatamento antigo (`p.text ?? p.content`) jogava fora todo bloco
 * `tool_use`: uma pergunta de escolha nao tem `text`, entao a mensagem inteira
 * virava null e sumia do painel. Aqui o texto continua sendo concatenado como
 * antes, e o que e estrutura (a pergunta, e a prova de qual opcao foi
 * escolhida) sai em `meta`, para a UI desenhar botoes de verdade.
 */
function normalize(obj, ctx) {
  if (!obj || typeof obj !== "object") return null;
  // O Kiro tem envelope proprio; o resto desta funcao e o do Claude Code.
  if (obj.payload && typeof obj.payload === "object" && typeof obj.payload.type === "string") {
    return normalizeKiro(obj, obj.payload, ctx);
  }
  const node = obj.message && typeof obj.message === "object" ? obj.message : obj;
  const role = node.role || obj.type || obj.sender || "assistant";
  let content = node.content ?? node.text ?? obj.text ?? obj.content;
  let meta = null;

  if (Array.isArray(content)) {
    const texts = [];
    for (const part of content) {
      if (typeof part === "string") {
        texts.push(part);
        continue;
      }
      if (!part || typeof part !== "object") continue;

      if (part.type === "tool_use" && part.name === "AskUserQuestion") {
        const questions = part.input?.questions;
        if (Array.isArray(questions) && questions.length) {
          meta = { ...(meta ?? {}), ask: questions, tool_use_id: part.id ?? null };
        }
        continue;
      }

      const inner = part.text ?? part.content ?? "";
      // A resposta de uma pergunta de escolha chega como tool_result cujo texto
      // e uma frase em ingles do proprio CLI. Ela nao e fala do usuario: vira
      // marcador estruturado, e o texto some da transcricao.
      if (part.type === "tool_result" && typeof inner === "string" && isAnswerText(inner)) {
        meta = {
          ...(meta ?? {}),
          answers_tool_use_id: part.tool_use_id ?? null,
          answers: answersOf(obj, inner),
        };
        continue;
      }
      if (typeof inner === "string" && inner) texts.push(inner);
    }
    content = texts.join("\n");
  }

  if (typeof content !== "string") content = "";
  // So descarta quando nao sobrou NADA. Antes, mensagem sem texto era
  // descartada mesmo carregando a pergunta.
  if (!content.trim() && !meta) return null;

  return {
    role: role === "human" ? "user" : role,
    content: content.slice(0, 100000),
    external_id: obj.uuid || obj.id || null,
    ...(meta ? { meta } : {}),
  };
}

function readNew(file) {
  const raw = fs.readFileSync(file, "utf8");
  if (/\.(json|chat)$/i.test(file)) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { messages: [] };
    }
    const candidates = Array.isArray(parsed)
      ? parsed
      : (parsed.messages ??
        parsed.events ??
        parsed.history ??
        parsed.conversation?.messages ??
        parsed.chat?.messages ?? [parsed]);
    const items = Array.isArray(candidates) ? candidates : [candidates];
    const start = sent.get(file) ?? 0;
    const messages = items
      .slice(start)
      .map((item, i) => {
        const message = normalize(item);
        return message ? { ...message, seq: start + i } : null;
      })
      .filter(Boolean);
    sent.set(file, items.length);
    return { messages };
  }

  const lines = raw.split("\n").filter((l) => l.trim());
  const start = sent.get(file) ?? 0;
  const fresh = lines.slice(start);
  // O indice cobre o arquivo INTEIRO, nao so as linhas novas: a chamada pode ter
  // sido lida num tick anterior e o resultado chegar so agora.
  const ctx = sourceOf(file) === "kiro" ? { toolCalls: kiroToolCalls(lines) } : undefined;
  sent.set(file, lines.length);
  const messages = [];
  fresh.forEach((line, i) => {
    try {
      const parsed = JSON.parse(line);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        const m = normalize(item, ctx);
        if (m) messages.push({ ...m, seq: start + i });
      }
    } catch {
      /* linha parcial: será relida na próxima passagem */
      sent.set(file, start + i);
    }
  });
  return { messages };
}

// ---------------------------------------------------------------------------
// envio
// ---------------------------------------------------------------------------

async function postSync(session, messages) {
  const res = await fetch(`${URL_BASE}/api/public/agent/sync`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: TOKEN, session, messages }),
  });
  if (!res.ok) {
    console.error("sync falhou:", res.status, await res.text());
    return null;
  }
  return res.json();
}

function deliverReplies(data, label) {
  for (const reply of data?.replies ?? []) {
    console.log(`\n>> resposta remota para ${label}:\n${reply.content}\n`);
    if (REPLY_FILE) fs.appendFileSync(REPLY_FILE, `${reply.content}\n`);
    if (REPLY_CMD) {
      const cmd = REPLY_CMD.replaceAll("{{reply}}", reply.content.replace(/"/g, '\\"')).replaceAll(
        "{{session}}",
        data.session_id,
      );
      exec(cmd, (err) => err && console.error("comando de resposta falhou:", err.message));
    }
  }
}

/**
 * Normaliza para ISO-8601 UTC. Datas vêm de arquivos de terceiros (Kiro escreve
 * `lastModifiedAt` do jeito dele): uma string fora do padrão faria o zod do
 * endpoint rejeitar o payload inteiro. Ilegível vira null, que é a verdade.
 */
function safeIso(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function sessionPayload(m) {
  return {
    external_id: `${m.agent}:${m.session_id}`,
    source: m.agent,
    title: (m.title || m.session_id).slice(0, 200),
    cwd: m.project ? m.project.slice(0, 500) : null,
    status: m.status,
    ide: m.ide,
    pid: m.pid,
    started_at: safeIso(m.started_at),
    last_activity_at: safeIso(m.last_activity_at),
    ended_at: safeIso(m.ended_at),
    detection_source: m.detection_source.slice(0, 200) || null,
    detection_confidence: m.confidence,
  };
}

async function tick() {
  const monitored = MONITOR_ON ? monitorScan() : [];
  const byId = new Map(monitored.map((m) => [`${m.agent}:${m.session_id}`, m]));

  // 1) mensagens novas das transcrições, casadas com a sessão monitorada
  const files = DIRS.flatMap((d) => walk(d));
  const dayAgo = Date.now() - 1000 * 60 * 60 * 24;
  const handled = new Set();

  for (const file of files) {
    const st = statOf(file);
    if (!st || st.mtimeMs < dayAgo) continue;
    const native = nativeIdOf(file);
    if (!native) continue;
    const key = `${native.agent}:${native.id}`;

    try {
      const { messages } = readNew(file);
      if (messages.length === 0) continue;
      handled.add(key);

      const monitor = byId.get(key);
      const project = projectOf(file);
      const session = monitor
        ? sessionPayload(monitor)
        : {
            // Sem o monitor não sabemos o estado: dizemos isso, não chutamos.
            external_id: key,
            source: native.agent,
            title: project.name.slice(0, 200),
            cwd: project.cwd.slice(0, 500),
            status: "unknown",
            ide: null,
            pid: null,
            started_at: null,
            last_activity_at: iso(st.mtimeMs),
            ended_at: null,
            detection_source: "transcript-only",
            detection_confidence: "unknown",
          };

      for (let i = 0; i < messages.length; i += 200) {
        const data = await postSync(session, messages.slice(i, i + 200));
        if (i === 0) deliverReplies(data, path.basename(file));
      }
    } catch (err) {
      console.error("erro em", file, err.message);
    }
  }

  // 2) estado das sessões monitoradas que não tiveram mensagem nova neste tick
  for (const [key, m] of byId) {
    if (handled.has(key)) continue;
    if (m.status === "unknown" && !m.last_activity_at) continue; // nada a dizer
    try {
      const data = await postSync(sessionPayload(m), []);
      deliverReplies(data, m.title || m.session_id);
    } catch (err) {
      console.error("erro ao sincronizar", key, err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// modo --probe: confronta o que o monitor vê com o que está aberto na IDE
// ---------------------------------------------------------------------------

function probe() {
  const snap = osSnapshot();
  const found = monitorScan();

  if (PROBE_JSON) {
    console.log(JSON.stringify(found, null, 2));
    return;
  }

  console.log(`Remote Session Monitor — sondagem em ${new Date().toISOString()}`);
  console.log(`plataforma=${process.platform} snapshot=${snap.degraded ? "INDISPONÍVEL" : "ok"}`);
  if (snap.error) console.log(`erro do snapshot: ${snap.error}`);
  console.log(
    `processos vistos: ${snap.procs.length} · logs do Kiro travados: ${snap.kiroLockedLogs.join(", ") || "nenhum"}`,
  );
  console.log(`sessões encontradas: ${found.length}\n`);

  const order = { active: 0, idle: 1, unknown: 2, finished: 3 };
  found.sort(
    (a, b) =>
      order[a.status] - order[b.status] || String(a.started_at).localeCompare(String(b.started_at)),
  );

  for (const s of found) {
    console.log(`[${s.status.toUpperCase()}] ${s.agent} ${s.session_id}`);
    console.log(
      `  ide=${s.ide ?? "desconhecida"}  pid=${s.pid ?? "n/a"}  confiança=${s.confidence}`,
    );
    console.log(`  projeto=${s.project ?? "desconhecido"}`);
    console.log(
      `  início=${s.started_at ?? "desconhecido"}  atividade=${s.last_activity_at ?? "desconhecida"}  fim=${s.ended_at ?? "—"}`,
    );
    console.log(`  fontes=${s.detection_source}`);
    for (const e of s.evidence) console.log(`    · ${e}`);
    console.log("");
  }

  const ativas = found.filter((s) => s.status === "active" || s.status === "idle");
  console.log(`Resumo: ${ativas.length} sessão(ões) viva(s).`);
  for (const s of ativas) {
    console.log(
      `  - ${s.agent} · ${s.ide ?? "IDE desconhecida"} · ${s.project ?? "?"} · ${s.status}`,
    );
  }
  console.log("\nConfira contra as abas realmente abertas na IDE.");
}

// ---------------------------------------------------------------------------
// entrada
// ---------------------------------------------------------------------------

if (PROBE) {
  probe();
} else {
  console.log(`Perfil do usuário: ${HOME}`);
  console.log(`Session monitoring: ${MONITOR_ON ? "ligado" : "desligado"}`);
  console.log("Transcrições monitoradas:");
  DIRS.forEach((d) => console.log("  -", d));
  console.log(`Enviando para ${URL_BASE} a cada ${INTERVAL}ms…`);

  await tick();
  setInterval(() => {
    tick().catch((e) => console.error(e.message));
  }, INTERVAL);
}
