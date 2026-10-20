import { triage } from "../../../lib/triage";
import { TriageRequestSchema, TriageResponseSchema } from "../../../lib/schema";
import { PROMPT_VERSION } from "../../../lib/prompt";
import { readBody, invalidRequest, errorResponse } from "../../../lib/errors";
export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await readBody(request);
  } catch {
    return invalidRequest();
  }
  const parsed = TriageRequestSchema.safeParse(raw);
  if (!parsed.success)
    return Response.json(
      {
        code: "invalid_request",
        error: parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      { status: 400 },
    );
  const requestId = crypto.randomUUID();
  try {
    return Response.json(
      TriageResponseSchema.parse({
        ...(await triage(parsed.data.ticket, requestId, parsed.data.strategy)),
        prompt_version: PROMPT_VERSION,
      }),
      { headers: { "X-Request-Id": requestId } },
    );
  } catch (error) {
    const response = errorResponse(error);
    response.headers.set("X-Request-Id", requestId);
    return response;
  }
}
