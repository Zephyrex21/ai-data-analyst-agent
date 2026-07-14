export const config = { runtime: "edge" };

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

interface RequestBody {
  question?: string;
  schemaDescription?: string;
}

const SYSTEM_PROMPT = `You are a SQL generator for DuckDB. You are given a table schema and a question in plain English.
Respond with ONLY a single valid DuckDB SQL SELECT statement that answers the question. Rules:
- Only use the table and columns given in the schema. Never invent columns that aren't listed.
- Only generate SELECT statements. Never generate INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, or any statement that modifies data or schema.
- Do not include markdown code fences, explanations, or comments. Output raw SQL only, nothing else.
- Do not end the statement with a semicolon.
- If the question genuinely cannot be answered using only the given schema, respond with exactly: NO_QUERY_POSSIBLE`;

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

  const { question, schemaDescription } = body;
  if (!question?.trim() || !schemaDescription?.trim()) {
    return jsonResponse({ error: "Missing question or schemaDescription." }, 400);
  }

  const userPrompt = `Schema:\n${schemaDescription}\n\nQuestion: ${question}`;

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
        max_tokens: 500,
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

    const sql = cleanSql(raw);

    if (sql === "NO_QUERY_POSSIBLE") {
      return jsonResponse(
        { error: "That question doesn't seem answerable from this dataset's columns." },
        200
      );
    }

    return jsonResponse({ sql }, 200);
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Unknown error calling Groq." },
      500
    );
  }
}

function cleanSql(raw: string): string {
  let sql = raw.trim();
  // Strip markdown code fences in case the model adds them despite instructions.
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
