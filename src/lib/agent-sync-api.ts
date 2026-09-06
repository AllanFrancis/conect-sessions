import { z } from "zod";

export const agentSyncBodySchema = z.object({
  token: z.string().min(10).max(200),
  agent: z
    .object({
      version: z.string().trim().max(40).nullish(),
      platform: z.string().trim().max(40).nullish(),
      plugin_status: z.enum(["unknown", "ready", "attention"]).nullish(),
      install_error: z.string().trim().max(1000).nullish(),
    })
    .optional(),
  session: z.object({
    external_id: z.string().min(1).max(200),
    source: z.string().min(1).max(40).default("unknown"),
    title: z.string().max(200).nullish(),
    cwd: z.string().max(500).nullish(),
    status: z
      .enum(["active", "idle", "finished", "unknown", "running", "waiting", "done", "error"])
      .nullish()
      .transform((value) => value ?? "unknown"),
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
          .transform((value) => value ?? "assistant"),
        content: z
          .string()
          .max(200000)
          .nullish()
          .transform((value) => value ?? ""),
        seq: z.number().int().nullish(),
        meta: z.record(z.unknown()).nullish(),
      }),
    )
    .max(500)
    .default([]),
});

export type AgentSyncBody = z.infer<typeof agentSyncBodySchema>;

export const agentSyncCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "content-type": "application/json",
};

export function agentSyncJson(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: agentSyncCors });
}

export async function parseAgentSyncRequest(request: Request) {
  try {
    return { data: agentSyncBodySchema.parse(await request.json()) } as const;
  } catch (error) {
    const detail =
      error instanceof z.ZodError
        ? error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")
        : "corpo ilegível";
    return { response: agentSyncJson({ error: "Payload inválido", detail }, 400) } as const;
  }
}

export function requireAgentAccess<T extends { revoked_at: string | null }>(agent: T | null) {
  if (!agent) return { response: agentSyncJson({ error: "Token inválido" }, 401) } as const;
  if (agent.revoked_at) {
    return { response: agentSyncJson({ error: "Máquina revogada" }, 403) } as const;
  }
  return { agent } as const;
}

export function buildAgentTelemetryUpdate(agent: AgentSyncBody["agent"], now: string) {
  return {
    last_seen_at: now,
    updated_at: now,
    ...(agent?.version ? { agent_version: agent.version } : {}),
    ...(agent?.platform ? { platform: agent.platform } : {}),
    ...(agent?.plugin_status ? { plugin_status: agent.plugin_status } : {}),
    ...(agent && "install_error" in agent ? { install_error: agent.install_error ?? null } : {}),
  };
}
