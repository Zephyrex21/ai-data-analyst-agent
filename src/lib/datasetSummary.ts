import type { ParsedCsv, ParsedColumn } from "./csv";
import { MAIN_TABLE_NAME } from "./schema";
import { quoteIdent, type QueryResult } from "./duckdb";

// Real, precomputed statistics — this is the entire point of the insights
// engine: the LLM narrating a question never gets to invent a number, it
// only ever sees figures that were actually computed here via DuckDB.
//
// Phase 26: originally (Phase 22) this ran one query per column, sequentially.
// It now batches every min/max/avg/stddev/distinct/null-count/correlation
// figure into a SINGLE combined query (aliased agg_0, agg_1, ... — indexed
// rather than name-derived, so there's no risk of a real column name
// colliding with a suffix like "_min"). Only the per-column top-5-values
// query still needs its own GROUP BY round trip, since DuckDB can't combine
// multiple different GROUP BY targets into one flat query.

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

export interface CorrelationPair {
  columnA: string;
  columnB: string;
  /** Null if DuckDB's corr() couldn't compute one (e.g. a column with zero variance). */
  value: number | null;
}

export interface DatasetSummary {
  totalRows: number;
  columns: ColumnSummary[];
  correlations: CorrelationPair[];
  /** Set when computation was scoped to specific columns instead of the whole dataset. */
  scopedToColumns: string[] | null;
}

type RunSql = (sql: string) => Promise<QueryResult>;

type PlanEntry =
  | { kind: "numeric"; column: string; stat: "min" | "max" | "avg" | "stddev" | "nulls" }
  | { kind: "date"; column: string; stat: "min" | "max" | "nulls" }
  | { kind: "categorical"; column: string; stat: "distinct" | "nulls" }
  | { kind: "correlation"; columnA: string; columnB: string };

export interface ComputeSummaryOptions {
  /** If given, only these real column names are summarized instead of the whole dataset. */
  onlyColumns?: string[];
}

