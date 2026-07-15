import { loadPyodide, type PyodideAPI } from "pyodide";

// Must match the installed npm "pyodide" package version — the JS loader and
// the CDN-hosted runtime/package files have to be the same version.
const PYODIDE_VERSION = "314.0.2";
const PYODIDE_CDN_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

export class PythonExecutionError extends Error {}

let instance: PyodideAPI | null = null;
let initPromise: Promise<PyodideAPI> | null = null;

/**
 * Lazily initializes a single shared Pyodide instance for the whole app.
 * Unlike DuckDB (loaded on every CSV upload), this is only initialized the
 * first time a question actually routes to the Python engine — Pyodide +
 * pandas is a multi-megabyte download, and most questions never need it.
 */
async function getPyodide(): Promise<PyodideAPI> {
  if (instance) return instance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const pyodide = await loadPyodide({ indexURL: PYODIDE_CDN_INDEX_URL });
    await pyodide.loadPackage(["pandas"]);
    instance = pyodide;
    return pyodide;
  })();

  return initPromise;
}

/** Loads the CSV's contents into a pandas DataFrame available as `df` in Python. */
export async function loadCsvIntoDataframe(file: File): Promise<void> {
  const pyodide = await getPyodide();
  const text = await file.text();
  pyodide.globals.set("_csv_text", text);
  await pyodide.runPythonAsync(`
import pandas as pd
import io as _io
df = pd.read_csv(_io.StringIO(_csv_text))
`);
}

export interface PythonResult {
  columns: string[];
  rows: Record<string, unknown>[];
}

/**
 * Executes model-generated Python code against the already-loaded `df`.
 * Real sandboxing here comes from the browser/WASM boundary itself — Pyodide
 * has no real OS filesystem or network access regardless of what the code
 * tries to do. lib/pythonValidator.ts adds a second layer on top of that,
 * mainly to fail fast with a clear reason rather than a confusing runtime
 * error, and to keep the code on the pattern this app actually supports.
 */
export async function runPythonCode(code: string): Promise<PythonResult> {
  const pyodide = await getPyodide();
  try {
    await pyodide.runPythonAsync(code);

    const jsonResult = await pyodide.runPythonAsync(`
import pandas as pd
import json as _json

def _serialize(_value):
    if isinstance(_value, pd.DataFrame):
        return _value.to_json(orient="records", date_format="iso")
    if isinstance(_value, pd.Series):
        return _value.reset_index().to_json(orient="records", date_format="iso")
    return _json.dumps([{"result": _value}])

_serialize(result)
`);

    const parsed = JSON.parse(jsonResult as string);
    const rows: Record<string, unknown>[] = Array.isArray(parsed) ? parsed : [parsed];
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    return { columns, rows };
  } catch (err) {
    throw new PythonExecutionError(err instanceof Error ? err.message : String(err));
  }
}
