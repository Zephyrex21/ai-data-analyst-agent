import { ProviderError } from "./types";

// Free-tier model as of mid-2026. Google's free-tier lineup shifts fairly
// often (see the Groq deprecation comment in groq.ts for why this kind of
// thing is worth a comment) — check Google AI Studio's current free-tier
// model list if this ever starts returning errors.
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export const GEMINI_LABEL = "Gemini — 2.5 Flash";

export async function callGemini(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const res = await fetch(`${GEMINI_API_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 429) {
      throw new ProviderError(
        "The demo is popular right now — please try again in a moment.",
        429
      );
    }
    throw new ProviderError(`Gemini API error (${res.status}): ${errText.slice(0, 300)}`, 502);
  }

  const data = await res.json();
  const raw: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new ProviderError("Gemini returned an empty response.", 502);
  return raw;
}
