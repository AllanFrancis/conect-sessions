// Carrega o normalize() REAL de public/agent/remote-agent.mjs — sem cópia.
// A cópia anterior (tmp/normalize.mjs) podia divergir do arquivo servido ao
// agente; aqui o harness fatia o próprio fonte, então o que passa no teste é
// exatamente o que roda na máquina do usuário.
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../../../../public/agent/remote-agent.mjs", import.meta.url), "utf8");
// Âncora no código, não no comentário: reescrever um docblock não pode quebrar
// o harness (já quebrou uma vez).
const start = src.indexOf("const ANSWER_PREFIXES");
const end = src.indexOf("function readNew(");
if (start < 0 || end < 0) throw new Error("marcadores do bloco de normalize não encontrados");

const slice =
  src.slice(start, end) + "\nexport { normalize, answersOf, parseAnswers, kiroToolCalls };\n";
const mod = await import(`data:text/javascript;base64,${Buffer.from(slice, "utf8").toString("base64")}`);
export const { normalize, answersOf, parseAnswers, kiroToolCalls } = mod;
