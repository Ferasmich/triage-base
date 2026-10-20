import { z } from "zod";
export const TriageSchema = z.strictObject({
  category: z.enum(["billing", "technical_bug", "account", "feature_request"]),
  priority: z.enum(["low", "medium", "high"]),
  summary: z
    .string()
    .min(1)
    .max(300)
    .refine((s) => !!s.trim()),
  suggested_action: z
    .string()
    .min(1)
    .max(500)
    .refine((s) => !!s.trim()),
});
export type TriageResult = z.infer<typeof TriageSchema>;
export const TicketSchema = z
  .object({ subject: z.string().max(500), body: z.string().min(1).max(5500) })
  .refine((t) => !!t.body.trim() && t.subject.length + t.body.length <= 6000);
export const StrategySchema = z.enum(["llm", "dm", "dm+llm"]);
export type Strategy = z.infer<typeof StrategySchema>;
export const TriageRequestSchema = z.object({
  ticket: TicketSchema,
  strategy: StrategySchema.default("llm"),
});
export const ChatRequestSchema = z
  .object({
    message: z
      .string()
      .min(1)
      .max(6000)
      .refine((s) => !!s.trim()),
    history: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z
            .string()
            .min(1)
            .max(6000)
            .refine((s) => !!s.trim()),
        }),
      )
      .max(40)
      .default([]),
  })
  .refine(
    (v) =>
      v.message.length + v.history.reduce((n, m) => n + m.content.length, 0) <=
      24000,
  );
// Refinements enforce whitespace locally; the JSON Schema describes the wire contract.
const { $schema, ...schema } = z.toJSONSchema(TriageSchema, {
  unrepresentable: "any",
});
export const TRIAGE_JSON_SCHEMA = schema;

export const UsageSchema = z.object({
  input_tokens: z.number().int().nonnegative().nullable(),
  output_tokens: z.number().int().nonnegative().nullable(),
  total_tokens: z.number().int().nonnegative().nullable(),
});
const probability = z.number().min(0).max(1);
function distribution<T extends z.ZodRawShape>(shape: T) {
  return z
    .strictObject(shape)
    .refine(
      (v) =>
        Math.abs(
          Object.values(v).reduce<number>((n, p) => n + Number(p), 0) - 1,
        ) < 0.02,
      "Probabilities must sum to one",
    );
}
export const DecisionSchema = z.object({
  category: z.object({
    type: z.literal("choice"),
    choice: TriageSchema.shape.category,
    probabilities: distribution({
      billing: probability,
      technical_bug: probability,
      account: probability,
      feature_request: probability,
    }),
    confidence: probability,
  }),
  priority: z.object({
    type: z.literal("choice"),
    choice: TriageSchema.shape.priority,
    probabilities: distribution({
      low: probability,
      medium: probability,
      high: probability,
    }),
    confidence: probability,
  }),
});
export const DMResponseSchema = z.object({
  model: z.string().min(1),
  answers: DecisionSchema,
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.literal(0),
  }),
  meta: z
    .object({
      model_id: z.string(),
      revision: z.string().optional(),
      model_sha256: z.string().optional(),
    })
    .passthrough()
    .optional(),
});
export const TriageResponseSchema = z.object({
  triage: TriageSchema,
  model: z.string(),
  models: z.array(z.string()),
  provider: z.string(),
  strategy: StrategySchema,
  decision: DecisionSchema.nullable(),
  text_source: z.enum(["llm", "template"]),
  usage: UsageSchema,
  cost_usd: z.number().nonnegative().nullable(),
  prompt_version: z.string(),
  latency_ms: z.number().nonnegative(),
});
export const SmokeRequestSchema = z
  .object({
    dataset: z.enum(["100", "500"]),
    sample_size: z.number().int().min(1).max(500),
    strategy: StrategySchema.default("llm"),
  })
  .refine((v) => v.sample_size <= Number(v.dataset), {
    message: "Sample size exceeds dataset size",
    path: ["sample_size"],
  });
