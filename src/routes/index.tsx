import { createFileRoute, Link } from "@tanstack/react-router";
import { TermBox, TermLine, TermScreen, termLinkClass } from "@/components/terminal";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Remote Session Monitor — acompanhe seus chats de IA" },
      {
        name: "description",
        content:
          "Acompanhe e responda remotamente às sessões de chat do Claude Code, Kiro e outros agentes de IA rodando no seu editor.",
      },
      { property: "og:title", content: "Remote Session Monitor" },
      {
        property: "og:description",
        content: "Acompanhe e responda remotamente às sessões de chat de IA do seu editor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <TermScreen className="flex min-h-screen flex-col justify-center">
      <TermBox tone="accent" className="px-4 py-3">
        <p className="text-primary">✻ Welcome to Remote Session Monitor</p>
        <p className="mt-2 text-muted-foreground">
          Acompanhe e responda seus chats de IA de qualquer lugar.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          cwd: um agente local lê Claude Code, Kiro e outros editores
        </p>
      </TermBox>

      <div className="mt-5 space-y-1">
        <TermLine tone="accent">
          <span className="text-foreground">Read</span>{" "}
          <span className="text-muted-foreground">sessões do editor em tempo real</span>
        </TermLine>
        <TermLine tone="accent">
          <span className="text-foreground">Watch</span>{" "}
          <span className="text-muted-foreground">
            status de cada máquina: running, waiting, done
          </span>
        </TermLine>
        <TermLine tone="accent">
          <span className="text-foreground">Reply</span>{" "}
          <span className="text-muted-foreground">
            responda do celular e o trabalho continua na máquina
          </span>
        </TermLine>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Link
          to="/auth"
          className="inline-flex items-center rounded-md border border-primary bg-primary px-4 py-2 text-xs text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Entrar no painel
        </Link>
        <Link to="/dashboard" className={termLinkClass}>
          Ver sessões
        </Link>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        agente local em Node.js · sem instalar nada no editor
      </p>

    </TermScreen>
  );
}
