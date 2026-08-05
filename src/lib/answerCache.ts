import type { Engine } from "./llm";
import type { QueryResult } from "./duckdb";
import type { ProviderId } from "./providers";

// A repeat of the exact same question (someone re-clicking a sample
// question, or asking the same thing again after scrolling back up) costs a
// full LLM round trip today for an answer already computed once. This cache
// is purely in-memory and purely session-scoped — nothing here is ever
// persisted to localStorage/disk, and it's meant to be thrown away on reset
// or a new upload, not carried between sessions.

export interface CachedAnswer {
  engine: Engine;
  sql: string | null;
  result: QueryResult | null;
  narrative: string | null;
  statsSummary: string | null;
  attemptsUsed: number;
  /**
   * Which provider actually produced this answer — NOT necessarily the same
   * as the `provider` this entry is keyed under. The cache key is the
   * PREFERRED provider (what the person had selected), but server-side
   * fallback (Phase 30) may have used a different one to actually answer.
   * Replaying a cache hit should show the truth, not the original request.
   */
  actualProvider: ProviderId;
}

export interface AnswerCache {
  get(question: string, provider: ProviderId): CachedAnswer | undefined;
  set(question: string, provider: ProviderId, answer: CachedAnswer): void;
  clear(): void;
}

// Trim + collapse whitespace + lowercase, so "Total revenue?" and "total
// revenue?  " hit the same cache entry without pretending to understand
// the question any more deeply than that.
function normalizeQuestion(question: string): string {
  return question.trim().toLowerCase().replace(/\s+/g, " ");
}

function cacheKey(question: string, provider: ProviderId): string {
  // Keying by provider too is deliberate, not incidental: switching
  // providers is the whole point of the Phase 21 selector (comparing how
  // two models answer the same thing), so a provider switch must always
  // trigger a fresh call rather than silently reusing the other model's answer.
  return `${provider}::${normalizeQuestion(question)}`;
}

export function createAnswerCache(): AnswerCache {
  const store = new Map<string, CachedAnswer>();
  return {
    get: (question, provider) => store.get(cacheKey(question, provider)),
    set: (question, provider, answer) => store.set(cacheKey(question, provider), answer),
    clear: () => store.clear(),
  };
}
