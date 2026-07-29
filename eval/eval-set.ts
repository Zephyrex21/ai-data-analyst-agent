// Phase 18 — automated version of what was previously eval-set.md's manual
// checklist. Hits the real /api/generate-query endpoint (a live LLM call)
// for all 18 questions and checks STRUCTURAL expectations: right engine,
// non-empty/validator-passing code, no crash, destructive queries actually
// get blocked. It does not execute the SQL/Python or check exact numbers —
// that would need a full DuckDB/Pyodide runtime, which is what Phases 1-15
// already cover with real browser testing. This is a regression net for the
// PROMPT, not the execution engines.
//
// Why this isn't in `npm test` / CI: every run spends real Groq API budget
// against the shared free-tier key, needs a live server (`vercel dev` or a
// deployed URL) rather than the static Vite dev server, and LLM output is
// non-deterministic — a flaky LLM call failing a CI build on every push to
// `main` is worse than not having the check running there at all.
//
// How to run it:
//   1. `vercel dev` (needs GROQ_API_KEY in your local env / .env)
//   2. in another terminal: `npm run eval`
//   Or against a deployed URL:  EVAL_BASE_URL=https://your-app.vercel.app npm run eval
//
// Run this after any change to the SYSTEM_PROMPT in api/generate-query.ts.

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Papa from "papaparse";
import { buildSchemaDescription } from "../src/lib/schema";
import { inferColumnType, type ParsedCsv } from "../src/lib/csv";
import { validateSql } from "../src/lib/sqlValidator";

const BASE_URL = process.env.EVAL_BASE_URL ?? "http://localhost:3000";
const ENDPOINT = `${BASE_URL}/api/generate-query`;
// Which provider the eval set exercises. Defaults to Groq since that's the
// original/primary provider; pass EVAL_PROVIDER=gemini to run the same 18
// cases against Gemini instead (needs GEMINI_API_KEY set for `vercel dev`).
const PROVIDER = process.env.EVAL_PROVIDER === "gemini" ? "gemini" : "groq";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.join(__dirname, "..", "public", "sample-sales-data.csv");

type HistoryTurn = { question: string; engine: "sql" | "python"; code: string; resultSummary: string };

interface ApiResult {
  status: number;
  body: { engine?: "sql" | "python"; code?: string; error?: string };
}

function loadSampleCsv(): ParsedCsv {
  const text = readFileSync(csvPath, "utf-8");
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  const rows = parsed.data;
  const fields = parsed.meta.fields ?? [];
  const columns = fields.map((name) => ({
    name,
    type: inferColumnType(rows.map((r) => r[name])),
  }));
  return { fileName: "sample-sales-data.csv", columns, rows, totalRows: rows.length, warnings: [] };
}

const csv = loadSampleCsv();
const schemaDescription = buildSchemaDescription(csv);

async function callApi(question: string, history?: HistoryTurn[]): Promise<ApiResult> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, schemaDescription, history, provider: PROVIDER }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

interface EvalCase {
  id: number;
  question: string;
  expectEngine?: "sql" | "python";
  expectRejected?: boolean;
  codeMatches?: RegExp;
}

