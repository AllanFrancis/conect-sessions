// Guard do vazamento que o passe de browser achou: o marcador de resposta do
// AskUserQuestion tem MAIS DE UM formato de frase, e reconhecer só um faz o
// texto em inglês vazar como fala do usuário E a pergunta parecer sem resposta.
//
// Varre TODOS os projetos do Claude Code desta máquina, não só este — os 20
// casos de "The user answered:" estavam em outro projeto, e é por isso que o
// harness anterior (que olhava só um) passava enquanto o painel exibia o bug.
//
// Verdade-terreno: `toolUseResult.answers`. Ele é o objeto estruturado que o CLI
// grava na MESMA linha do tool_result; se ele existe, aquela linha É um marcador
// de resposta, qualquer que seja a frase em inglês ao lado.
import { normalize } from "./load-normalize.mjs";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const base = join(process.env.USERPROFILE ?? process.env.HOME, ".claude", "projects");
const projetos = readdirSync(base).filter((d) => {
  try { return statSync(join(base, d)).isDirectory(); } catch { return false; }
});

let marcadores = 0, reconhecidos = 0, vazados = 0;
const porPrefixo = new Map();
const falhas = [];

for (const projeto of projetos) {
  const dir = join(base, projeto);
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".jsonl"))) {
    for (const line of readFileSync(join(dir, f), "utf8").split("\n")) {
      if (!line.trim()) continue;
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }

      const structured = obj?.toolUseResult?.answers;
      if (!structured || typeof structured !== "object" || Array.isArray(structured)) continue;
      marcadores++;

      // A frase em inglês que acompanha este marcador, para o relatório.
      const parts = Array.isArray(obj?.message?.content) ? obj.message.content : [];
      const texto = parts
        .filter((p) => p?.type === "tool_result")
        .map((p) => (typeof p.content === "string" ? p.content : ""))
        .join("");
      const prefixo = texto.slice(0, texto.indexOf('"')).trim() || "(sem frase)";
      porPrefixo.set(prefixo, (porPrefixo.get(prefixo) ?? 0) + 1);

      const n = normalize(obj);
      if (n?.meta?.answers_tool_use_id) reconhecidos++;
      // O vazamento: a frase em inglês sobreviveu como conteúdo de mensagem.
      if (n && n.content && /"[^"]*"="/.test(n.content)) {
        vazados++;
        if (falhas.length < 3) falhas.push({ prefixo, trecho: n.content.slice(0, 110) });
      }
      if (!n?.meta?.answers_tool_use_id && falhas.length < 3) {
        falhas.push({ prefixo, motivo: "não virou marcador", trecho: (n?.content ?? "").slice(0, 110) });
      }
    }
  }
}

console.log(`projetos varridos: ${projetos.length}`);
console.log(`marcadores de resposta (toolUseResult.answers presente): ${marcadores}`);
console.log(`  reconhecidos pelo agente: ${reconhecidos}`);
console.log(`  frase em inglês vazada na transcrição: ${vazados}`);
console.log("frases encontradas:");
for (const [p, n] of [...porPrefixo].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)} ${JSON.stringify(p)}`);
for (const f of falhas) console.log("  FALHA:", JSON.stringify(f));

const ok = marcadores > 0 && reconhecidos === marcadores && vazados === 0;
console.log(ok ? "\nOK — todo marcador foi reconhecido e nada vazou" : "\nFALHOU");
