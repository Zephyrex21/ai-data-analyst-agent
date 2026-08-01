import { describe, it, expect } from "vitest";
import { buildMetaAnswer } from "./metaAnswer";
import type { ParsedCsv } from "./csv";

const csv: ParsedCsv = {
  fileName: "sample-sales-data.csv",
  totalRows: 1440,
  warnings: [],
  rows: [{ date: "2025-10-01", region: "North", revenue: "1850.79" }],
  columns: [
    { name: "date", type: "date" },
    { name: "region", type: "string" },
    { name: "revenue", type: "number" },
    { name: "notes", type: "empty" },
  ],
};

const CAPABILITY_MARKER = "counts, sums, averages";

describe("buildMetaAnswer — phrasing-aware intent (Phase 27)", () => {
  it("leads with the column list and skips the capability blurb for a columns-focused question", () => {
    const text = buildMetaAnswer(csv, "what columns does this dataset have");
    expect(text).toContain("date (date)");
    expect(text).toContain("region (string)");
    expect(text).not.toContain(CAPABILITY_MARKER);
  });

  it("leads with the capability blurb and skips the full column list for a capability-focused question", () => {
    const text = buildMetaAnswer(csv, "what can I ask you");
    expect(text).toContain(CAPABILITY_MARKER);
    expect(text).not.toContain("date (date)");
  });

  it("gives both column list and capability blurb for genuinely ambiguous phrasing", () => {
    const text = buildMetaAnswer(csv, "what is this dataset about");
    expect(text).toContain("date (date)");
    expect(text).toContain(CAPABILITY_MARKER);
  });

  it("falls back to the full (general) answer when a question signals both intents at once", () => {
    const text = buildMetaAnswer(csv, "what columns can I ask about");
    expect(text).toContain("date (date)");
    expect(text).toContain(CAPABILITY_MARKER);
  });

  it("is case-insensitive when detecting intent", () => {
    const text = buildMetaAnswer(csv, "WHAT COLUMNS DOES THIS HAVE");
    expect(text).not.toContain(CAPABILITY_MARKER);
  });
});

describe("buildMetaAnswer — real example row (Phase 27)", () => {
  it("includes a real first row for concreteness", () => {
    const text = buildMetaAnswer(csv, "what columns does this dataset have");
    expect(text).toContain("first row is");
    expect(text).toContain("North");
    expect(text).toContain("1850.79");
  });

  it("excludes the empty column from the example row", () => {
    const text = buildMetaAnswer(csv, "what columns does this dataset have");
    expect(text).not.toContain("notes:");
  });

  it("omits the example-row sentence gracefully when there are no parsed rows", () => {
    const noRows: ParsedCsv = { ...csv, rows: [] };
    const text = buildMetaAnswer(noRows, "what columns does this dataset have");
    expect(text).not.toContain("first row is");
  });
});

describe("buildMetaAnswer — singular/plural row and column counts", () => {
  it("uses singular wording for exactly 1 row and 1 column", () => {
    const single: ParsedCsv = {
      fileName: "x.csv",
      totalRows: 1,
      warnings: [],
      rows: [{ id: "1" }],
      columns: [{ name: "id", type: "number" }],
    };
    const text = buildMetaAnswer(single, "what columns does this have");
    expect(text).toContain("1 row and 1 column:");
  });

  it("uses plural wording otherwise", () => {
    const text = buildMetaAnswer(csv, "what columns does this dataset have");
    expect(text).toContain("1,440 rows and 3 columns:");
  });
});
