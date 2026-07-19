import type { QueryResult } from "./duckdb";

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  // Quote any field containing a comma, quote, or newline, doubling internal quotes.
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function resultToCsvText(result: QueryResult): string {
  const header = result.columns.map(csvEscape).join(",");
  const rows = result.rows.map((row) =>
    result.columns.map((col) => csvEscape(row[col])).join(",")
  );
  return [header, ...rows].join("\n");
}

function slugifyForFilename(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "result"
  );
}

/** Triggers a browser download of the result as a CSV file, using full (unrounded) precision. */
export function downloadResultAsCsv(result: QueryResult, questionForFilename: string): void {
  const csvText = resultToCsvText(result);
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `${slugifyForFilename(questionForFilename)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
