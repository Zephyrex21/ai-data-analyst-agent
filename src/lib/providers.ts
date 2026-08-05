// Client-side mirror of api/providers/index.ts's registry — the id/label/tag
// triples needed for the selector UI, since the client never needs the
// actual call logic or API keys. Keep this list in sync with
// api/providers/index.ts if a provider is ever added or removed.

export type ProviderId = "groq" | "gemini" | "mistral" | "cerebras" | "cohere";

export const DEFAULT_PROVIDER: ProviderId = "groq";

export interface ProviderOption {
  id: ProviderId;
  /** Provider name, shown as the main label. */
  label: string;
  /** The specific model this provider runs, shown as a subtitle. */
  model: string;
  /** One-word-ish descriptor of what this provider is good for — shown as a small badge. */
  tag: string;
}

export const PROVIDER_OPTIONS: ProviderOption[] = [
  { id: "groq", label: "Groq", model: "gpt-oss-120b", tag: "Fast" },
  { id: "gemini", label: "Gemini", model: "2.5 Flash", tag: "Balanced" },
  { id: "mistral", label: "Mistral", model: "Small", tag: "Efficient" },
  { id: "cerebras", label: "Cerebras", model: "gpt-oss-120b", tag: "Fastest" },
  { id: "cohere", label: "Cohere", model: "Command A", tag: "Fallback" },
];

export function isProviderId(value: unknown): value is ProviderId {
  return PROVIDER_OPTIONS.some((p) => p.id === value);
}
