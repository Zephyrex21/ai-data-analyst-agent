// Client-side mirror of api/providers/index.ts's registry — just the id/label
// pairs needed for the selector UI, since the client never needs the actual
// call logic or API keys. Keep this list in sync with api/providers/index.ts
// if a provider is ever added or removed.

export type ProviderId = "groq" | "gemini";

export const DEFAULT_PROVIDER: ProviderId = "groq";

export interface ProviderOption {
  id: ProviderId;
  label: string;
}

export const PROVIDER_OPTIONS: ProviderOption[] = [
  { id: "groq", label: "Groq" },
  { id: "gemini", label: "Gemini" },
];

export function isProviderId(value: unknown): value is ProviderId {
  return value === "groq" || value === "gemini";
}
