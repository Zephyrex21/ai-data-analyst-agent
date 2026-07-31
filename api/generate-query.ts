import { PROVIDERS, DEFAULT_PROVIDER, isProviderId, ProviderError, type ProviderId } from "./providers";
import { jsonResponse, log, parseModelJson } from "./_lib/util";

export const config = { runtime: "edge" };

type Engine = "sql" | "python" | "insights" | "meta";

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
  provider?: string;
}

const SYSTEM_PROMPT = `You are a data analysis assistant. Given a table schema and a question in plain English,
decide how to answer it: SQL (DuckDB), Python (pandas), "insights" (a narrated summary of real computed
stats — see below), or "meta" (a question about the dataset's structure or this tool's capabilities,
not its data values — see below), then write ONLY the code for that engine (insights and meta need no code).

ENGINE CHOICE — prefer SQL for almost everything: counts, sums, averages, filtering, grouping, sorting,
min/max, simple correlations (DuckDB has a built-in corr(x, y) function). SQL also supports window
functions and a single-level subquery — use this for "top N per group" style questions instead of
routing to Python, e.g.:
SELECT * FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY region ORDER BY revenue DESC) AS rn FROM data) WHERE rn <= 2
(Multi-statement CTEs — a "WITH ... AS (...)" prefix — are NOT supported; use a subquery instead, as above.)
Only choose Python when the question needs something SQL genuinely struggles with even with subqueries:
a correlation matrix across several columns at once, z-score/statistical outlier detection, simple linear
regression coefficients, rolling/moving averages, or similar multi-step statistical work. When in doubt,
choose SQL.

Choose "insights" ONLY when the question is genuinely open-ended, asking to analyze or characterize the
ACTUAL DATA VALUES with no single computable answer — "summarize this dataset", "what stands out",
"anything interesting here", "what trends do you see". If the question CAN be answered with a specific
SQL or Python query, always prefer that over "insights", even if it sounds broad on the surface (e.g.
"how does revenue vary by region" is still a GROUP BY, not insights).

Choose "meta" for questions about the TOOL or the dataset's STRUCTURE rather than its values — "what
columns/fields does this have", "what is this dataset about" (asked as "what kind of data is this",
not "what patterns exist in it"), "what can I ask you", "how does this work", "what table is this".
Meta is answered directly from the schema you were given, not by analyzing any data values — if the
question needs the actual numbers/values in the data to answer, it's insights/SQL/Python instead, not meta.

Respond with ONLY a single JSON object, no markdown fences, no explanation outside the JSON, in exactly
this shape:
{"engine": "sql", "code": "..."}
or
{"engine": "python", "code": "..."}
or
{"engine": "insights"}
or
{"engine": "meta"}
or, if the question is ON-TOPIC (genuinely about this dataset) but asks for a metric that isn't
derivable from these columns (e.g. "profit margin" with no cost column):
{"error": "NO_QUERY_POSSIBLE"}
or, if the question is NOT about this dataset at all (small talk, general knowledge, requests unrelated
to the uploaded data, coding help unrelated to this schema, etc.):
{"error": "OFF_TOPIC"}

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
- Only use pandas, numpy, scipy, and Python built-ins. Do not import os, sys, subprocess, socket, or any
  file/network module. Do not use open(), eval(), exec(), or __import__().
- For z-score/outlier detection, prefer scipy.stats.zscore over hand-writing the (x - mean) / std formula
  yourself. For linear regression, prefer scipy.stats.linregress over deriving coefficients manually.
  Tested library functions here are less error-prone than reimplementing the same math inline each time.
- Keep the code short and focused only on answering the question.
- Before computing an outlier, average, z-score, or similar statistic on a numeric column, check whether
  the schema has a categorical column (like product, region, category, type) that the numeric column's
  scale plausibly depends on. If a metric being compared "as one pool" would actually be dominated by
  different underlying scales — e.g. one product being priced very differently from another, so a
  cross-product revenue comparison flags normal-for-that-product values as outliers just because that
  product costs more — compute the statistic WITHIN each group (e.g. groupby(...).apply(...) per group,
  or a z-score computed per group) instead of pooling everything together, unless the question explicitly
  asks for an overall/global figure ("what's the single highest revenue transaction across everything").
  When genuinely unsure whether grouping is warranted, prefer grouping by the most relevant categorical
  column over pooling — a scoped, correct answer beats a technically-computed but misleading one.

All engines — these rules apply regardless of which one is chosen:
- If a question asks for a metric that isn't directly derivable from the given columns (e.g. "profit margin"
  when there's no cost/profit column), OR asks for a write/destructive operation this tool never performs
  (delete, update, modify the data), do NOT invent a workaround. In both cases respond with
  {"error": "NO_QUERY_POSSIBLE"} — these questions ARE about the dataset, they just can't or won't be done.
- If the question isn't about this dataset at all — general knowledge, small talk, requests unrelated to
  the uploaded data — respond with {"error": "OFF_TOPIC"} instead. Don't guess which one applies from vague
  wording alone: NO_QUERY_POSSIBLE means "this IS a question/request about the data, but it can't or won't
  be done from here"; OFF_TOPIC means "this isn't about the data at all."
- If given a "Previous attempt" and its error below, that attempt failed — do not repeat the same mistake.
  Read the error and fix the specific problem it describes. You may switch engines if that would fix it.
- You may be given a "Conversation history" of earlier questions in this session, each with the code that
  answered it and a summary of the result. Use it ONLY to resolve references like "that", "it", "those",
  "break it down further", or "now filter to just X" — figure out what the person means, then write a
  complete, standalone, self-contained query that answers the CURRENT question from scratch against the
  full table. Never assume any variable, temp table, or prior result persists — it doesn't. If the current
  question is unrelated to the history, ignore the history entirely and answer it fresh.`;

