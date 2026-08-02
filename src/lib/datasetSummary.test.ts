import { describe, it, expect, vi } from "vitest";
import { computeDatasetSummary, formatDatasetSummaryForPrompt, formatDatasetSummaryForWelcome, findMentionedColumns } from "./datasetSummary";
import type { ParsedCsv } from "./csv";
import type { QueryResult } from "./duckdb";

const csv: ParsedCsv = {
  fileName: "sales.csv",
  totalRows: 100,
  warnings: [],
  rows: [],
  columns: [
    { name: "revenue", type: "number" },
    { name: "units_sold", type: "number" },
    { name: "order_date", type: "date" },
    { name: "region", type: "string" },
    { name: "notes", type: "empty" },
  ],
};

// Matches the exact agg_N ordering computeDatasetSummary builds for the csv
// fixture above: revenue's 5 stats, units_sold's 5 stats, order_date's 3,
// region's 2, then the one revenue×units_sold correlation.
const FULL_COMBINED_ROW = {
  agg_0: 10,
  agg_1: 500,
  agg_2: 123.456,
  agg_3: 45.678,
  agg_4: 2,
  agg_5: 1,
  agg_6: 100,
  agg_7: 20.5,
  agg_8: 10.1,
  agg_9: 0,
  agg_10: "2025-01-01",
  agg_11: "2025-03-31",
  agg_12: 0,
  agg_13: 4,
  agg_14: 1,
  agg_15: 0.87,
};

function mockRunSql(
  combinedRow: Record<string, unknown>,
  topValuesByColumn: Record<string, { value: string; cnt: number }[]> = {}
) {
  return vi.fn(async (sql: string): Promise<QueryResult> => {
    if (sql.includes("GROUP BY")) {
      for (const [col, rows] of Object.entries(topValuesByColumn)) {
        if (sql.includes(`"${col}"`)) {
          return { columns: [], rows: rows as unknown as Record<string, unknown>[] };
        }
      }
      return { columns: [], rows: [] };
    }
    return { columns: [], rows: [combinedRow] };
  });
}

describe("computeDatasetSummary — batched query (Phase 26)", () => {
  it("computes every column's stats from a single combined query", async () => {
    const runSql = mockRunSql(FULL_COMBINED_ROW, {
      region: [
        { value: "North", cnt: 40 },
        { value: "South", cnt: 30 },
      ],
    });
    await computeDatasetSummary(csv, runSql);

    const combinedCalls = runSql.mock.calls.filter(([sql]) => !sql.includes("GROUP BY"));
    expect(combinedCalls).toHaveLength(1);
  });

  it("maps indexed aliases back to the right numeric column correctly", async () => {
    const runSql = mockRunSql(FULL_COMBINED_ROW, { region: [] });
    const summary = await computeDatasetSummary(csv, runSql);

    const revenue = summary.columns.find((c) => c.name === "revenue");
    expect(revenue).toMatchObject({ type: "number", min: 10, max: 500, nullCount: 2 });

    const unitsSold = summary.columns.find((c) => c.name === "units_sold");
    expect(unitsSold).toMatchObject({ type: "number", min: 1, max: 100, nullCount: 0 });
  });

  it("still needs one GROUP BY round trip per categorical column for top values", async () => {
    const runSql = mockRunSql(FULL_COMBINED_ROW, {
      region: [{ value: "North", cnt: 40 }],
    });
    await computeDatasetSummary(csv, runSql);

    const groupByCalls = runSql.mock.calls.filter(([sql]) => sql.includes("GROUP BY"));
    expect(groupByCalls).toHaveLength(1); // one categorical column in the fixture
  });

  it("skips entirely-empty columns", async () => {
    const runSql = mockRunSql(FULL_COMBINED_ROW, { region: [] });
    const summary = await computeDatasetSummary(csv, runSql);
    expect(summary.columns.find((c) => c.name === "notes")).toBeUndefined();
  });
});

describe("computeDatasetSummary — correlations (Phase 26)", () => {
  it("computes a correlation for every pair of numeric columns", async () => {
    const runSql = mockRunSql(FULL_COMBINED_ROW, { region: [] });
    const summary = await computeDatasetSummary(csv, runSql);
    expect(summary.correlations).toEqual([{ columnA: "revenue", columnB: "units_sold", value: 0.87 }]);
  });

  it("computes no correlations when fewer than 2 numeric columns exist", async () => {
    const oneNumeric: ParsedCsv = {
      ...csv,
      columns: [
        { name: "revenue", type: "number" },
        { name: "region", type: "string" },
      ],
    };
    const runSql = mockRunSql({ agg_0: 1, agg_1: 2, agg_2: 1.5, agg_3: 0.5, agg_4: 0, agg_5: 2, agg_6: 0 }, {
      region: [],
    });
    const summary = await computeDatasetSummary(oneNumeric, runSql);
    expect(summary.correlations).toEqual([]);
  });
});

describe("computeDatasetSummary — column scoping (Phase 26)", () => {
  it("only queries the requested columns when onlyColumns is given", async () => {
    const runSql = mockRunSql({ agg_0: 10, agg_1: 500, agg_2: 123, agg_3: 45, agg_4: 2 });
    const summary = await computeDatasetSummary(csv, runSql, { onlyColumns: ["revenue"] });

    expect(summary.columns).toHaveLength(1);
    expect(summary.columns[0].name).toBe("revenue");
    expect(summary.scopedToColumns).toEqual(["revenue"]);
    expect(summary.correlations).toEqual([]); // can't correlate with only one column selected
  });

  it("falls back to the full dataset when onlyColumns matches nothing real", async () => {
    const runSql = mockRunSql(FULL_COMBINED_ROW, { region: [] });
    const summary = await computeDatasetSummary(csv, runSql, { onlyColumns: ["not_a_real_column"] });

    expect(summary.columns).toHaveLength(4); // all real columns, scoping silently ignored
    expect(summary.scopedToColumns).toBeNull();
  });

  it("does not mark itself scoped when onlyColumns happens to match every real column", async () => {
    const runSql = mockRunSql(FULL_COMBINED_ROW, { region: [] });
    const summary = await computeDatasetSummary(csv, runSql, {
      onlyColumns: ["revenue", "units_sold", "order_date", "region"],
    });
    expect(summary.scopedToColumns).toBeNull();
  });
});

