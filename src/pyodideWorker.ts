/// <reference lib="webworker" />
import { loadPyodide, type PyodideAPI } from "pyodide";

// Must match the installed npm "pyodide" package version.
const PYODIDE_VERSION = "314.0.2";
const PYODIDE_CDN_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

let pyodide: PyodideAPI | null = null;

async function ensurePyodide(): Promise<PyodideAPI> {
  if (pyodide) return pyodide;
  pyodide = await loadPyodide({ indexURL: PYODIDE_CDN_INDEX_URL });
  await pyodide.loadPackage(["pandas"]);
  return pyodide;
}

interface WorkerRequest {
  id: number;
  type: "loadCsv" | "runCode";
  payload: string;
}

interface WorkerResponse {
  id: number;
  ok: boolean;
  result?: string;
  error?: string;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, type, payload } = event.data;

  try {
    const py = await ensurePyodide();

    if (type === "loadCsv") {
      py.globals.set("_csv_text", payload);
      await py.runPythonAsync(`
import pandas as pd
import io as _io
df = pd.read_csv(_io.StringIO(_csv_text))
`);
      const response: WorkerResponse = { id, ok: true };
      self.postMessage(response);
      return;
    }

    if (type === "runCode") {
      await py.runPythonAsync(payload);

      // Capture columns directly from the pandas object itself (via
      // .columns.tolist()), not by inspecting the resulting JSON records —
      // a DataFrame/Series with zero matching rows still has real column
      // names, but an empty records array on the JS side would otherwise
      // lose them, leaving the UI with no table headers at all.
      const jsonResult = await py.runPythonAsync(`
import pandas as pd
import json as _json

def _serialize(_value):
    if isinstance(_value, pd.DataFrame):
        _df = _value.copy()
    elif isinstance(_value, pd.Series):
        _df = _value.reset_index()
    else:
        return _json.dumps({"columns": ["result"], "records": [{"result": _value}]})

    # Format datetime columns as clean date-only strings (matching the SQL
    # path's formatting) instead of pandas' default full ISO datetime
    # ("2025-10-05T00:00:00.000") — there's no actual time-of-day in this
    # data, and the redundant timestamp was wide enough to make Excel show
    # "####" for the column instead of a readable date on export.
    for _col in _df.columns:
        if pd.api.types.is_datetime64_any_dtype(_df[_col]):
            _df[_col] = _df[_col].dt.strftime("%Y-%m-%d")

    records = _json.loads(_df.to_json(orient="records"))
    return _json.dumps({"columns": _df.columns.tolist(), "records": records})

_serialize(result)
`);
      const response: WorkerResponse = { id, ok: true, result: jsonResult as string };
      self.postMessage(response);
      return;
    }
  } catch (err) {
    const response: WorkerResponse = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
};
