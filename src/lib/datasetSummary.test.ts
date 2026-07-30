import { describe, it, expect, vi } from "vitest";
import { computeDatasetSummary, formatDatasetSummaryForPrompt } from "./datasetSummary";
import type { ParsedCsv } from "./csv";
import type { QueryResult } from "./duckdb";

const csv: ParsedCsv = {
  fileName: "x.csv",
  totalRows: 100,
  warnings: [],
  rows: [],
  columns: [
    { name: "revenue", type: "number" },
    { name: "region", type: "string" },
    { name: "order_date", type: "date" },
    { name: "notes", type: "empty" },
  ],
};

function mockRunSql(responses: Record<string, QueryResult>) {
  return vi.fn(async (sql: string): Promise<QueryResult> => {
    // Check the GROUP BY (top-values) query first — it's a superset match
    // for other keys (e.g. it also contains the quoted column name), so it
    // has to win over a same-column full-table-scan key.
    if ("GROUP BY" in responses && sql.includes("GROUP BY")) {
      return responses["GROUP BY"];
    }
    for (const [needle, result] of Object.entries(responses)) {
      if (needle !== "GROUP BY" && sql.includes(needle)) return result;
    }
    throw new Error(`Unexpected SQL in test: ${sql}`);
  });
}

describe("computeDatasetSummary", () => {
  it("computes min/max/avg/stddev/nulls for numeric columns", async () => {
    const runSql = mockRunSql({
      '"revenue"': { columns: [], rows: [{ min_v: 10, max_v: 500, avg_v: 123.456, stddev_v: 45.6, null_count: 2 }] },
      '"region"': { columns: [], rows: [{ distinct_count: 4, null_count: 0 }] },
      "GROUP BY": { columns: [], rows: [{ value: "North", cnt: 30 }] },
      '"order_date"': { columns: [], rows: [{ min_v: "2025-01-01", max_v: "2025-03-31", null_count: 0 }] },
    });

    const summary = await computeDatasetSummary(csv, runSql);
    const revenue = summary.columns.find((c) => c.name === "revenue");
    expect(revenue).toMatchObject({ type: "number", min: 10, max: 500, nullCount: 2 });
  });

  it("skips entirely-empty columns rather than querying them", async () => {
    const runSql = mockRunSql({
      '"revenue"': { columns: [], rows: [{ min_v: 1, max_v: 2, avg_v: 1.5, stddev_v: 0.5, null_count: 0 }] },
      '"region"': { columns: [], rows: [{ distinct_count: 1, null_count: 0 }] },
      "GROUP BY": { columns: [], rows: [] },
      '"order_date"': { columns: [], rows: [{ min_v: "2025-01-01", max_v: "2025-01-02", null_count: 0 }] },
    });
    const summary = await computeDatasetSummary(csv, runSql);
    expect(summary.columns.find((c) => c.name === "notes")).toBeUndefined();
  });

  it("collects top categorical values with counts", async () => {
    const runSql = mockRunSql({
      '"revenue"': { columns: [], rows: [{ min_v: 1, max_v: 2, avg_v: 1.5, stddev_v: 0.5, null_count: 0 }] },
      '"region"': { columns: [], rows: [{ distinct_count: 2, null_count: 1 }] },
      "GROUP BY": {
        columns: [],
        rows: [
          { value: "North", cnt: 10 },
          { value: "South", cnt: 5 },
        ],
      },
      '"order_date"': { columns: [], rows: [{ min_v: "2025-01-01", max_v: "2025-01-02", null_count: 0 }] },
    });
    const summary = await computeDatasetSummary(csv, runSql);
    const region = summary.columns.find((c) => c.name === "region");
    expect(region).toMatchObject({
      type: "string",
      distinctCount: 2,
      nullCount: 1,
      topValues: [
        { value: "North", count: 10 },
        { value: "South", count: 5 },
      ],
    });
  });
});

describe("formatDatasetSummaryForPrompt", () => {
  it("renders a compact, numbers-only summary with rounded decimals", () => {
    const text = formatDatasetSummaryForPrompt({
      totalRows: 100,
      columns: [
        { name: "revenue", type: "number", min: 1, max: 999, avg: 123.4567, stddev: 45.678, nullCount: 0 },
        { name: "order_date", type: "date", min: "2025-01-01", max: "2025-03-31", nullCount: 0 },
        {
          name: "region",
          type: "string",
          distinctCount: 2,
          topValues: [{ value: "North", count: 10 }],
          nullCount: 0,
        },
      ],
    });
    expect(text).toContain("Total rows: 100");
    expect(text).toContain("avg=123.46");
    expect(text).toContain("stddev=45.68");
    expect(text).toContain("range 2025-01-01 to 2025-03-31");
    expect(text).toContain("North (10)");
  });
});
