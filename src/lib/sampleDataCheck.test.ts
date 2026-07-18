import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { parseCsvFile } from "./csv";

describe("bundled sample dataset sanity check", () => {
  it("parses cleanly with no warnings and sensible types", async () => {
    const content = readFileSync("public/sample-sales-data.csv", "utf-8");
    const file = new File([content], "sample-sales-data.csv", { type: "text/csv" });

    const result = await parseCsvFile(file);

    expect(result.warnings).toHaveLength(0);
    expect(result.totalRows).toBeGreaterThan(1000);

    const typeByName = Object.fromEntries(result.columns.map((c) => [c.name, c.type]));
    expect(typeByName.date).toBe("date");
    expect(typeByName.region).toBe("string");
    expect(typeByName.product).toBe("string");
    expect(typeByName.units_sold).toBe("number");
    expect(typeByName.revenue).toBe("number");
    expect(typeByName.in_stock).toBe("boolean");

    const regions = new Set(result.rows.map((r) => r.region));
    expect(regions).toEqual(new Set(["North", "South", "East", "West"]));
  });
});
