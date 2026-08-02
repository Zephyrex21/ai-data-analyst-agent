import { lazy, Suspense, useMemo, useRef, useState } from "react";
import type { AskStage, ConversationTurn } from "../hooks/useAskQuestion";
import type { Engine } from "../lib/llm";
import { PROVIDER_OPTIONS } from "../lib/providers";
import { chooseChartType, isSingleScalar, type ChartSpec } from "../lib/chartSelection";
import { downloadSvgAsPng } from "../lib/downloadChartPng";
import { BigNumberDisplay } from "./BigNumberDisplay";
import { ResultTable } from "./ResultTable";

// Recharts is a sizeable dependency only needed once a chart-worthy result
// actually appears — most single-answer/table-only questions never need it,
// so it shouldn't be part of the initial page bundle everyone downloads.
const ResultChart = lazy(() =>
  import("./ResultChart").then((m) => ({ default: m.ResultChart }))
);

interface AnswerCardProps {
  turn: ConversationTurn;
  number: number;
  devMode?: boolean;
  disableActions: boolean;
  onRegenerate: (turnId: number) => void;
}

const STAGE_LABELS: Record<AskStage, string> = {
  "generating-sql": "Thinking about how to answer this…",
  validating: "Checking the code is safe to run…",
  "loading-python": "Starting the Python engine (first time only, ~10-20s)…",
  "computing-stats": "Computing real statistics about your data…",
  "running-query": "Running it…",
  done: "",
  error: "",
};

