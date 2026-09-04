import { createFileRoute } from "@tanstack/react-router";
// O diretório public/ fica atrás do gate de autenticação em previews não publicados,
// então servimos o script do agente por uma rota pública.
import script from "../../../../../public/agent/remote-agent.mjs?raw";

export const Route = createFileRoute("/api/public/agent/remote-agent")({
  server: {
    handlers: {
      GET: async () =>
        new Response(script, {
          headers: {
            "Content-Type": "text/javascript; charset=utf-8",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
          },
        }),
    },
  },
});
