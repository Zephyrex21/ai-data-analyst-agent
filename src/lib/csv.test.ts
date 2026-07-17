import { describe, it, expect } from "vitest";
import { parseCsvFile, assertIsCsvFile, CsvValidationError } from "./csv";

function makeFile(name: string, content: string, type = "text/csv"): File {
  return new File([content], name, { type });
}

describe("assertIsCsvFile", () => {
  it("accepts a .csv file", () => {
    expect(() => assertIsCsvFile(makeFile("data.csv", "a,b\n1,2"))).not.toThrow();
  });

  it("rejects a non-.csv file", () => {
    expect(() => assertIsCsvFile(makeFile("notes.txt", "hello"))).toThrow(CsvValidationError);
  });

  it("rejects an empty file", () => {
    expect(() => assertIsCsvFile(makeFile("empty.csv", ""))).toThrow(CsvValidationError);
  });
});

describe("parseCsvFile", () => {
  it("parses a clean CSV and infers column types correctly", async () => {
    const csv = [
      "date,region,product,units_sold,revenue,in_stock",
      "2025-01-05,North,Widget A,120,2400.50,yes",
      "2025-01-06,South,Widget B,85,1700.00,no",
    ].join("\n");

    const result = await parseCsvFile(makeFile("clean.csv", csv));

    expect(result.totalRows).toBe(2);
    expect(result.warnings).toHaveLength(0);

    const typeByName = Object.fromEntries(result.columns.map((c) => [c.name, c.type]));
    expect(typeByName.date).toBe("date");
    expect(typeByName.region).toBe("string");
    expect(typeByName.product).toBe("string");
    expect(typeByName.units_sold).toBe("number");
    expect(typeByName.revenue).toBe("number");
    expect(typeByName.in_stock).toBe("boolean");
  });

  it("still parses malformed rows and surfaces a warning instead of failing", async () => {
    const csv = [
      "date,region,product,units_sold,revenue,in_stock",
      "2025-01-05,North,Widget A,120,2400.50,yes",
      "2025-01-06,South,Widget B,85,1700.00", // missing field
      "2025-01-07,East,Widget A,200,4000.00,yes,extra", // extra field
    ].join("\n");

    const result = await parseCsvFile(makeFile("malformed.csv", csv));

    expect(result.totalRows).toBeGreaterThan(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toMatch(/formatting issues/i);
  });

  it("rejects a file with no header/data rows", async () => {
    await expect(parseCsvFile(makeFile("empty.csv", ""))).rejects.toThrow(CsvValidationError);
  });

  it("flags entirely-empty columns as a warning", async () => {
    const csv = ["a,b,c", "1,,x", "2,,y"].join("\n");
    const result = await parseCsvFile(makeFile("emptycol.csv", csv));
    const typeByName = Object.fromEntries(result.columns.map((c) => [c.name, c.type]));
    expect(typeByName.b).toBe("empty");
    expect(result.warnings.some((w) => w.includes("entirely empty"))).toBe(true);
  });
});