const ENGINE_BADGE_STYLES: Record<Engine, string> = {
  sql: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  python: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  insights: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  meta: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const ENGINE_LABELS: Record<Engine, string> = {
  sql: "SQL",
  python: "Python",
  insights: "Insights",
  meta: "Info",
};

/** Applies a Phase 29 display override on top of the chart chooseChartType() would pick by itself. */
function applyChartOverride(
  base: ChartSpec | null,
  override: ConversationTurn["displayOverride"]
): { spec: ChartSpec | null; forceTable: boolean } {
  if (!base || !override?.chartType) return { spec: base, forceTable: false };
  if (override.chartType === "table") return { spec: base, forceTable: true };
  return { spec: { ...base, type: override.chartType }, forceTable: false };
}

export function AnswerCard({
  turn,
  number,
  devMode = false,
  disableActions,
  onRegenerate,
}: AnswerCardProps) {
  const { stage, question, sql, engine, provider, result, narrative, statsSummary, error, attemptsUsed } = turn;
  const [copied, setCopied] = useState(false);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const isBusy =
    stage === "generating-sql" ||
    stage === "validating" ||
    stage === "loading-python" ||
    stage === "computing-stats" ||
    stage === "running-query";

  const rawChartSpec = result ? chooseChartType(result) : null;
  const { spec: chartSpec, forceTable } = applyChartOverride(rawChartSpec, turn.displayOverride);
  const showBigNumber = result ? isSingleScalar(result) : false;
  const providerLabel = PROVIDER_OPTIONS.find((p) => p.id === provider)?.label ?? provider;

  // Sort tweaks only apply when the result fits the classic "one label +
  // one numeric value" shape chooseChartType already detects — for wider,
  // multi-column results there's no unambiguous "the number" to sort by,
  // so the sort override is silently a no-op rather than guessing a column.
  const displayResult = useMemo(() => {
    if (!result || !turn.displayOverride?.sort || !rawChartSpec) return result;
    const key = rawChartSpec.valueKey;
    const sorted = [...result.rows].sort((a, b) => {
      const av = Number(a[key]);
      const bv = Number(b[key]);
      return turn.displayOverride!.sort === "asc" ? av - bv : bv - av;
    });
    return { ...result, rows: sorted };
  }, [result, turn.displayOverride, rawChartSpec]);

  async function handleCopyCode() {
    if (!sql) return;
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can fail in locked-down contexts — silently no-op
      // rather than showing an error for a non-critical convenience action.
    }
  }

  async function handleExportPng() {
    const svg = chartContainerRef.current?.querySelector("svg");
    if (!svg) return;
    try {
      await downloadSvgAsPng(svg, question);
    } catch {
      // Best-effort — chart export failing shouldn't feel like a broken app.
    }
  }

  const displayedResult = displayResult ?? result;

  return (
    <div className="turn-enter flex gap-3 w-full">
      <div className="flex-shrink-0 flex items-start justify-center pt-6">
        <span
          className="clay flex items-center justify-center h-8 w-8 text-xs font-semibold text-[var(--color-accent)]"
          style={{ borderRadius: 9999 }}
        >
          {number}
        </span>
      </div>

      <div className="clay p-6 flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm text-[var(--color-text-muted)]">You asked</p>
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <p className="font-medium text-[var(--color-text)]">{question}</p>
              {engine && (
                <span
                  className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full ${ENGINE_BADGE_STYLES[engine]}`}
                >
                  {ENGINE_LABELS[engine]}
                </span>
              )}
              {engine && (
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]">
                  {providerLabel}
                </span>
              )}
              {stage === "done" && attemptsUsed > 1 && (
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">
                  Self-corrected after {attemptsUsed} attempts
                </span>
              )}
            </div>
          </div>

          {stage === "done" && (
            <button
              onClick={() => onRegenerate(turn.id)}
              disabled={disableActions}
              title="Ask this again, replacing this answer with a fresh attempt"
              aria-label="Regenerate this answer"
              className="flex-shrink-0 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent)] disabled:opacity-40 disabled:pointer-events-none"
            >
              ↻ Regenerate
            </button>
          )}
        </div>

        {isBusy && (
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <span className="flex items-center gap-1">
              <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
              <span
                className="thinking-dot h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]"
                style={{ animationDelay: "0.15s" }}
              />
              <span
                className="thinking-dot h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]"
                style={{ animationDelay: "0.3s" }}
              />
            </span>
            {STAGE_LABELS[stage]}
          </div>
        )}

        {error && (
          <div className="rounded-2xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {narrative && (
          <div className="mb-4">
            <p className="text-[var(--color-text)] leading-relaxed">{narrative}</p>
            {statsSummary && (
              <details className="mt-3 group">
                <summary className="text-xs text-[var(--color-text-muted)] cursor-pointer hover:text-[var(--color-text)] select-none">
                  Show the real numbers behind this
                </summary>
                <pre className="mt-2 clay-inset p-3 text-xs text-[var(--color-text-muted)] whitespace-pre-wrap font-mono">
                  {statsSummary}
                </pre>
              </details>
            )}
          </div>
        )}

        {devMode && sql && (
          <details className="mb-4 group">
            <summary className="text-xs text-[var(--color-text-muted)] cursor-pointer hover:text-[var(--color-text)] select-none">
              Show code ({engine === "python" ? "Python" : "SQL"})
            </summary>
            <div className="relative mt-2">
              <pre className="clay-inset p-3 pr-16 text-xs text-[var(--color-text)] whitespace-pre-wrap font-mono overflow-x-auto">
                {sql}
              </pre>
              <button
                onClick={handleCopyCode}
                className="absolute top-2 right-2 text-[10px] font-medium px-2 py-1 rounded-full clay clay-pressable text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </details>
        )}

        {result && showBigNumber && (
          <div className="mb-4">
            <BigNumberDisplay result={result} />
          </div>
        )}

        {result && !showBigNumber && chartSpec && !forceTable && (
          <div className="mb-4">
            <div className="flex justify-end mb-1">
              <button
                onClick={handleExportPng}
                className="text-xs font-medium text-[var(--color-accent)] hover:underline"
              >
                Download chart as PNG
              </button>
            </div>
            <div ref={chartContainerRef}>
              <Suspense
                fallback={
                  <div className="h-[320px] rounded-[28px] bg-[var(--color-surface-muted)] animate-pulse" />
                }
              >
                <ResultChart spec={chartSpec} result={displayedResult ?? result} />
              </Suspense>
            </div>
          </div>
        )}

        {result && <ResultTable result={displayedResult ?? result} questionForFilename={question} />}
      </div>
    </div>
  );
}
