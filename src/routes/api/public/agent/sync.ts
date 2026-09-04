import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";

const bodySchema = z.object({
  token: z.string().min(10).max(200),
  session: z.object({
    external_id: z.string().min(1).max(200),
    source: z.string().min(1).max(40).default("unknown"),
    title: z.string().max(200).nullish(),
    cwd: z.string().max(500).nullish(),
    // "active | idle | finished | unknown" é o vocabulário do session monitor.
    // Os valores antigos seguem aceitos para não quebrar agentes já instalados.
    status: z
      .enum(["active", "idle", "finished", "unknown", "running", "waiting", "done", "error"])
      .nullish()
      .transform((v) => v ?? "unknown"),
    ide: z.string().max(80).nullish(),
    pid: z.number().int().nonnegative().nullish(),
    started_at: z.string().datetime().nullish(),
    last_activity_at: z.string().datetime().nullish(),
    ended_at: z.string().datetime().nullish(),
    detection_source: z.string().max(200).nullish(),
    detection_confidence: z.enum(["confirmed", "inferred", "unknown"]).nullish(),
  }),
  messages: z
    .array(
      z.object({
        external_id: z.string().max(200).nullish(),
        role: z
          .string()
          .max(40)
          .nullish()
          .transform((v) => v ?? "assistant"),
        content: z
          .string()
          .max(200000)
          .nullish()
          .transform((v) => v ?? ""),
        seq: z.number().int().nullish(),
        // Estrutura que nao cabe em `content` (pergunta de escolha e a prova
        // de qual opcao foi escolhida). Opcional: agente antigo nao manda.
        meta: z.record(z.unknown()).nullish(),
      }),
    )
    .max(500)
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
        } catch (err) {
          const detail =
            err instanceof z.ZodError
              ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
              : "corpo ilegível";
          return json({ error: "Payload inválido", detail }, 400);
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
              ide: parsed.session.ide ?? null,
              pid: parsed.session.pid ?? null,
              started_at: parsed.session.started_at ?? null,
              ended_at: parsed.session.ended_at ?? null,
              detection_source: parsed.session.detection_source ?? null,
              detection_confidence: parsed.session.detection_confidence ?? null,
              // O agente sabe quando a sessão de fato mexeu; `now` é só o
              // fallback para quando ele não consegue medir.
              last_activity_at: parsed.session.last_activity_at ?? now,
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
            // O zod valida "é um objeto" e para por aí, de propósito: `meta` é
            // aditivo e o agente pode ganhar chaves sem a API mudar. Isso deixa
            // o tipo em `Record<string, unknown>`, que o TS não reconhece como
            // `Json`. O valor veio de `request.json()`, então é JSON por
            // construção — a asserção afirma o que o parser já garantiu.
            meta: (m.meta ?? null) as Json,
          }));
          // O Kiro reescreve a MESMA linha (mesmo `id`, payload idêntico) a cada
          // mudança de estado da interação — visto até 6x no mesmo arquivo. Entre
          // lotes o ON CONFLICT DO NOTHING resolve; dentro do lote a repetição
          // chegaria como duas linhas no mesmo INSERT, então some aqui.
          const withId = [
            ...new Map(
              rows.filter((r) => r.external_id !== null).map((r) => [r.external_id, r]),
            ).values(),
          ];
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
