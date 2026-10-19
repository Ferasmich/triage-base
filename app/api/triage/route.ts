import { triage } from "../../../lib/triage";
import { TriageRequestSchema } from "../../../lib/schema";
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
  if (!parsed.success) return invalidRequest();
  const requestId = crypto.randomUUID();
  try {
    return Response.json(
      {
        ...(await triage(parsed.data.ticket, requestId)),
        prompt_version: PROMPT_VERSION,
      },
      { headers: { "X-Request-Id": requestId } },
    );
  } catch (error) {
    const response = errorResponse(error);
    response.headers.set("X-Request-Id", requestId);
    return response;
  }
}
