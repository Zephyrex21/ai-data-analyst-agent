import { callGroq, GROQ_LABEL } from "./groq";
import { callGemini, GEMINI_LABEL } from "./gemini";
import { callMistral, MISTRAL_LABEL } from "./mistral";
import { callCerebras, CEREBRAS_LABEL } from "./cerebras";
import { callCohere, COHERE_LABEL } from "./cohere";
import { ProviderError, type ProviderId, type ProviderConfig } from "./types";

export { ProviderError } from "./types";
export type { ProviderId } from "./types";

// Single source of truth for which providers exist server-side. The
// client-side mirror of the id/label/tag triples (for the selector UI)
// lives in src/lib/providers.ts — keep the two in sync if a provider is
// added/removed here.
export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  groq: { label: GROQ_LABEL, envKey: "GROQ_API_KEY", call: callGroq },
  gemini: { label: GEMINI_LABEL, envKey: "GEMINI_API_KEY", call: callGemini },
  mistral: { label: MISTRAL_LABEL, envKey: "MISTRAL_API_KEY", call: callMistral },
  cerebras: { label: CEREBRAS_LABEL, envKey: "CEREBRAS_API_KEY", call: callCerebras },
  cohere: { label: COHERE_LABEL, envKey: "COHERE_API_KEY", call: callCohere },
};

export const DEFAULT_PROVIDER: ProviderId = "groq";

// Order the automatic failover cascades through when the preferred
// provider fails — roughly by capability/speed/free-tier generosity, with
// Cohere deliberately last given its much lower monthly-call cap (~1,000/mo
// vs. the others' per-minute/per-day windows).
export const FALLBACK_ORDER: ProviderId[] = ["groq", "gemini", "mistral", "cerebras", "cohere"];

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && (FALLBACK_ORDER as string[]).includes(value);
}

const PROVIDER_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new ProviderError("Provider timed out.", 504)), ms)
    ),
  ]);
}

export interface FallbackResult {
  raw: string;
  /** Which provider actually produced the answer — may differ from what was requested. */
  providerUsed: ProviderId;
  attempted: ProviderId[];
}

/**
 * Tries the preferred provider first, then cascades through the rest of
 * FALLBACK_ORDER on ANY failure — a rate limit, a server error, a timeout,
 * an empty/malformed response — skipping any provider whose API key isn't
 * configured on this deployment. Only throws once every configured
 * provider has been tried and failed, so a single busy provider no longer
 * means "server busy" as long as at least one other is available.
 */
export async function callWithFallback(
  preferredProvider: ProviderId,
  systemPrompt: string,
  userPrompt: string,
  log: (event: string, data?: Record<string, unknown>) => void
): Promise<FallbackResult> {
  const order = [preferredProvider, ...FALLBACK_ORDER.filter((id) => id !== preferredProvider)];
  const configured = order.filter((id) => Boolean(process.env[PROVIDERS[id].envKey]));

  if (configured.length === 0) {
    throw new ProviderError(
      `Server has no AI provider configured. Add at least one of: ${order
        .map((id) => PROVIDERS[id].envKey)
        .join(", ")}.`,
      500
    );
  }

  const attempted: ProviderId[] = [];

  for (const id of configured) {
    attempted.push(id);
    const apiKey = process.env[PROVIDERS[id].envKey] as string;
    try {
      const raw = await withTimeout(PROVIDERS[id].call(apiKey, systemPrompt, userPrompt), PROVIDER_TIMEOUT_MS);
      if (id !== preferredProvider) {
        log("provider_fallback_succeeded", { preferred: preferredProvider, actual: id, attempted });
      }
      return { raw, providerUsed: id, attempted };
    } catch (err) {
      log("provider_attempt_failed", {
        provider: id,
        message: err instanceof Error ? err.message : String(err),
      });
      // Deliberately no special-casing here — every failure mode (rate
      // limit, 5xx, timeout, empty response) is treated as "try the next
      // provider," since the whole point of this loop is resilience
      // against any single provider being unavailable.
    }
  }

  const triedCount = configured.length;
  throw new ProviderError(
    triedCount > 1
      ? `All ${triedCount} configured AI providers are busy right now — please try again in a moment.`
      : "The demo is popular right now — please try again in a moment.",
    429
  );
}
