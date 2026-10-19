import OpenAI from "openai";
export class InvalidOutputError extends Error {}
export class ConfigurationError extends Error {}
export function safeError(error: unknown) {
  if (error instanceof InvalidOutputError)
    return {
      status: 502,
      code: "invalid_model_output",
      error: "The model returned invalid output. Please try again.",
    };
  if (error instanceof OpenAI.APIConnectionTimeoutError)
    return {
      status: 504,
      code: "triage_timeout",
      error: "The model timed out. Please try again.",
    };
  const status =
    error instanceof OpenAI.APIError
      ? error.status
      : typeof error === "object" &&
          error !== null &&
          "status" in error &&
          typeof error.status === "number"
        ? error.status
        : undefined;
  if (status === 429)
    return {
      status: 429,
      code: "rate_limited",
      error: "The provider is busy. Please retry later.",
    };
  if (
    error instanceof ConfigurationError ||
    (status && status >= 400 && status < 500 && status !== 408)
  )
    return {
      status: 500,
      code: "internal_error",
      error: "The server provider configuration needs attention.",
    };
  return {
    status: 502,
    code: "triage_unavailable",
    error: "The model is unavailable. Please try again.",
  };
}
export function errorResponse(error: unknown) {
  const { status, ...body } = safeError(error);
  return Response.json(body, { status });
}
export async function readBody(request: Request): Promise<unknown> {
  // Bound bytes as well as fields before constructing a potentially huge JSON object.
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_request");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 128000) {
      await reader.cancel();
      throw new Error("invalid_request");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export const invalidRequest = () =>
  Response.json(
    {
      code: "invalid_request",
      error: "Invalid JSON, unsupported roles, empty or over-long input.",
    },
    { status: 400 },
  );
