import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
    // BOM: sem ele o PowerShell 5.1 lê o script salvo em disco como ANSI e as
    // mensagens em português chegam ilegíveis ao usuário.
    expect(rendered.charCodeAt(0)).toBe(0xfeff);
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
