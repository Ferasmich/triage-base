import "server-only";
import { randomInt, randomUUID } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { triage } from "./triage";
import { TicketSchema, type Strategy, type DecisionSchema } from "./schema";
import { metrics, type EvaluationRow } from "./evaluation";
import { safeError } from "./errors";
import { readLogs } from "./logs";
import { PROMPT_VERSION } from "./prompt";
export function sample<T>(items: T[], count: number): T[] {
  if (!Number.isInteger(count) || count < 1 || count > items.length)
    throw new Error("Invalid sample size");
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}
export async function runSmoke(
  dataset: "100" | "500",
  count: number,
  strategy: Strategy = "llm",
) {
  const labelled = dataset === "100";
  const filename = labelled
    ? "support_tickets_100_labelled.json"
    : "support_tickets_500.json";
  const tickets = sample(
    JSON.parse(await readFile(`data/${filename}`, "utf8")) as Array<{
      ticket_id: string;
      subject: string;
      body: string;
      category?: string;
      priority?: string;
      tags?: string;
    }>,
    count,
  );
  const rows: (EvaluationRow & {
    model: string | null;
    provider: string | null;
    models: string[];
    attempted_models: string[];
    decision: import("zod").infer<typeof DecisionSchema> | null;
    calls: import("./logs").CallLog[];
  })[] = [];
  for (const ticket of tickets) {
    const started = Date.now(),
      requestId = randomUUID();
    let output = null,
      status = 200,
      outcome = "ok";
    const valid = TicketSchema.safeParse({
      subject: ticket.subject,
      body: ticket.body,
    });
    let decision = null;
    try {
      if (!valid.success) {
        status = 400;
        outcome = "invalid_request";
      } else {
        const result = await triage(valid.data, requestId, strategy);
        output = result.triage;
        decision = result.decision;
      }
    } catch (error) {
      const mapped = safeError(error);
      status = mapped.status;
      outcome = mapped.code;
    }
    const calls = (await readLogs()).filter((r) => r.request_id === requestId);
    const sum = (key: "input_tokens" | "output_tokens" | "cost_usd") =>
      calls.length && calls.every((r) => r[key] !== null)
        ? calls.reduce((n, r) => n + r[key]!, 0)
        : null;
    const models = [
      ...new Set(
        calls.flatMap((r) => (r.served_model ? [r.served_model] : [])),
      ),
    ];
    rows.push({
      ticket_id: ticket.ticket_id,
      tags: ticket.tags || "",
      expected: {
        category: ticket.category || "",
        priority: ticket.priority || "",
      },
      output,
      status,
      outcome,
      latency_ms: Date.now() - started,
      input_tokens: sum("input_tokens"),
      output_tokens: sum("output_tokens"),
      cost_usd: sum("cost_usd"),
      model: models.join(", ") || null,
      models,
      attempted_models: [
        ...new Set(calls.map((r) => r.requested_model || r.model)),
      ],
      decision,
      calls,
      provider: calls.map((r) => r.provider).join(", ") || null,
    });
  }
  const calculated = metrics(rows);
  const run = {
    id: randomUUID(),
    created_at: new Date().toISOString(),
    source: "frontend",
    strategy,
    prompt_version: PROMPT_VERSION,
    decision_prompt_version: strategy === "llm" ? null : "dm-v1",
    dataset: filename,
    labelled,
    models: [...new Set(rows.flatMap((r) => r.models))],
    attempted_models: [...new Set(rows.flatMap((r) => r.attempted_models))],
    metrics: {
      ...calculated,
      category_accuracy: labelled ? calculated.category_accuracy : null,
      priority_accuracy: labelled ? calculated.priority_accuracy : null,
      successful_category_accuracy: labelled
        ? calculated.successful_category_accuracy
        : null,
      successful_priority_accuracy: labelled
        ? calculated.successful_priority_accuracy
        : null,
      category_confusion: labelled ? calculated.category_confusion : {},
      priority_confusion: labelled ? calculated.priority_confusion : {},
      slices: labelled ? calculated.slices : {},
      category_mismatches: labelled
        ? rows.filter((r) => r.output?.category !== r.expected.category).length
        : null,
      priority_mismatches: labelled
        ? rows.filter((r) => r.output?.priority !== r.expected.priority).length
        : null,
      outcome_counts: rows.reduce<Record<string, number>>((a, r) => {
        a[r.outcome] = (a[r.outcome] || 0) + 1;
        return a;
      }, {}),
    },
    rows,
  };
  await mkdir("runs", { recursive: true });
  await writeFile(
    `runs/${run.created_at.replace(/[:.]/g, "-")}-smoke-${run.id}.json`,
    JSON.stringify(run, null, 2) + "\n",
  );
  return run;
}
