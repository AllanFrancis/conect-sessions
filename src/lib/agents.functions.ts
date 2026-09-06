import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { randomHex, sha256Hex } from "@/lib/agent-pairing";

/*
 * Não existe mais um `createAgent` que devolva o token permanente ao navegador.
 *
 * Ele era o fluxo antigo — "copie este token agora" — e o RF-3 proíbe exibir a
 * credencial permanente ao navegador. Quem cria máquina agora é
 * `consume_agent_pairing`, chamado pelo instalador com um código de uso único:
 * o token nasce no servidor e vai direto para a máquina, sem passar pela aba.
 *
 * Consequência assumida com o usuário em 2026-09-06: adicionar uma máquina NOVA
 * fora do Windows ficou sem caminho, porque `/api/public/agent/pair` só aceita
 * `platform: windows-x64`. Agentes já existentes continuam sincronizando.
 */

export const createAgentPairing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string; targetAgentId?: string | null }) => {
    const name = String(input?.name ?? "").trim();
    const targetAgentId = input?.targetAgentId ? String(input.targetAgentId) : null;
    if (!name || name.length > 80) throw new Error("Nome inválido");
    if (targetAgentId && !/^[0-9a-f-]{36}$/i.test(targetAgentId)) {
      throw new Error("Máquina inválida");
    }
    return { name, targetAgentId };
  })
  .handler(async ({ data, context }) => {
    const code = randomHex();
    const codeHash = await sha256Hex(code);
    const { data: pairings, error } = await context.supabase.rpc("create_agent_pairing", {
      p_agent_name: data.name,
      p_code_hash: codeHash,
      p_target_agent_id: data.targetAgentId,
    });

    if (error) throw new Error(error.message);
    const pairing = pairings?.[0];
    if (!pairing) throw new Error("Falha ao criar pareamento");
    return { pairingId: pairing.pairing_id, code, expiresAt: pairing.expires_at };
  });

export const cancelAgentPairing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pairingId: string }) => ({
    pairingId: String(input?.pairingId ?? ""),
  }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("agent_pairing_codes")
      .delete()
      .eq("id", data.pairingId)
      .eq("user_id", context.userId)
      .is("consumed_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const revokeAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { agentId: string }) => ({
    agentId: String(input?.agentId ?? ""),
  }))
  .handler(async ({ data, context }) => {
    const now = new Date().toISOString();
    const { data: agent, error } = await context.supabase
      .from("agents")
      .update({ revoked_at: now, updated_at: now })
      .eq("id", data.agentId)
      .eq("user_id", context.userId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!agent) throw new Error("Máquina não encontrada");
    return { ok: true, revokedAt: now };
  });
