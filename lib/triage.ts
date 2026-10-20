import "server-only";
import { complete } from "./llm";
import { decide } from "./decision";
import { TRIAGE_SYSTEM_PROMPT, wrapTicket } from "./prompt";
import { TriageSchema, type Strategy } from "./schema";
import { InvalidOutputError } from "./errors";
export async function triage(
  ticket: { subject: string; body: string },
  requestId?: string,
  strategy: Strategy = "llm",
) {
  const started = Date.now();
  const dm =
    strategy !== "llm" ? await decide(ticket, requestId, strategy) : null;
  const fixed = dm
    ? {
        category: dm.answers.category.choice,
        priority: dm.answers.priority.choice,
      }
    : null;
  const templateActions = {
    billing: "Send to billing to review the invoice, charge or subscription.",
    technical_bug:
      "Send to support to reproduce the issue and check workarounds.",
    account: "Send to account support to verify access and permissions.",
    feature_request: "Record the request for product review.",
  };
  if (strategy === "dm" && dm && fixed)
    return {
      triage: TriageSchema.parse({
        ...fixed,
        summary: `DM classification: ${fixed.category}; ${fixed.priority} priority.`,
        suggested_action: templateActions[fixed.category],
      }),
      decision: dm.answers,
      text_source: "template" as const,
      strategy,
      models: [dm.model],
      model: dm.model,
      provider: "vllm-semantic-router",
      usage: {
        input_tokens: dm.usage.input_tokens,
        output_tokens: dm.usage.output_tokens,
        total_tokens: dm.usage.input_tokens + dm.usage.output_tokens,
      },
      cost_usd:
        new URL(process.env.DM_BASE_URL || "https://decision.vllm-sr.ai")
          .hostname === "decision.vllm-sr.ai"
          ? 0
          : null,
      latency_ms: Date.now() - started,
    };
  const response = await complete(
    [
      {
        role: "system",
        content:
          TRIAGE_SYSTEM_PROMPT +
          (fixed
            ? `\nThe Decision Model has already classified this ticket. Keep category=${fixed.category} and priority=${fixed.priority} exactly. Generate only the summary and suggested_action within the required full JSON object.`
            : ""),
      },
      { role: "user", content: wrapTicket(ticket) },
    ],
    "triage",
    requestId,
    strategy,
    fixed ?? undefined,
  );
  if (
    !response.triage ||
    !response.usage ||
    !response.model ||
    !response.provider
  )
    throw new InvalidOutputError();
  if (
    fixed &&
    (response.triage.category !== fixed.category ||
      response.triage.priority !== fixed.priority)
  )
    throw new InvalidOutputError();
  const input =
    response.usage.input_tokens === null
      ? null
      : response.usage.input_tokens + (dm?.usage.input_tokens ?? 0);
  const output =
    response.usage.output_tokens === null
      ? null
      : response.usage.output_tokens + (dm?.usage.output_tokens ?? 0);
  return {
    ...response,
    strategy,
    decision: dm?.answers ?? null,
    text_source: "llm" as const,
    cost_usd:
      dm &&
      new URL(process.env.DM_BASE_URL || "https://decision.vllm-sr.ai")
        .hostname !== "decision.vllm-sr.ai"
        ? null
        : response.cost_usd,
    models: dm ? [dm.model, response.model] : [response.model],
    usage: {
      input_tokens: input,
      output_tokens: output,
      total_tokens: input !== null && output !== null ? input + output : null,
    },
    latency_ms: Date.now() - started,
  };
}
