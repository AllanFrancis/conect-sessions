import { z } from "zod";
import { createAgentToken, sha256Hex } from "@/lib/agent-pairing";

const bodySchema = z.object({
  code: z.string().regex(/^[0-9a-f]{64}$/i),
  version: z.string().trim().max(40).optional(),
  platform: z.enum(["windows-x64"]).default("windows-x64"),
});

export const pairingHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: pairingHeaders });
}

export function pairingError(message: string) {
  if (message.includes("PAIRING_EXPIRED")) {
    return json({ error: "Este código expirou. Gere outro no painel." }, 410);
  }
  if (message.includes("PAIRING_CONSUMED")) {
    return json({ error: "Este código já foi utilizado." }, 409);
  }
  return json({ error: "Código de pareamento inválido." }, 400);
}

export interface ConsumePairingArgs {
  p_code_hash: string;
  p_token_hash: string;
  p_token_prefix: string;
  p_platform: "windows-x64";
  p_version?: string;
}

interface ConsumePairingRow {
  agent_id: string;
  repaired: boolean;
}

interface ConsumePairingResult {
  data: ConsumePairingRow[] | null;
  error: { message: string } | null;
}

export async function handleAgentPair(
  request: Request,
  consume: (args: ConsumePairingArgs) => Promise<ConsumePairingResult>,
) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return pairingError("PAIRING_INVALID");

  const token = createAgentToken();
  const result = await consume({
    p_code_hash: await sha256Hex(parsed.data.code.toLowerCase()),
    p_token_hash: await sha256Hex(token),
    p_token_prefix: token.slice(0, 12),
    p_platform: parsed.data.platform,
    ...(parsed.data.version ? { p_version: parsed.data.version } : {}),
  });
  if (result.error || !result.data?.[0]) {
    return pairingError(result.error?.message ?? "PAIRING_INVALID");
  }

  return json({
    token,
    agentId: result.data[0].agent_id,
    repaired: result.data[0].repaired,
    apiUrl: new URL(request.url).origin,
  });
}
