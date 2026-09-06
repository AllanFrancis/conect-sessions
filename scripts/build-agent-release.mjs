#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const outputDirectory = resolve(process.env.RELEASE_OUT_DIR ?? "dist/agent");
mkdirSync(outputDirectory, { recursive: true });

const targets = [
  { source: "public/agent/remote-agent.mjs", output: "conect-agent.exe", hideConsole: true },
  { source: "public/agent/claude-hook.mjs", output: "conect-hook.exe", hideConsole: false },
];

for (const target of targets) {
  const buildArguments = [
    "build",
    target.source,
    "--compile",
    "--target=bun-windows-x64-baseline",
    ...(target.hideConsole ? ["--windows-hide-console"] : []),
    "--outfile",
    resolve(outputDirectory, target.output),
  ];
  const result = spawnSync(
    process.execPath,
    buildArguments,
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`artefatos compilados em ${outputDirectory}`);
