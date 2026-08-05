import { ProviderError } from "./types";

const CEREBRAS_API_URL = "https://api.cerebras.ai/v1/chat/completions";

// Same open model Groq serves, run on Cerebras's own wafer-scale hardware
// instead — genuinely the fastest inference of the 5 providers here. Free
// tier as of mid-2026: no card required, ~1M tokens/day.
const MODEL = "gpt-oss-120b";

export const CEREBRAS_LABEL = "Cerebras — gpt-oss-120b";

export async function callCerebras(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const res = await fetch(CEREBRAS_API_URL, {
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
      throw new ProviderError("Cerebras rate limit hit.", 429);
    }
    throw new ProviderError(`Cerebras API error (${res.status}): ${errText.slice(0, 300)}`, res.status >= 500 ? 502 : res.status);
  }

  const data = await res.json();
  const raw: string | undefined = data?.choices?.[0]?.message?.content;
  if (!raw) throw new ProviderError("Cerebras returned an empty response.", 502);
  return raw;
}
