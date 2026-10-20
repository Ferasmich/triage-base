"use client";
import type { Strategy, DecisionSchema } from "../lib/schema";
import type { z } from "zod";
export function StrategySelect({
  value,
  onChange,
  disabled,
}: {
  value: Strategy;
  onChange: (s: Strategy) => void;
  disabled: boolean;
}) {
  return (
    <>
      <label htmlFor="strategy">Strategy</label>
      <select
        id="strategy"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as Strategy)}
      >
        <option value="llm">LLM — classify and write</option>
        <option value="dm">DM — classify with template text</option>
        <option value="dm+llm">
          DM+LLM — DM labels, LLM summary and action
        </option>
      </select>
    </>
  );
}
export function DecisionDetails({
  decision,
}: {
  decision: z.infer<typeof DecisionSchema>;
}) {
  return (
    <details>
      <summary>Decision Model probabilities and confidence</summary>
      {(["category", "priority"] as const).map((key) => (
        <div key={key}>
          <strong>
            {key}: {decision[key].choice}
          </strong>
          <p>Confidence: {decision[key].confidence.toFixed(4)}</p>
          <ul>
            {Object.entries(decision[key].probabilities).map(([label, p]) => (
              <li key={label}>
                {label}: {(p * 100).toFixed(2)}%
              </li>
            ))}
          </ul>
        </div>
      ))}
    </details>
  );
}
