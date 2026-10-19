import { mkdir, writeFile } from "node:fs/promises";
import { complete } from "../lib/llm";
import { safeError } from "../lib/errors";
import { TRIAGE_SYSTEM_PROMPT, wrapTicket } from "../lib/prompt";
async function main() {
  const rows = [];
  for (const model of [
    "nvidia/nemotron-3-super-120b-a12b",
    "google/diffusiongemma-26b-a4b-it",
  ]) {
    process.env.LLM_MODEL = model;
    process.env.LLM_OUTPUT_MODE = "json_schema";
    const started = Date.now();
    try {
      await complete(
        [
          { role: "system", content: TRIAGE_SYSTEM_PROMPT },
          {
            role: "user",
            content: wrapTicket({
              subject: "Invoice update",
              body: "Please add a PO reference to my next invoice.",
            }),
          },
        ],
        "triage",
      );
      rows.push({
        model,
        mode: "json_schema",
        status: 200,
        result: "Accepted schema request and returned locally validated output",
        latency_ms: Date.now() - started,
      });
    } catch (error) {
      const mapped = safeError(error);
      rows.push({
        model,
        mode: "json_schema",
        status: mapped.status,
        result: mapped.code,
        latency_ms: Date.now() - started,
      });
    }
  }
  await mkdir("docs", { recursive: true });
  await writeFile(
    "docs/provider-capabilities.json",
    JSON.stringify(
      {
        checked_at: new Date().toISOString(),
        caveat:
          "One probe per model. An accepted request does not prove every JSON Schema constraint is enforced upstream; Zod always validates locally.",
        rows,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify(rows));
}
main().catch(() => {
  console.error("Capability probe failed.");
  process.exitCode = 1;
});