// Cases 13 and 16 need custom multi-step / lenient handling and get their
// own `it()` blocks below instead of living in this table.
const CASES: EvalCase[] = [
  { id: 1, question: "how many rows are there", expectEngine: "sql", codeMatches: /count/i },
  { id: 2, question: "what's the total revenue", expectEngine: "sql", codeMatches: /sum/i },
  { id: 3, question: "total revenue by region", expectEngine: "sql", codeMatches: /group by/i },
  { id: 4, question: "total revenue by product", expectEngine: "sql", codeMatches: /group by/i },
  { id: 5, question: "what's the daily revenue trend", expectEngine: "sql", codeMatches: /date/i },
  { id: 6, question: "what was the highest revenue day", expectEngine: "sql", codeMatches: /order by/i },
  { id: 7, question: "which region sells the most units", expectEngine: "sql" },
  { id: 8, question: "average units sold per product", expectEngine: "sql", codeMatches: /avg/i },
  // Must stay SQL — DuckDB has native corr(); this is the "don't over-route to Python" check.
  { id: 9, question: "what's the correlation between units sold and revenue", expectEngine: "sql" },
  { id: 10, question: "are there any outliers in revenue", expectEngine: "python" },
  { id: 11, question: "how correlated are revenue across the different products", expectEngine: "python" },
  { id: 12, question: "show a 7 day moving average of revenue", expectEngine: "python" },
  { id: 14, question: "delete all rows where region is north", expectRejected: true },
  { id: 15, question: "what's the profit margin", expectRejected: true },
  { id: 17, question: "how many distinct products are there", expectEngine: "sql", codeMatches: /distinct/i },
  { id: 18, question: "which days had no widget in stock", expectEngine: "sql", codeMatches: /in_stock/i },
];

beforeAll(async () => {
  try {
    await fetch(BASE_URL);
  } catch {
    console.warn(
      `\n⚠ Couldn't reach ${BASE_URL}. Run "vercel dev" first (needs GROQ_API_KEY set locally), ` +
        `or point EVAL_BASE_URL at a deployed URL.\n`
    );
  }
});

describe("Phase 18 eval set — live LLM query generation", () => {
  it.each(CASES)("#$id — $question", async (c) => {
    const { status, body } = await callApi(c.question);
    expect(status, `HTTP ${status}: ${JSON.stringify(body)}`).toBeLessThan(500);

    if (c.expectRejected) {
      expect(body.error, `expected NO_QUERY_POSSIBLE, got engine=${body.engine}`).toBeTruthy();
      if (body.engine === "sql" && body.code) {
        expect(validateSql(body.code, csv).valid, "a destructive query slipped through").toBe(false);
      }
      return;
    }

    expect(body.error, `unexpectedly rejected: ${body.error}`).toBeFalsy();
    expect(body.code?.trim(), "model returned empty code").toBeTruthy();

    if (c.expectEngine) {
      expect(body.engine, `expected engine "${c.expectEngine}", got "${body.engine}"`).toBe(c.expectEngine);
    }
    if (c.codeMatches) {
      expect(body.code, `code didn't match ${c.codeMatches}:\n${body.code}`).toMatch(c.codeMatches);
    }
    if (body.engine === "sql" && body.code) {
      const v = validateSql(body.code, csv);
      expect(v.valid, `generated SQL failed the validator: ${v.reason}\n${body.code}`).toBe(true);
    }
  });

  it("#13 — multi-turn: narrows the previous result, not a restart", async () => {
    const first = await callApi("total revenue by region");
    expect(first.body.error, "setup call for #13 failed").toBeFalsy();

    const history: HistoryTurn[] = [
      {
        question: "total revenue by region",
        engine: first.body.engine!,
        code: first.body.code!,
        resultSummary: "North=10000, South=9000, East=8000, West=7000",
      },
    ];
    const follow = await callApi("now just show me the top 2", history);
    expect(follow.body.error, `follow-up unexpectedly rejected: ${follow.body.error}`).toBeFalsy();
    expect(follow.body.code?.trim(), "follow-up returned empty code").toBeTruthy();
    if (follow.body.engine === "sql") {
      expect(follow.body.code, "expected the narrowed query to include LIMIT 2").toMatch(/limit\s*2\b/i);
    }
  });

  it("#16 — nonexistent product: graceful, never a fabricated number", async () => {
    const { body } = await callApi("average revenue for Widget Z");
    // Either an explicit NO_QUERY_POSSIBLE, or a real, validator-passing query
    // that will simply return an empty result. Never a crash, never invented data.
    if (!body.error) {
      expect(body.code?.trim()).toBeTruthy();
      if (body.engine === "sql" && body.code) {
        expect(validateSql(body.code, csv).valid).toBe(true);
      }
    }
  });
});
