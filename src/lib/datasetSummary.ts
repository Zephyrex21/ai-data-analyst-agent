import type { ParsedCsv } from "./csv";
import { MAIN_TABLE_NAME } from "./schema";
import { quoteIdent, type QueryResult } from "./duckdb";

// Real, precomputed statistics — this is the entire point of the insights
// engine: the LLM narrating a question never gets to invent a number, it
// only ever sees figures that were actually computed here via DuckDB.

const TOP_VALUES_LIMIT = 5;

export interface NumericColumnSummary {
  name: string;
  type: "number";
  min: number | null;
  max: number | null;
  avg: number | null;
  stddev: number | null;
  nullCount: number;
}

export interface DateColumnSummary {
  name: string;
  type: "date";
  min: string | null;
  max: string | null;
  nullCount: number;
}

export interface CategoricalColumnSummary {
  name: string;
  type: "string" | "boolean";
  distinctCount: number;
  topValues: { value: string; count: number }[];
  nullCount: number;
}

export type ColumnSummary = NumericColumnSummary | DateColumnSummary | CategoricalColumnSummary;

export interface DatasetSummary {
  totalRows: number;
  columns: ColumnSummary[];
}

type RunSql = (sql: string) => Promise<QueryResult>;

export async function computeDatasetSummary(
  csv: ParsedCsv,
  runSql: RunSql
): Promise<DatasetSummary> {
  const table = quoteIdent(MAIN_TABLE_NAME);
  const columns: ColumnSummary[] = [];

  for (const col of csv.columns) {
    if (col.type === "empty") continue; // nothing meaningful to summarize
    const ident = quoteIdent(col.name);

    if (col.type === "number") {
      const result = await runSql(
        `SELECT MIN(${ident}) AS min_v, MAX(${ident}) AS max_v, AVG(${ident}) AS avg_v, ` +
          `STDDEV(${ident}) AS stddev_v, COUNT(*) FILTER (WHERE ${ident} IS NULL) AS null_count ` +
          `FROM ${table}`
      );
      const row = result.rows[0] ?? {};
      columns.push({
        name: col.name,
        type: "number",
        min: toNumberOrNull(row.min_v),
        max: toNumberOrNull(row.max_v),
        avg: toNumberOrNull(row.avg_v),
        stddev: toNumberOrNull(row.stddev_v),
        nullCount: toNumberOrNull(row.null_count) ?? 0,
      });
    } else if (col.type === "date") {
      const result = await runSql(
        `SELECT MIN(${ident}) AS min_v, MAX(${ident}) AS max_v, ` +
          `COUNT(*) FILTER (WHERE ${ident} IS NULL) AS null_count FROM ${table}`
      );
      const row = result.rows[0] ?? {};
      columns.push({
        name: col.name,
        type: "date",
        min: row.min_v != null ? String(row.min_v) : null,
        max: row.max_v != null ? String(row.max_v) : null,
        nullCount: toNumberOrNull(row.null_count) ?? 0,
      });
    } else {
      const countsResult = await runSql(
        `SELECT COUNT(DISTINCT ${ident}) AS distinct_count, ` +
          `COUNT(*) FILTER (WHERE ${ident} IS NULL) AS null_count FROM ${table}`
      );
      const countsRow = countsResult.rows[0] ?? {};

      const topResult = await runSql(
        `SELECT ${ident} AS value, COUNT(*) AS cnt FROM ${table} ` +
          `WHERE ${ident} IS NOT NULL GROUP BY ${ident} ORDER BY cnt DESC LIMIT ${TOP_VALUES_LIMIT}`
      );

      columns.push({
        name: col.name,
        type: col.type,
        distinctCount: toNumberOrNull(countsRow.distinct_count) ?? 0,
        topValues: topResult.rows.map((r) => ({
          value: String(r.value),
          count: toNumberOrNull(r.cnt) ?? 0,
        })),
        nullCount: toNumberOrNull(countsRow.null_count) ?? 0,
      });
    }
  }

  return { totalRows: csv.totalRows, columns };
}

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round2(n: number | null): number | null {
  if (n === null) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Renders a DatasetSummary as compact, plain-text lines for the narration
 * prompt. Deliberately terse and numbers-only — this text is the ONLY
 * source of truth the narration model is allowed to draw from.
 */
export function formatDatasetSummaryForPrompt(summary: DatasetSummary): string {
  const lines = [`Total rows: ${summary.totalRows}`];
  for (const col of summary.columns) {
    if (col.type === "number") {
      lines.push(
        `- ${col.name} (number): min=${col.min}, max=${col.max}, avg=${round2(col.avg)}, ` +
          `stddev=${round2(col.stddev)}, nulls=${col.nullCount}`
      );
    } else if (col.type === "date") {
      lines.push(`- ${col.name} (date): range ${col.min} to ${col.max}, nulls=${col.nullCount}`);
    } else {
      const top = col.topValues.map((v) => `${v.value} (${v.count})`).join(", ") || "none";
      lines.push(
        `- ${col.name} (${col.type}): ${col.distinctCount} distinct values, ` +
          `top: ${top}, nulls=${col.nullCount}`
      );
    }
  }
  return lines.join("\n");
}
