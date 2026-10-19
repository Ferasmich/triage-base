export type EvaluationRow = {
  ticket_id: string;
  tags: string;
  expected: { category: string; priority: string };
  output: {
    category: string;
    priority: string;
    summary: string;
    suggested_action: string;
  } | null;
  status: number;
  outcome: string;
  latency_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
};
export function metrics(rows: EvaluationRow[]) {
  const outcomes: Record<string, number> = {};
  const category_confusion: Record<string, Record<string, number>> = {};
  const priority_confusion: Record<string, Record<string, number>> = {};
  const matrix = (
    m: Record<string, Record<string, number>>,
    expected: string,
    actual: string,
  ) => {
    m[expected] ??= {};
    m[expected][actual] = (m[expected][actual] || 0) + 1;
  };
  for (const r of rows) {
    outcomes[r.status] = (outcomes[r.status] || 0) + 1;
    matrix(
      category_confusion,
      r.expected.category,
      r.output?.category || "NO_OUTPUT",
    );
    matrix(
      priority_confusion,
      r.expected.priority,
      r.output?.priority || "NO_OUTPUT",
    );
  }
  const accuracy = (key: "category" | "priority", subset: EvaluationRow[]) =>
    subset.length
      ? subset.filter((r) => r.output?.[key] === r.expected[key]).length /
        subset.length
      : null;
  const tags = [
    ...new Set(
      rows.flatMap((r) =>
        r.tags
          .split(/[;,|]/)
          .map((t) => t.trim())
          .filter(Boolean),
      ),
    ),
  ];
  return {
    count: rows.length,
    successful_count: rows.filter((r) => r.status === 200).length,
    successful_category_accuracy: accuracy(
      "category",
      rows.filter((r) => r.status === 200),
    ),
    successful_priority_accuracy: accuracy(
      "priority",
      rows.filter((r) => r.status === 200),
    ),
    outcomes,
    category_accuracy: accuracy("category", rows),
    priority_accuracy: accuracy("priority", rows),
    category_confusion,
    priority_confusion,
    mean_latency_ms: rows.length
      ? Math.round(rows.reduce((n, r) => n + r.latency_ms, 0) / rows.length)
      : null,
    cost_usd: rows.every((r) => r.cost_usd !== null)
      ? rows.reduce((n, r) => n + r.cost_usd!, 0)
      : null,
    slices: Object.fromEntries(
      tags.map((tag) => {
        const subset = rows.filter((r) =>
          r.tags
            .split(/[;,|]/)
            .map((t) => t.trim())
            .includes(tag),
        );
        return [
          tag,
          {
            count: subset.length,
            category_accuracy: accuracy("category", subset),
            priority_accuracy: accuracy("priority", subset),
          },
        ];
      }),
    ),
  };
}
