export const config = { runtime: "edge" };

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

interface PreviousAttempt {
  sql: string;
  error: string;
}

interface RequestBody {
  question?: string;
  schemaDescription?: string;
  previousAttempt?: PreviousAttempt | null;
}

const SYSTEM_PROMPT = `You are a SQL generator for DuckDB. You are given a table schema and a question in plain English.
Respond with ONLY a single valid DuckDB SQL SELECT statement that answers the question. Rules:
- Only use the table and columns given in the schema. Never invent columns that aren't listed.
- Only generate SELECT statements. Never generate INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, or any statement that modifies data or schema.
- Do not include markdown code fences, explanations, or comments. Output raw SQL only, nothing else.
- Do not end the statement with a semicolon.
- Every SQL function call MUST have parentheses around its arguments. This is critical:
  correct: SELECT MAX(revenue) FROM data
  wrong:   SELECT MAX revenue FROM data
  correct: SELECT SUM(revenue) FROM data WHERE region = 'North'
  wrong:   SELECT SUM revenue FROM data WHERE region = 'North'
  correct: SELECT COUNT(*) FROM data
- To find the row with the highest/lowest value of something, prefer ORDER BY ... DESC/ASC LIMIT 1
  over a bare MAX()/MIN() when the question implies you also want the other columns of that row.
  Example — "highest revenue in north region":
  SELECT * FROM data WHERE region = 'North' ORDER BY revenue DESC LIMIT 1
  Example — "what's the highest revenue" (just the number):
  SELECT MAX(revenue) FROM data
- String literals use single quotes: WHERE region = 'North', not double quotes.
- Always use the explicit AS keyword when naming an aggregate or expression, e.g.
  SUM(revenue) AS total_revenue, not SUM(revenue) total_revenue.
- Do not use WITH / CTEs (Common Table Expressions). Write a single flat SELECT query only.
- If a question asks for a metric that isn't directly derivable from the given columns (e.g. "profit margin"
  when there's no cost/profit column, "conversion rate" with no visits column), do NOT invent a formula
  using unrelated columns to produce a placeholder number. A formula like revenue/revenue is not a real
  answer. In that case respond with exactly: NO_QUERY_POSSIBLE
- If you are given a "Previous attempt" and its error below, that query failed — do not repeat the
  same mistake. Read the error carefully and fix the specific problem it describes.
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

  const { question, schemaDescription, previousAttempt } = body;
  if (!question?.trim() || !schemaDescription?.trim()) {
    return jsonResponse({ error: "Missing question or schemaDescription." }, 400);
  }

  let userPrompt = `Schema:\n${schemaDescription}\n\nQuestion: ${question}`;
  if (previousAttempt?.sql && previousAttempt?.error) {
    userPrompt += `\n\nPrevious attempt (this failed, do not repeat it):\n${previousAttempt.sql}\n\nError from that attempt:\n${previousAttempt.error}\n\nWrite a corrected query.`;
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
