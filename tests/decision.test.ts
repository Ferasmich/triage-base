import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { POST } from "../app/api/triage/route";
import { runSmoke } from "../lib/smoke";
import { readLogs } from "../lib/logs";
import { DMResponseSchema } from "../lib/schema";
const decision = {
  model: "served-dm-v3",
  usage: { input_tokens: 100, output_tokens: 0 },
  answers: {
    category: {
      type: "choice",
      choice: "billing",
      probabilities: {
        billing: 0.7,
        technical_bug: 0.1,
        account: 0.1,
        feature_request: 0.1,
      },
      confidence: 0.6,
    },
    priority: {
      type: "choice",
      choice: "low",
      probabilities: { low: 0.8, medium: 0.1, high: 0.1 },
      confidence: 0.7,
    },
  },
};
test("DM contract rejects invalid labels, partial answers, bad probability values and distributions", () => {
  assert.equal(DMResponseSchema.safeParse(decision).success, true);
  for (const mutate of [
    (v: any) => {
      v.answers.category.choice = "other";
    },
    (v: any) => {
      delete v.answers.priority;
    },
    (v: any) => {
      v.answers.priority.probabilities.low = -1;
    },
    (v: any) => {
      delete v.answers.category.probabilities.billing;
    },
    (v: any) => {
      v.answers.priority.probabilities.low = 0.1;
    },
    (v: any) => {
      v.answers.category.confidence = 2;
    },
  ]) {
    const v = structuredClone(decision);
    mutate(v);
    assert.equal(DMResponseSchema.safeParse(v).success, false);
  }
});
test("DM and hybrid routes, model tracking, smoke aggregation and failure isolation", async () => {
  const cwd = process.cwd(),
    env = { ...process.env };
  process.chdir(await mkdtemp(path.join(tmpdir(), "triage-dm-test-")));
  let dmStatus = 200,
    llmStatus = 200,
    invalidDM = false,
    changedLabels = false;
  const calls: { url: string; body: any }[] = [];
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    calls.push({ url: req.url!, body });
    const isDM = req.url === "/v1/systemone",
      status = isDM ? dmStatus : llmStatus;
    res.writeHead(status, {
      "Content-Type": "application/json",
      "X-Request-Id": "provider-id",
    });
    res.end(
      JSON.stringify(
        status !== 200
          ? { error: { message: "secret-provider-details" } }
          : isDM
            ? invalidDM
              ? { ...decision, answers: {} }
              : decision
            : {
                model: "served-llm-v2",
                choices: [
                  {
                    index: 0,
                    finish_reason: "stop",
                    message: {
                      role: "assistant",
                      content: JSON.stringify({
                        category: changedLabels ? "account" : "billing",
                        priority: "low",
                        summary: "Invoice request",
                        suggested_action: "Review the invoice.",
                      }),
                    },
                  },
                ],
                usage: {
                  prompt_tokens: 10,
                  completion_tokens: 5,
                  total_tokens: 15,
                },
              },
      ),
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  Object.assign(process.env, {
    DM_BASE_URL: base,
    DM_MODEL: "requested-dm",
    DECISION_API_KEY: "test",
    LLM_BASE_URL: base + "/v1",
    LLM_MODEL: "requested-llm",
    LLM_API_KEY: "test",
    LLM_INPUT_PRICE_PER_MILLION: "1",
    LLM_OUTPUT_PRICE_PER_MILLION: "2",
  });
  const request = (strategy: string) =>
    new Request("http://localhost/api/triage", {
      method: "POST",
      body: JSON.stringify({
        ticket: { subject: "Invoice", body: "Update invoice" },
        strategy,
      }),
    });
  try {
    let response = await POST(request("dm")),
      body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.strategy, "dm");
    assert.equal(body.text_source, "template");
    assert.equal(body.decision.category.choice, "billing");
    assert.deepEqual(body.models, ["served-dm-v3"]);
    assert.equal(body.usage.total_tokens, 100);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.model, "requested-dm");
    assert.equal(typeof calls[0].body.state, "string");
    response = await POST(request("dm+llm"));
    body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body.models, ["served-dm-v3", "served-llm-v2"]);
    assert.equal(body.usage.total_tokens, 115);
    assert.match(
      calls.at(-1)!.body.messages[0].content,
      /Keep category=billing and priority=low exactly/,
    );
    changedLabels = true;
    assert.equal((await POST(request("dm+llm"))).status, 502);
    assert.equal((await readLogs()).at(-1)!.error_code, "invalid_model_output");
    changedLabels = false;
    const before = calls.length;
    assert.equal((await POST(request("fake"))).status, 400);
    assert.equal(calls.length, before);
    await mkdir("data");
    const tickets = [
      {
        ticket_id: "A",
        subject: "Invoice",
        body: "Update invoice",
        category: "billing",
        priority: "low",
      },
    ];
    await writeFile(
      "data/support_tickets_100_labelled.json",
      JSON.stringify(tickets),
    );
    await writeFile(
      "data/support_tickets_500.json",
      JSON.stringify(tickets.map(({ category, priority, ...t }) => t)),
    );
    const run = await runSmoke("100", 1, "dm+llm");
    assert.equal(run.strategy, "dm+llm");
    assert.equal(run.rows[0].input_tokens, 110);
    assert.equal(run.rows[0].calls.length, 2);
    assert.equal(run.metrics.category_accuracy, 1);
    assert.equal(
      run.metrics.cost_usd,
      null,
      "Unknown DM host pricing must stay unknown",
    );
    assert.equal(
      (await runSmoke("500", 1, "dm")).metrics.category_accuracy,
      null,
    );
    llmStatus = 404;
    const failed = await runSmoke("100", 1, "dm+llm");
    assert.equal(failed.rows[0].output, null);
    assert.deepEqual(failed.models, ["served-dm-v3"]);
    assert.deepEqual(failed.attempted_models, [
      "requested-dm",
      "requested-llm",
    ]);
    assert.equal(failed.rows[0].calls[1].provider_status, 404);
    assert.equal(failed.metrics.category_mismatches, 1);
    invalidDM = true;
    const callCount = calls.length;
    response = await POST(request("dm+llm"));
    assert.equal(response.status, 502);
    assert.equal((await response.json()).code, "invalid_dm_output");
    assert.equal(
      calls.length,
      callCount + 1,
      "Invalid DM must prevent LLM call",
    );
    invalidDM = false;
    for (const [status, expected, code] of [
      [401, 500, "dm_configuration"],
      [429, 429, "dm_rate_limited"],
      [503, 502, "dm_unavailable"],
      [504, 504, "dm_timeout"],
    ] as const) {
      dmStatus = status;
      response = await POST(request("dm"));
      assert.equal(response.status, expected);
      body = await response.json();
      assert.equal(body.code, code);
      assert.ok(!JSON.stringify(body).includes("secret-provider-details"));
    }
    const logs = await readLogs();
    assert.ok(logs.every((r) => ["dm", "dm+llm"].includes(r.strategy!)));
    assert.ok(logs.some((r) => r.served_model === "served-llm-v2"));
  } finally {
    process.env = env;
    process.chdir(cwd);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
