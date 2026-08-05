import { DEFAULT_PROVIDER, isProviderId, ProviderError, callWithFallback, type ProviderId } from "./providers";
import { jsonResponse, log, parseModelJson } from "./_lib/util";

export const config = { runtime: "edge" };

interface RequestBody {
  question?: string;
  statsSummary?: string;
  provider?: string;
}

interface ParsedInsightResponse {
  narrative?: string;
}

// Deliberately narrow: this model is never given raw rows or asked to
// compute anything. It only ever narrates numbers it's handed, which is
// what keeps the insights engine from becoming just "let the LLM guess."
const SYSTEM_PROMPT = `You are a data analyst narrating REAL, precomputed statistics about a
dataset to answer an open-ended question. The numbers below have already been computed
correctly by real code — you are not calculating or estimating anything yourself.

Rules:
- Use ONLY the numbers given below. Never invent, estimate, guess, or extrapolate a figure
  that isn't directly present in the statistics.
- If the question asks about something the statistics don't cover (a relationship between
  two specific columns, a metric like "profit margin" that doesn't exist, etc.), say so
  honestly instead of guessing at an answer.
- Write 2-4 sentences of plain, direct prose. No bullet lists, no markdown formatting, no
  preamble like "Based on the data provided...".
- Respond with ONLY a single JSON object, no markdown fences, no explanation outside the
  JSON, in exactly this shape: {"narrative": "..."}`;

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid request body." }, 400);
  }

  const { question, statsSummary } = body;
  if (!question?.trim() || !statsSummary?.trim()) {
    return jsonResponse({ error: "Missing question or statsSummary." }, 400);
  }

  const preferredProvider: ProviderId = isProviderId(body.provider) ? body.provider : DEFAULT_PROVIDER;

  log("insights_request_received", { preferredProvider });

  const userPrompt = `Dataset statistics:\n${statsSummary}\n\nQuestion: ${question}`;

  try {
    const { raw, providerUsed } = await callWithFallback(preferredProvider, SYSTEM_PROMPT, userPrompt, log);

    const parsed = parseModelJson<ParsedInsightResponse>(raw);
    if (!parsed || typeof parsed.narrative !== "string" || !parsed.narrative.trim()) {
      return jsonResponse(
        { error: "Model response wasn't valid JSON with a narrative." },
        502
      );
    }

    return jsonResponse({ narrative: parsed.narrative.trim(), provider: providerUsed }, 200);
  } catch (err) {
    if (err instanceof ProviderError) {
      log("insights_all_providers_failed", { preferredProvider, status: err.status });
      return jsonResponse({ error: err.message }, err.status);
    }
    log("insights_unhandled_exception", {
      preferredProvider,
      message: err instanceof Error ? err.message : String(err),
    });
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Unknown error calling the model." },
      500
    );
  }
}
