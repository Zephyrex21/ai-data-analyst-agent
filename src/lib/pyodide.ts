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
// Tracks an in-flight load so a background warm-up (Phase 25) and a real
// question arriving moments later don't both trigger their own separate
// "loadCsv" round trip for the same file — the second caller just awaits
// the first's promise instead. Keyed by file reference so switching to a
// genuinely different file while a load is in flight still starts fresh
// rather than waiting on the wrong file's promise.
let loadingFile: File | null = null;
let loadingPromise: Promise<void> | null = null;

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
 * exact File is already loaded, and if a load for this exact File is
 * already in flight (e.g. a background warm-up that hasn't finished yet),
 * this just awaits that same load instead of starting a redundant one.
 */
export function loadCsvIntoDataframe(file: File): Promise<void> {
  if (loadedFile === file) return Promise.resolve();
  if (loadingFile === file && loadingPromise) return loadingPromise;

  loadingFile = file;
  loadingPromise = (async () => {
    const text = await file.text();
    await sendToWorker("loadCsv", text);
    loadedFile = file;
  })().finally(() => {
    if (loadingFile === file) {
      loadingFile = null;
      loadingPromise = null;
    }
  });
  return loadingPromise;
}

/**
 * Pure logic, exported separately so it's unit-testable without needing a
 * real Worker: whether to skip the background Pyodide warm-up because the
 * browser has signalled the person is on a metered/data-saver connection.
 * `navigator.connection` is Chromium-only and experimental, so this is a
 * best-effort check, not a guarantee — absence of the API just means "don't skip."
 */
export function shouldSkipBackgroundWarmup(): boolean {
  if (typeof navigator === "undefined") return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
    .connection;
  return connection?.saveData === true;
}

/**
 * Kicks off the Pyodide download + CSV load in the background right after a
 * successful upload, well before any question is asked — see Phase 25.
 * Purely an optimization: if it fails for any reason (offline, a CDN
 * hiccup), the normal lazy-load path above still runs exactly as before the
 * first time a question actually routes to Python. Errors here are
 * swallowed on purpose — a background prefetch failing must never surface
 * to the user as if something actually went wrong.
 */
export function warmUpPyodide(file: File): void {
  if (shouldSkipBackgroundWarmup()) return;
  loadCsvIntoDataframe(file).catch(() => {
    // Swallowed — see doc comment above.
  });
}

/** Forces the next loadCsvIntoDataframe call to actually reload, e.g. after the app-level reset. */
export function resetPythonState(): void {
  loadedFile = null;
  loadingFile = null;
  loadingPromise = null;
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