describe("findMentionedColumns", () => {
  it("matches a real column name mentioned in the question, case-insensitively", () => {
    expect(findMentionedColumns("what's the average Revenue?", csv)).toEqual(["revenue"]);
  });

  it("does not false-positive on a column name appearing as part of a longer word", () => {
    const csvWithDate: ParsedCsv = { ...csv, columns: [{ name: "date", type: "date" }] };
    expect(findMentionedColumns("when was this updated", csvWithDate)).toEqual([]);
  });

  it("returns every real column mentioned, in schema order", () => {
    const found = findMentionedColumns("compare revenue and region for each order_date", csv);
    expect(found).toEqual(["revenue", "order_date", "region"]);
  });

  it("returns an empty array when no real column is named", () => {
    expect(findMentionedColumns("give me an overview", csv)).toEqual([]);
  });
});

describe("formatDatasetSummaryForPrompt", () => {
  it("includes a correlations section when present", () => {
    const text = formatDatasetSummaryForPrompt({
      totalRows: 10,
      columns: [],
      correlations: [{ columnA: "revenue", columnB: "units_sold", value: 0.8734 }],
      scopedToColumns: null,
    });
    expect(text).toContain("Correlations between numeric columns:");
    expect(text).toContain("revenue vs units_sold: 0.87");
  });

  it("omits the correlations section when there are none", () => {
    const text = formatDatasetSummaryForPrompt({
      totalRows: 10,
      columns: [],
      correlations: [],
      scopedToColumns: null,
    });
    expect(text).not.toContain("Correlations");
  });

  it("notes when the summary was scoped to specific columns", () => {
    const text = formatDatasetSummaryForPrompt({
      totalRows: 10,
      columns: [],
      correlations: [],
      scopedToColumns: ["revenue"],
    });
    expect(text).toContain("Scoped to the column(s) the question named: revenue");
  });
});

describe("formatDatasetSummaryForWelcome (Phase 29 fix — detailed welcome message)", () => {
  it("returns null when there's nothing notable to highlight", () => {
    const text = formatDatasetSummaryForWelcome({
      totalRows: 10,
      columns: [],
      correlations: [],
      scopedToColumns: null,
    });
    expect(text).toBeNull();
  });

  it("includes a numeric column's real range and average", () => {
    const text = formatDatasetSummaryForWelcome({
      totalRows: 10,
      columns: [{ name: "revenue", type: "number", min: 15.2, max: 983.29, avg: 312.456, stddev: 100, nullCount: 0 }],
      correlations: [],
      scopedToColumns: null,
    });
    expect(text).toContain("Revenue ranges from 15.2 to 983.29");
    expect(text).toContain("avg 312.46");
  });

  it("includes the real date range", () => {
    const text = formatDatasetSummaryForWelcome({
      totalRows: 10,
      columns: [{ name: "order_date", type: "date", min: "2025-10-01", max: "2025-10-04", nullCount: 0 }],
      correlations: [],
      scopedToColumns: null,
    });
    expect(text).toContain("Dates span 2025-10-01 to 2025-10-04");
  });

  it("includes the top categorical value with its real count", () => {
    const text = formatDatasetSummaryForWelcome({
      totalRows: 10,
      columns: [
        {
          name: "region",
          type: "string",
          distinctCount: 4,
          topValues: [{ value: "North", count: 360 }],
          nullCount: 0,
        },
      ],
      correlations: [],
      scopedToColumns: null,
    });
    expect(text).toContain('most common region is "North" (360 rows)');
  });

  it("mentions a strong correlation but not a weak one", () => {
    const strong = formatDatasetSummaryForWelcome({
      totalRows: 10,
      columns: [],
      correlations: [{ columnA: "revenue", columnB: "units_sold", value: 0.91 }],
      scopedToColumns: null,
    });
    expect(strong).toContain("Revenue and units_sold are positively correlated (0.91)");

    const weak = formatDatasetSummaryForWelcome({
      totalRows: 10,
      columns: [],
      correlations: [{ columnA: "revenue", columnB: "units_sold", value: 0.12 }],
      scopedToColumns: null,
    });
    expect(weak).toBeNull();
  });

  it("labels a negative correlation correctly", () => {
    const text = formatDatasetSummaryForWelcome({
      totalRows: 10,
      columns: [],
      correlations: [{ columnA: "price", columnB: "units_sold", value: -0.72 }],
      scopedToColumns: null,
    });
    expect(text).toContain("negatively correlated");
  });

  it("caps numeric highlights at 2 columns to stay skimmable", () => {
    const text = formatDatasetSummaryForWelcome({
      totalRows: 10,
      columns: [
        { name: "a", type: "number", min: 1, max: 2, avg: 1.5, stddev: 0.5, nullCount: 0 },
        { name: "b", type: "number", min: 1, max: 2, avg: 1.5, stddev: 0.5, nullCount: 0 },
        { name: "c", type: "number", min: 1, max: 2, avg: 1.5, stddev: 0.5, nullCount: 0 },
      ],
      correlations: [],
      scopedToColumns: null,
    });
    expect(text).not.toContain("c ranges");
  });
});
