import type { ParsedCsv } from "./csv";

export const MAIN_TABLE_NAME = "data";
const SAMPLE_ROWS_FOR_PROMPT = 3;

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
