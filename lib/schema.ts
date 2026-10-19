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
export const TriageRequestSchema = z.object({ ticket: TicketSchema });
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
