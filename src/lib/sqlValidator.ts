import type { ParsedCsv } from "./csv";
import { MAIN_TABLE_NAME } from "./schema";

export interface ValidationResult {
  valid: boolean;
  /** The SQL that should actually be executed (may have a LIMIT appended). */
  sql: string;
  reason?: string;
}

// Row cap protects two things at once: DuckDB-WASM's in-browser memory, and
// our current unvirtualized HTML table (Phase 10 can raise this once the
// table is virtualized). Applied only when the model didn't already specify
// its own LIMIT, so "ORDER BY x DESC LIMIT 1" style queries are untouched.
const MAX_ROWS = 5000;

const FORBIDDEN_KEYWORDS = [
  "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE",
  "ATTACH", "DETACH", "COPY", "EXPORT", "IMPORT", "PRAGMA", "INSTALL",
  "LOAD", "CALL", "GRANT", "REVOKE", "VACUUM", "REPLACE", "MERGE", "SET",
];

// Deliberately not exhaustive. This validator's job is to catch the two
// realistic failure modes: destructive statements, and hallucinated column
// names. It is NOT a full SQL parser — anything syntactically wrong that
// isn't a hallucinated column (e.g. a malformed function call) will still
// reach DuckDB and surface as an execution error, which Phase 6's
// self-correction loop is what actually handles systematically.
const KNOWN_KEYWORDS_AND_FUNCTIONS = new Set([
  "SELECT", "FROM", "WHERE", "GROUP", "BY", "ORDER", "LIMIT", "AS", "AND",
  "OR", "NOT", "NULL", "IS", "IN", "LIKE", "ILIKE", "BETWEEN", "DESC", "ASC",
  "DISTINCT", "HAVING", "CASE", "WHEN", "THEN", "ELSE", "END", "INTERVAL",
  "WITH", "ALL", "ANY", "EXISTS", "TRUE", "FALSE", "OVER", "PARTITION",
  "UNION", "INTERSECT", "EXCEPT", "JOIN", "ON", "INNER", "LEFT", "RIGHT",
  "FULL", "OUTER", "CROSS", "USING",
  "COUNT", "SUM", "AVG", "MIN", "MAX", "ROUND", "CAST", "COALESCE", "NULLIF",
  "DATE_TRUNC", "STRFTIME", "EXTRACT", "DATE_PART", "YEAR", "MONTH", "DAY",
  "NOW", "TODAY", "CURRENT_DATE", "LOWER", "UPPER", "TRIM", "LENGTH",
  "SUBSTR", "CONCAT", "REPLACE_STR", "ABS", "FLOOR", "CEIL", "POWER", "SQRT",
  "STDDEV", "VARIANCE", "MEDIAN", "QUANTILE", "LIST", "ARRAY_AGG",
  "STRING_AGG", "REGEXP_MATCHES", "INT", "VARCHAR", "DOUBLE", "BOOLEAN",
  "DATE", "TIMESTAMP",
]);

export function validateSql(rawSql: string, csv: ParsedCsv): ValidationResult {
  const trimmed = rawSql.trim();
  if (!trimmed) {
    return fail(rawSql, "The model returned an empty query.");
  }

  const stripped = stripStringLiteralsAndComments(trimmed);

  if (stripped.includes(";")) {
    return fail(rawSql, "Multiple statements in one query aren't allowed.");
  }

  const firstToken = stripped.trim().split(/\s+/)[0]?.toUpperCase();
  if (firstToken !== "SELECT") {
    // CTEs (WITH ...) are deliberately not supported: this app only ever
    // queries one flat table, so a CTE's temporary name would need special
    // handling in the table-existence check below for no real benefit here.
    return fail(
      rawSql,
      `Only plain SELECT queries are allowed — this one started with "${firstToken ?? "?"}".`
    );
  }

  const upperStripped = stripped.toUpperCase();
  for (const keyword of FORBIDDEN_KEYWORDS) {
    if (new RegExp(`\\b${keyword}\\b`).test(upperStripped)) {
      return fail(rawSql, `Query contains a disallowed keyword: ${keyword}.`);
    }
  }

  const fromMatches = [...stripped.matchAll(/\bFROM\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi)];
  for (const m of fromMatches) {
    if (m[1].toLowerCase() !== MAIN_TABLE_NAME.toLowerCase()) {
      return fail(rawSql, `Query references an unknown table "${m[1]}".`);
    }
  }

  const aliases = new Set(
    [...stripped.matchAll(/\bAS\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi)].map((m) =>
      m[1].toLowerCase()
    )
  );
  const knownColumns = new Set(csv.columns.map((c) => c.name.toLowerCase()));

  const unknown = new Set<string>();
  // Identifiers not immediately followed by "(" — those are function calls,
  // which we don't attempt to validate (see comment on KNOWN_KEYWORDS_AND_FUNCTIONS).
  for (const match of stripped.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b(?!\s*\()/g)) {
    const ident = match[1];
    const lower = ident.toLowerCase();
    if (KNOWN_KEYWORDS_AND_FUNCTIONS.has(ident.toUpperCase())) continue;
    if (lower === MAIN_TABLE_NAME.toLowerCase()) continue;
    if (knownColumns.has(lower)) continue;
    if (aliases.has(lower)) continue;
    unknown.add(ident);
  }

  if (unknown.size > 0) {
    return fail(
      rawSql,
      `Query references column(s) that don't exist in this dataset: ${[...unknown].join(", ")}.`
    );
  }

  const hasLimit = /\bLIMIT\b/i.test(stripped);
  const finalSql = hasLimit ? trimmed : `${trimmed} LIMIT ${MAX_ROWS}`;

  return { valid: true, sql: finalSql };
}

function stripStringLiteralsAndComments(sql: string): string {
  let result = sql.replace(/'(?:[^']|'')*'/g, "''");
  result = result.replace(/--.*$/gm, "");
  result = result.replace(/\/\*[\s\S]*?\*\//g, "");
  return result;
}

function fail(sql: string, reason: string): ValidationResult {
  // Blueprint Phase 5 requirement: log the rejection reason for visibility
  // during development, without needing extra UI beyond the error message
  // already shown to the user.
  console.warn("[sqlValidator] rejected query:", { sql, reason });
  return { valid: false, sql, reason };
}
