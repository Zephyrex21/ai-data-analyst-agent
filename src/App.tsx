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

  const isAskBusy =
    ask.stage === "generating-sql" ||
    ask.stage === "validating" ||
    ask.stage === "loading-python" ||
    ask.stage === "running-query";

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-12 gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">
          AI Data Analyst Agent
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Phase 7 — SQL for most questions, Python for statistical ones
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
            isBusy={isAskBusy || duckDb.isLoadingTable || !duckDb.isTableReady}
          />
        )}

        {csv.data && duckDb.isLoadingTable && (
          <p className="text-xs text-[var(--color-text-muted)] text-center">
            Loading table into DuckDB…
          </p>
        )}

        <AnswerCard
          stage={ask.stage}
          question={ask.question}
          sql={ask.sql}
          engine={ask.engine}
          result={ask.result}
          error={ask.error}
          attemptsUsed={ask.attemptsUsed}
        />
      </div>
    </div>
  );
}

export default App;
