import type { ParsedCsv, ColumnType } from "../lib/csv";

interface DataTableProps {
  data: ParsedCsv;
  onReset: () => void;
  previewRowCount?: number;
}

const TYPE_BADGE_STYLES: Record<ColumnType, string> = {
  number: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  string: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  boolean: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  date: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  empty: "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-300",
};

export function DataTable({ data, onReset, previewRowCount = 50 }: DataTableProps) {
  const previewRows = data.rows.slice(0, previewRowCount);

  return (
    <div className="clay p-6 w-full">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="font-semibold text-[var(--color-text)]">{data.fileName}</h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            {data.totalRows.toLocaleString("en-US")} rows · {data.columns.length} columns
          </p>
        </div>
        <button
          onClick={onReset}
          className="text-sm font-medium text-[var(--color-accent)] hover:underline"
        >
          Upload a different file
        </button>
      </div>

      {data.warnings.length > 0 && (
        <div className="mb-4 rounded-2xl bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          {data.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}

      <div className="clay-inset overflow-x-auto p-1">
        <table className="min-w-full text-sm text-left">
          <thead className="bg-[var(--color-surface-muted)] sticky top-0">
            <tr>
              {data.columns.map((col) => (
                <th key={col.name} className="px-4 py-2 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[var(--color-text)]">{col.name}</span>
                    <span
                      className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full ${TYPE_BADGE_STYLES[col.type]}`}
                    >
                      {col.type}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="border-t border-[var(--color-border)] odd:bg-[var(--color-surface)] even:bg-[var(--color-surface-muted)]/40"
              >
                {data.columns.map((col) => (
                  <td key={col.name} className="px-4 py-2 whitespace-nowrap text-[var(--color-text)]">
                    {row[col.name] ?? (
                      <span className="text-[var(--color-text-muted)] italic">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-[var(--color-text-muted)]">
        Showing {previewRows.length.toLocaleString("en-US")} of {data.totalRows.toLocaleString("en-US")} rows
      </p>
    </div>
  );
}
