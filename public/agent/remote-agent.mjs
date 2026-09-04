#!/usr/bin/env node
/**
 * Remote Session Monitor — agente local.
 *
 * Lê as sessões de chat gravadas em disco por agentes de IA (Claude Code, Kiro
 * e compatíveis), envia as mensagens novas para o painel e recebe de volta as
 * respostas que você escreveu remotamente.
 *
 * Uso:
 *   LRC_URL=https://seu-app.lovable.app LRC_TOKEN=lrc_xxx node remote-agent.mjs
 *
 * Variáveis opcionais:
 *   LRC_INTERVAL=2000                    intervalo de polling em ms
 *   LRC_WATCH=/caminho1,/caminho2        pastas extras com arquivos .jsonl/.json de sessão
 *   LRC_REPLY_CMD='echo "{{reply}}"'     comando executado para cada resposta recebida
 *                                        ({{reply}} = texto, {{session}} = id da sessão)
 *   LRC_REPLY_FILE=/caminho/inbox.txt    além disso, grava cada resposta neste arquivo
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { exec } from "node:child_process";

const URL_BASE = (process.env.LRC_URL || "").replace(/\/$/, "");
const TOKEN = process.env.LRC_TOKEN || "";
const INTERVAL = Number(process.env.LRC_INTERVAL || 2000);
const REPLY_CMD = process.env.LRC_REPLY_CMD || "";
const REPLY_FILE = process.env.LRC_REPLY_FILE || "";

if (!URL_BASE || !TOKEN) {
  console.error("Defina LRC_URL e LRC_TOKEN.");
  process.exit(1);
}

const HOME = os.homedir();
const DEFAULT_DIRS = [
  path.join(HOME, ".claude", "projects"), // Claude Code
  path.join(HOME, ".kiro", "sessions"), // Kiro
  path.join(HOME, ".kiro", "chats"),
  path.join(HOME, ".config", "kiro", "sessions"),
];
const EXTRA_DIRS = (process.env.LRC_WATCH || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const DIRS = [...DEFAULT_DIRS, ...EXTRA_DIRS].filter((d) => fs.existsSync(d));

if (DIRS.length === 0) {
  console.error("Nenhuma pasta de sessão encontrada. Use LRC_WATCH=/caminho para indicar uma.");
  process.exit(1);
}

console.log("Monitorando:");
DIRS.forEach((d) => console.log("  -", d));

/** @type {Map<string, number>} arquivo -> quantas linhas já enviadas */
const sent = new Map();

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(jsonl|json)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

function sourceOf(file) {
  if (file.includes(`${path.sep}.claude${path.sep}`)) return "claude-code";
  if (file.includes(`${path.sep}.kiro${path.sep}`) || file.includes("kiro")) return "kiro";
  return "unknown";
}

/**
 * Descobre o projeto ao qual a sessão pertence.
 * Claude Code guarda em ~/.claude/projects/-Users-eu-code-meu-app/<uuid>.jsonl,
 * então o nome da pasta é o caminho do projeto com "/" trocado por "-".
 */
function projectOf(file) {
  const dir = path.dirname(file);
  const folder = path.basename(dir);
  if (sourceOf(file) === "claude-code" && folder.startsWith("-")) {
    const decoded = folder.replace(/^-/, "/").replaceAll("-", "/");
    return { name: path.basename(decoded) || folder, cwd: decoded };
  }
  return { name: folder, cwd: dir };
}


/** Extrai {role, content} de formatos comuns de log de sessão. */
function normalize(obj) {
  if (!obj || typeof obj !== "object") return null;
  const node = obj.message && typeof obj.message === "object" ? obj.message : obj;
  const role = node.role || obj.type || obj.sender || "assistant";
  let content = node.content ?? node.text ?? obj.text ?? obj.content;
  if (Array.isArray(content)) {
    content = content
      .map((p) => (typeof p === "string" ? p : (p?.text ?? p?.content ?? "")))
      .filter(Boolean)
      .join("\n");
  }
  if (typeof content !== "string" || !content.trim()) return null;
  return {
    role: role === "human" ? "user" : role,
    content: content.slice(0, 100000),
    external_id: obj.uuid || obj.id || null,
  };
}

function readNew(file) {
  const raw = fs.readFileSync(file, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim());
  const start = sent.get(file) ?? 0;
  const fresh = lines.slice(start);
  sent.set(file, lines.length);
  const messages = [];
  fresh.forEach((line, i) => {
    try {
      const parsed = JSON.parse(line);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        const m = normalize(item);
        if (m) messages.push({ ...m, seq: start + i });
      }
    } catch {
      /* linha parcial: será relida na próxima passagem */
      sent.set(file, start + i);
    }
  });
  return { messages, isFirstRun: start === 0, total: lines.length };
}

async function sync(file, messages, status) {
  const stat = fs.statSync(file);
  const project = projectOf(file);
  const body = {
    token: TOKEN,
    session: {
      external_id: file,
      source: sourceOf(file),
      title: project.name,
      cwd: project.cwd,
      status,
    },
    messages,
  };
  const res = await fetch(`${URL_BASE}/api/public/agent/sync`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error("sync falhou:", res.status, await res.text());
    return;
  }
  const data = await res.json();
  for (const reply of data.replies ?? []) {
    console.log(`\n>> resposta remota para ${path.basename(file)}:\n${reply.content}\n`);
    if (REPLY_FILE) fs.appendFileSync(REPLY_FILE, `${reply.content}\n`);
    if (REPLY_CMD) {
      const cmd = REPLY_CMD.replaceAll("{{reply}}", reply.content.replace(/"/g, '\\"')).replaceAll(
        "{{session}}",
        data.session_id,
      );
      exec(cmd, (err) => err && console.error("comando de resposta falhou:", err.message));
    }
  }
  void stat;
}

async function tick() {
  const files = DIRS.flatMap((d) => walk(d));
  const recent = files.filter((f) => Date.now() - fs.statSync(f).mtimeMs < 1000 * 60 * 60 * 24);
  for (const file of recent) {
    try {
      const { messages } = readNew(file);
      const idleMs = Date.now() - fs.statSync(file).mtimeMs;
      const status = idleMs < 15000 ? "running" : idleMs < 5 * 60000 ? "waiting" : "idle";
      if (messages.length > 0 || idleMs < 5 * 60000) {
        await sync(file, messages, status);
      }
    } catch (err) {
      console.error("erro em", file, err.message);
    }
  }
}

console.log(`Enviando para ${URL_BASE} a cada ${INTERVAL}ms…`);
await tick();
setInterval(() => {
  tick().catch((e) => console.error(e.message));
}, INTERVAL);
