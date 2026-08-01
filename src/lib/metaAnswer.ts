import type { ParsedCsv } from "./csv";
import { SAMPLE_QUESTIONS } from "./sampleData";

// The meta engine answers questions about the TOOL/dataset STRUCTURE (what
// columns exist, what can be asked) rather than its data VALUES. Unlike the
// other three engines, this needs no second LLM call at all — everything
// here was already known the moment the CSV was parsed, so the answer is
// plain string templating: instant, free, and impossible to hallucinate
// since there's no model in the loop for this step.
//
// Phase 27: the router already tells us this is a meta question, but not
// *which kind* — "what columns do you have" and "what can I ask you" want
// different emphasis even though both are meta. This adds a cheap, purely
// local heuristic (no contract change, no added LLM cost) to lead with
// whichever the question actually seems to want, plus one real example row
// for concreteness.

type MetaIntent = "columns" | "capability" | "general";

function classifyMetaIntent(question: string): MetaIntent {
  const q = question.toLowerCase();
  const columnsSignal = /\b(columns?|fields?|schema|structure)\b/.test(q);
  const capabilitySignal = /\b(ask|can you|could you|capable|help|what can|do you)\b/.test(q);
  if (columnsSignal && !capabilitySignal) return "columns";
  if (capabilitySignal && !columnsSignal) return "capability";
  return "general";
}

function formatExampleRow(csv: ParsedCsv): string | null {
  const firstRow = csv.rows[0];
  if (!firstRow) return null;
  const realColumns = csv.columns.filter((c) => c.type !== "empty");
  if (realColumns.length === 0) return null;
  const parts = realColumns.map((c) => `${c.name}: ${firstRow[c.name] ?? ""}`);
  return parts.join(", ");
}

export function buildMetaAnswer(csv: ParsedCsv, question: string): string {
  const realColumns = csv.columns.filter((c) => c.type !== "empty");
  const columnList = realColumns.map((c) => `${c.name} (${c.type})`).join(", ");
  const rowCountText = `${csv.totalRows.toLocaleString("en-US")} row${csv.totalRows === 1 ? "" : "s"}`;
  const columnCountText = `${realColumns.length} column${realColumns.length === 1 ? "" : "s"}`;

  const exampleRow = formatExampleRow(csv);
  const exampleSentence = exampleRow ? ` For example, the first row is: ${exampleRow}.` : "";

  const examples = SAMPLE_QUESTIONS.slice(0, 3)
    .map((q) => `"${q}"`)
    .join(", ");
  const capabilitySentence =
    `You can ask about counts, sums, averages, filters, grouped breakdowns, correlations, trends, ` +
    `outliers, or open-ended questions like "give me an overview" — every answer is either computed ` +
    `and verified against the real data or, for open-ended questions, narrated from real precomputed ` +
    `statistics. It never just guesses. A few examples: ${examples}.`;

  const intent = classifyMetaIntent(question);

  if (intent === "columns") {
    // Leads with the column list; capability info is what they didn't ask for, so it's dropped.
    return (
      `This dataset ("${csv.fileName}") has ${rowCountText} and ${columnCountText}: ${columnList}.` +
      exampleSentence
    );
  }

  if (intent === "capability") {
    // Leads with what can be asked; the full column list is what they didn't ask for, so it's dropped.
    return `This dataset ("${csv.fileName}") has ${rowCountText} across ${columnCountText}. ${capabilitySentence}`;
  }

  // "What is this dataset about" and similar — genuinely ambiguous between
  // the two, so give the full picture: columns, an example, and capability.
  return (
    `This dataset ("${csv.fileName}") has ${rowCountText} and ${columnCountText}: ${columnList}.` +
    exampleSentence +
    ` ${capabilitySentence}`
  );
}
