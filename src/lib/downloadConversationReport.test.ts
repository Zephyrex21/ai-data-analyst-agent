import { describe, it, expect } from "vitest";
import { buildConversationReport } from "./downloadConversationReport";
import type { ConversationTurn } from "../hooks/useAskQuestion";

function makeTurn(overrides: Partial<ConversationTurn>): ConversationTurn {
  return {
    id: 1,
    stage: "done",
    question: "total revenue by region",
    sql: null,
    engine: "sql",
    provider: "groq",
    result: null,
    narrative: null,
    statsSummary: null,
    error: null,
    attemptsUsed: 1,
    displayOverride: null,
    ...overrides,
  };
}

describe("buildConversationReport", () => {
  it("includes the dataset name and question count in the header", () => {
    const report = buildConversationReport([makeTurn({})], "sales.csv");
    expect(report).toContain("sales.csv");
    expect(report).toContain("1 question answered");
  });

  it("uses correct singular/plural for the question count", () => {
    const report = buildConversationReport([makeTurn({ id: 1 }), makeTurn({ id: 2 })], "sales.csv");
    expect(report).toContain("2 questions answered");
  });

  it("includes the SQL code block for a SQL turn", () => {
    const report = buildConversationReport(
      [makeTurn({ sql: "SELECT region, SUM(revenue) FROM data GROUP BY region" })],
      "sales.csv"
    );
    expect(report).toContain("```sql");
    expect(report).toContain("SELECT region");
  });

  it("uses a python code fence for a python turn", () => {
    const report = buildConversationReport(
      [makeTurn({ engine: "python", sql: "result = df['revenue'].corr(df['units_sold'])" })],
      "sales.csv"
    );
    expect(report).toContain("```python");
  });

  it("renders a result as a Markdown table", () => {
    const report = buildConversationReport(
      [
        makeTurn({
          result: {
            columns: ["region", "revenue"],
            rows: [
              { region: "North", revenue: 1000 },
              { region: "South", revenue: 800 },
            ],
          },
        }),
      ],
      "sales.csv"
    );
    expect(report).toContain("| region | revenue |");
    expect(report).toContain("North");
    expect(report).toContain("South");
  });

  it("notes truncation when a result has more than 20 rows", () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({ region: `R${i}`, revenue: i }));
    const report = buildConversationReport(
      [makeTurn({ result: { columns: ["region", "revenue"], rows } })],
      "sales.csv"
    );
    expect(report).toContain("showing 20 of 25 rows");
  });

  it("includes the narrative for an insights/meta turn instead of a table", () => {
    const report = buildConversationReport(
      [makeTurn({ engine: "meta", sql: null, narrative: "This dataset has 100 rows." })],
      "sales.csv"
    );
    expect(report).toContain("This dataset has 100 rows.");
  });

  it("includes the error message for a failed turn instead of a table/code block", () => {
    const report = buildConversationReport(
      [makeTurn({ stage: "error", engine: null, error: "That question doesn't seem answerable." })],
      "sales.csv"
    );
    expect(report).toContain("That question doesn't seem answerable.");
  });

  it("excludes in-progress turns — only done/error turns are reported", () => {
    const report = buildConversationReport(
      [makeTurn({ stage: "generating-sql" as ConversationTurn["stage"] })],
      "sales.csv"
    );
    expect(report).toContain("0 questions answered");
  });
});
