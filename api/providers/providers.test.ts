import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { isProviderId, PROVIDERS, DEFAULT_PROVIDER, FALLBACK_ORDER, callWithFallback } from "./index";
import { ProviderError } from "./types";
import { callGroq } from "./groq";
import { callGemini } from "./gemini";
import { callMistral } from "./mistral";
import { callCerebras } from "./cerebras";
import { callCohere } from "./cohere";

function mockFetchOnce(response: Partial<Response> & { json?: () => Promise<unknown>; text?: () => Promise<string> }) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => "",
      ...response,
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isProviderId", () => {
  it("accepts all 5 known provider ids", () => {
    for (const id of ["groq", "gemini", "mistral", "cerebras", "cohere"]) {
      expect(isProviderId(id)).toBe(true);
    }
  });

  it("rejects anything else — this is the whitelist that keeps a client from picking an arbitrary env var", () => {
    expect(isProviderId("openai")).toBe(false);
    expect(isProviderId("")).toBe(false);
    expect(isProviderId(undefined)).toBe(false);
    expect(isProviderId({ toString: () => "groq" })).toBe(false);
  });
});

describe("PROVIDERS registry", () => {
  it("has a config entry for every known provider id, each with a label/envKey/call", () => {
    for (const id of ["groq", "gemini", "mistral", "cerebras", "cohere"] as const) {
      expect(PROVIDERS[id].label).toBeTruthy();
      expect(PROVIDERS[id].envKey).toBeTruthy();
      expect(typeof PROVIDERS[id].call).toBe("function");
    }
  });

  it("defaults to groq", () => {
    expect(DEFAULT_PROVIDER).toBe("groq");
  });

  it("FALLBACK_ORDER contains every provider exactly once, Cohere last given its much lower quota", () => {
    expect(FALLBACK_ORDER).toHaveLength(5);
    expect(new Set(FALLBACK_ORDER).size).toBe(5);
    expect(FALLBACK_ORDER[FALLBACK_ORDER.length - 1]).toBe("cohere");
  });
});

describe("callGroq", () => {
  it("extracts the message content on success", async () => {
    mockFetchOnce({
      json: async () => ({ choices: [{ message: { content: '{"engine":"sql","code":"SELECT 1"}' } }] }),
    });
    const raw = await callGroq("key", "system", "user");
    expect(raw).toBe('{"engine":"sql","code":"SELECT 1"}');
  });

  it("maps a 429 to a ProviderError — message is internal/logged now that the fallback layer (index.ts) builds the user-facing text", async () => {
    mockFetchOnce({ ok: false, status: 429, text: async () => "rate limited" });
    await expect(callGroq("key", "s", "u")).rejects.toMatchObject({
      status: 429,
      message: expect.stringContaining("rate limit"),
    });
  });

  it("wraps other non-ok statuses in a ProviderError with that status", async () => {
    mockFetchOnce({ ok: false, status: 500, text: async () => "boom" });
    await expect(callGroq("key", "s", "u")).rejects.toBeInstanceOf(ProviderError);
  });

  it("throws when the response has no message content", async () => {
    mockFetchOnce({ json: async () => ({ choices: [] }) });
    await expect(callGroq("key", "s", "u")).rejects.toThrow(/empty response/i);
  });
});

describe("callGemini", () => {
  it("extracts the candidate text on success", async () => {
    mockFetchOnce({
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '{"engine":"python","code":"result = 1"}' }] } }],
      }),
    });
    const raw = await callGemini("key", "system", "user");
    expect(raw).toBe('{"engine":"python","code":"result = 1"}');
  });

  it("maps a 429 to a ProviderError — message is internal/logged now that the fallback layer (index.ts) builds the user-facing text", async () => {
    mockFetchOnce({ ok: false, status: 429, text: async () => "RESOURCE_EXHAUSTED" });
    await expect(callGemini("key", "s", "u")).rejects.toMatchObject({
      status: 429,
      message: expect.stringContaining("rate limit"),
    });
  });

  it("throws when the response has no candidate text", async () => {
    mockFetchOnce({ json: async () => ({ candidates: [] }) });
    await expect(callGemini("key", "s", "u")).rejects.toThrow(/empty response/i);
  });
});

describe("callMistral", () => {
  it("extracts the message content on success (OpenAI-compatible shape)", async () => {
    mockFetchOnce({
      json: async () => ({ choices: [{ message: { content: '{"engine":"sql","code":"SELECT 1"}' } }] }),
    });
    const raw = await callMistral("key", "system", "user");
    expect(raw).toBe('{"engine":"sql","code":"SELECT 1"}');
  });

  it("maps a 429 to a ProviderError", async () => {
    mockFetchOnce({ ok: false, status: 429, text: async () => "rate limited" });
    await expect(callMistral("key", "s", "u")).rejects.toMatchObject({ status: 429 });
  });

  it("throws when the response has no message content", async () => {
    mockFetchOnce({ json: async () => ({ choices: [] }) });
    await expect(callMistral("key", "s", "u")).rejects.toThrow(/empty response/i);
  });
});

