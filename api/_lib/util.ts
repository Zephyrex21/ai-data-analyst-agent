// Shared helpers between api/generate-query.ts and api/generate-insights.ts.
// The `_lib` prefix keeps Vercel from treating this as its own route.

export function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function log(event: string, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, ts: new Date().toISOString(), ...data }));
}

/**
 * Extracts a JSON object from a model's raw text response, tolerating the
 * couple of ways models occasionally ignore "respond with ONLY JSON":
 * markdown code fences, or stray text wrapped around the actual object.
 */
export function parseModelJson<T = Record<string, unknown>>(raw: string): T | null {
  const attempts = [raw.trim()];

  const fenceStripped = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  if (fenceStripped !== attempts[0]) attempts.push(fenceStripped);

  const braceMatch = raw.match(/\{[\s\S]*\}/);
  if (braceMatch) attempts.push(braceMatch[0]);

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }
  return null;
}
