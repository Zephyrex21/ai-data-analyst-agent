import type { ParsedCsv } from "./csv";
import type { QueryResult } from "./duckdb";

export const MAIN_TABLE_NAME = "data";
const SAMPLE_ROWS_FOR_PROMPT = 3;
const HISTORY_RESULT_ROW_CAP = 5;

/**
 * Produces a compact, LLM-friendly description of the table: name, columns
 * with inferred types, and a few real sample rows. This is what lets the
 * model write correct SQL instead of guessing column names.
 */
export function buildSchemaDescription(csv: ParsedCsv): string {
  const columnLines = csv.columns
    .map((c) => `  - ${c.name} (${c.type})`)
    .join("\n");

  const sampleRows = csv.rows.slice(0, SAMPLE_ROWS_FOR_PROMPT).map((row) =>
    Object.fromEntries(csv.columns.map((c) => [c.name, row[c.name] ?? null]))
  );

  return [
    `Table name: ${MAIN_TABLE_NAME}`,
    `Columns:`,
    columnLines,
    `Sample rows (JSON):`,
    JSON.stringify(sampleRows, null, 2),
  ].join("\n");
}

/**
 * Compact, capped summary of a result for conversation history — enough for
 * the model to resolve "that"/"it"/"break it down further" style follow-ups,
 * without letting old full result tables balloon the prompt over a long
 * conversation.
 */
export function summarizeResultForHistory(result: QueryResult): string {
  if (result.rows.length === 0) {
    return "0 rows returned.";
  }
  const shown = result.rows.slice(0, HISTORY_RESULT_ROW_CAP);
  const lines = shown.map((row) =>
    result.columns.map((c) => `${c}=${row[c] ?? "null"}`).join(", ")
  );
  const suffix =
    result.rows.length > HISTORY_RESULT_ROW_CAP
      ? `\n(... ${result.rows.length - HISTORY_RESULT_ROW_CAP} more row(s), ${result.rows.length} total)`
      : "";
  return lines.join("\n") + suffix;
}
