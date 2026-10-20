import { SmokeRequestSchema } from "../../../lib/schema";
import { readBody, invalidRequest, errorResponse } from "../../../lib/errors";
import { runSmoke } from "../../../lib/smoke";
export const runtime = "nodejs";
export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await readBody(request);
  } catch {
    return invalidRequest();
  }
  const parsed = SmokeRequestSchema.safeParse(raw);
  if (!parsed.success)
    return Response.json(
      {
        error: parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
        code: "invalid_request",
      },
      { status: 400 },
    );
  try {
    return Response.json(
      await runSmoke(
        parsed.data.dataset,
        parsed.data.sample_size,
        parsed.data.strategy,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
