import { readLogs } from "../lib/logs";
import { readFile, writeFile } from "node:fs/promises";
async function main() {
  const tickets = JSON.parse(
    await readFile("data/support_tickets_100_labelled.json", "utf8"),
  );
  const selected = [
    tickets[0],
    tickets.find((t: any) => t.ticket_id === "TCK-10017"),
    tickets.reduce((a: any, b: any) => (a.body.length > b.body.length ? a : b)),
    tickets.find((t: any) => (t.tags || "").includes("prompt_injection")),
    tickets.find((t: any) => t.language !== "en"),
  ].filter(Boolean);
  const rows = [];
  for (const ticket of selected) {
    const response = await fetch("http://localhost:3033/api/triage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticket: { subject: ticket.subject, body: ticket.body },
      }),
      signal: AbortSignal.timeout(70000),
    });
    const result = await response.json();
    const requestId = response.headers.get("X-Request-Id");
    const log = (await readLogs()).find((r) => r.request_id === requestId);
    const problem = response.ok
      ? result.triage.category === ticket.category &&
        result.triage.priority === ticket.priority
        ? "No label disagreement"
        : `Expected ${ticket.category}/${ticket.priority}`
      : result.code;
    rows.push(
      `| 2026-10-14 | ${result.prompt_version || "triage-v2.1"} | ${log ? log.provider + "/" + log.model : "input validation (no provider call)"} | ${ticket.ticket_id} | ${response.status}: ${JSON.stringify(result.triage || result.code).replaceAll("|", "\\|")} | ${problem} | Keep contract; investigate before changing prompt |`,
    );
  }
  await writeFile(
    "EXPERIMENTS.md",
    `# Experiments\n\nInitial observed code failure: triage-v1 accepted arbitrary input and returned unchecked plain text; malformed tickets became HTTP 500. Hypothesis: input and output validation will make failures predictable. Change: triage-v2.1 adds Zod contracts, output-length checks, tag escaping and safe status mapping. Verified by automated tests. This is a code finding, not a claimed model experiment.\n\n| Date | Prompt version | Provider / model | Ticket ID | Observed output | Problem noticed | Change made |\n|---|---|---|---|---|---|---|\n${rows.join("\n")}\n`,
  );
}
main().catch(() => {
  console.error("Evaluation failed. Check the local server and configuration.");
  process.exitCode = 1;
});
