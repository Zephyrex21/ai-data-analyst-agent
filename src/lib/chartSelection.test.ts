import { describe, it, expect } from "vitest";
import { chooseChartType, isSingleScalar } from "./chartSelection";
import type { QueryResult } from "./duckdb";

describe("isSingleScalar", () => {
  it("is true for a 1-row, 1-column result", () => {
    const result: QueryResult = { columns: ["total"], rows: [{ total: 21026.25 }] };
    expect(isSingleScalar(result)).toBe(true);
  });

  it("is false for a multi-row result", () => {
    const result: QueryResult = {
      columns: ["region"],
      rows: [{ region: "North" }, { region: "South" }],
    };
    expect(isSingleScalar(result)).toBe(false);
  });
});

describe("chooseChartType", () => {
  it("picks a pie chart for a small number of categories", () => {
    const result: QueryResult = {
      columns: ["region", "total_revenue"],
      rows: [
        { region: "North", total_revenue: 6225.5 },
        { region: "South", total_revenue: 5800 },
        { region: "East", total_revenue: 4600 },
        { region: "West", total_revenue: 4400.75 },
      ],
    };
    expect(chooseChartType(result)?.type).toBe("pie");
  });

  it("picks a line chart when the label column looks like dates", () => {
    const result: QueryResult = {
      columns: ["date", "revenue"],
      rows: [
        { date: "2025-01-05", revenue: 2400.5 },
        { date: "2025-01-06", revenue: 1700 },
        { date: "2025-01-07", revenue: 4000 },
      ],
    };
    expect(chooseChartType(result)?.type).toBe("line");
  });

  it("picks a bar chart for many categories", () => {
    const result: QueryResult = {
      columns: ["product", "count"],
      rows: Array.from({ length: 8 }, (_, i) => ({ product: `Product ${i}`, count: i + 1 })),
    };
    expect(chooseChartType(result)?.type).toBe("bar");
  });

  it("returns null for 3+ columns rather than guessing", () => {
    const result: QueryResult = {
      columns: ["region", "product", "revenue"],
      rows: [{ region: "North", product: "A", revenue: 100 }],
    };
    expect(chooseChartType(result)).toBeNull();
  });

  it("returns null for an empty result", () => {
    expect(chooseChartType({ columns: ["x"], rows: [] })).toBeNull();
  });

  it("returns null when both columns are numeric (ambiguous label/value split)", () => {
    const result: QueryResult = {
      columns: ["units_sold", "revenue"],
      rows: [
        { units_sold: 120, revenue: 2400.5 },
        { units_sold: 85, revenue: 1700 },
      ],
    };
    expect(chooseChartType(result)).toBeNull();
  });
});
