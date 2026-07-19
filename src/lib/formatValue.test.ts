import { describe, it, expect } from "vitest";
import { formatDisplayValue, roundForDisplay } from "./formatValue";

describe("formatDisplayValue", () => {
  it("cleans up floating-point summation noise (the exact production bug)", () => {
    expect(formatDisplayValue(361540.22000000015)).toBe("361,540.22");
    expect(formatDisplayValue(284399.02000000014)).toBe("284,399.02");
  });

  it("keeps clean integers clean, no unnecessary decimals", () => {
    expect(formatDisplayValue(10)).toBe("10");
    expect(formatDisplayValue(0)).toBe("0");
  });

  it("forces 2 decimals on currency-scale non-integers", () => {
    expect(formatDisplayValue(2400.5)).toBe("2,400.50");
    expect(formatDisplayValue(4400.75)).toBe("4,400.75");
  });

  it("preserves meaningful precision on small statistical values instead of flattening to 2 decimals", () => {
    // This was a real bug: a correlation of 0.997 would previously round to "1".
    expect(formatDisplayValue(0.997031331245565)).toBe("0.997");
  });

  it("handles negative values", () => {
    expect(formatDisplayValue(-125.5)).toBe("-125.50");
  });

  it("handles null/undefined as an em dash", () => {
    expect(formatDisplayValue(null)).toBe("—");
    expect(formatDisplayValue(undefined)).toBe("—");
  });

  it("passes through non-numeric values unchanged", () => {
    expect(formatDisplayValue("North")).toBe("North");
    expect(formatDisplayValue(true)).toBe("true");
  });
});

describe("roundForDisplay", () => {
  it("rounds without adding string formatting", () => {
    expect(roundForDisplay(361540.22000000015)).toBe(361540.22);
    expect(roundForDisplay(0.997031331245565)).toBe(0.997);
  });

  it("leaves integers untouched", () => {
    expect(roundForDisplay(10)).toBe(10);
  });
});
