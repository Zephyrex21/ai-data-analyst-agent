import { describe, it, expect } from "vitest";
import { validateSql } from "./sqlValidator";
import type { ParsedCsv } from "./csv";

const csv: ParsedCsv = {
  fileName: "x.csv",
  totalRows: 0,
  warnings: [],
  rows: [],
  columns: [
    { name: "date", type: "date" },
    { name: "region", type: "string" },
    { name: "product", type: "string" },
    { name: "units_sold", type: "number" },
    { name: "revenue", type: "number" },
    { name: "in_stock", type: "boolean" },
  ],
};

describe("validateSql — legitimate queries pass", () => {
  it("allows SELECT *", () => {
    expect(validateSql("SELECT * FROM data LIMIT 10", csv).valid).toBe(true);
  });

  it("allows COUNT(*)", () => {
    expect(validateSql("SELECT COUNT(*) FROM data", csv).valid).toBe(true);
  });

  it("allows GROUP BY with an explicit AS alias", () => {
    const r = validateSql("SELECT region, SUM(revenue) AS total FROM data GROUP BY region", csv);
    expect(r.valid).toBe(true);
  });

  it("allows ORDER BY ... LIMIT for superlative questions", () => {
    const r = validateSql(
      "SELECT * FROM data WHERE region = 'North' ORDER BY revenue DESC LIMIT 1",
      csv
    );
    expect(r.valid).toBe(true);
  });
});

describe("validateSql — destructive statements are blocked", () => {
  it("blocks DROP", () => {
    expect(validateSql("DROP TABLE data", csv).valid).toBe(false);
  });

  it("blocks DELETE", () => {
    expect(validateSql("DELETE FROM data WHERE region = 'North'", csv).valid).toBe(false);
  });

  it("blocks a destructive statement stacked after a valid one via semicolon", () => {
    expect(validateSql("SELECT * FROM data; DROP TABLE data", csv).valid).toBe(false);
  });
});

describe("validateSql — schema hallucinations are caught", () => {
  it("rejects an unknown table", () => {
    const r = validateSql("SELECT * FROM users", csv);
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/unknown table/i);
  });

  it("rejects an unknown column", () => {
    const r = validateSql("SELECT profit_margin FROM data", csv);
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/profit_margin/);
  });

  it("rejects an unknown column used in WHERE", () => {
    const r = validateSql("SELECT * FROM data WHERE profit > 100", csv);
    expect(r.valid).toBe(false);
  });
});

describe("validateSql — edge cases", () => {
  it("does not false-positive on a keyword-like string literal", () => {
    const r = validateSql("SELECT * FROM data WHERE product = 'Widget DROP Special'", csv);
    expect(r.valid).toBe(true);
  });

  it("appends a LIMIT when none is present", () => {
    const r = validateSql("SELECT * FROM data", csv);
    expect(r.valid).toBe(true);
    expect(r.sql).toMatch(/LIMIT \d+$/);
  });

  it("respects an existing LIMIT instead of overriding it", () => {
    const r = validateSql("SELECT * FROM data LIMIT 3", csv);
    expect(r.valid).toBe(true);
    expect(r.sql).toBe("SELECT * FROM data LIMIT 3");
  });

  it("rejects CTEs (WITH) rather than half-supporting them", () => {
    const r = validateSql("WITH t AS (SELECT * FROM data) SELECT * FROM t", csv);
    expect(r.valid).toBe(false);
  });

  it("rejects empty input", () => {
    expect(validateSql("   ", csv).valid).toBe(false);
  });
});

describe("validateSql — subqueries and window functions (Phase 24)", () => {
  it("allows a window function directly in a SELECT (no subquery needed)", () => {
    const r = validateSql(
      "SELECT region, revenue, ROW_NUMBER() OVER (PARTITION BY region ORDER BY revenue DESC) AS rn FROM data",
      csv
    );
    expect(r.valid).toBe(true);
  });

  it("allows a single-level subquery filtering on a window function alias — the 'top N per group' pattern", () => {
    const r = validateSql(
      "SELECT * FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY region ORDER BY revenue DESC) AS rn FROM data) WHERE rn <= 2",
      csv
    );
    expect(r.valid).toBe(true);
  });

  it("still catches a hallucinated column even when it's nested inside a subquery", () => {
    const r = validateSql(
      "SELECT * FROM (SELECT profit_margin, region FROM data) WHERE profit_margin > 100",
      csv
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/profit_margin/);
  });

  it("still blocks a destructive keyword even alongside subquery syntax", () => {
    const r = validateSql(
      "SELECT * FROM (SELECT * FROM data) AS t; DELETE FROM data",
      csv
    );
    expect(r.valid).toBe(false);
  });

  it("still rejects true multi-statement CTEs (WITH ... SELECT) — unchanged from before", () => {
    const r = validateSql("WITH t AS (SELECT * FROM data) SELECT * FROM t", csv);
    expect(r.valid).toBe(false);
  });

  it("appends the row-cap LIMIT to a subquery-based query same as any other", () => {
    const r = validateSql(
      "SELECT * FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY region ORDER BY revenue DESC) AS rn FROM data) WHERE rn <= 2",
      csv
    );
    expect(r.sql).toMatch(/LIMIT \d+$/);
  });
});
