import { describe, it, expect, vi, afterEach } from "vitest";
import { isProviderId, PROVIDERS, DEFAULT_PROVIDER } from "./index";
import { ProviderError } from "./types";
import { callGroq } from "./groq";
import { callGemini } from "./gemini";

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
  it("accepts the two known provider ids", () => {
    expect(isProviderId("groq")).toBe(true);
    expect(isProviderId("gemini")).toBe(true);
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
    for (const id of ["groq", "gemini"] as const) {
      expect(PROVIDERS[id].label).toBeTruthy();
      expect(PROVIDERS[id].envKey).toBeTruthy();
      expect(typeof PROVIDERS[id].call).toBe("function");
    }
  });

  it("defaults to groq", () => {
    expect(DEFAULT_PROVIDER).toBe("groq");
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

  it("maps a 429 to a friendly ProviderError", async () => {
    mockFetchOnce({ ok: false, status: 429, text: async () => "rate limited" });
    await expect(callGroq("key", "s", "u")).rejects.toMatchObject({
      status: 429,
      message: expect.stringContaining("popular right now"),
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

  it("maps a 429 to a friendly ProviderError", async () => {
    mockFetchOnce({ ok: false, status: 429, text: async () => "RESOURCE_EXHAUSTED" });
    await expect(callGemini("key", "s", "u")).rejects.toMatchObject({
      status: 429,
      message: expect.stringContaining("popular right now"),
    });
  });

  it("throws when the response has no candidate text", async () => {
    mockFetchOnce({ json: async () => ({ candidates: [] }) });
    await expect(callGemini("key", "s", "u")).rejects.toThrow(/empty response/i);
  });
});
