// Phase 29 — "make that a bar chart" / "sort descending" are pure display
// instructions on an answer that's already been computed. They deliberately
// never touch the LLM, the cache, or the cooldown: there's no new data to
// fetch, just a different way to show data that's already sitting in the
// last turn's result. If a question doesn't parse as a tweak, this returns
// null and the caller falls through to the normal engine pipeline —
// nothing here can accidentally swallow a real question.

export type ChartTypeOverride = "bar" | "line" | "pie" | "table";
export type SortOverride = "asc" | "desc";

export interface ChartTweak {
  chartType?: ChartTypeOverride;
  sort?: SortOverride;
}

const CHART_TYPE_PATTERNS: Array<{ pattern: RegExp; type: ChartTypeOverride }> = [
  { pattern: /\bbar\s?(chart|graph)?\b/, type: "bar" },
  { pattern: /\bline\s?(chart|graph)?\b|\btrend line\b/, type: "line" },
  { pattern: /\bpie\s?(chart|graph)?\b/, type: "pie" },
  // "table" alone is a low-collision word in this context (unlike bar/line/
  // pie, which double as ordinary English/product-name words), so it
  // doesn't need the "as a"/"view" qualifiers the others lean on.
  { pattern: /\btable\b/, type: "table" },
];

const SORT_DESC_RE = /\b(descending|desc|highest to lowest|biggest first|largest first|high to low)\b/;
const SORT_ASC_RE = /\b(ascending|asc|lowest to highest|smallest first|low to high)\b/;

/**
 * Requires an explicit "make it/show it/as a ___" framing for chart-type
 * words specifically, so a genuine data question that happens to contain
 * "bar" (a product name, say) doesn't get misread as a display tweak.
 */
const CHART_TWEAK_FRAMING_RE =
  /\b(make (it|that|this)|show (it|that|this|me)|display (it|that|this)|put (it|that|this)|turn (it|that|this)|as a|switch to|change to|view as)\b/;

export function parseChartTweak(question: string): ChartTweak | null {
  const q = question.toLowerCase().trim();
  const tweak: ChartTweak = {};

  if (CHART_TWEAK_FRAMING_RE.test(q)) {
    for (const { pattern, type } of CHART_TYPE_PATTERNS) {
      if (pattern.test(q)) {
        tweak.chartType = type;
        break;
      }
    }
  }

  if (SORT_DESC_RE.test(q)) tweak.sort = "desc";
  else if (SORT_ASC_RE.test(q)) tweak.sort = "asc";

  if (!tweak.chartType && !tweak.sort) return null;
  return tweak;
}
