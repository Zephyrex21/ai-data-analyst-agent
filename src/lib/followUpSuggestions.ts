import type { ParsedCsv } from "./csv";

// Phase 29 — suggested follow-ups after every answer. Deliberately NOT an
// extra LLM call: doubling the API cost of every single answer just to
// suggest what to ask next would cut against everything Phases 21-28 spent
// on making this app cheap to run. Instead these are generated from the
// real schema (which columns actually exist), so they're always valid
// questions for whatever was actually uploaded — never hardcoded text tied
// to the bundled sample dataset the way SAMPLE_QUESTIONS is.

const MAX_SUGGESTIONS = 3;

function normalize(question: string): string {
  return question.trim().toLowerCase().replace(/\s+/g, " ").replace(/[?.!]+$/, "");
}

export function suggestFollowUps(csv: ParsedCsv, askedQuestions: string[]): string[] {
  const realColumns = csv.columns.filter((c) => c.type !== "empty");
  const numericColumns = realColumns.filter((c) => c.type === "number");
  const dateColumns = realColumns.filter((c) => c.type === "date");
  const categoricalColumns = realColumns.filter((c) => c.type === "string" || c.type === "boolean");

  const primaryNumeric = numericColumns[0]?.name;
  const primaryCategorical = categoricalColumns[0]?.name;
  const primaryDate = dateColumns[0]?.name;

  const candidates: string[] = [];

  if (primaryNumeric && primaryCategorical) {
    candidates.push(`which ${primaryCategorical} has the highest ${primaryNumeric}`);
  }
  if (primaryNumeric && primaryDate) {
    candidates.push(`${primaryNumeric} over time`);
  }
  if (primaryNumeric) {
    candidates.push(`are there any outliers in ${primaryNumeric}`);
  }
  if (primaryNumeric && categoricalColumns.length >= 2) {
    candidates.push(`${primaryNumeric} by ${categoricalColumns[1].name}`);
  }
  if (numericColumns.length >= 2) {
    candidates.push(`what's the correlation between ${numericColumns[0].name} and ${numericColumns[1].name}`);
  }
  candidates.push("give me an overview of this dataset");

  const asked = new Set(askedQuestions.map(normalize));
  const fresh = candidates.filter((c) => !asked.has(normalize(c)));

  // De-dupe (a small schema can produce the same candidate via two rules)
  // while preserving first-seen order, then cap the list.
  const seen = new Set<string>();
  const unique = fresh.filter((c) => {
    const key = normalize(c);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.slice(0, MAX_SUGGESTIONS);
}
