import { createFileRoute } from "@tanstack/react-router";
import type { Json } from "@/integrations/supabase/types";
import { sha256Hex } from "@/lib/agent-pairing";
import {
  agentSyncCors,
  agentSyncJson,
  buildAgentTelemetryUpdate,
  parseAgentSyncRequest,
  requireAgentAccess,
} from "@/lib/agent-sync-api";

export const Route = createFileRoute("/api/public/agent/sync")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: agentSyncCors }),
      POST: async ({ request }) => {
        const requestResult = await parseAgentSyncRequest(request);
        if ("response" in requestResult) return requestResult.response;
        const parsed = requestResult.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const tokenHash = await sha256Hex(parsed.token);

        const { data: agent } = await supabaseAdmin
          .from("agents")
          .select("id, user_id, revoked_at")
          .eq("token_hash", tokenHash)
          .maybeSingle();

        const access = requireAgentAccess(agent);
        if ("response" in access) return access.response;
        const activeAgent = access.agent;

        const agentUpdate = buildAgentTelemetryUpdate(parsed.agent, new Date().toISOString());
        await supabaseAdmin.from("agents").update(agentUpdate).eq("id", activeAgent.id);

        const now = new Date().toISOString();
        const { data: session, error: sessionError } = await supabaseAdmin
          .from("sessions")
          .upsert(
            {
              user_id: activeAgent.user_id,
              agent_id: activeAgent.id,
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
            // A identidade da sessão é (user_id, external_id), não o agente:
            // duas cópias do agente na mesma máquina têm tokens diferentes e
            // criavam duas linhas para a MESMA sessão de IA. O agent_id segue
            // gravado — por onde a sessão entrou é informação — mas quem chega
            // depois atualiza a linha existente em vez de duplicá-la.
            { onConflict: "user_id,external_id" },
          )
          .select("id")
          .single();

        if (sessionError || !session) {
          return agentSyncJson({ error: "Falha ao salvar sessão" }, 500);
        }

        if (parsed.messages.length > 0) {
          const rows = parsed.messages.map((m, i) => ({
            session_id: session.id,
            user_id: activeAgent.user_id,
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

        // Entregar e marcar no MESMO comando (`UPDATE ... RETURNING`).
        //
        // Antes eram dois: ler os pendentes, depois marcá-los. Dois syncs da
        // mesma sessão em voo — o que acontece o tempo todo, porque o tick do
        // agente não espera o anterior — liam a mesma linha antes de qualquer
        // escrita e levavam a mesma resposta. Reproduzido contra o deploy: 3
        // requisições paralelas receberam o mesmo reply, e como o agente roda o
        // `LRC_REPLY_CMD` para cada uma, o comando do usuário rodaria 3x.
        //
        // Com um comando só, o segundo UPDATE concorrente espera o primeiro
        // comitar, reavalia o `WHERE`, não encontra mais nada `pending` e leva
        // zero linhas. Uma requisição leva a resposta; as outras, nada.
        // O sync de UMA sessão drena as respostas de TODAS as sessões deste
        // agente, não só as dela.
        //
        // O agente só faz POST para sessão que o monitor enxerga agora ou que
        // teve mensagem nova. Uma sessão que já terminou não se encaixa em
        // nenhum dos dois: a resposta que o usuário mandasse para ela ficava
        // `pending` para sempre, sem nada na tela dizendo isso. Medido — de 11
        // respostas num passe de 11 min, 6 nunca chegaram, e eram exatamente as
        // 6 sessões que o monitor não via.
        //
        // Escopo por AGENTE e não por usuário, de propósito: o mesmo usuário tem
        // várias máquinas, e a resposta escrita para a sessão de uma não pode
        // ser entregue no terminal da outra.
        const { data: minhasSessoes } = await supabaseAdmin
          .from("sessions")
          .select("id, external_id")
          .eq("agent_id", activeAgent.id);
        const idsDoAgente = (minhasSessoes ?? []).map((s) => s.id);

        const { data: entregues } = await supabaseAdmin
          .from("replies")
          .update({ status: "delivered", delivered_at: new Date().toISOString() })
          .in("session_id", idsDoAgente.length ? idsDoAgente : [session.id])
          .eq("status", "pending")
          .select("id, content, created_at, session_id");

        // O UPDATE não aceita `order`, e a ordem importa: são falas do usuário,
        // que chegam ao terminal na sequência em que ele as escreveu.
        const ordenadas = (entregues ?? []).sort((a, b) =>
          a.created_at.localeCompare(b.created_at),
        );

        // `session_id` é o uuid DESTA tabela, e o agente não tem esse dicionário:
        // ele conhece a sessão pelo id nativo ("claude-code:<uuid da sessão>").
        // Sem traduzir, o agente sabia que chegou resposta mas não para QUAL
        // sessão da máquina — e o invariante é justamente nunca escrever na
        // sessão errada. O dicionário sai da consulta que já fizemos acima, de
        // graça: só passamos a pedir `external_id` junto com o `id`.
        const externalPorId = new Map((minhasSessoes ?? []).map((s) => [s.id, s.external_id]));
        const replies = ordenadas.map((r) => ({
          ...r,
          external_id: externalPorId.get(r.session_id) ?? null,
        }));

        return agentSyncJson({
          session_id: session.id,
          external_id: parsed.session.external_id,
          replies,
        });
      },
    },
  },
});
