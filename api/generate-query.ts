export const config = { runtime: "edge" };

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
// llama-3.3-70b-versatile was deprecated by Groq (announced June 17 2026,
// shuts down August 16 2026). Using their recommended replacement instead.
const MODEL = "openai/gpt-oss-120b";

type Engine = "sql" | "python";

interface PreviousAttempt {
  engine?: Engine;
  code: string;
  error: string;
}

interface HistoryTurn {
  question: string;
  engine: Engine;
  code: string;
  resultSummary: string;
}

interface RequestBody {
  question?: string;
  schemaDescription?: string;
  previousAttempt?: PreviousAttempt | null;
  history?: HistoryTurn[];
}

const SYSTEM_PROMPT = `You are a data analysis assistant. Given a table schema and a question in plain English,
decide whether to answer it with SQL (DuckDB) or Python (pandas), then write ONLY the code for that engine.

ENGINE CHOICE — prefer SQL for almost everything: counts, sums, averages, filtering, grouping, sorting,
min/max, simple correlations (DuckDB has a built-in corr(x, y) function). Only choose Python when the
question needs something SQL genuinely struggles with here: a correlation matrix across several columns
at once, z-score/statistical outlier detection, simple linear regression coefficients, rolling/moving
averages, or similar multi-step statistical work. When in doubt, choose SQL.

Respond with ONLY a single JSON object, no markdown fences, no explanation outside the JSON, in exactly
this shape:
{"engine": "sql", "code": "..."}
or
{"engine": "python", "code": "..."}
or, if the question genuinely cannot be answered with either engine given the schema:
{"error": "NO_QUERY_POSSIBLE"}

Rules when engine is "sql" (DuckDB):
- Only use the table and columns given in the schema. Never invent columns that aren't listed.
- Only SELECT statements. Never INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, or anything that modifies data.
- Do not end the statement with a semicolon.
- Every function call MUST have parentheses around its arguments:
  correct: SELECT MAX(revenue) FROM data — wrong: SELECT MAX revenue FROM data
- To find the row with the highest/lowest value of something, prefer ORDER BY ... DESC/ASC LIMIT 1 over a
  bare MAX()/MIN() when the question implies wanting the other columns of that row too.
- String literals use single quotes, e.g. WHERE region = 'North'.
- Always use the explicit AS keyword when naming an aggregate or expression.
- Do not use WITH / CTEs. Write a single flat SELECT query only.

Rules when engine is "python" (pandas):
- A pandas DataFrame called df is already loaded with the CSV data. Do not reload or reassign df.
- Assign your final answer to a variable named result — a pandas DataFrame, a pandas Series, or a plain
  scalar (number/string). This is required.
- Only use pandas, numpy, and Python built-ins. Do not import os, sys, subprocess, socket, or any
  file/network module. Do not use open(), eval(), exec(), or __import__().
- Keep the code short and focused only on answering the question.

Both engines — this rule applies either way:
- If a question asks for a metric that isn't directly derivable from the given columns (e.g. "profit margin"
  when there's no cost/profit column), do NOT invent a formula using unrelated columns to fake a placeholder
  number. In that case respond with {"error": "NO_QUERY_POSSIBLE"}.
- If given a "Previous attempt" and its error below, that attempt failed — do not repeat the same mistake.
  Read the error and fix the specific problem it describes. You may switch engines if that would fix it.
- You may be given a "Conversation history" of earlier questions in this session, each with the code that
  answered it and a summary of the result. Use it ONLY to resolve references like "that", "it", "those",
  "break it down further", or "now filter to just X" — figure out what the person means, then write a
  complete, standalone, self-contained query that answers the CURRENT question from scratch against the
  full table. Never assume any variable, temp table, or prior result persists — it doesn't. If the current
  question is unrelated to the history, ignore the history entirely and answer it fresh.`;

const MAX_HISTORY_TURNS = 5;

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return jsonResponse(
      {
        error:
          "Server is missing GROQ_API_KEY. Add it in your Vercel project's Environment Variables, then redeploy.",
      },
      500
    );
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid request body." }, 400);
  }

  const { question, schemaDescription, previousAttempt, history } = body;
  if (!question?.trim() || !schemaDescription?.trim()) {
    return jsonResponse({ error: "Missing question or schemaDescription." }, 400);
  }

  let userPrompt = `Schema:\n${schemaDescription}`;

  if (history && history.length > 0) {
    const recentHistory = history.slice(-MAX_HISTORY_TURNS);
    const historyText = recentHistory
      .map(
        (turn, i) =>
          `Turn ${i + 1}:\nQ: ${turn.question}\nEngine: ${turn.engine}\nCode: ${turn.code}\nResult: ${turn.resultSummary}`
      )
      .join("\n\n");
    userPrompt += `\n\nConversation history (most recent last):\n${historyText}`;
  }

  userPrompt += `\n\nQuestion: ${question}`;

  if (previousAttempt?.code && previousAttempt?.error) {
    const engineLabel = previousAttempt.engine ?? "sql";
    userPrompt += `\n\nPrevious attempt (engine: ${engineLabel}, this failed, do not repeat it):\n${previousAttempt.code}\n\nError from that attempt:\n${previousAttempt.error}\n\nWrite a corrected response.`;
  }

  try {
    const groqRes = await fetch(GROQ_API_URL, {
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
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      return jsonResponse(
        { error: `Groq API error (${groqRes.status}): ${errText.slice(0, 300)}` },
        502
      );
    }

    const data = await groqRes.json();
    const raw: string | undefined = data?.choices?.[0]?.message?.content;
    if (!raw) {
      return jsonResponse({ error: "Groq returned an empty response." }, 502);
    }

    const parsed = parseModelJson(raw);
    if (!parsed) {
      return jsonResponse(
        { error: "Model response wasn't valid JSON and couldn't be parsed." },
        502
      );
    }

    if (parsed.error === "NO_QUERY_POSSIBLE" || parsed.error) {
      return jsonResponse(
        { error: "That question doesn't seem answerable from this dataset's columns." },
        200
      );
    }

    if (parsed.engine !== "sql" && parsed.engine !== "python") {
      return jsonResponse({ error: `Model returned an unknown engine: ${parsed.engine}.` }, 502);
    }
    if (typeof parsed.code !== "string" || !parsed.code.trim()) {
      return jsonResponse({ error: "Model response was missing code." }, 502);
    }

    const code =
      parsed.engine === "sql" ? cleanSql(parsed.code) : parsed.code.trim();

    return jsonResponse({ engine: parsed.engine, code }, 200);
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Unknown error calling Groq." },
      500
    );
  }
}

interface ParsedModelResponse {
  engine?: string;
  code?: string;
  error?: string;
}

function parseModelJson(raw: string): ParsedModelResponse | null {
  const attempts = [raw.trim()];

  // In case the model adds markdown fences despite instructions.
  const fenceStripped = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  if (fenceStripped !== attempts[0]) attempts.push(fenceStripped);

  // Fallback: grab the first {...} block in case of stray text around it.
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

function cleanSql(raw: string): string {
  let sql = raw.trim();
  sql = sql.replace(/^```(?:sql)?\s*/i, "").replace(/```\s*$/i, "");
  sql = sql.trim();
  sql = sql.replace(/;\s*$/, "");
  return sql;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
