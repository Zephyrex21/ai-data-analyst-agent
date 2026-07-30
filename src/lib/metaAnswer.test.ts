import { describe, it, expect } from "vitest";
import { buildMetaAnswer } from "./metaAnswer";
import type { ParsedCsv } from "./csv";

const csv: ParsedCsv = {
  fileName: "sample-sales-data.csv",
  totalRows: 1440,
  warnings: [],
  rows: [],
  columns: [
    { name: "date", type: "date" },
    { name: "region", type: "string" },
    { name: "revenue", type: "number" },
    { name: "notes", type: "empty" },
  ],
};

describe("buildMetaAnswer", () => {
  it("mentions the real row count and file name", () => {
    const text = buildMetaAnswer(csv);
    expect(text).toContain("1,440");
    expect(text).toContain("sample-sales-data.csv");
  });

  it("lists real columns with their inferred types", () => {
    const text = buildMetaAnswer(csv);
    expect(text).toContain("date (date)");
    expect(text).toContain("region (string)");
    expect(text).toContain("revenue (number)");
  });

  it("excludes entirely-empty columns from the column list", () => {
    const text = buildMetaAnswer(csv);
    expect(text).not.toContain("notes");
  });

  it("is fully deterministic — same input always produces the same output", () => {
    expect(buildMetaAnswer(csv)).toBe(buildMetaAnswer(csv));
  });
});
