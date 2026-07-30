import type { ParsedCsv } from "./csv";
import { SAMPLE_QUESTIONS } from "./sampleData";

// The meta engine answers questions about the TOOL/dataset STRUCTURE (what
// columns exist, what can be asked) rather than its data VALUES. Unlike the
// other three engines, this needs no second LLM call at all — everything
// here was already known the moment the CSV was parsed, so the answer is
// plain string templating: instant, free, and impossible to hallucinate
// since there's no model in the loop for this step.

export function buildMetaAnswer(csv: ParsedCsv): string {
  const realColumns = csv.columns.filter((c) => c.type !== "empty");
  const columnList = realColumns.map((c) => `${c.name} (${c.type})`).join(", ");

  const intro =
    `This dataset ("${csv.fileName}") has ${csv.totalRows.toLocaleString("en-US")} rows and ` +
    `${realColumns.length} column${realColumns.length === 1 ? "" : "s"}: ${columnList}.`;

  const examples = SAMPLE_QUESTIONS.slice(0, 3)
    .map((q) => `"${q}"`)
    .join(", ");

  const capability =
    `You can ask about counts, sums, averages, filters, grouped breakdowns, correlations, trends, ` +
    `outliers, or open-ended questions like "give me an overview" — every answer is either computed ` +
    `and verified against the real data or, for open-ended questions, narrated from real precomputed ` +
    `statistics. It never just guesses. A few examples: ${examples}.`;

  return `${intro} ${capability}`;
}
