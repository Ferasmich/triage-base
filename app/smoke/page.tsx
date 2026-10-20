"use client";
import { useState, type FormEvent } from "react";
import type { runSmoke } from "../../lib/smoke";
import { StrategySelect, DecisionDetails } from "../strategy-controls";
export default function SmokePage() {
  const [dataset, setDataset] = useState("100"),
    [size, setSize] = useState(5);
  const [strategy, setStrategy] =
    useState<import("../../lib/schema").Strategy>("llm");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [run, setRun] = useState<Awaited<ReturnType<typeof runSmoke>> | null>(
    null,
  );
  async function start(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/smoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataset, sample_size: size, strategy }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setRun(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Smoke run failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="admin">
      <h1>Smoke test runner</h1>
      <p>
        Random sampling without replacement. Runs are saved in Admin. Large
        samples can take several minutes; keep this page open.
      </p>
      <form onSubmit={start} aria-busy={busy}>
        <StrategySelect
          value={strategy}
          onChange={setStrategy}
          disabled={busy}
        />
        <label htmlFor="dataset">Dataset</label>
        <select
          id="dataset"
          value={dataset}
          disabled={busy}
          onChange={(e) => {
            setDataset(e.target.value);
            setSize(Math.min(size, Number(e.target.value)));
          }}
        >
          <option value="100">100 labelled tickets</option>
          <option value="500">500 unlabelled tickets</option>
        </select>
        <label htmlFor="sample">Random sample size</label>
        <input
          id="sample"
          type="number"
          min={1}
          max={Number(dataset)}
          required
          value={size}
          disabled={busy}
          onChange={(e) => setSize(Number(e.target.value))}
        />
        <button disabled={busy}>{busy ? "Running…" : "Run smoke test"}</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {run && (
        <section aria-live="polite">
          <h2>Run results</h2>
          <p>
            {run.dataset} · Strategy: {run.strategy} · Served models:{" "}
            {run.models.join(", ") || "No model called"}
          </p>
          <p>
            Outcomes: {JSON.stringify(run.metrics.outcome_counts)} · Mean
            latency: {run.metrics.mean_latency_ms} ms · Cost:{" "}
            {run.metrics.cost_usd === null
              ? "Unknown (pricing or usage unavailable)"
              : `$${run.metrics.cost_usd}`}
          </p>
          {run.labelled ? (
            <p>
              Category accuracy: {run.metrics.category_accuracy} · Priority
              accuracy: {run.metrics.priority_accuracy} · Category mismatches:{" "}
              {run.metrics.category_mismatches} · Priority mismatches:{" "}
              {run.metrics.priority_mismatches} (failures count as mismatches)
            </p>
          ) : (
            <p>
              Accuracy is unavailable because this dataset has no expected
              labels.
            </p>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Outcome</th>
                  <th>Predicted category / priority</th>
                  {run.labelled && <th>Expected category / priority</th>}
                  <th>Tokens input / output / total</th>
                  <th>Served / attempted models</th>
                  <th>DM probabilities</th>
                </tr>
              </thead>
              <tbody>
                {run.rows.map((r) => (
                  <tr key={r.ticket_id}>
                    <td>{r.ticket_id}</td>
                    <td>{r.outcome}</td>
                    <td>
                      {r.output
                        ? `${r.output.category} / ${r.output.priority}`
                        : "No output"}
                    </td>
                    {run.labelled && (
                      <td>
                        {r.expected.category} / {r.expected.priority}
                      </td>
                    )}
                    <td>
                      {r.input_tokens ?? "?"} / {r.output_tokens ?? "?"} /{" "}
                      {r.input_tokens !== null && r.output_tokens !== null
                        ? r.input_tokens + r.output_tokens
                        : "?"}
                    </td>
                    <td>
                      {r.model ?? "No serving model confirmed"} /{" "}
                      {r.attempted_models.join(", ")}
                    </td>
                    <td>
                      {r.decision && <DecisionDetails decision={r.decision} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
