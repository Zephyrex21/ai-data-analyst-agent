import { useState } from "react";
import type { AskStage } from "../hooks/useAskQuestion";
import type { QueryResult } from "../lib/duckdb";
import { chooseChartType, isSingleScalar } from "../lib/chartSelection";
import { BigNumberDisplay } from "./BigNumberDisplay";
import { ResultChart } from "./ResultChart";

interface AnswerCardProps {
  stage: AskStage;
  question: string | null;
  sql: string | null;
  result: QueryResult | null;
  error: string | null;
}

const STAGE_LABELS: Record<AskStage, string> = {
  idle: "",
  "generating-sql": "Thinking about how to query this…",
  "running-query": "Running the query…",
  done: "",
  error: "",
};

export function AnswerCard({ stage, question, sql, result, error }: AnswerCardProps) {
  const [showSql, setShowSql] = useState(false);

  if (stage === "idle" || !question) return null;

  const isBusy = stage === "generating-sql" || stage === "running-query";
  const chartSpec = result ? chooseChartType(result) : null;
  const showBigNumber = result ? isSingleScalar(result) : false;

  return (
    <div className="glass rounded-2xl p-6 w-full">
      <p className="text-sm text-[var(--color-text-muted)]">You asked</p>
      <p className="font-medium text-[var(--color-text)] mb-4">{question}</p>

      {isBusy && (
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
          <span className="h-2 w-2 rounded-full bg-[var(--color-accent)] animate-pulse" />
          {STAGE_LABELS[stage]}
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {sql && (
        <div className="mb-4">
          <button
            onClick={() => setShowSql((v) => !v)}
            className="text-xs font-medium text-[var(--color-accent)] hover:underline"
          >
            {showSql ? "Hide generated SQL" : "Show generated SQL"}
          </button>
          {showSql && (
            <pre className="mt-2 rounded-lg bg-[var(--color-text)] text-white text-xs p-3 overflow-x-auto whitespace-pre-wrap">
              {sql}
            </pre>
          )}
        </div>
      )}

      {result && showBigNumber && (
        <div className="mb-4">
          <BigNumberDisplay result={result} />
        </div>
      )}

      {result && !showBigNumber && chartSpec && (
        <div className="mb-4">
          <ResultChart spec={chartSpec} result={result} />
        </div>
      )}

      {result && (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
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
                        String(row[col])
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
  );
}
