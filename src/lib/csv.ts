import Papa from "papaparse";

export type ColumnType = "number" | "string" | "boolean" | "date" | "empty";

export interface ParsedColumn {
  name: string;
  type: ColumnType;
}

export interface ParsedCsv {
  fileName: string;
  columns: ParsedColumn[];
  /** All rows, as raw string values keyed by column name. */
  rows: Record<string, string>[];
  totalRows: number;
  /** Non-fatal issues worth surfacing to the user (bad rows, empty columns, etc). */
  warnings: string[];
}

const MAX_ACCEPTED_SIZE_BYTES = 25 * 1024 * 1024; // 25MB — generous for a client-side demo
const TYPE_SAMPLE_SIZE = 100;

const BOOLEAN_VALUES = new Set([
  "true",
  "false",
  "yes",
  "no",
  "y",
  "n",
]);

// Matches common unambiguous date shapes: 2024-01-30, 2024/01/30, 01-30-2024, etc.
// Deliberately conservative so we don't misclassify plain numbers or free text as dates.
const DATE_REGEX =
  /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$|^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/;

export class CsvValidationError extends Error {}

export function assertIsCsvFile(file: File): void {
  const nameLooksLikeCsv = file.name.toLowerCase().endsWith(".csv");
  if (!nameLooksLikeCsv) {
    throw new CsvValidationError(
      `"${file.name}" doesn't look like a CSV file. Please upload a .csv file.`
    );
  }
  if (file.size === 0) {
    throw new CsvValidationError(`"${file.name}" is empty.`);
  }
  if (file.size > MAX_ACCEPTED_SIZE_BYTES) {
    throw new CsvValidationError(
      `"${file.name}" is larger than 25MB. Try a smaller file for this demo.`
    );
  }
}

function inferColumnType(values: string[]): ColumnType {
  const nonEmpty = values.filter((v) => v !== undefined && v !== null && v !== "");
  if (nonEmpty.length === 0) return "empty";

  const sample = nonEmpty.slice(0, TYPE_SAMPLE_SIZE);

  if (sample.every((v) => v.trim().length > 0 && !isNaN(Number(v)))) {
    return "number";
  }
  if (sample.every((v) => BOOLEAN_VALUES.has(v.trim().toLowerCase()))) {
    return "boolean";
  }
  if (sample.every((v) => DATE_REGEX.test(v.trim()))) {
    return "date";
  }
  return "string";
}

export function parseCsvFile(file: File): Promise<ParsedCsv> {
  return new Promise((resolve, reject) => {
    try {
      assertIsCsvFile(file);
    } catch (err) {
      reject(err);
      return;
    }

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      complete: (result) => {
        const warnings: string[] = [];
        const rawColumns = result.meta.fields ?? [];

        if (rawColumns.length === 0 || result.data.length === 0) {
          reject(
            new CsvValidationError(
              `Couldn't find any data in "${file.name}". Check that it has a header row and at least one data row.`
            )
          );
          return;
        }

        // Papa reports row-level issues (mismatched field counts, delimiter guesses, etc)
        // without necessarily failing the whole parse — surface them, don't block on them.
        if (result.errors.length > 0) {
          const distinctReasons = new Set(result.errors.map((e) => e.code));
          warnings.push(
            `${result.errors.length} row(s) had formatting issues (${Array.from(
              distinctReasons
            ).join(", ")}) and may be incomplete.`
          );
        }

        const columns: ParsedColumn[] = rawColumns.map((name) => ({
          name,
          type: inferColumnType(result.data.map((row) => row[name])),
        }));

        const emptyColumns = columns.filter((c) => c.type === "empty");
        if (emptyColumns.length > 0) {
          warnings.push(
            `${emptyColumns.length} column(s) appear to be entirely empty: ${emptyColumns
              .map((c) => c.name)
              .join(", ")}.`
          );
        }

        resolve({
          fileName: file.name,
          columns,
          rows: result.data,
          totalRows: result.data.length,
          warnings,
        });
      },
      error: (err: Error) => {
        reject(new CsvValidationError(`Failed to parse "${file.name}": ${err.message}`));
      },
    });
  });
}
