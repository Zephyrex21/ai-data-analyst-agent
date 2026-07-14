import { useCsvData } from "./hooks/useCsvData";
import { useDuckDb } from "./hooks/useDuckDb";
import { FileUpload } from "./components/FileUpload";
import { DataTable } from "./components/DataTable";
import { SqlDebugBox } from "./components/SqlDebugBox";

function App() {
  const csv = useCsvData();
  const duckDb = useDuckDb();

  function handleFileSelected(file: File) {
    csv.loadFile(file);
    duckDb.loadTable(file);
  }

  function handleReset() {
    csv.reset();
    duckDb.resetTable();
  }

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-12 gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">
          AI Data Analyst Agent
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Phase 2 — real SQL execution in-browser via DuckDB-WASM
        </p>
      </div>

      <div className="w-full max-w-4xl flex flex-col gap-6">
        {!csv.data && (
          <FileUpload onFileSelected={handleFileSelected} isLoading={csv.isLoading} />
        )}

        {csv.error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {csv.error}
          </div>
        )}

        {csv.data && <DataTable data={csv.data} onReset={handleReset} />}

        {duckDb.tableError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            DuckDB error: {duckDb.tableError}
          </div>
        )}

        {csv.data && (
          <SqlDebugBox
            isTableReady={duckDb.isTableReady}
            isQuerying={duckDb.isQuerying}
            queryError={duckDb.queryError}
            result={duckDb.result}
            onRunQuery={duckDb.query}
          />
        )}
      </div>
    </div>
  );
}

export default App;
