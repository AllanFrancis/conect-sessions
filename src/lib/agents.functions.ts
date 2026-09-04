import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Cria um agente local (máquina/editor) e devolve o token em texto puro
 * UMA única vez — no banco fica apenas o hash.
 */
export const createAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { name: string }) => {
    const name = String(data?.name ?? "").trim();
    if (!name || name.length > 80) throw new Error("Nome inválido");
    return { name };
  })
  .handler(async ({ data, context }) => {
    const token = `lrc_${randomToken()}`;
    const token_hash = await sha256Hex(token);

    const { data: agent, error } = await context.supabase
      .from("agents")
      .insert({
        user_id: context.userId,
        name: data.name,
        token_hash,
        token_prefix: token.slice(0, 12),
      })
      .select("id, name, created_at")
      .single();

    if (error) throw new Error(error.message);
    return { agent, token };
  });
