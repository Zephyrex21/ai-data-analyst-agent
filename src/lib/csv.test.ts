import { describe, it, expect } from "vitest";
import { parseCsvFile, assertIsCsvFile, CsvValidationError } from "./csv";

function makeFile(name: string, content: string | Uint8Array, type = "text/csv"): File {
  return new File([content as BlobPart], name, { type });
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

describe("parseCsvFile — edge cases (Phase 17)", () => {
  it("strips a UTF-8 BOM from the header instead of corrupting the first column name", async () => {
    const csv = "\uFEFFdate,region\n2025-01-05,North";
    const result = await parseCsvFile(makeFile("bom.csv", csv));
    expect(result.columns.map((c) => c.name)).toEqual(["date", "region"]);
  });

  it("handles Windows (CRLF) line endings the same as Unix (LF)", async () => {
    const csv = "a,b\r\n1,2\r\n3,4";
    const result = await parseCsvFile(makeFile("crlf.csv", csv));
    expect(result.totalRows).toBe(2);
    expect(result.rows[0]).toEqual({ a: "1", b: "2" });
  });

  it("auto-detects a semicolon delimiter", async () => {
    const csv = "a;b\n1;2\n3;4";
    const result = await parseCsvFile(makeFile("semi.csv", csv));
    expect(result.columns.map((c) => c.name)).toEqual(["a", "b"]);
    expect(result.rows).toEqual([{ a: "1", b: "2" }, { a: "3", b: "4" }]);
  });

  it("auto-detects a tab delimiter", async () => {
    const csv = "a\tb\n1\t2";
    const result = await parseCsvFile(makeFile("tab.csv", csv));
    expect(result.columns.map((c) => c.name)).toEqual(["a", "b"]);
  });

  it("auto-detects a pipe delimiter", async () => {
    const csv = "a|b\n1|2";
    const result = await parseCsvFile(makeFile("pipe.csv", csv));
    expect(result.columns.map((c) => c.name)).toEqual(["a", "b"]);
  });

  it("warns (doesn't crash) when a file isn't actually UTF-8 encoded", async () => {
    // 0x93/0x94 are curly quotes in Windows-1252 but invalid continuation
    // bytes under UTF-8, so the browser decoder swaps them for U+FFFD.
    const bytes = new Uint8Array([
      ...Buffer.from("name,note\nAlice,"),
      0x93,
      ...Buffer.from("hi"),
      0x94,
      ...Buffer.from("\n"),
    ]);
    const result = await parseCsvFile(makeFile("cp1252.csv", bytes));
    expect(result.totalRows).toBe(1); // parses, doesn't throw
    expect(result.warnings.some((w) => w.includes("UTF-8"))).toBe(true);
  });

  it("rejects a file over the 25MB cap", async () => {
    const big = "a,b\n" + "1,2\n".repeat(7_000_000); // ~28MB
    await expect(parseCsvFile(makeFile("huge.csv", big))).rejects.toThrow(CsvValidationError);
  });

  it("parses a file with several thousand rows without truncating (no upload row cap)", async () => {
    const rows = Array.from({ length: 6000 }, (_, i) => `${i},North`).join("\n");
    const csv = `id,region\n${rows}`;
    const result = await parseCsvFile(makeFile("manyrows.csv", csv));
    expect(result.totalRows).toBe(6000);
  });
});