export async function computeDatasetSummary(
  csv: ParsedCsv,
  runSql: RunSql,
  options: ComputeSummaryOptions = {}
): Promise<DatasetSummary> {
  const table = quoteIdent(MAIN_TABLE_NAME);
  const allRealColumns = csv.columns.filter((c) => c.type !== "empty");

  const requested = options.onlyColumns?.length
    ? allRealColumns.filter((c) => options.onlyColumns!.includes(c.name))
    : [];
  // Falls back to the full dataset if scoping matched nothing usable —
  // scoping is an optimization, never a way to silently return less.
  const targetColumns = requested.length > 0 ? requested : allRealColumns;
  const isScoped = requested.length > 0 && requested.length < allRealColumns.length;

  const numericColumns = targetColumns.filter((c): c is ParsedColumn => c.type === "number");
  const dateColumns = targetColumns.filter((c): c is ParsedColumn => c.type === "date");
  const categoricalColumns = targetColumns.filter(
    (c): c is ParsedColumn => c.type === "string" || c.type === "boolean"
  );

  const selectExprs: string[] = [];
  const plan: PlanEntry[] = [];
  function addExpr(sql: string, entry: PlanEntry) {
    selectExprs.push(`${sql} AS agg_${plan.length}`);
    plan.push(entry);
  }

  for (const col of numericColumns) {
    const ident = quoteIdent(col.name);
    addExpr(`MIN(${ident})`, { kind: "numeric", column: col.name, stat: "min" });
    addExpr(`MAX(${ident})`, { kind: "numeric", column: col.name, stat: "max" });
    addExpr(`AVG(${ident})`, { kind: "numeric", column: col.name, stat: "avg" });
    addExpr(`STDDEV(${ident})`, { kind: "numeric", column: col.name, stat: "stddev" });
    addExpr(`COUNT(*) FILTER (WHERE ${ident} IS NULL)`, {
      kind: "numeric",
      column: col.name,
      stat: "nulls",
    });
  }
  for (const col of dateColumns) {
    const ident = quoteIdent(col.name);
    addExpr(`MIN(${ident})`, { kind: "date", column: col.name, stat: "min" });
    addExpr(`MAX(${ident})`, { kind: "date", column: col.name, stat: "max" });
    addExpr(`COUNT(*) FILTER (WHERE ${ident} IS NULL)`, { kind: "date", column: col.name, stat: "nulls" });
  }
  for (const col of categoricalColumns) {
    const ident = quoteIdent(col.name);
    addExpr(`COUNT(DISTINCT ${ident})`, { kind: "categorical", column: col.name, stat: "distinct" });
    addExpr(`COUNT(*) FILTER (WHERE ${ident} IS NULL)`, {
      kind: "categorical",
      column: col.name,
      stat: "nulls",
    });
  }
  // Every unique pair of numeric columns — real relationship data the
  // insights narration previously had no access to at all.
  for (let i = 0; i < numericColumns.length; i++) {
    for (let j = i + 1; j < numericColumns.length; j++) {
      const a = quoteIdent(numericColumns[i].name);
      const b = quoteIdent(numericColumns[j].name);
      addExpr(`corr(${a}, ${b})`, {
        kind: "correlation",
        columnA: numericColumns[i].name,
        columnB: numericColumns[j].name,
      });
    }
  }

  const numericStats = new Map<
    string,
    { min: number | null; max: number | null; avg: number | null; stddev: number | null; nullCount: number }
  >();
  const dateStats = new Map<string, { min: string | null; max: string | null; nullCount: number }>();
  const categoricalCounts = new Map<string, { distinctCount: number; nullCount: number }>();
  const correlations: CorrelationPair[] = [];

  if (selectExprs.length > 0) {
    const combined = await runSql(`SELECT ${selectExprs.join(", ")} FROM ${table}`);
    const row = combined.rows[0] ?? {};

    plan.forEach((entry, i) => {
      const value = row[`agg_${i}`];
      if (entry.kind === "numeric") {
        const s = numericStats.get(entry.column) ?? {
          min: null,
          max: null,
          avg: null,
          stddev: null,
          nullCount: 0,
        };
        if (entry.stat === "nulls") s.nullCount = toNumberOrNull(value) ?? 0;
        else s[entry.stat] = toNumberOrNull(value);
        numericStats.set(entry.column, s);
      } else if (entry.kind === "date") {
        const s = dateStats.get(entry.column) ?? { min: null, max: null, nullCount: 0 };
        if (entry.stat === "nulls") s.nullCount = toNumberOrNull(value) ?? 0;
        else s[entry.stat] = value != null ? String(value) : null;
        dateStats.set(entry.column, s);
      } else if (entry.kind === "categorical") {
        const c = categoricalCounts.get(entry.column) ?? { distinctCount: 0, nullCount: 0 };
        if (entry.stat === "distinct") c.distinctCount = toNumberOrNull(value) ?? 0;
        else c.nullCount = toNumberOrNull(value) ?? 0;
        categoricalCounts.set(entry.column, c);
      } else {
        correlations.push({ columnA: entry.columnA, columnB: entry.columnB, value: toNumberOrNull(value) });
      }
    });
  }

  const columns: ColumnSummary[] = [];

  for (const col of numericColumns) {
    const s = numericStats.get(col.name)!;
    columns.push({ name: col.name, type: "number", ...s });
  }
  for (const col of dateColumns) {
    const s = dateStats.get(col.name)!;
    columns.push({ name: col.name, type: "date", ...s });
  }
  for (const col of categoricalColumns) {
    const counts = categoricalCounts.get(col.name)!;
    const ident = quoteIdent(col.name);
    const topResult = await runSql(
      `SELECT ${ident} AS value, COUNT(*) AS cnt FROM ${table} ` +
        `WHERE ${ident} IS NOT NULL GROUP BY ${ident} ORDER BY cnt DESC LIMIT ${TOP_VALUES_LIMIT}`
    );
    columns.push({
      name: col.name,
      type: col.type as "string" | "boolean",
      distinctCount: counts.distinctCount,
      topValues: topResult.rows.map((r) => ({
        value: String(r.value),
        count: toNumberOrNull(r.cnt) ?? 0,
      })),
      nullCount: counts.nullCount,
    });
  }

  return {
    totalRows: csv.totalRows,
    columns,
    correlations,
    scopedToColumns: isScoped ? targetColumns.map((c) => c.name) : null,
  };
}

/**
 * Cheap, purely client-side heuristic (Phase 26): which real column names
 * are mentioned by name in the question, matched whole-word and
 * case-insensitively so "date" doesn't false-positive inside "updated".
 * No LLM/router involvement — this is what lets computeDatasetSummary scope
 * itself down without a contract change or an extra round trip.
 */
export function findMentionedColumns(question: string, csv: ParsedCsv): string[] {
  return csv.columns
    .filter((c) => c.type !== "empty" && c.name.trim().length > 0)
    .filter((c) => new RegExp(`\\b${escapeRegExp(c.name)}\\b`, "i").test(question))
    .map((c) => c.name);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  if (summary.scopedToColumns) {
    lines.push(`(Scoped to the column(s) the question named: ${summary.scopedToColumns.join(", ")}.)`);
  }
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
  if (summary.correlations.length > 0) {
    lines.push("Correlations between numeric columns:");
    for (const c of summary.correlations) {
      lines.push(`- ${c.columnA} vs ${c.columnB}: ${c.value === null ? "n/a" : round2(c.value)}`);
    }
  }
  return lines.join("\n");
}
