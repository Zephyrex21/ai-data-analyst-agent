import { describe, it, expect } from "vitest";
import {
  buildMetaAnswer,
  buildWelcomeSummary,
  summarizeDataQuality,
  classifyMetaIntent,
} from "./metaAnswer";
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

describe("classifyMetaIntent (Phase 27/29)", () => {
  it("classifies plain greetings", () => {
    for (const q of ["hi", "Hello", "hey there", "good morning", "yo", "howdy"]) {
      expect(classifyMetaIntent(q)).toBe("greeting");
    }
  });

  it("classifies 'who are you' as a greeting", () => {
    expect(classifyMetaIntent("who are you?")).toBe("greeting");
  });

  it("classifies short acknowledgments", () => {
    for (const q of ["thanks", "thank you!", "cool", "great", "ok", "got it", "perfect."]) {
      expect(classifyMetaIntent(q)).toBe("acknowledgment");
    }
  });

  it("does not misclassify a real question containing an ack-like word", () => {
    // "great" appears, but this is a real question, not a bare "great." —
    // the ^...$ anchoring in ACK_RE should keep this out of "acknowledgment".
    expect(classifyMetaIntent("what's the great lakes region's revenue")).not.toBe("acknowledgment");
  });
});

describe("buildMetaAnswer — greetings and small talk (Phase 29)", () => {
  it("gives a friendly, dataset-aware reply to a greeting instead of declining", () => {
    const text = buildMetaAnswer(csv, "hi there");
    expect(text).toContain("sample-sales-data.csv");
    expect(text).toContain("1,440");
  });

  it("gives a short friendly reply to an acknowledgment", () => {
    const text = buildMetaAnswer(csv, "thanks!");
    expect(text.length).toBeLessThan(120); // should stay brief, not turn into a full capability dump
  });
});

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
});

describe("buildMetaAnswer — real example row (Phase 27)", () => {
  it("includes a real first row for concreteness", () => {
    const text = buildMetaAnswer(csv, "what columns does this dataset have");
    expect(text).toContain("first row is");
    expect(text).toContain("North");
  });

  it("omits the example-row sentence gracefully when there are no parsed rows", () => {
    const noRows: ParsedCsv = { ...csv, rows: [] };
    const text = buildMetaAnswer(noRows, "what columns does this dataset have");
    expect(text).not.toContain("first row is");
  });
});

describe("summarizeDataQuality (Phase 29)", () => {
  function csvWithMissing(missingPct: number): ParsedCsv {
    const total = 20;
    const missingCount = Math.round(total * missingPct);
    const rows = Array.from({ length: total }, (_, i) => ({
      region: i < missingCount ? "" : "North",
    }));
    return {
      fileName: "x.csv",
      totalRows: total,
      warnings: [],
      rows,
      columns: [{ name: "region", type: "string" }],
    };
  }

  it("flags a column with meaningfully missing data", () => {
    const note = summarizeDataQuality(csvWithMissing(0.2)); // 20% missing
    expect(note).toContain("region (20%)");
  });

  it("does not flag a column with only trivial missingness", () => {
    const note = summarizeDataQuality(csvWithMissing(0.02)); // 2% missing — under the 5% threshold
    expect(note).toBeNull();
  });

  it("returns null when there are no rows at all", () => {
    const empty: ParsedCsv = { fileName: "x.csv", totalRows: 0, warnings: [], rows: [], columns: [] };
    expect(summarizeDataQuality(empty)).toBeNull();
  });

  it("ignores empty-type columns", () => {
    const withEmptyCol: ParsedCsv = {
      fileName: "x.csv",
      totalRows: 5,
      warnings: [],
      rows: Array.from({ length: 5 }, () => ({ notes: "" })),
      columns: [{ name: "notes", type: "empty" }],
    };
    expect(summarizeDataQuality(withEmptyCol)).toBeNull();
  });
});

describe("buildWelcomeSummary (Phase 29)", () => {
  it("mentions the real file name, row count, and columns", () => {
    const text = buildWelcomeSummary(csv);
    expect(text).toContain("sample-sales-data.csv");
    expect(text).toContain("1,440 rows");
    expect(text).toContain("date, region, revenue");
  });

  it("folds in a data-quality note when one exists", () => {
    const dirty: ParsedCsv = {
      fileName: "dirty.csv",
      totalRows: 20,
      warnings: [],
      rows: Array.from({ length: 20 }, (_, i) => ({ region: i < 6 ? "" : "North" })), // 30% missing
      columns: [{ name: "region", type: "string" }],
    };
    const text = buildWelcomeSummary(dirty);
    expect(text).toContain("Heads up");
    expect(text).toContain("region (30%)");
  });

  it("omits the data-quality note when the data is clean", () => {
    const text = buildWelcomeSummary(csv);
    expect(text).not.toContain("Heads up");
  });
});
