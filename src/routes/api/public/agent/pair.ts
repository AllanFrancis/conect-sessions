import { createFileRoute } from "@tanstack/react-router";
import { handleAgentPair, pairingHeaders } from "@/lib/agent-pairing-api";

export const Route = createFileRoute("/api/public/agent/pair")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: pairingHeaders }),
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        return handleAgentPair(request, async (args) => {
          return await supabaseAdmin.rpc("consume_agent_pairing", args);
        });
      },
    },
  },
});
