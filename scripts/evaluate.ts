import { readFile, mkdir, writeFile } from "node:fs/promises";
import { readLogs } from "../lib/logs";
import { metrics, type EvaluationRow } from "../lib/evaluation";
import { PROMPT_VERSION } from "../lib/prompt";
async function main() {
  const tickets = JSON.parse(
    await readFile("data/support_tickets_100_labelled.json", "utf8"),
  );
  const limit = Number(process.env.EVAL_LIMIT || tickets.length);
  const base = process.env.EVAL_URL || "http://localhost:3033";
  const rows: EvaluationRow[] = [];
  let runModel = "unknown";
  let runMode = "unknown";
  let runProvider = "unknown";
  const selected = tickets.slice(0, limit);
  let cursor = 0;
  async function worker() {
    while (cursor < selected.length) {
      const ticket = selected[cursor++];
      const started = Date.now();
      let status = 502;
      let output = null;
      let outcome = "request_failed";
      let requestId: string | null = null;
      try {
        const response = await fetch(`${base}/api/triage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticket: { subject: ticket.subject, body: ticket.body },
          }),
          signal: AbortSignal.timeout(70000),
        });
        requestId = response.headers.get("X-Request-Id");
        status = response.status;
        const body = await response.json();
        output = response.ok ? body.triage : null;
        outcome = response.ok ? "ok" : body.code || "error";
      } catch {
        /* Never persist provider details or ticket text. */
      }
      const log = requestId
        ? (await readLogs()).find((r) => r.request_id === requestId)
        : undefined;
      if (log) {
        runModel = log.model;
        runMode = log.mode;
        runProvider = log.provider;
      }
      rows.push({
        ticket_id: ticket.ticket_id,
        tags: ticket.tags || "",
        expected: { category: ticket.category, priority: ticket.priority },
        output,
        status,
        outcome,
        latency_ms: Date.now() - started,
        input_tokens: log?.input_tokens ?? null,
        output_tokens: log?.output_tokens ?? null,
        cost_usd: log?.cost_usd ?? null,
      });
      if (rows.length % 10 === 0)
        console.log(
          `${rows.length}/${Math.min(limit, tickets.length)} tickets evaluated`,
        );
    }
  }
  await Promise.all(
    Array.from(
      {
        length: Math.max(
          1,
          Math.min(4, Number(process.env.EVAL_CONCURRENCY || 3)),
        ),
      },
      () => worker(),
    ),
  );
  rows.sort(
    (a, b) =>
      selected.findIndex((t: any) => t.ticket_id === a.ticket_id) -
      selected.findIndex((t: any) => t.ticket_id === b.ticket_id),
  );
  const model = runModel;
  const run = {
    created_at: new Date().toISOString(),
    prompt_version: PROMPT_VERSION,
    model,
    provider: runProvider,
    mode: runMode,
    dataset: "support_tickets_100_labelled.json",
    metrics: metrics(rows),
    rows,
  };
  await mkdir("runs", { recursive: true });
  const filename = `runs/${new Date().toISOString().replace(/[:.]/g, "-")}-${PROMPT_VERSION}-${model.replace(/[^a-zA-Z0-9-]/g, "-")}.json`;
  await writeFile(filename, JSON.stringify(run, null, 2) + "\n");
  console.log(filename);
  console.log(JSON.stringify(run.metrics));
}
main().catch(() => {
  console.error("Evaluation failed. Check the local server and configuration.");
  process.exitCode = 1;
});
