#!/usr/bin/env bun
/**
 * Compila o agente para um executável Windows x64 baseline autossuficiente.
 *
 * O destino é parâmetro (AGENT_OUTFILE ou --outfile) porque quem consome este
 * build são três lugares com necessidades diferentes: o workflow de release
 * publica em asset, o teste compila em pasta temporária e o dev quer só olhar o
 * binário. Caminho fixo dentro de docs/active/ acopla o build ao ciclo de vida
 * de uma SPEC e para de existir quando ela é arquivada.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const flagIndex = process.argv.indexOf("--outfile");
const requested =
  (flagIndex >= 0 ? process.argv[flagIndex + 1] : null) ??
  process.env.AGENT_OUTFILE ??
  "dist/agent/conect-agent.exe";

const outfile = resolve(requested);
mkdirSync(dirname(outfile), { recursive: true });

const result = spawnSync(
  process.execPath,
  [
    "build",
    "public/agent/remote-agent.mjs",
    "--compile",
    "--target=bun-windows-x64-baseline",
    "--windows-hide-console",
    "--outfile",
    outfile,
  ],
  { stdio: "inherit" },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`agente compilado em ${outfile}`);
