import { ProviderError } from "./types";

const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";

// Free "Experiment" tier as of mid-2026: no card required, ~1B tokens/month.
// Small model, not Large — appropriate for a free-tier key and plenty for
// this app's job (pick an engine, write short SQL/Python).
const MODEL = "mistral-small-latest";

export const MISTRAL_LABEL = "Mistral — Small";

export async function callMistral(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const res = await fetch(MISTRAL_API_URL, {
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
      throw new ProviderError("Mistral rate limit hit.", 429);
    }
    throw new ProviderError(`Mistral API error (${res.status}): ${errText.slice(0, 300)}`, res.status >= 500 ? 502 : res.status);
  }

  const data = await res.json();
  const raw: string | undefined = data?.choices?.[0]?.message?.content;
  if (!raw) throw new ProviderError("Mistral returned an empty response.", 502);
  return raw;
}
