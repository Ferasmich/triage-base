import "server-only";
import OpenAI from "openai";
import { ConfigurationError, InvalidOutputError, safeError } from "./errors";
import { logCall } from "./logs";
import { PROMPT_VERSION } from "./prompt";
import { TRIAGE_JSON_SCHEMA, TriageSchema } from "./schema";
type Messages = OpenAI.Chat.Completions.ChatCompletionMessageParam[];
export function configuration() {
  const {
    LLM_BASE_URL: baseURL,
    LLM_API_KEY: apiKey,
    LLM_MODEL: model,
  } = process.env;
  if (!baseURL || !apiKey || !model) throw new ConfigurationError();
  const mode = process.env.LLM_OUTPUT_MODE || "prompt";
  if (!["prompt", "json_schema"].includes(mode)) throw new ConfigurationError();
  return {
    baseURL,
    apiKey,
    model,
    mode,
    provider: process.env.LLM_PROVIDER || new URL(baseURL).hostname,
  };
}
function client() {
  const cfg = configuration();
  return {
    cfg,
    sdk: new OpenAI({
      baseURL: cfg.baseURL,
      apiKey: cfg.apiKey,
      timeout: 30000,
      maxRetries: 0,
    }),
  };
}
function price(name: string): number | null {
  const value = process.env[name];
  if (!value?.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
export async function complete(
  messages: Messages,
  route: "chat" | "triage",
  requestId?: string,
) {
  const started = Date.now();
  let attempts = 0;
  let input: number | null = 0;
  let output: number | null = 0;
  let status = 200;
  let error_code: string | undefined;
  let cfg: ReturnType<typeof configuration> | undefined;
  try {
    const connection = client();
    cfg = connection.cfg;
    for (let attempt = 0; attempt < 2; attempt++) {
      attempts++;
      let received = false;
      try {
        const response = await connection.sdk.chat.completions.create({
          model: cfg.model,
          messages,
          max_tokens: 1024,
          stream: false,
          ...(route === "triage" && cfg.mode === "json_schema"
            ? {
                response_format: {
                  type: "json_schema" as const,
                  json_schema: {
                    name: "support_triage",
                    strict: true,
                    schema: TRIAGE_JSON_SCHEMA,
                  },
                },
              }
            : {}),
        });
        received = true;
        input =
          response.usage && input !== null
            ? input + response.usage.prompt_tokens
            : null;
        output =
          response.usage && output !== null
            ? output + response.usage.completion_tokens
            : null;
        const choice = response.choices[0];
        if (
          !choice?.message.content?.trim() ||
          choice.finish_reason === "length" ||
          choice.message.refusal
        )
          throw new InvalidOutputError();
        if (route === "chat") return { answer: choice.message.content };
        let raw: unknown;
        try {
          raw = JSON.parse(choice.message.content);
        } catch {
          throw new InvalidOutputError();
        }
        const parsed = TriageSchema.safeParse(raw);
        if (!parsed.success) throw new InvalidOutputError();
        return { triage: parsed.data };
      } catch (error) {
        if (!received) {
          input = null;
          output = null;
        }
        const mapped = safeError(error);
        if (
          attempt === 0 &&
          (error instanceof InvalidOutputError ||
            mapped.code === "triage_unavailable")
        ) {
          await new Promise((r) => setTimeout(r, 300));
          continue;
        }
        throw error;
      }
    }
    throw new InvalidOutputError();
  } catch (error) {
    const mapped = safeError(error);
    status = mapped.status;
    error_code = mapped.code;
    throw error;
  } finally {
    const inPrice = price("LLM_INPUT_PRICE_PER_MILLION"),
      outPrice = price("LLM_OUTPUT_PRICE_PER_MILLION");
    await logCall({
      ts: new Date().toISOString(),
      request_id: requestId,
      route,
      api: "chat_completions",
      prompt_version: route === "triage" ? PROMPT_VERSION : "chat-v1",
      provider: cfg?.provider || "unconfigured",
      model: cfg?.model || "unconfigured",
      mode: cfg?.mode || "prompt",
      status,
      error_code,
      latency_ms: Date.now() - started,
      attempts,
      input_tokens: attempts ? input : null,
      output_tokens: attempts ? output : null,
      cost_usd:
        attempts > 0 &&
        input !== null &&
        output !== null &&
        inPrice !== null &&
        outPrice !== null
          ? (input * inPrice + output * outPrice) / 1e6
          : null,
    });
  }
}
export async function explainStream(messages: Messages, signal?: AbortSignal) {
  const started = Date.now();
  let cfg: ReturnType<typeof configuration> | undefined;
  try {
    const connection = client();
    cfg = connection.cfg;
    const stream = await connection.sdk.chat.completions.create(
      {
        model: cfg.model,
        messages,
        max_tokens: 300,
        stream: true,
        stream_options: { include_usage: true },
      },
      { signal },
    );
    return { stream, cfg, started };
  } catch (error) {
    const mapped = safeError(error);
    await recordStream(cfg, started, mapped.status, undefined, mapped.code);
    throw error;
  }
}
export async function recordStream(
  cfg: ReturnType<typeof configuration> | undefined,
  started: number,
  status: number,
  usage?: { prompt_tokens: number; completion_tokens: number },
  error_code?: string,
) {
  const ip = price("LLM_INPUT_PRICE_PER_MILLION"),
    op = price("LLM_OUTPUT_PRICE_PER_MILLION");
  await logCall({
    ts: new Date().toISOString(),
    route: "explain",
    api: "chat_completions",
    prompt_version: "explain-v1",
    provider: cfg?.provider || "unconfigured",
    model: cfg?.model || "unconfigured",
    mode: "stream",
    status,
    error_code,
    latency_ms: Date.now() - started,
    attempts: 1,
    input_tokens: usage?.prompt_tokens ?? null,
    output_tokens: usage?.completion_tokens ?? null,
    cost_usd:
      usage && ip !== null && op !== null
        ? (usage.prompt_tokens * ip + usage.completion_tokens * op) / 1e6
        : null,
  });
}
