import type { QueryResult } from "../lib/duckdb";
import { formatDisplayValue } from "../lib/formatValue";

interface BigNumberDisplayProps {
  result: QueryResult;
}

export function BigNumberDisplay({ result }: BigNumberDisplayProps) {
  const label = result.columns[0];
  const value = result.rows[0]?.[label];

  return (
    <div className="clay clay-accent px-6 py-8 text-center">
      <p className="text-4xl font-semibold text-[var(--color-accent)]">{formatDisplayValue(value)}</p>
      <p className="mt-1 text-xs uppercase tracking-wide text-[var(--color-text-muted)]">{label}</p>
    </div>
  );
}
