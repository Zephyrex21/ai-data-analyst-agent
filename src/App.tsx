import { useRef, useState } from "react";
import { useCsvData } from "./hooks/useCsvData";
import { useDuckDb } from "./hooks/useDuckDb";
import { useAskQuestion } from "./hooks/useAskQuestion";
import { FileUpload } from "./components/FileUpload";
import { DataTable } from "./components/DataTable";
import { AskBar } from "./components/AskBar";
import { AnswerCard } from "./components/AnswerCard";
import { SampleQuestions } from "./components/SampleQuestions";
import { ThemeToggle } from "./components/ThemeToggle";
import { Landing } from "./components/Landing";

function App() {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isSampleData, setIsSampleData] = useState(false);
  const csv = useCsvData();
  const duckDb = useDuckDb();
  const ask = useAskQuestion(csv.data, uploadedFile);
  const toolRef = useRef<HTMLDivElement>(null);

  function scrollToTool() {
    toolRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function loadFile(file: File, isSample: boolean) {
    setUploadedFile(file);
    setIsSampleData(isSample);
    csv.loadFile(file);
    duckDb.loadTable(file);
    ask.reset();
  }

  function handleFileSelected(file: File) {
    loadFile(file, false);
  }

  function handleSampleSelected(file: File) {
    loadFile(file, true);
  }

  function handleReset() {
    setUploadedFile(null);
    setIsSampleData(false);
    csv.reset();
    duckDb.resetTable();
    ask.reset();
  }

  const isBusy = ask.isBusy || duckDb.isLoadingTable || !duckDb.isTableReady;

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8 sm:py-12 gap-6">
      <div className="fixed top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      <Landing onTryDemo={scrollToTool} />

      <div ref={toolRef} className="w-full max-w-4xl flex flex-col gap-6 scroll-mt-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">
            AI Data Analyst Agent
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Ask questions about your data in plain English
          </p>
        </div>

        {!csv.data && (
          <FileUpload
            onFileSelected={handleFileSelected}
            onSampleSelected={handleSampleSelected}
            isLoading={csv.isLoading}
          />
        )}

        {csv.error && (
          <div className="rounded-2xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {csv.error}
          </div>
        )}

        {csv.data && <DataTable data={csv.data} onReset={handleReset} />}

        {duckDb.tableError && (
          <div className="rounded-2xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            DuckDB error: {duckDb.tableError}
          </div>
        )}

        {csv.data && <AskBar onAsk={ask.ask} isBusy={isBusy} />}

        {csv.data && isSampleData && ask.turns.length === 0 && (
          <SampleQuestions onAsk={ask.ask} isBusy={isBusy} />
        )}

        {csv.data && duckDb.isLoadingTable && (
          <p className="text-xs text-[var(--color-text-muted)] text-center">
            Loading table into DuckDB…
          </p>
        )}

        {ask.turns
          .map((turn, i) => ({ turn, number: i + 1 }))
          .reverse()
          .map(({ turn, number }) => (
            <AnswerCard key={turn.id} turn={turn} number={number} />
          ))}
      </div>
    </div>
  );
}

export default App;
