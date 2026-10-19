import { complete } from "../../../lib/llm";
import { CHAT_SYSTEM_PROMPT } from "../../../lib/prompt";
import { ChatRequestSchema } from "../../../lib/schema";
import { readBody, invalidRequest, errorResponse } from "../../../lib/errors";
export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await readBody(request);
  } catch {
    return invalidRequest();
  }
  const parsed = ChatRequestSchema.safeParse(raw);
  if (!parsed.success) return invalidRequest();
  try {
    return Response.json(
      await complete(
        [
          { role: "system", content: CHAT_SYSTEM_PROMPT },
          ...parsed.data.history,
          { role: "user", content: parsed.data.message.trim() },
        ],
        "chat",
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
