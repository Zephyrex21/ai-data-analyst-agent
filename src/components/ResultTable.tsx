import { useState } from "react";
import type { QueryResult } from "../lib/duckdb";
import { formatDisplayValue } from "../lib/formatValue";
import { downloadResultAsCsv } from "../lib/downloadCsv";

interface ResultTableProps {
  result: QueryResult;
  questionForFilename: string;
}

const PAGE_SIZE = 50;

export function ResultTable({ result, questionForFilename }: ResultTableProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const visibleRows = result.rows.slice(0, visibleCount);
  const hasMore = visibleCount < result.rows.length;

  return (
    <div className="clay-inset overflow-x-auto p-1">
      <div className="flex justify-end px-2 pt-2">
        <button
          onClick={() => downloadResultAsCsv(result, questionForFilename)}
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
          {visibleRows.map((row, i) => (
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
      <div className="flex items-center justify-between gap-3 px-4 py-2 flex-wrap">
        <p className="text-xs text-[var(--color-text-muted)]">
          Showing {visibleRows.length.toLocaleString("en-US")} of {result.rows.length.toLocaleString("en-US")} row(s)
        </p>
        {hasMore && (
          <button
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            className="text-xs font-medium text-[var(--color-accent)] hover:underline"
          >
            Show {Math.min(PAGE_SIZE, result.rows.length - visibleCount)} more
          </button>
        )}
      </div>
    </div>
  );
}
