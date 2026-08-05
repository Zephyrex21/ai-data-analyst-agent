// Shared types for the multi-provider LLM abstraction. Each provider module
// (groq.ts, gemini.ts) exposes the same shape — a single async function
// that takes a system+user prompt and returns the raw text response — so
// generate-query.ts can stay completely provider-agnostic: it only knows
// about the shared {engine, code} JSON contract, never about Groq's or
// Gemini's specific request/response shapes.

export type ProviderId = "groq" | "gemini" | "mistral" | "cerebras" | "cohere";

export class ProviderError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type ProviderCallFn = (
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
) => Promise<string>;

export interface ProviderConfig {
  label: string;
  /** Name of the Vercel/local env var holding this provider's API key. */
  envKey: string;
  call: ProviderCallFn;
}
