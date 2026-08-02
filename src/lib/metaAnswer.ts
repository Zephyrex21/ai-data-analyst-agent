import type { ParsedCsv } from "./csv";
import { SAMPLE_QUESTIONS } from "./sampleData";

// The meta engine answers questions about the TOOL/dataset STRUCTURE (what
// columns exist, what can be asked) rather than its data VALUES — plus, as
// of Phase 29, greetings and small talk, since those are also "about the
// assistant" rather than about the data. None of this needs a second LLM
// call: everything here was already known the moment the CSV was parsed,
// so every answer in this file is plain string templating — instant, free,
// and impossible to hallucinate since there's no model in the loop.

export type MetaIntent = "greeting" | "acknowledgment" | "columns" | "capability" | "general";

const GREETING_RE = /^(hi|hello|hey+|yo|hiya|howdy|good\s?(morning|afternoon|evening))\b/;
const WHO_ARE_YOU_RE = /\bwho are you\b/;
const ACK_RE = /^(thanks|thank you|thx|ty|cool|nice|great|awesome|got it|ok|okay|k|perfect|sweet|nice one|sounds good)\b[!.]*$/;

export function classifyMetaIntent(question: string): MetaIntent {
  const q = question.toLowerCase().trim();

  // Checked first — short, high-signal phrases that would otherwise get
  // lost against the longer columns/capability regexes below.
  if (GREETING_RE.test(q) || WHO_ARE_YOU_RE.test(q)) return "greeting";
  if (ACK_RE.test(q)) return "acknowledgment";

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

const ACKNOWLEDGMENT_REPLIES = [
  "Anytime — ask away whenever you've got another question.",
  "Happy to help. What else would you like to know about the data?",
  "Sure thing — I'm right here whenever you've got more questions.",
];

/**
 * `seed` defaults to something that varies call-to-call in real use (so
 * repeated "thanks!" replies don't feel copy-pasted) but can be pinned in
 * tests for deterministic coverage of every reply.
 */
function buildAcknowledgmentAnswer(seed: number = Date.now()): string {
  const i = ((seed % ACKNOWLEDGMENT_REPLIES.length) + ACKNOWLEDGMENT_REPLIES.length) % ACKNOWLEDGMENT_REPLIES.length;
  return ACKNOWLEDGMENT_REPLIES[i];
}

function buildGreetingAnswer(csv: ParsedCsv): string {
  const rowCountText = `${csv.totalRows.toLocaleString("en-US")} row${csv.totalRows === 1 ? "" : "s"}`;
  const examples = SAMPLE_QUESTIONS.slice(0, 2)
    .map((q) => `"${q}"`)
    .join(" or ");
  return (
    `Hey! I'm here to help you dig into "${csv.fileName}" — ${rowCountText} loaded and ready. ` +
    `Try asking something like ${examples}.`
  );
}

export function buildMetaAnswer(csv: ParsedCsv, question: string): string {
  const intent = classifyMetaIntent(question);

  if (intent === "greeting") return buildGreetingAnswer(csv);
  if (intent === "acknowledgment") return buildAcknowledgmentAnswer();

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

  if (intent === "columns") {
    return (
      `This dataset ("${csv.fileName}") has ${rowCountText} and ${columnCountText}: ${columnList}.` +
      exampleSentence
    );
  }

  if (intent === "capability") {
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

// --- Phase 29: proactive welcome message + data-quality callout ---------

const MISSING_VALUE_THRESHOLD = 0.05; // flag a column once >5% of its values are blank/missing

/**
 * Real, computed-from-every-row data quality flags — not a sample, not a
 * guess. csv.rows holds the full parsed dataset (see csv.ts), so this is
 * cheap client-side iteration, no DuckDB round trip needed.
 */
export function summarizeDataQuality(csv: ParsedCsv): string | null {
  if (csv.rows.length === 0) return null;
  const realColumns = csv.columns.filter((c) => c.type !== "empty");

  const flagged = realColumns
    .map((col) => {
      let missing = 0;
      for (const row of csv.rows) {
        const v = row[col.name];
        if (v === null || v === undefined || v.trim() === "") missing++;
      }
      return { name: col.name, pct: missing / csv.rows.length };
    })
    .filter((f) => f.pct > MISSING_VALUE_THRESHOLD)
    .sort((a, b) => b.pct - a.pct);

  if (flagged.length === 0) return null;

  const parts = flagged.map((f) => `${f.name} (${Math.round(f.pct * 100)}%)`).join(", ");
  return `Heads up: some columns have missing values — ${parts}.`;
}

/**
 * The proactive message shown right after a successful upload, before the
 * person has asked anything. Reuses the same real schema facts as
 * buildMetaAnswer — this is the "feels like it already looked at my file"
 * first impression, and it costs nothing to show.
 *
 * `factsSentence`, if given, is the real computed min/max/avg/correlation
 * highlights from datasetSummary.ts's formatDatasetSummaryForWelcome —
 * optional because it needs a DuckDB round trip the caller may not have
 * run yet (or may choose to show a quick structural-only version while
 * that's still loading).
 */
export function buildWelcomeSummary(csv: ParsedCsv, factsSentence?: string | null): string {
  const realColumns = csv.columns.filter((c) => c.type !== "empty");
  const columnList = realColumns.map((c) => c.name).join(", ");
  const rowCountText = `${csv.totalRows.toLocaleString("en-US")} row${csv.totalRows === 1 ? "" : "s"}`;
  const columnCountText = `${realColumns.length} column${realColumns.length === 1 ? "" : "s"}`;

  let text = `Loaded "${csv.fileName}" — ${rowCountText} across ${columnCountText}: ${columnList}.`;

  if (factsSentence) text += ` ${factsSentence}`;

  const qualityNote = summarizeDataQuality(csv);
  if (qualityNote) text += ` ${qualityNote}`;

  text += ` Ask away, or try one of the questions below.`;
  return text;
}
