import { z } from "zod";
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


export { bodySchema };
