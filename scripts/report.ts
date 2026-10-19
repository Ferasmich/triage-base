import { readFile, readdir, writeFile } from "node:fs/promises";
import { metrics } from "../lib/evaluation";
async function main() {
  const files = (await readdir("runs")).filter((f) => f.endsWith(".json"));
  const full = [];
  for (const file of files) {
    const run = JSON.parse(await readFile(`runs/${file}`, "utf8"));
    for (const row of run.rows) {
      if (row.status !== 200 && row.outcome !== "invalid_model_output") {
        row.input_tokens = null;
        row.output_tokens = null;
      }
    }
    run.metrics = metrics(run.rows);
    await writeFile(`runs/${file}`, JSON.stringify(run, null, 2) + "\n");
    if (run.rows.length === 100) full.push({ file, ...run });
  }
  const percent = (n: number | null) =>
    n === null ? "Unknown" : (n * 100).toFixed(1) + "%";
  const rows = full.map(
    (r) =>
      `| [${r.model}](runs/${r.file}) | ${r.metrics.successful_count}/100 | ${JSON.stringify(r.metrics.outcomes)} | ${percent(r.metrics.category_accuracy)} / ${percent(r.metrics.priority_accuracy)} | ${percent(r.metrics.successful_category_accuracy)} / ${percent(r.metrics.successful_priority_accuracy)} | ${r.metrics.mean_latency_ms} | ${r.metrics.cost_usd ?? "Unknown"} |`,
  );
  const base = (await readFile("README.md", "utf8")).split(
    "\n## Measured comparison",
  )[0];
  const successfulLatency = full.map((r) => ({
    model: r.model,
    mean: Math.round(
      r.rows
        .filter((row: any) => row.status === 200)
        .reduce((n: number, row: any) => n + row.latency_ms, 0) /
        (r.metrics.successful_count || 1),
    ),
    input: r.rows
      .filter((row: any) => row.input_tokens !== null)
      .reduce((n: number, row: any) => n + row.input_tokens, 0),
    output: r.rows
      .filter((row: any) => row.output_tokens !== null)
      .reduce((n: number, row: any) => n + row.output_tokens, 0),
  }));
  await writeFile(
    "README.md",
    `${base}\n## Measured comparison — 14 October 2026\n\nBoth functioning models used triage-v2.1, prompt-only JSON, the same 100 tickets and bounded concurrency of 3. The retired Llama run is failure evidence, not a quality score.\n\n| Model / run evidence | Valid results | HTTP counts | All-ticket category / priority | Successful-only category / priority | Mean latency, all outcomes (ms) | USD |\n|---|---|---|---|---|---|---|\n${rows.join("\n")}\n\nThree observed differences:\n\n1. DiffusionGemma returned many more 429 responses than Nemotron in these runs. Rate limiting and different successful subsets confound accuracy comparisons. No claim of equal load or production throughput is made.\n2. Successful-call mean latency and reported tokens differed: ${successfulLatency
      .filter((r) => !r.model.includes("llama"))
      .map(
        (r) =>
          `${r.model}: ${r.mean}ms, ${r.input} input / ${r.output} output tokens reported across the run`,
      )
      .join(
        "; ",
      )}. Fast failed calls explain why all-outcome latency alone is misleading.\n3. The old Llama configuration returned upstream HTTP 410, while Nemotron and DiffusionGemma produced locally validated JSON. Strict-schema capability probes are saved in [provider-capabilities.json](docs/provider-capabilities.json); accepting a schema request does not establish full upstream constraint enforcement.\n\nTask choice: keep Nemotron as the current triage default because it completed more tickets in this run, and explore DiffusionGemma for low-latency drafts subject to human review until throttled repeat runs establish comparable accuracy and availability.\n\nNo hosted cost winner can be established without account-specific prices. Follow-up: rerun sequentially or at a measured sustainable rate after cooldown, then compare matched successful ticket IDs.\n`,
  );
}
main().catch(() => {
  console.error("Report generation failed.");
  process.exitCode = 1;
});
