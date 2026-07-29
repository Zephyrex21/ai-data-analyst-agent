import { callGroq, GROQ_LABEL } from "./groq";
import { callGemini, GEMINI_LABEL } from "./gemini";
import type { ProviderId, ProviderConfig } from "./types";

export { ProviderError } from "./types";
export type { ProviderId } from "./types";

// Single source of truth for which providers exist server-side. The
// client-side mirror of the id/label pairs (for the selector UI) lives in
// src/lib/providers.ts — keep the two in sync if a provider is added here.
export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  groq: { label: GROQ_LABEL, envKey: "GROQ_API_KEY", call: callGroq },
  gemini: { label: GEMINI_LABEL, envKey: "GEMINI_API_KEY", call: callGemini },
};

export const DEFAULT_PROVIDER: ProviderId = "groq";

export function isProviderId(value: unknown): value is ProviderId {
  return value === "groq" || value === "gemini";
}
