export class PythonExecutionError extends Error {}

export interface PythonResult {
  columns: string[];
  rows: Record<string, unknown>[];
}

interface PendingRequest {
  resolve: (value: string | undefined) => void;
  reject: (error: Error) => void;
}

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, PendingRequest>();
// Tracks which File is currently loaded as `df` in the live worker. Reset on
// worker crash so a stale "already loaded" assumption can't survive a
// worker being silently replaced underneath it.
let loadedFile: File | null = null;

/**
 * Lazily creates a single shared Worker running Pyodide off the main thread
 * (see pyodideWorker.ts). Only created the first time a question actually
 * routes to Python — most questions never need it, and it's a heavy download.
 * Running it in a Worker (the same pattern DuckDB-WASM already uses
 * internally) keeps the UI responsive during load and execution instead of
 * freezing while WASM initializes on the main thread.
 */
function getWorker(): Worker {
  if (worker) return worker;

  worker = new Worker(new URL("../pyodideWorker.ts", import.meta.url), { type: "module" });

  worker.onmessage = (event: MessageEvent) => {
    const { id, ok, result, error } = event.data ?? {};
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    if (ok) entry.resolve(result);
    else entry.reject(new PythonExecutionError(error ?? "Python execution failed."));
  };

  worker.onerror = (event) => {
    const message = event.message || "The Python worker crashed unexpectedly.";
    for (const [id, entry] of pending) {
      entry.reject(new PythonExecutionError(message));
      pending.delete(id);
    }
    // The worker is in an unknown state after a crash — drop it so the next
    // call creates a fresh one instead of talking to a dead worker forever.
    worker = null;
    loadedFile = null;
  };

  return worker;
}

function sendToWorker(type: "loadCsv" | "runCode", payload: string): Promise<string | undefined> {
  const w = getWorker();
  const id = nextRequestId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, type, payload });
  });
}

/** Whether this exact File is already loaded as `df` in the current worker. */
export function isDataFrameLoaded(file: File): boolean {
  return loadedFile === file;
}

/**
 * Loads the CSV's contents into a pandas DataFrame available as `df` in
 * Python. Safe to call before every Python question — it's a no-op if this
 * exact File is already loaded into the current worker.
 */
export async function loadCsvIntoDataframe(file: File): Promise<void> {
  if (loadedFile === file) return;
  const text = await file.text();
  await sendToWorker("loadCsv", text);
  loadedFile = file;
}

/** Forces the next loadCsvIntoDataframe call to actually reload, e.g. after the app-level reset. */
export function resetPythonState(): void {
  loadedFile = null;
}

/** Executes model-generated Python code against the already-loaded `df`. */
export async function runPythonCode(code: string): Promise<PythonResult> {
  const raw = await sendToWorker("runCode", code);
  if (!raw) {
    throw new PythonExecutionError("Python worker returned no result.");
  }
  const parsed = JSON.parse(raw) as { columns: string[]; records: Record<string, unknown>[] };
  return { columns: parsed.columns, rows: parsed.records };
}
