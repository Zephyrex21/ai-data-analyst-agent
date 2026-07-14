import type { QueryResult } from "../lib/duckdb";

interface BigNumberDisplayProps {
  result: QueryResult;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return String(value);
}

export function BigNumberDisplay({ result }: BigNumberDisplayProps) {
  const label = result.columns[0];
  const value = result.rows[0]?.[label];

  return (
    <div className="rounded-xl bg-[var(--color-surface-muted)] px-6 py-8 text-center">
      <p className="text-4xl font-semibold text-[var(--color-accent)]">{formatValue(value)}</p>
      <p className="mt-1 text-xs uppercase tracking-wide text-[var(--color-text-muted)]">{label}</p>
    </div>
  );
}
