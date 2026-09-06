import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { installerHeaders, renderAgentInstaller } from "@/lib/agent-installer";
import { Route } from "@/routes/api/public/agent/install[.]ps1";

/**
 * O bootstrap é servido, não lido do disco pelo usuário: o que importa é o que
 * sai do endpoint. Aqui se prova que a origem entra, que os scripts irmãos são
 * embutidos byte a byte e que nenhum placeholder — nem segredo — escapa.
 */

const pairingToken = "lrc_";
const files = {
  __CONNECT_PROCESS_LIB_B64__: "public/agent/agent-process.ps1",
  __CONNECT_LAUNCHER_B64__: "public/agent/launcher.ps1",
  __CONNECT_UNINSTALLER_B64__: "public/agent/uninstall-agent.ps1",
} as const;

function decodeBase64(value: string) {
  const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  // ignoreBOM: true preserva o U+FEFF inicial, que aqui é conteúdo relevante —
  // é ele que faz o PowerShell 5.1 ler o script instalado como UTF-8.
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
}

function embeddedSource(rendered: string, variable: string) {
  const match = rendered.match(new RegExp(`\\$${variable} = '([A-Za-z0-9+/=]+)'`));
  if (!match) throw new Error(`variável ${variable} não encontrada no bootstrap servido`);
  return decodeBase64(match[1]);
}

describe("bootstrap servido em /api/public/agent/install.ps1", () => {
  test("aplica a origem da requisição e não deixa placeholder para trás", () => {
    const rendered = renderAgentInstaller("https://painel.exemplo.com");
    expect(rendered).toContain("$ApiUrl = 'https://painel.exemplo.com'");
    expect(rendered).not.toContain("__CONNECT_");
  });

  test("não começa com BOM — o bootstrap é string, não arquivo", () => {
    const rendered = renderAgentInstaller("https://painel.exemplo.com");
    // Esta asserção já existiu invertida, exigindo o BOM, e foi ela que deixou a
    // produção quebrar com 41 testes verdes. O comando do painel faz `irm` e
    // entrega o texto a [scriptblock]::Create(): ali o U+FEFF é o primeiro
    // CARACTERE da string, o parser não reconhece o `<#` da linha 1 e lê o
    // cabeçalho de comentário como código.
    expect(rendered.charCodeAt(0)).not.toBe(0xfeff);
    expect(rendered.startsWith("<#")).toBe(true);
  });

  /*
   * O caminho REAL de execução, que nenhum teste exercitava.
   *
   * As suítes gravavam o bootstrap em arquivo e rodavam com `-File`, modo em que
   * o BOM é obrigatório e tudo passava — 41 testes verdes com a produção
   * quebrada. O comando do painel não faz isso: faz `irm` e passa o texto a
   * `[scriptblock]::Create()`. Aqui o texto é decodificado como o `irm`
   * decodifica (UTF8.GetString NÃO remove o U+FEFF) e entregue ao mesmo parser.
   */
  test("o parser aceita o bootstrap servido, como faria o comando do painel", () => {
    const dir = mkdtempSync(join(tmpdir(), "bootstrap-parse-"));
    try {
      const alvo = join(dir, "served.ps1");
      writeFileSync(alvo, renderAgentInstaller("https://painel.exemplo.com"), "utf8");
      const sonda = join(dir, "sonda.ps1");
      writeFileSync(
        sonda,
        [
          `$bytes = [IO.File]::ReadAllBytes('${alvo.replace(/\\/g, "\\\\")}')`,
          "$texto = [Text.Encoding]::UTF8.GetString($bytes)",
          "try { [scriptblock]::Create($texto) | Out-Null; 'PARSE_OK' }",
          "catch { 'PARSE_FALHOU: ' + $_.Exception.Message }",
        ].join("\n"),
        "utf8",
      );
      const child = Bun.spawnSync([
        "powershell.exe",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        sonda,
      ]);
      const saida = new TextDecoder().decode(child.stdout).trim();
      expect(saida).toBe("PARSE_OK");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("o que vai para o DISCO continua com BOM", () => {
    const rendered = renderAgentInstaller("https://painel.exemplo.com");
    // O bootstrap grava estes três em disco e o PowerShell 5.1 os abre por
    // caminho — sem BOM, cada acento das mensagens chega quebrado ao usuário.
    for (const nome of ["EmbeddedLauncher", "EmbeddedUninstaller", "EmbeddedProcessLib"] as const) {
      expect(embeddedSource(rendered, nome).charCodeAt(0)).toBe(0xfeff);
    }
  });

  test("normaliza origem com porta e barra final", () => {
    const rendered = renderAgentInstaller("https://painel.exemplo.com:8443/");
    expect(rendered).toContain("$ApiUrl = 'https://painel.exemplo.com:8443'");
    expect(rendered).not.toContain("8443/'");
  });

  test("embute launcher, desinstalador e biblioteca de processo sem divergir da fonte", () => {
    const rendered = renderAgentInstaller("https://painel.exemplo.com");
    expect(embeddedSource(rendered, "EmbeddedLauncher")).toBe(
      readFileSync(resolve(files.__CONNECT_LAUNCHER_B64__), "utf8"),
    );
    expect(embeddedSource(rendered, "EmbeddedUninstaller")).toBe(
      readFileSync(resolve(files.__CONNECT_UNINSTALLER_B64__), "utf8"),
    );
    expect(embeddedSource(rendered, "EmbeddedProcessLib")).toBe(
      readFileSync(resolve(files.__CONNECT_PROCESS_LIB_B64__), "utf8"),
    );
  });

  test("não carrega credencial permanente nem chave de serviço", () => {
    const rendered = renderAgentInstaller("https://painel.exemplo.com");
    expect(rendered).not.toContain(pairingToken);
    expect(rendered).not.toContain("service_role");
    expect(rendered.toUpperCase()).not.toContain("SUPABASE");
  });

  test("o endpoint devolve texto simples, sem cache e com CORS", async () => {
    type InstallerRoute = {
      options: {
        server?: {
          handlers?: { GET?: (context: { request: Request }) => Promise<Response> };
        };
      };
    };
    const handler = (Route as unknown as InstallerRoute).options.server?.handlers?.GET;
    expect(typeof handler).toBe("function");
    if (!handler) throw new Error("handler GET ausente na rota do bootstrap");

    const response = await handler({
      request: new Request("https://painel.exemplo.com:8443/api/public/agent/install.ps1"),
    });
    const body = await response.text();

    expect(response.headers.get("content-type")).toBe(installerHeaders["content-type"]);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(body).toContain("$ApiUrl = 'https://painel.exemplo.com:8443'");
    expect(body).not.toContain("__CONNECT_");
  });
});
