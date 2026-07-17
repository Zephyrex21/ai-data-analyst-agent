import { describe, it, expect } from "vitest";
import { buildSchemaDescription, summarizeResultForHistory } from "./schema";
import type { ParsedCsv } from "./csv";
import type { QueryResult } from "./duckdb";

describe("buildSchemaDescription", () => {
  it("includes the table name, column names/types, and sample rows", () => {
    const csv: ParsedCsv = {
      fileName: "x.csv",
      totalRows: 2,
      warnings: [],
      columns: [
        { name: "region", type: "string" },
        { name: "revenue", type: "number" },
      ],
      rows: [
        { region: "North", revenue: "100" },
        { region: "South", revenue: "200" },
      ],
    };

    const description = buildSchemaDescription(csv);
    expect(description).toContain("Table name: data");
    expect(description).toContain("region (string)");
    expect(description).toContain("revenue (number)");
    expect(description).toContain("North");
  });
});

describe("summarizeResultForHistory", () => {
  it("summarizes a small result in full", () => {
    const result: QueryResult = {
      columns: ["region", "total_revenue"],
      rows: [
        { region: "North", total_revenue: 6225.5 },
        { region: "South", total_revenue: 5800 },
      ],
    };
    const summary = summarizeResultForHistory(result);
    expect(summary).toContain("region=North");
    expect(summary).toContain("region=South");
  });

  it("caps a large result and notes how many rows were omitted", () => {
    const result: QueryResult = {
      columns: ["date", "revenue"],
      rows: Array.from({ length: 20 }, (_, i) => ({ date: `2025-01-${i + 1}`, revenue: i * 100 })),
    };
    const summary = summarizeResultForHistory(result);
    expect(summary).toContain("15 more row(s)");
    expect(summary).toContain("20 total");
  });

  it("reports an empty result plainly", () => {
    expect(summarizeResultForHistory({ columns: ["x"], rows: [] })).toBe("0 rows returned.");
  });

  it("summarizes a scalar result", () => {
    const result: QueryResult = { columns: ["total"], rows: [{ total: 21026.25 }] };
    expect(summarizeResultForHistory(result)).toBe("total=21026.25");
  });
});
