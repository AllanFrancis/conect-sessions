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
 * O BOM não é decoração: o PowerShell 5.1, que é o que existe por padrão no
 * Windows 10 e 11, lê um `.ps1` sem BOM usando a página de código ANSI. Sem ele
 * cada acento das mensagens chega quebrado ao usuário. Os arquivos versionados
 * têm BOM, mas o carregador `?raw` do bun o remove na importação (o do Vite
 * pode preservar), então a garantia é reposta aqui em vez de depender do
 * empacotador.
 */
const BOM = "\uFEFF";
const withBom = (source: string) => (source.startsWith(BOM) ? source : BOM + source);

const embedded: Record<string, string> = {
  __CONNECT_PROCESS_LIB_B64__: toBase64(withBom(processLibSource)),
  __CONNECT_LAUNCHER_B64__: toBase64(withBom(launcherSource)),
  __CONNECT_UNINSTALLER_B64__: toBase64(withBom(uninstallerSource)),
};

export function renderAgentInstaller(origin: string) {
  let rendered = withBom(installerSource).replaceAll(
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
