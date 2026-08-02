/// <reference lib="webworker" />
import { loadPyodide, type PyodideAPI } from "pyodide";

// Must match the installed npm "pyodide" package version.
const PYODIDE_VERSION = "314.0.2";
const PYODIDE_CDN_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

let pyodide: PyodideAPI | null = null;

async function ensurePyodide(): Promise<PyodideAPI> {
  if (pyodide) return pyodide;

  const instance = await loadPyodide({ indexURL: PYODIDE_CDN_INDEX_URL });
  // Required — if this throws, `pyodide` stays null so the NEXT call
  // retries from scratch instead of being permanently stuck.
  await instance.loadPackage(["pandas"]);

  // scipy added in Phase 25 so outlier/regression questions can use tested
  // functions (scipy.stats.zscore, scipy.stats.linregress) instead of the
  // model hand-rolling that math inline every time — see api/generate-query.ts's
  // system prompt and Engineering Journal bug #3 for why that matters.
  // Deliberately optional: if it fails to load (network hiccup, package
  // temporarily unavailable), Python still works for everything except
  // scipy-specific code — code that tries to import it anyway will hit a
  // normal Python ImportError, which the existing self-correction retry
  // loop already knows how to feed back and recover from. Better than the
  // entire Python engine becoming permanently unusable over one optional
  // package, which is what happened before this fix: a scipy failure used
  // to leave `pyodide` set but broken, with no way to retry.
  try {
    await instance.loadPackage(["scipy"]);
  } catch (err) {
    console.error("scipy failed to load — Python will still work without it:", err);
  }

  pyodide = instance;
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
