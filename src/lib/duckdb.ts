import * as duckdb from "@duckdb/duckdb-wasm";
import { DataType } from "apache-arrow";
import type { Field } from "apache-arrow";

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
}

export class SqlExecutionError extends Error {}

let dbSingleton: duckdb.AsyncDuckDB | null = null;
let dbInitPromise: Promise<duckdb.AsyncDuckDB> | null = null;

/**
 * Lazily initializes a single shared AsyncDuckDB instance for the whole app.
 * Uses the jsDelivr-hosted bundles so we don't need any special Vite/worker
 * bundling config, and duckdb-wasm auto-selects a bundle that works without
 * cross-origin-isolation headers (falls back to the MVP bundle).
 */
async function getDb(): Promise<duckdb.AsyncDuckDB> {
  if (dbSingleton) return dbSingleton;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = (async () => {
    const bundles = duckdb.getJsDelivrBundles();
    const bundle = await duckdb.selectBundle(bundles);

    const workerUrl = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker}");`], {
        type: "text/javascript",
      })
    );

    const worker = new Worker(workerUrl);
    const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    URL.revokeObjectURL(workerUrl);

    dbSingleton = db;
    return db;
  })();

  return dbInitPromise;
}

/**
 * Registers a CSV file's contents as a queryable table (dropping/replacing
 * any existing table of the same name so re-uploads work cleanly).
 */
export async function loadCsvAsTable(file: File, tableName: string): Promise<void> {
  const db = await getDb();
  const text = await file.text();
  const virtualFileName = `${tableName}.csv`;

  await db.registerFileText(virtualFileName, text);

  const conn = await db.connect();
  try {
    await conn.query(
      `CREATE OR REPLACE TABLE ${quoteIdent(tableName)} AS
       SELECT * FROM read_csv_auto('${virtualFileName}', header=true, sample_size=-1)`
    );
  } catch (err) {
    throw new SqlExecutionError(
      `DuckDB couldn't load this CSV: ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    await conn.close();
  }
}

export async function runQuery(sql: string): Promise<QueryResult> {
  const db = await getDb();
  const conn = await db.connect();
  try {
    const result = await conn.query(sql);
    const fields = result.schema.fields;
    const columns = fields.map((f) => f.name);
    const rows = result.toArray().map((row) => serializeRow(row.toJSON(), fields));
    return { columns, rows };
  } catch (err) {
    throw new SqlExecutionError(err instanceof Error ? err.message : String(err));
  } finally {
    await conn.close();
  }
}

// Arrow can return BigInt (int64), raw epoch numbers/Date objects for
// date/timestamp columns, and other non-JSON-safe types. Normalize them
// using the actual Arrow field type (not just runtime typeof) so, e.g.,
// a DATE column reliably renders as "2025-01-05" instead of a raw epoch
// number like 1736035200000.
function serializeRow(
  row: Record<string, unknown>,
  fields: Field[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const col = field.name;
    const value = row[col];

    if (value === null || value === undefined) {
      out[col] = value;
    } else if (DataType.isDate(field.type) || DataType.isTimestamp(field.type)) {
      const asDate = value instanceof Date ? value : new Date(Number(value));
      out[col] = DataType.isDate(field.type)
        ? asDate.toISOString().slice(0, 10)
        : asDate.toISOString().replace("T", " ").slice(0, 19);
    } else if (typeof value === "bigint") {
      out[col] = Number.isSafeInteger(Number(value)) ? Number(value) : value.toString();
    } else if (value instanceof Date) {
      out[col] = value.toISOString().slice(0, 10);
    } else {
      out[col] = value;
    }
  }
  return out;
}

// Basic identifier quoting so table names with odd characters don't break the query.
function quoteIdent(ident: string): string {
  return `"${ident.replace(/"/g, '""')}"`;
}