const MAX_HISTORY_TURNS = 5;

interface ParsedModelResponse {
  engine?: string;
  code?: string;
  error?: string;
}

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

  const { question, schemaDescription, previousAttempt, history } = body;
  if (!question?.trim() || !schemaDescription?.trim()) {
    return jsonResponse({ error: "Missing question or schemaDescription." }, 400);
  }

  // Whitelist the provider explicitly — never let a client-supplied string
  // pick which env var/key gets read.
  const provider: ProviderId = isProviderId(body.provider) ? body.provider : DEFAULT_PROVIDER;
  const providerConfig = PROVIDERS[provider];

  const apiKey = process.env[providerConfig.envKey];
  if (!apiKey) {
    return jsonResponse(
      {
        error: `Server is missing ${providerConfig.envKey}. Add it in your Vercel project's Environment Variables, then redeploy.`,
      },
      500
    );
  }

  log("request_received", {
    provider,
    isRetry: Boolean(previousAttempt),
    historyLength: history?.length ?? 0,
  });

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
    const raw = await providerConfig.call(apiKey, SYSTEM_PROMPT, userPrompt);

    const parsed = parseModelJson<ParsedModelResponse>(raw);
    if (!parsed) {
      return jsonResponse(
        { error: "Model response wasn't valid JSON and couldn't be parsed." },
        502
      );
    }

    if (parsed.error === "OFF_TOPIC") {
      return jsonResponse(
        {
          error:
            "I can only answer questions about your uploaded dataset — try asking something about the data itself.",
        },
        200
      );
    }

    if (parsed.error === "NO_QUERY_POSSIBLE" || parsed.error) {
      return jsonResponse(
        { error: "That question doesn't seem answerable from this dataset's columns." },
        200
      );
    }

    if (parsed.engine === "insights") {
      return jsonResponse({ engine: "insights", provider }, 200);
    }

    if (parsed.engine === "meta") {
      return jsonResponse({ engine: "meta", provider }, 200);
    }

    if (parsed.engine !== "sql" && parsed.engine !== "python") {
      return jsonResponse({ error: `Model returned an unknown engine: ${parsed.engine}.` }, 502);
    }
    if (typeof parsed.code !== "string" || !parsed.code.trim()) {
      return jsonResponse({ error: "Model response was missing code." }, 502);
    }

    const code = parsed.engine === "sql" ? cleanSql(parsed.code) : parsed.code.trim();

    return jsonResponse({ engine: parsed.engine, code, provider }, 200);
  } catch (err) {
    if (err instanceof ProviderError) {
      log("provider_error", { provider, status: err.status });
      return jsonResponse({ error: err.message }, err.status);
    }
    log("unhandled_exception", {
      provider,
      message: err instanceof Error ? err.message : String(err),
    });
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Unknown error calling the model." },
      500
    );
  }
}

function cleanSql(raw: string): string {
  let sql = raw.trim();
  sql = sql.replace(/^```(?:sql)?\s*/i, "").replace(/```\s*$/i, "");
  sql = sql.trim();
  sql = sql.replace(/;\s*$/, "");
  return sql;
}
