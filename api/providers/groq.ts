import { ProviderError } from "./types";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// llama-3.3-70b-versatile was deprecated by Groq (announced June 17 2026,
// shuts down August 16 2026). Using their recommended replacement instead.
const MODEL = "openai/gpt-oss-120b";

export const GROQ_LABEL = "Groq — gpt-oss-120b";

export async function callGroq(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      max_tokens: 1024,
      reasoning_effort: "low",
      reasoning_format: "hidden",
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
      throw new ProviderError(
        "The demo is popular right now — please try again in a moment, or switch to Gemini using the model selector above.",
        429
      );
    }
    throw new ProviderError(`Groq API error (${res.status}): ${errText.slice(0, 300)}`, 502);
  }

  const data = await res.json();
  const raw: string | undefined = data?.choices?.[0]?.message?.content;
  if (!raw) throw new ProviderError("Groq returned an empty response.", 502);
  return raw;
}
