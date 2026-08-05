import { ProviderError } from "./types";

const COHERE_API_URL = "https://api.cohere.com/v2/chat";

// Cohere's free trial key is capped at ~1,000 calls/month (far lower than
// the others' per-minute/per-day windows), so this is deliberately last in
// FALLBACK_ORDER (index.ts) — a genuine last resort, not a primary pick.
const MODEL = "command-a-03-2025";

export const COHERE_LABEL = "Cohere — Command A";

export async function callCohere(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const res = await fetch(COHERE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      max_tokens: 1024,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 429) {
      throw new ProviderError("Cohere rate limit hit.", 429);
    }
    throw new ProviderError(`Cohere API error (${res.status}): ${errText.slice(0, 300)}`, res.status >= 500 ? 502 : res.status);
  }

  const data = await res.json();
  // Cohere v2's response shape differs from the OpenAI-style providers:
  // message.content is an array of typed blocks, not a single string —
  // find the text block rather than assuming index 0 is always it.
  const blocks = data?.message?.content;
  const textBlock = Array.isArray(blocks)
    ? blocks.find((b: { type?: string; text?: string }) => b?.type === "text")
    : undefined;
  const raw: string | undefined = textBlock?.text;
  if (!raw) throw new ProviderError("Cohere returned an empty response.", 502);
  return raw;
}
