import { describe, it, expect } from "vitest";
import { parseChartTweak } from "./chartTweaks";

describe("parseChartTweak — chart type", () => {
  it("detects 'make it a bar chart'", () => {
    expect(parseChartTweak("make it a bar chart")).toEqual({ chartType: "bar" });
  });

  it("detects 'show that as a line chart'", () => {
    expect(parseChartTweak("show that as a line chart")).toEqual({ chartType: "line" });
  });

  it("detects 'switch to a pie chart'", () => {
    expect(parseChartTweak("switch to a pie chart")).toEqual({ chartType: "pie" });
  });

  it("detects a request to view as a table", () => {
    expect(parseChartTweak("just show me the table")).toEqual({ chartType: "table" });
  });

  it("is case-insensitive", () => {
    expect(parseChartTweak("MAKE IT A BAR CHART")).toEqual({ chartType: "bar" });
  });
});

describe("parseChartTweak — sort", () => {
  it("detects descending", () => {
    expect(parseChartTweak("sort descending")).toEqual({ sort: "desc" });
  });

  it("detects ascending phrasing variants", () => {
    expect(parseChartTweak("lowest to highest please")).toEqual({ sort: "asc" });
  });

  it("combines a chart type and a sort in one request", () => {
    expect(parseChartTweak("make it a bar chart, highest to lowest")).toEqual({
      chartType: "bar",
      sort: "desc",
    });
  });
});

describe("parseChartTweak — must not swallow real questions", () => {
  it("returns null for an unrelated question", () => {
    expect(parseChartTweak("what's the total revenue")).toBeNull();
  });

  it("does not treat a bare chart-type word as a tweak without tweak framing", () => {
    // "bar" alone (e.g. as part of a product name in a real question)
    // shouldn't be read as a display instruction without framing like
    // "make it"/"show as"/"switch to".
    expect(parseChartTweak("how many units of Widget Bar were sold")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseChartTweak("")).toBeNull();
  });

  it("does not treat 'give me a table of X' as a tweak — that's a new question, not a display change", () => {
    // Deliberately NOT in the framing list: "give me" is too generic and
    // collides with genuine new questions like this one.
    expect(parseChartTweak("give me a table of revenue by category")).toBeNull();
  });
});
