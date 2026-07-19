import { lazy, Suspense } from "react";
import type { AskStage, ConversationTurn } from "../hooks/useAskQuestion";
import type { Engine } from "../lib/llm";
import { chooseChartType, isSingleScalar } from "../lib/chartSelection";
import { formatDisplayValue } from "../lib/formatValue";
import { downloadResultAsCsv } from "../lib/downloadCsv";
import { BigNumberDisplay } from "./BigNumberDisplay";

// Recharts is a sizeable dependency only needed once a chart-worthy result
// actually appears — most single-answer/table-only questions never need it,
// so it shouldn't be part of the initial page bundle everyone downloads.
const ResultChart = lazy(() =>
  import("./ResultChart").then((m) => ({ default: m.ResultChart }))
);

interface AnswerCardProps {
  turn: ConversationTurn;
  number: number;
}

const STAGE_LABELS: Record<AskStage, string> = {
  "generating-sql": "Thinking about how to answer this…",
  validating: "Checking the code is safe to run…",
  "loading-python": "Starting the Python engine (first time only, ~10-20s)…",
  "running-query": "Running it…",
  done: "",
  error: "",
};

const ENGINE_BADGE_STYLES: Record<Engine, string> = {
  sql: "bg-blue-100 text-blue-700",
  python: "bg-amber-100 text-amber-700",
};

export function AnswerCard({ turn, number }: AnswerCardProps) {
  const { stage, question, engine, result, error, attemptsUsed } = turn;

  const isBusy =
    stage === "generating-sql" ||
    stage === "validating" ||
    stage === "loading-python" ||
    stage === "running-query";
  const chartSpec = result ? chooseChartType(result) : null;
  const showBigNumber = result ? isSingleScalar(result) : false;

  return (
    <div className="turn-enter flex gap-3 w-full">
      <div className="flex-shrink-0 flex items-start justify-center pt-6">
        <span className="flex items-center justify-center h-7 w-7 rounded-full bg-[var(--color-surface-muted)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-muted)]">
          {number}
        </span>
      </div>

      <div className="glass rounded-2xl p-6 flex-1 min-w-0">
        <p className="text-sm text-[var(--color-text-muted)]">You asked</p>
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <p className="font-medium text-[var(--color-text)]">{question}</p>
          {engine && (
            <span
              className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${ENGINE_BADGE_STYLES[engine]}`}
            >
              {engine === "sql" ? "SQL" : "Python"}
            </span>
          )}
          {stage === "done" && attemptsUsed > 1 && (
            <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-green-100 text-green-700">
              Self-corrected after {attemptsUsed} attempts
            </span>
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
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {result && showBigNumber && (
          <div className="mb-4">
            <BigNumberDisplay result={result} />
          </div>
        )}

        {result && !showBigNumber && chartSpec && (
          <div className="mb-4">
            <Suspense
              fallback={
                <div className="h-[320px] rounded-xl bg-[var(--color-surface-muted)] animate-pulse" />
              }
            >
              <ResultChart spec={chartSpec} result={result} />
            </Suspense>
          </div>
        )}

        {result && (
          <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
            <div className="flex justify-end px-2 pt-2">
              <button
                onClick={() => downloadResultAsCsv(result, question)}
                className="text-xs font-medium text-[var(--color-accent)] hover:underline"
              >
                Download as CSV
              </button>
            </div>
            <table className="min-w-full text-sm text-left">
              <thead className="bg-[var(--color-surface-muted)]">
                <tr>
                  {result.columns.map((col) => (
                    <th key={col} className="px-4 py-2 whitespace-nowrap font-medium">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr key={i} className="border-t border-[var(--color-border)]">
                    {result.columns.map((col) => (
                      <td key={col} className="px-4 py-2 whitespace-nowrap">
                        {row[col] === null || row[col] === undefined ? (
                          <span className="text-[var(--color-text-muted)] italic">null</span>
                        ) : (
                          formatDisplayValue(row[col])
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-4 py-2 text-xs text-[var(--color-text-muted)]">
              {result.rows.length} row(s) returned
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
