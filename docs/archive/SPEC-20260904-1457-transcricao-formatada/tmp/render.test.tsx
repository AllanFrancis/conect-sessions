import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "@/components/markdown";

const TABLE = ["| a | b |", "|---|---|", "| 1 | 2 |"].join("\n");
const FENCE_TS = ["```ts", "const x: number = 1;", "```"].join("\n");
const FENCE_BARE = ["```", "sem linguagem", "```"].join("\n");

const html = renderToStaticMarkup(
  <Markdown
    content={[
      "# Titulo H1",
      "## Titulo H2",
      "Paragrafo com `code inline` e **negrito** e [link](https://x.dev).",
      "- item de lista\n- outro item",
      "1. primeiro\n2. segundo",
      "> citacao",
      TABLE,
      "---",
      FENCE_TS,
      FENCE_BARE,
    ].join("\n\n")}
  />,
);

// Cada <pre> tem que fechar antes do proximo abrir: o `pre()` do mapa existe
// justamente para o <pre> do ReactMarkdown nao envolver o do TermCode.
const noNestedPre = html
  .split("<pre")
  .slice(1)
  .every((b) => b.includes("</pre>") && (!b.includes("<pre") || b.indexOf("</pre>") < b.indexOf("<pre")));

const checks: [string, boolean][] = [
  // criterio 1 — bloco de codigo em card
  ["fence vira card (border + bg-card)", /<div class="[^"]*rounded-md border border-border bg-card/.test(html)],
  ["rotulo da linguagem 'ts' aparece", html.includes(">ts<")],
  ["fence sem linguagem cai no rotulo 'código'", html.includes(">código<")],
  ["botao copiar existe", html.includes(">copiar<")],
  ["rolagem contida no card (pre overflow-x-auto)", /<pre class="overflow-x-auto/.test(html)],
  ["nao aninhou <pre> dentro de <pre>", noNestedPre],
  // criterio 2 — hierarquia visual sem @tailwindcss/typography
  ["h1 tem classe propria", /<h1 class="[^"]*text-base/.test(html)],
  ["h2 difere do h1", /<h2 class="[^"]*text-sm/.test(html)],
  ["ul com list-disc", /<ul class="[^"]*list-disc/.test(html)],
  ["ol com list-decimal", /<ol class="[^"]*list-decimal/.test(html)],
  ["p tem classe propria", /<p class="[^"]*leading-6/.test(html)],
  ["code inline com bg-secondary (nao virou card)", /<code class="[^"]*bg-secondary/.test(html)],
  ["blockquote com barra lateral", /<blockquote class="[^"]*border-l-2/.test(html)],
  ["tabela (remark-gfm ativo) dentro de wrapper que rola", /<div class="[^"]*overflow-x-auto[^"]*"><table/.test(html)],
  ["hr estilizado", /<hr class="[^"]*border-border/.test(html)],
  ["link abre em nova aba com rel seguro", html.includes('rel="noreferrer noopener"')],
  ["nenhuma classe prose sobrou", !html.includes("prose")],
];

let fail = 0;
for (const [name, ok] of checks) {
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}
console.log(fail === 0 ? "\nTODOS OS CHECKS PASSARAM" : `\n${fail} CHECK(S) FALHARAM`);
