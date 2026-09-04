import { createFileRoute, Link } from "@tanstack/react-router";

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
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <p className="mb-3 font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
        remote control para agentes de IA
      </p>
      <h1 className="max-w-2xl text-4xl font-semibold leading-tight">
        Acompanhe e responda seus chats de IA de qualquer lugar
      </h1>
      <p className="mt-4 max-w-xl text-muted-foreground">
        Um agente local lê as sessões do Claude Code, do Kiro e de outros editores e transmite as
        perguntas e o texto em tempo real para este painel — onde você responde e o trabalho
        continua.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          to="/auth"
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Entrar no painel
        </Link>
        <Link
          to="/dashboard"
          className="rounded-md border border-input px-5 py-2.5 text-sm font-medium hover:bg-accent"
        >
          Ver sessões
        </Link>
      </div>
    </main>
  );
}
