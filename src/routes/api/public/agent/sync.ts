import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  token: z.string().min(10).max(200),
  session: z.object({
    external_id: z.string().min(1).max(200),
    source: z.string().min(1).max(40).default("unknown"),
    title: z.string().max(200).optional(),
    cwd: z.string().max(500).optional(),
    status: z.enum(["running", "waiting", "idle", "done", "error"]).default("idle"),
  }),
  messages: z
    .array(
      z.object({
        external_id: z.string().max(200).optional(),
        role: z.string().max(40).default("assistant"),
        content: z.string().max(200000).default(""),
        seq: z.number().int().optional(),
      }),
    )
    .max(200)
    .default([]),
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "content-type": "application/json",
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: cors });
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const Route = createFileRoute("/api/public/agent/sync")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        let parsed;
        try {
          parsed = bodySchema.parse(await request.json());
        } catch {
          return json({ error: "Payload inválido" }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const tokenHash = await sha256Hex(parsed.token);

        const { data: agent } = await supabaseAdmin
          .from("agents")
          .select("id, user_id")
          .eq("token_hash", tokenHash)
          .maybeSingle();

        if (!agent) return json({ error: "Token inválido" }, 401);

        await supabaseAdmin
          .from("agents")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("id", agent.id);

        const now = new Date().toISOString();
        const { data: session, error: sessionError } = await supabaseAdmin
          .from("sessions")
          .upsert(
            {
              user_id: agent.user_id,
              agent_id: agent.id,
              external_id: parsed.session.external_id,
              source: parsed.session.source,
              title: parsed.session.title || parsed.session.external_id,
              cwd: parsed.session.cwd ?? null,
              status: parsed.session.status,
              last_activity_at: now,
            },
            { onConflict: "agent_id,external_id" },
          )
          .select("id")
          .single();

        if (sessionError || !session) return json({ error: "Falha ao salvar sessão" }, 500);

        if (parsed.messages.length > 0) {
          const rows = parsed.messages.map((m, i) => ({
            session_id: session.id,
            user_id: agent.user_id,
            external_id: m.external_id ?? null,
            role: m.role,
            content: m.content,
            seq: m.seq ?? i,
          }));
          const withId = rows.filter((r) => r.external_id !== null);
          const withoutId = rows.filter((r) => r.external_id === null);
          if (withId.length) {
            await supabaseAdmin
              .from("messages")
              .upsert(withId, { onConflict: "session_id,external_id", ignoreDuplicates: true });
          }
          if (withoutId.length) {
            await supabaseAdmin.from("messages").insert(withoutId);
          }
        }

        const { data: replies } = await supabaseAdmin
          .from("replies")
          .select("id, content, created_at")
          .eq("session_id", session.id)
          .eq("status", "pending")
          .order("created_at", { ascending: true });

        if (replies && replies.length > 0) {
          await supabaseAdmin
            .from("replies")
            .update({ status: "delivered", delivered_at: new Date().toISOString() })
            .in(
              "id",
              replies.map((r) => r.id),
            );
        }

        return json({ session_id: session.id, replies: replies ?? [] });
      },
    },
  },
});
