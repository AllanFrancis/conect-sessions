import { createFileRoute } from "@tanstack/react-router";
import { installerHeaders, renderAgentInstaller } from "@/lib/agent-installer";

export const Route = createFileRoute("/api/public/agent/install.ps1")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        return new Response(renderAgentInstaller(origin), { headers: installerHeaders });
      },
    },
  },
});
