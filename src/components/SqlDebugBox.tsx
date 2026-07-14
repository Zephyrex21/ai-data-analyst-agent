import { useState } from "react";
import type { QueryResult } from "../lib/duckdb";

interface SqlDebugBoxProps {
  isTableReady: boolean;
  isQuerying: boolean;
  queryError: string | null;
  result: QueryResult | null;
  onRunQuery: (sql: string) => void;
}

/**
 * TEMPORARY, Phase-2-only component.
 * This exists purely to manually prove DuckDB-WASM executes real SQL against
 * the uploaded CSV before the LLM starts generating that SQL in Phase 3.
 * Delete this component (and its usage in App.tsx) once Phase 3 is working.
 */
export function SqlDebugBox({
  isTableReady,
  isQuerying,
  queryError,
  result,
  onRunQuery,
}: SqlDebugBoxProps) {
  const [sql, setSql] = useState("SELECT * FROM data LIMIT 10");

  return (
    <div className="glass rounded-2xl p-6 w-full border-2 border-dashed border-amber-300">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
          Dev only — Phase 2 debug
        </span>
        <span className="text-xs text-[var(--color-text-muted)]">
          Table name is <code>data</code>. Remove this box in Phase 3.
        </span>
      </div>

      <textarea
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        rows={3}
        spellCheck={false}
        className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 font-mono text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
      />

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={() => onRunQuery(sql)}
          disabled={!isTableReady || isQuerying}
          className="rounded-full bg-[var(--color-accent)] text-white text-sm font-medium px-4 py-2 disabled:opacity-40"
        >
          {isQuerying ? "Running…" : "Run query"}
        </button>
        {!isTableReady && (
          <span className="text-xs text-[var(--color-text-muted)]">
            Waiting for table to load into DuckDB…
          </span>
        )}
      </div>

      {queryError && (
        <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 font-mono whitespace-pre-wrap">
          {queryError}
        </div>
      )}

      {result && (
        <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--color-border)]">
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
