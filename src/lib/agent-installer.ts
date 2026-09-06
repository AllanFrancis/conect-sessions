import processLibSource from "../../public/agent/agent-process.ps1?raw";
import installerSource from "../../public/agent/install-agent.ps1?raw";
import launcherSource from "../../public/agent/launcher.ps1?raw";
import uninstallerSource from "../../public/agent/uninstall-agent.ps1?raw";

/**
 * O bootstrap é um único arquivo baixado por um comando, mas launcher,
 * desinstalador e a biblioteca de identidade de processo são scripts
 * versionados no repositório. Em vez de manter uma segunda cópia dentro do
 * instalador — que divergiria na primeira correção aplicada só de um lado —
 * eles são embutidos aqui em base64 na hora de servir. Base64 porque o
 * conteúdo tem aspas, `$` e here-strings de PowerShell, e qualquer um deles
 * quebraria a interpolação direta.
 */
function toBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * BOM sim para o que vai ao DISCO, nunca para o que vai como STRING.
 *
 * O PowerShell 5.1 — o que existe por padrão no Windows 10 e 11 — lê um `.ps1`
 * sem BOM usando a página de código ANSI, e cada acento das mensagens chega
 * quebrado ao usuário. Por isso launcher, desinstalador e biblioteca de processo
 * são embutidos COM BOM: o bootstrap grava os três em disco e o PowerShell os
 * abre por caminho. O carregador `?raw` do bun remove o BOM na importação, então
 * a garantia é reposta aqui em vez de depender do empacotador.
 *
 * O bootstrap é o caso oposto, e foi onde isto quebrou em produção. Ele nunca
 * toca o disco: o comando do painel faz `irm` e entrega o TEXTO a
 * `[scriptblock]::Create()`. Ali o U+FEFF vira o primeiro caractere da string, o
 * parser deixa de reconhecer o `<#` da linha 1 e passa a ler o cabeçalho de
 * comentário como código — o erro que chegou ao usuário foi "Missing closing ')'"
 * apontando para um parêntese que estava DENTRO do comentário.
 */
const BOM = "\uFEFF";
const withBom = (source: string) => (source.startsWith(BOM) ? source : BOM + source);
const withoutBom = (source: string) => (source.startsWith(BOM) ? source.slice(1) : source);

const embedded: Record<string, string> = {
  __CONNECT_PROCESS_LIB_B64__: toBase64(withBom(processLibSource)),
  __CONNECT_LAUNCHER_B64__: toBase64(withBom(launcherSource)),
  __CONNECT_UNINSTALLER_B64__: toBase64(withBom(uninstallerSource)),
};

export function renderAgentInstaller(origin: string) {
  let rendered = withoutBom(installerSource).replaceAll(
    "__CONNECT_API_URL__",
    origin.trim().replace(/\/+$/, ""),
  );
  for (const [placeholder, value] of Object.entries(embedded)) {
    rendered = rendered.replaceAll(placeholder, value);
  }
  return rendered;
}

export const installerHeaders = {
  "content-type": "text/plain; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
};
