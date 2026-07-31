import { describe, it, expect, afterEach } from "vitest";
import { shouldSkipBackgroundWarmup } from "./pyodide";

// pyodide.ts otherwise depends on a real Worker + WASM download, which this
// environment can't exercise (same reason duckdb.ts has no unit tests
// either) — that's what the eval script / a real browser pass are for.
// shouldSkipBackgroundWarmup is pure logic, though, so it's worth testing
// directly rather than leaving Phase 25's actual behavior unverified.

afterEach(() => {
  delete (navigator as { connection?: unknown }).connection;
});

describe("shouldSkipBackgroundWarmup", () => {
  it("returns false when navigator.connection doesn't exist (most browsers)", () => {
    expect(shouldSkipBackgroundWarmup()).toBe(false);
  });

  it("returns false when connection exists but saveData is off", () => {
    Object.defineProperty(navigator, "connection", {
      value: { saveData: false },
      configurable: true,
    });
    expect(shouldSkipBackgroundWarmup()).toBe(false);
  });

  it("returns true when the browser signals data-saver mode", () => {
    Object.defineProperty(navigator, "connection", {
      value: { saveData: true },
      configurable: true,
    });
    expect(shouldSkipBackgroundWarmup()).toBe(true);
  });
});
