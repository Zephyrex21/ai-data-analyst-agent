/**
 * Formats a value for display, specifically to eliminate floating-point
 * accumulation noise (e.g. a SUM() of many decimal currency values coming
 * back as 361540.22000000015 instead of 361540.22) without losing
 * meaningful precision on small statistical values like a correlation
 * coefficient (0.997031331245565 should still show as 0.997, not be
 * flattened to 2 decimals and become 1.00).
 *
 * Heuristic: values with magnitude >= 1 (the vast majority of business
 * metrics — revenue, counts, totals) get exactly 2 decimals, matching
 * standard currency/quantity display. Values with magnitude < 1 (ratios,
 * correlations, proportions) get up to 4 decimals, since 2 would destroy
 * the information those numbers exist to convey.
 */
export function formatDisplayValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value !== "number" || !Number.isFinite(value)) return String(value);

  if (Number.isInteger(value)) return value.toLocaleString();

  const isLarge = Math.abs(value) >= 1;
  const decimals = isLarge ? 2 : 4;
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;

  return rounded.toLocaleString(undefined, {
    minimumFractionDigits: isLarge ? 2 : 0,
    maximumFractionDigits: decimals,
  });
}

/** Same rounding logic as formatDisplayValue, but returns a number (for chart axes/values) rather than a formatted string. */
export function roundForDisplay(value: number): number {
  if (!Number.isFinite(value) || Number.isInteger(value)) return value;
  const decimals = Math.abs(value) >= 1 ? 2 : 4;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
