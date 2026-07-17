import { useState } from "react";
import { useCsvData } from "./hooks/useCsvData";
import { useDuckDb } from "./hooks/useDuckDb";
import { useAskQuestion } from "./hooks/useAskQuestion";
import { FileUpload } from "./components/FileUpload";
import { DataTable } from "./components/DataTable";
import { AskBar } from "./components/AskBar";
import { AnswerCard } from "./components/AnswerCard";

function App() {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const csv = useCsvData();
  const duckDb = useDuckDb();
  const ask = useAskQuestion(csv.data, uploadedFile);

  function handleFileSelected(file: File) {
    setUploadedFile(file);
    csv.loadFile(file);
    duckDb.loadTable(file);
    ask.reset();
  }

  function handleReset() {
    setUploadedFile(null);
    csv.reset();
    duckDb.resetTable();
    ask.reset();
  }

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-12 gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">
          AI Data Analyst Agent
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Phase 8 — follow-up questions understand what "that" means
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
          <AskBar
            onAsk={ask.ask}
            isBusy={ask.isBusy || duckDb.isLoadingTable || !duckDb.isTableReady}
          />
        )}

        {csv.data && duckDb.isLoadingTable && (
          <p className="text-xs text-[var(--color-text-muted)] text-center">
            Loading table into DuckDB…
          </p>
        )}

        {ask.turns.map((turn) => (
          <AnswerCard key={turn.id} turn={turn} />
        ))}
      </div>
    </div>
  );
}

export default App;
