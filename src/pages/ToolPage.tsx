import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCsvData } from "../hooks/useCsvData";
import { useDuckDb } from "../hooks/useDuckDb";
import { useAskQuestion } from "../hooks/useAskQuestion";
import { useDevMode } from "../hooks/useDevMode";
import { useWelcomeSummary } from "../hooks/useWelcomeSummary";
import { warmUpPyodide } from "../lib/pyodide";
import { suggestFollowUps } from "../lib/followUpSuggestions";
import { downloadConversationReport } from "../lib/downloadConversationReport";
import { FileUpload } from "../components/FileUpload";
import { DataTable } from "../components/DataTable";
import { AskBar } from "../components/AskBar";
import { ProviderSelector } from "../components/ProviderSelector";
import { DevModeToggle } from "../components/DevModeToggle";
import { AnswerCard } from "../components/AnswerCard";
import { SampleQuestions } from "../components/SampleQuestions";
import { FollowUpChips } from "../components/FollowUpChips";
import { WelcomeSummary } from "../components/WelcomeSummary";
import { Navbar } from "../components/Navbar";
import { Footer } from "../components/Footer";

export function ToolPage() {
  const navigate = useNavigate();
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isSampleData, setIsSampleData] = useState(false);
  const csv = useCsvData();
  const duckDb = useDuckDb();
  const ask = useAskQuestion(csv.data, uploadedFile);
  const devMode = useDevMode();
  const welcome = useWelcomeSummary(csv.data, duckDb.isTableReady);

  function handleNavigate(id: string) {
    if (id === "top") {
      navigate("/");
      return;
    }
    // Features/Architecture only exist on the home page — navigate there
    // with a hash; HomePage scrolls to it once mounted.
    navigate(`/#${id}`);
  }

  function loadFile(file: File, isSample: boolean) {
    setUploadedFile(file);
    setIsSampleData(isSample);
    csv.loadFile(file);
    duckDb.loadTable(file);
    ask.reset();
    // Phase 25: start downloading Pyodide + loading this file into pandas
    // now, in the background, instead of waiting for the first question
    // that actually routes to Python. Fire-and-forget by design.
    warmUpPyodide(file);
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

  const askedQuestions = useMemo(() => ask.turns.map((t) => t.question), [ask.turns]);

  const latestTurn = ask.turns.length > 0 ? ask.turns[ask.turns.length - 1] : null;
  const followUps = useMemo(() => {
    if (!csv.data || !latestTurn || latestTurn.stage !== "done") return [];
    return suggestFollowUps(csv.data, askedQuestions);
  }, [csv.data, latestTurn, askedQuestions]);

  function handleExportConversation() {
    if (!csv.data) return;
    downloadConversationReport(ask.turns, csv.data.fileName);
  }

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-4 gap-6">
      <Navbar onNavigate={handleNavigate} variant="tool" />

      <div className="w-full max-w-4xl flex flex-col gap-6">
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

        {csv.data && ask.turns.length === 0 && (
          <>
            {welcome.text && <WelcomeSummary text={welcome.text} />}
            {welcome.loading && !welcome.text && (
              <p className="text-xs text-[var(--color-text-muted)] text-center">
                Looking at your data…
              </p>
            )}
          </>
        )}

        {csv.data && (
          <div className="flex items-center justify-end gap-2">
            <DevModeToggle devMode={devMode.devMode} onChange={devMode.setDevMode} />
            <span className="text-xs text-[var(--color-text-muted)]">Model:</span>
            <ProviderSelector value={ask.provider} onChange={ask.setProvider} disabled={isBusy} />
          </div>
        )}

        {csv.data && (
          <AskBar onAsk={ask.ask} isBusy={isBusy} cooldownUntil={ask.cooldownUntil} />
        )}

        {/* Follow-up suggestions always live right below the prompt box —
            never buried at the bottom of an answer card. SampleQuestions
            (before anything's been asked) and FollowUpChips (after the
            latest answer) occupy the exact same slot, one replacing the
            other as the conversation progresses. */}
        {csv.data && isSampleData && ask.turns.length === 0 && (
          <SampleQuestions onAsk={ask.ask} isBusy={isBusy} cooldownUntil={ask.cooldownUntil} />
        )}
        {csv.data && ask.turns.length > 0 && (
          <FollowUpChips
            suggestions={followUps}
            onAsk={ask.ask}
            isBusy={isBusy}
            cooldownUntil={ask.cooldownUntil}
          />
        )}

        {csv.data && duckDb.isLoadingTable && (
          <p className="text-xs text-[var(--color-text-muted)] text-center">
            Loading table into DuckDB…
          </p>
        )}

        {ask.turns.length > 0 && (
          <div className="flex justify-end">
            <button
              onClick={handleExportConversation}
              className="text-xs font-medium text-[var(--color-accent)] hover:underline"
            >
              Export conversation
            </button>
          </div>
        )}

        {ask.turns
          .map((turn, i) => ({ turn, number: i + 1 }))
          .reverse()
          .map(({ turn, number }) => (
            <AnswerCard
              key={turn.id}
              turn={turn}
              number={number}
              devMode={devMode.devMode}
              disableActions={isBusy}
              selectedProvider={ask.provider}
              onRegenerate={ask.regenerate}
            />
          ))}
      </div>

      <Footer onBackToTop={() => navigate("/")} />
    </div>
  );
}
