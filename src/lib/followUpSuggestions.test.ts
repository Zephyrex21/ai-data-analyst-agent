import { describe, it, expect } from "vitest";
import { suggestFollowUps } from "./followUpSuggestions";
import type { ParsedCsv } from "./csv";

const csv: ParsedCsv = {
  fileName: "sales.csv",
  totalRows: 100,
  warnings: [],
  rows: [],
  columns: [
    { name: "date", type: "date" },
    { name: "region", type: "string" },
    { name: "product", type: "string" },
    { name: "revenue", type: "number" },
    { name: "units_sold", type: "number" },
    { name: "notes", type: "empty" },
  ],
};

describe("suggestFollowUps", () => {
  it("only ever suggests real columns from this schema", () => {
    const suggestions = suggestFollowUps(csv, []);
    for (const s of suggestions) {
      expect(s).not.toContain("notes"); // empty-type column should never appear
    }
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.length).toBeLessThanOrEqual(3);
  });

  it("suggests drilling into the highest category for the primary numeric/categorical pair", () => {
    const suggestions = suggestFollowUps(csv, []);
    expect(suggestions.some((s) => s.includes("region") && s.includes("revenue"))).toBe(true);
  });

  it("suggests a trend-over-time question when a date column exists", () => {
    const suggestions = suggestFollowUps(csv, []);
    expect(suggestions.some((s) => s.includes("revenue") && s.includes("over time"))).toBe(true);
  });

  it("never repeats a question that's already been asked", () => {
    const suggestions = suggestFollowUps(csv, ["which region has the highest revenue"]);
    expect(suggestions.some((s) => s === "which region has the highest revenue")).toBe(false);
  });

  it("matching against already-asked is whitespace/case/punctuation tolerant", () => {
    const suggestions = suggestFollowUps(csv, ["  Which Region Has The Highest Revenue?  "]);
    expect(suggestions).not.toContain("which region has the highest revenue");
  });

  it("falls back to the generic overview question when a schema has almost nothing to work with", () => {
    const sparse: ParsedCsv = {
      fileName: "x.csv",
      totalRows: 5,
      warnings: [],
      rows: [],
      columns: [{ name: "id", type: "number" }],
    };
    const suggestions = suggestFollowUps(sparse, []);
    expect(suggestions).toContain("give me an overview of this dataset");
  });

  it("never suggests correlation when there's only one numeric column", () => {
    const oneNumeric: ParsedCsv = {
      fileName: "x.csv",
      totalRows: 5,
      warnings: [],
      rows: [],
      columns: [
        { name: "revenue", type: "number" },
        { name: "region", type: "string" },
      ],
    };
    const suggestions = suggestFollowUps(oneNumeric, []);
    expect(suggestions.some((s) => s.includes("correlation"))).toBe(false);
  });

  it("returns no duplicate suggestions even if multiple rules would produce the same text", () => {
    const suggestions = suggestFollowUps(csv, []);
    const unique = new Set(suggestions.map((s) => s.toLowerCase()));
    expect(unique.size).toBe(suggestions.length);
  });
});
