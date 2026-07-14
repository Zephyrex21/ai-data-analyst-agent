import type { QueryResult } from "./duckdb";

export type ChartType = "bar" | "line" | "pie";

export interface ChartSpec {
  type: ChartType;
  labelKey: string;
  valueKey: string;
}

const DATE_LIKE_REGEX = /^\d{4}-\d{2}-\d{2}(?:\s\d{2}:\d{2}:\d{2})?$/;
const PIE_MAX_CATEGORIES = 6;

function isNumericValue(value: unknown): boolean {
  return typeof value === "number" || (typeof value === "string" && value.trim() !== "" && !isNaN(Number(value)));
}

function looksLikeDate(value: unknown): boolean {
  return typeof value === "string" && DATE_LIKE_REGEX.test(value);
}

/** A single row with a single column — better shown as a big number than a chart. */
export function isSingleScalar(result: QueryResult): boolean {
  return result.rows.length === 1 && result.columns.length === 1;
}

/**
 * Deliberately conservative: only handles the common "one label column +
 * one numeric column" shape (e.g. GROUP BY aggregates). Anything more
 * complex (3+ columns, multiple numeric measures, no clear label/value
 * split) falls back to the table — guessing wrong is worse than not
 * charting at all.
 */
export function chooseChartType(result: QueryResult): ChartSpec | null {
  if (result.rows.length === 0) return null;
  if (result.columns.length !== 2) return null;

  const [colA, colB] = result.columns;
  const sample = result.rows.slice(0, Math.min(20, result.rows.length));

  const aIsNumeric = sample.every((r) => r[colA] === null || isNumericValue(r[colA]));
  const bIsNumeric = sample.every((r) => r[colB] === null || isNumericValue(r[colB]));

  // Need exactly one numeric column and one non-numeric (label) column.
  if (aIsNumeric === bIsNumeric) return null;

  const valueKey = aIsNumeric ? colA : colB;
  const labelKey = aIsNumeric ? colB : colA;

  const labelIsDate = sample.every((r) => r[labelKey] === null || looksLikeDate(r[labelKey]));
  if (labelIsDate) {
    return { type: "line", labelKey, valueKey };
  }

  const distinctLabels = new Set(result.rows.map((r) => r[labelKey]));
  if (distinctLabels.size <= PIE_MAX_CATEGORIES) {
    return { type: "pie", labelKey, valueKey };
  }

  return { type: "bar", labelKey, valueKey };
}
