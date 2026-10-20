import assert from "node:assert/strict";
import { writeFile, readFile } from "node:fs/promises";
const base = process.env.EVAL_URL || "http://localhost:3033";
const evidence = {
  checked_at: new Date().toISOString(),
  base_url: base,
  triage: [],
  runs: [],
  pages: [],
};
async function checkpoint() {
  await writeFile(
    "docs/c5-live-verification.json",
    JSON.stringify(evidence, null, 2) + "\n",
  );
}
async function post(path, body) {
  const response = await fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(240000),
  });
  return { response, data: await response.json() };
}
const ticket = {
  subject: "Duplicate invoice charge",
  body: "Please refund the duplicate charge on my latest invoice. This is a routine billing request.",
};
for (const strategy of ["dm", "llm", "dm+llm"]) {
  const { response, data } = await post("/api/triage", { ticket, strategy });
  evidence.triage.push({
    strategy,
    status: response.status,
    request_id: response.headers.get("x-request-id"),
    result: data,
  });
  await checkpoint();
  if (strategy === "dm") {
    assert.equal(response.status, 200);
    assert.equal(data.triage.category, "billing");
    assert.equal(data.text_source, "template");
    assert.equal(data.model, "vllm-sr/d3-flash");
    assert.equal(data.usage.output_tokens, 0);
  }
  console.log(
    JSON.stringify({
      strategy,
      status: response.status,
      model: data.model,
      code: data.code,
    }),
  );
}
for (const [dataset, sample_size, strategy] of [
  ["100", 20, "dm"],
  ["500", 5, "dm"],
  ["100", 2, "llm"],
  ["100", 2, "dm+llm"],
]) {
  const { response, data } =
    dataset === "100" && strategy === "dm" && process.env.C5_LABELLED_RUN
      ? {
          response: { status: 200 },
          data: JSON.parse(await readFile(process.env.C5_LABELLED_RUN, "utf8")),
        }
      : await post("/api/smoke", { dataset, sample_size, strategy });
  assert.equal(response.status, 200);
  assert.equal(data.rows.length, sample_size);
  assert.equal(data.strategy, strategy);
  if (strategy === "dm")
    assert.ok(
      data.metrics.successful_count > 0,
      "Expected at least one successful live DM result; validation failures stay in metrics",
    );
  if (dataset === "500") assert.equal(data.metrics.category_accuracy, null);
  evidence.runs.push({
    id: data.id,
    dataset: data.dataset,
    strategy: data.strategy,
    models: data.models,
    attempted_models: data.attempted_models,
    metrics: data.metrics,
  });
  await checkpoint();
  console.log(JSON.stringify(evidence.runs.at(-1)));
}
assert.equal(
  (await post("/api/triage", { ticket, strategy: "invalid" })).response.status,
  400,
);
assert.equal(
  (
    await post("/api/smoke", {
      dataset: "100",
      sample_size: 101,
      strategy: "dm",
    })
  ).response.status,
  400,
);
for (const path of ["/", "/triage", "/smoke", "/admin"]) {
  const r = await fetch(base + path);
  assert.equal(r.status, 200);
  const html = await r.text();
  if (path === "/admin") {
    assert.ok(html.includes("vllm-sr/d3-flash"));
    assert.ok(html.includes(evidence.runs[0].id));
  }
  if (path === "/triage" || path === "/smoke")
    assert.ok(html.includes('value="dm+llm"'));
  evidence.pages.push({ path, status: r.status });
}
await writeFile(
  "docs/c5-live-verification.json",
  JSON.stringify(evidence, null, 2) + "\n",
);
console.log(
  "C5 live checks completed; inspect evidence for LLM and hybrid outcomes.",
);
