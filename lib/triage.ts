import "server-only";
import { complete } from "./llm";
import { TRIAGE_SYSTEM_PROMPT, wrapTicket } from "./prompt";
export async function triage(
  ticket: { subject: string; body: string },
  requestId?: string,
) {
  return complete(
    [
      { role: "system", content: TRIAGE_SYSTEM_PROMPT },
      { role: "user", content: wrapTicket(ticket) },
    ],
    "triage",
    requestId,
  );
}
