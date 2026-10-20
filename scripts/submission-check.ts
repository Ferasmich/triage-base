import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { TriageResponseSchema, TriageSchema } from "../lib/schema";
import { readLogs } from "../lib/logs";
const base = process.env.EVAL_URL || "http://localhost:3033";
const evidence: {
  checked_at: string;
  base_url: string;
  checks: any[];
  status: string;
} = {
  checked_at: new Date().toISOString(),
  base_url: base,
  checks: [],
  status: "RUNNING",
};
const save = () =>
  writeFile(
    "docs/submission-verification.json",
    JSON.stringify(evidence, null, 2) + "\n",
  );
async function post(path: string, body: unknown) {
  const response = await fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(240000),
  });
  return { response, data: await response.json() };
}
async function main() {
  try {
    const labelled = JSON.parse(
      await readFile("data/support_tickets_100_labelled.json", "utf8"),
    );
    const ticket = labelled[0];
    for (const strategy of ["llm", "dm", "dm+llm"] as const) {
      const { response, data } = await post("/api/triage", {
        strategy,
        ticket: { subject: ticket.subject, body: ticket.body },
      });
      const request_id = response.headers.get("x-request-id");
      const calls = (await readLogs()).filter(
        (r) => r.request_id === request_id,
      );
      const record = {
        kind: "triage",
        strategy,
        ticket_id: ticket.ticket_id,
        expected: { category: ticket.category, priority: ticket.priority },
        status: response.status,
        request_id,
        result: data,
        calls,
      };
      evidence.checks.push(record);
      await save();
      assert.equal(response.status, 200, `${strategy} live triage failed`);
      const result = TriageResponseSchema.parse(data);
      assert.equal(result.strategy, strategy);
      assert.equal(
        result.usage.total_tokens,
        result.usage.input_tokens! + result.usage.output_tokens!,
      );
      assert.ok(result.usage.input_tokens! > 0);
      assert.ok(result.usage.output_tokens !== null);
      assert.equal(calls.length, strategy === "dm+llm" ? 2 : 1);
      assert.deepEqual(
        result.models,
        calls.map((r) => r.served_model),
      );
      assert.ok(
        calls.every(
          (r) =>
            r.status === 200 && r.strategy === strategy && !!r.requested_model,
        ),
      );
      assert.equal(
        result.usage.input_tokens,
        calls.reduce((n, r) => n + r.input_tokens!, 0),
      );
      assert.equal(
        result.usage.output_tokens,
        calls.reduce((n, r) => n + r.output_tokens!, 0),
      );
      assert.equal(
        result.cost_usd,
        calls.reduce((n, r) => n + r.cost_usd!, 0),
      );
      if (result.decision) {
        assert.equal(result.triage.category, result.decision.category.choice);
        assert.equal(result.triage.priority, result.decision.priority.choice);
      }
      console.log(
        JSON.stringify({
          kind: "triage",
          strategy,
          status: response.status,
          models: result.models,
          usage: result.usage,
        }),
      );
    }
    for (const strategy of ["llm", "dm", "dm+llm"] as const)
      for (const [dataset, sample_size] of [
        ["100", 3],
        ["500", 2],
      ] as const) {
        const { response, data } = await post("/api/smoke", {
          dataset,
          sample_size,
          strategy,
        });
        evidence.checks.push({
          kind: "smoke",
          strategy,
          dataset,
          status: response.status,
          id: data.id,
          models: data.models,
          metrics: data.metrics,
        });
        await save();
        assert.equal(response.status, 200);
        assert.equal(data.strategy, strategy);
        assert.equal(data.rows.length, sample_size);
        assert.equal(
          new Set(data.rows.map((r: any) => r.ticket_id)).size,
          sample_size,
        );
        assert.ok(
          data.metrics.successful_count > 0,
          `${strategy}/${dataset} had no successful live smoke results`,
        );
        for (const row of data.rows)
          if (row.status === 200) {
            TriageSchema.parse(row.output);
            assert.ok(
              row.calls.every(
                (r: any) => r.strategy === strategy && r.served_model,
              ),
            );
          }
        if (dataset === "500")
          assert.equal(data.metrics.category_accuracy, null);
        console.log(
          JSON.stringify({
            kind: "smoke",
            strategy,
            dataset,
            id: data.id,
            metrics: data.metrics,
          }),
        );
      }
    const count = (await readLogs()).length;
    for (const [path, body] of [
      [
        "/api/triage",
        { strategy: "invalid", ticket: { subject: "", body: "help" } },
      ],
      ["/api/triage", { ticket: { subject: "", body: " " } }],
      ["/api/smoke", { dataset: "100", sample_size: 101, strategy: "dm" }],
    ] as const) {
      const { response, data } = await post(path, body);
      assert.equal(response.status, 400);
      assert.equal(typeof data.error, "string");
      evidence.checks.push({
        kind: "validation",
        path,
        status: response.status,
        code: data.code,
      });
    }
    assert.equal(
      (await readLogs()).length,
      count,
      "Invalid requests must not call providers",
    );
    for (const path of ["/", "/triage", "/smoke", "/admin"]) {
      const r = await fetch(base + path);
      assert.equal(r.status, 200);
      const html = await r.text();
      if (path === "/admin")
        for (const run of evidence.checks.filter((c) => c.kind === "smoke"))
          assert.ok(html.includes(run.id));
      evidence.checks.push({ kind: "page", path, status: r.status });
    }
    evidence.status = "PASS";
    await save();
    console.log("Submission integration checks passed.");
  } catch (error) {
    evidence.status = "FAIL";
    await save();
    console.error(
      error instanceof Error
        ? error.message
        : "Submission integration check failed",
    );
    process.exitCode = 1;
  }
}
main().catch(() => {
  console.error("Submission check runner failed.");
  process.exitCode = 1;
});
