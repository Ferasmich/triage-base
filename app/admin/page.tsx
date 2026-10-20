import { readLogs, readRuns } from "../../lib/logs";
export const dynamic = "force-dynamic";
export default async function AdminPage() {
  const [logs, runs] = await Promise.all([readLogs(), readRuns()]);
  const groups = new Map<string, typeof logs>();
  for (const row of logs) {
    const key = `${row.strategy || "llm"} / ${row.prompt_version} / ${row.api} / ${row.provider} / ${row.model}`;
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  const sum = (
    rows: typeof logs,
    key: "input_tokens" | "output_tokens" | "cost_usd",
  ) =>
    rows.every((r) => r[key] !== null)
      ? rows
          .reduce((n, r) => n + (r[key] || 0), 0)
          .toLocaleString("en", { maximumFractionDigits: 6 })
      : "Unknown (usage or pricing unavailable)";
  const statuses = logs.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
  return (
    <main className="admin">
      <h1>Usage and evaluation</h1>
      <p>
        {logs.length} calls · {logs.filter((r) => r.status >= 400).length}{" "}
        errors · total cost: {sum(logs, "cost_usd")}
      </p>
      <p>
        Status counts:{" "}
        {Object.entries(statuses)
          .map(([status, count]) => `${status}: ${count}`)
          .join(" · ") || "No calls yet"}
      </p>
      <h2>Totals by prompt, API and model</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Configuration</th>
              <th>Calls</th>
              <th>Errors</th>
              <th>Input tokens</th>
              <th>Output tokens</th>
              <th>USD</th>
            </tr>
          </thead>
          <tbody>
            {[...groups].map(([key, rows]) => (
              <tr key={key}>
                <td>{key}</td>
                <td>{rows.length}</td>
                <td>{rows.filter((r) => r.status >= 400).length}</td>
                <td>{sum(rows, "input_tokens")}</td>
                <td>{sum(rows, "output_tokens")}</td>
                <td>{sum(rows, "cost_usd")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Saved run comparison</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Run</th>
              <th>Strategy / served / attempted models</th>
              <th>Outcomes</th>
              <th>Category accuracy</th>
              <th>Priority accuracy</th>
              <th>Mean latency (ms)</th>
              <th>USD</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.file}>
                <td>{run.file}</td>
                <td>
                  {run.strategy || "llm"} /{" "}
                  {run.models?.join(", ") || run.model || "None confirmed"} /{" "}
                  {run.attempted_models?.join(", ") || "—"}
                </td>
                <td>
                  {JSON.stringify(
                    run.metrics?.outcome_counts || run.metrics?.outcomes,
                  )}
                </td>
                <td>{run.metrics?.category_accuracy ?? "—"}</td>
                <td>{run.metrics?.priority_accuracy ?? "—"}</td>
                <td>{run.metrics?.mean_latency_ms ?? "—"}</td>
                <td>{run.metrics?.cost_usd ?? "Unknown"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Calls</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Route</th>
              <th>Strategy</th>
              <th>Served / attempted model</th>
              <th>Status</th>
              <th>Attempts</th>
              <th>Latency</th>
              <th>Tokens in / out / total</th>
              <th>USD</th>
            </tr>
          </thead>
          <tbody>
            {logs
              .slice()
              .reverse()
              .map((row, i) => (
                <tr key={i}>
                  <td>{row.ts}</td>
                  <td>{row.route}</td>
                  <td>{row.strategy || "llm"}</td>
                  <td>
                    {row.served_model ?? "Unconfirmed (legacy or failed call)"}{" "}
                    / {row.requested_model || row.model}
                  </td>
                  <td>
                    {row.status} {row.error_code}{" "}
                    {row.provider_status && `(provider ${row.provider_status})`}
                  </td>
                  <td>{row.attempts}</td>
                  <td>{row.latency_ms} ms</td>
                  <td>
                    {row.input_tokens ?? "?"} / {row.output_tokens ?? "?"} /{" "}
                    {row.input_tokens !== null && row.output_tokens !== null
                      ? row.input_tokens + row.output_tokens
                      : "?"}
                  </td>
                  <td>{row.cost_usd ?? "Unknown"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
