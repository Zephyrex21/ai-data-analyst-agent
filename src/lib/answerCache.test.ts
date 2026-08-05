import { describe, it, expect } from "vitest";
import { createAnswerCache, type CachedAnswer } from "./answerCache";

const answer: CachedAnswer = {
  engine: "sql",
  sql: "SELECT COUNT(*) FROM data",
  result: { columns: ["count"], rows: [{ count: 42 }] },
  narrative: null,
  statsSummary: null,
  attemptsUsed: 1,
  actualProvider: "groq",
};

describe("createAnswerCache", () => {
  it("returns undefined for a question that was never cached", () => {
    const cache = createAnswerCache();
    expect(cache.get("how many rows", "groq")).toBeUndefined();
  });

  it("returns what was set for the same question + provider", () => {
    const cache = createAnswerCache();
    cache.set("how many rows", "groq", answer);
    expect(cache.get("how many rows", "groq")).toEqual(answer);
  });

  it("normalizes whitespace and case so near-identical phrasing still hits", () => {
    const cache = createAnswerCache();
    cache.set("How many rows?", "groq", answer);
    expect(cache.get("  how many rows?  ", "groq")).toEqual(answer);
    expect(cache.get("HOW MANY   ROWS?", "groq")).toEqual(answer);
  });

  it("keeps a different provider's answer separate, even for the identical question", () => {
    const cache = createAnswerCache();
    cache.set("how many rows", "groq", answer);
    expect(cache.get("how many rows", "gemini")).toBeUndefined();
  });

  it("keeps genuinely different questions separate", () => {
    const cache = createAnswerCache();
    cache.set("how many rows", "groq", answer);
    expect(cache.get("total revenue", "groq")).toBeUndefined();
  });

  it("clear() empties every entry regardless of provider", () => {
    const cache = createAnswerCache();
    cache.set("how many rows", "groq", answer);
    cache.set("how many rows", "gemini", answer);
    cache.clear();
    expect(cache.get("how many rows", "groq")).toBeUndefined();
    expect(cache.get("how many rows", "gemini")).toBeUndefined();
  });

  it("preserves actualProvider separately from the requested provider it's keyed under — Phase 30 fallback tracking", () => {
    const cache = createAnswerCache();
    // Cached under "groq" (what was requested/preferred), but the server
    // actually answered with gemini due to fallback.
    cache.set("how many rows", "groq", { ...answer, actualProvider: "gemini" });
    const hit = cache.get("how many rows", "groq");
    expect(hit?.actualProvider).toBe("gemini");
  });
});
