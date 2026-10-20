import { z } from "zod";
import { TicketSchema, TriageSchema } from "../../../../lib/schema";
import { EXPLAIN_SYSTEM_PROMPT, wrapTicket } from "../../../../lib/prompt";
import { explainStream, recordStream } from "../../../../lib/llm";
import {
  readBody,
  invalidRequest,
  errorResponse,
  safeError,
  InvalidOutputError,
} from "../../../../lib/errors";
export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await readBody(request);
  } catch {
    return invalidRequest();
  }
  const parsed = z
    .object({ ticket: TicketSchema, triage: TriageSchema })
    .safeParse(raw);
  if (!parsed.success) return invalidRequest();
  try {
    const { stream, cfg, started } = await explainStream(
      [
        { role: "system", content: EXPLAIN_SYSTEM_PROMPT },
        {
          role: "user",
          content: `${wrapTicket(parsed.data.ticket)}\nValidated decision: ${JSON.stringify(parsed.data.triage)}`,
        },
      ],
      request.signal,
    );
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      async start(controller) {
        let usage;
        let servedModel: string | undefined;
        let status = 200;
        let code;
        const send = (event: unknown) =>
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        try {
          for await (const chunk of stream) {
            if (chunk.model) servedModel = chunk.model;
            if (chunk.usage) usage = chunk.usage;
            if (chunk.choices[0]?.finish_reason === "length")
              throw new InvalidOutputError();
            const text = chunk.choices[0]?.delta.content;
            if (text) send({ text });
          }
          send({ done: true });
        } catch (error) {
          const mapped = safeError(error);
          status = mapped.status;
          code = mapped.code;
          if (!request.signal.aborted) send({ error: mapped.error });
        } finally {
          await recordStream(cfg, started, status, usage, code, servedModel);
          controller.close();
        }
      },
      cancel() {
        stream.controller.abort();
      },
    });
    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