describe("callCerebras", () => {
  it("extracts the message content on success (OpenAI-compatible shape)", async () => {
    mockFetchOnce({
      json: async () => ({ choices: [{ message: { content: '{"engine":"python","code":"result = 1"}' } }] }),
    });
    const raw = await callCerebras("key", "system", "user");
    expect(raw).toBe('{"engine":"python","code":"result = 1"}');
  });

  it("maps a 429 to a ProviderError", async () => {
    mockFetchOnce({ ok: false, status: 429, text: async () => "rate limited" });
    await expect(callCerebras("key", "s", "u")).rejects.toMatchObject({ status: 429 });
  });
});

describe("callCohere", () => {
  it("extracts the text block from Cohere's array-of-content-blocks response shape", async () => {
    mockFetchOnce({
      json: async () => ({
        message: {
          content: [
            { type: "text", text: '{"engine":"meta"}' },
          ],
        },
      }),
    });
    const raw = await callCohere("key", "system", "user");
    expect(raw).toBe('{"engine":"meta"}');
  });

  it("finds the text block even if it's not first in the content array", async () => {
    mockFetchOnce({
      json: async () => ({
        message: {
          content: [
            { type: "thinking", text: "some internal reasoning" },
            { type: "text", text: '{"engine":"insights"}' },
          ],
        },
      }),
    });
    const raw = await callCohere("key", "system", "user");
    expect(raw).toBe('{"engine":"insights"}');
  });

  it("maps a 429 to a ProviderError", async () => {
    mockFetchOnce({ ok: false, status: 429, text: async () => "rate limited" });
    await expect(callCohere("key", "s", "u")).rejects.toMatchObject({ status: 429 });
  });

  it("throws when there's no text block at all", async () => {
    mockFetchOnce({ json: async () => ({ message: { content: [] } }) });
    await expect(callCohere("key", "s", "u")).rejects.toThrow(/empty response/i);
  });
});

describe("callWithFallback", () => {
  const ORIGINAL_ENV = process.env;
  const noopLog = () => {};

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });
  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("uses the preferred provider directly when it succeeds", async () => {
    process.env.GROQ_API_KEY = "g";
    process.env.GEMINI_API_KEY = "gem";
    mockFetchOnce({ json: async () => ({ choices: [{ message: { content: "ok" } }] }) });

    const result = await callWithFallback("groq", "sys", "user", noopLog);
    expect(result.providerUsed).toBe("groq");
    expect(result.attempted).toEqual(["groq"]);
  });

  it("falls through to the next configured provider when the preferred one fails", async () => {
    process.env.GROQ_API_KEY = "g";
    process.env.GEMINI_API_KEY = "gem";
    // No Mistral/Cerebras/Cohere keys configured — they should be skipped entirely.

    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        if (call === 1) {
          // First attempt (groq, the preferred provider): fails.
          return { ok: false, status: 429, text: async () => "rate limited" };
        }
        // Second attempt (gemini, next in FALLBACK_ORDER): succeeds.
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: "fallback answer" }] } }],
          }),
        };
      })
    );

    const result = await callWithFallback("groq", "sys", "user", noopLog);
    expect(result.providerUsed).toBe("gemini");
    expect(result.attempted).toEqual(["groq", "gemini"]);
    expect(result.raw).toBe("fallback answer");
  });

  it("skips providers whose API key isn't configured on this deployment", async () => {
    process.env.GEMINI_API_KEY = "gem";
    // GROQ_API_KEY deliberately not set — even though "groq" is preferred,
    // it should be skipped entirely rather than attempted with no key.

    mockFetchOnce({
      json: async () => ({ candidates: [{ content: { parts: [{ text: "gemini answered" }] } }] }),
    });

    const result = await callWithFallback("groq", "sys", "user", noopLog);
    expect(result.providerUsed).toBe("gemini");
    expect(result.attempted).toEqual(["gemini"]);
  });

  it("throws a clear error when no provider is configured at all", async () => {
    process.env = {};
    await expect(callWithFallback("groq", "sys", "user", noopLog)).rejects.toMatchObject({
      status: 500,
    });
  });

  it("throws a friendly, count-aware error when every configured provider fails", async () => {
    process.env.GROQ_API_KEY = "g";
    process.env.GEMINI_API_KEY = "gem";
    mockFetchOnce({ ok: false, status: 429, text: async () => "rate limited" });

    await expect(callWithFallback("groq", "sys", "user", noopLog)).rejects.toMatchObject({
      status: 429,
      message: expect.stringContaining("2 configured AI providers"),
    });
  });

  it("gives the single-provider message when only one is configured and it fails", async () => {
    process.env.GROQ_API_KEY = "g";
    mockFetchOnce({ ok: false, status: 429, text: async () => "rate limited" });

    await expect(callWithFallback("groq", "sys", "user", noopLog)).rejects.toMatchObject({
      status: 429,
      message: expect.stringContaining("popular right now"),
    });
  });

  it("logs a fallback event when the actual provider differs from the preferred one", async () => {
    process.env.GROQ_API_KEY = "g";
    process.env.GEMINI_API_KEY = "gem";
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        if (call === 1) return { ok: false, status: 429, text: async () => "rate limited" };
        return {
          ok: true,
          status: 200,
          json: async () => ({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }),
        };
      })
    );

    const log = vi.fn();
    await callWithFallback("groq", "sys", "user", log);
    expect(log).toHaveBeenCalledWith(
      "provider_fallback_succeeded",
      expect.objectContaining({ preferred: "groq", actual: "gemini" })
    );
  });
});
