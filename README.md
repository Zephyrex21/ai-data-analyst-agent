# AI Data Analyst Agent

Upload a CSV, ask questions in plain English, get a verified, executed answer back — SQL (DuckDB-WASM) for most questions, Python (Pyodide/pandas) for statistical ones the SQL engine handles poorly. Both run entirely client-side, in your browser. The only server-side code is a tiny serverless function that proxies the LLM call so the API key never reaches the browser.

Zero cost: Vite/React frontend on Vercel's free tier, DuckDB-WASM and Pyodide running in-browser (no backend, no server execution risk), and Groq's free API tier for the LLM.

## Local development

This project has a Vercel serverless function (`/api/generate-query.ts`), so plain `npm run dev` will run the frontend but the API route won't work — you need the Vercel CLI:

```
npm install -g vercel
npm install
cp .env.local.example .env.local   # then paste your real Groq key into .env.local
vercel dev
```

Get a free Groq API key (no card required) at https://console.groq.com.

## Testing

```
npm test          # run once
npm run test:watch
```

54 tests across CSV parsing, the SQL/Python validators, chart-type selection, conversation-history summarization, and integration tests of the generate→validate→execute→retry orchestration loop (mocked LLM/execution, no network needed). CI (`.github/workflows/ci.yml`) runs the full suite plus a production build on every push and pull request to `main`.

## Deploying

Push to GitHub, import the repo in Vercel, then add `GROQ_API_KEY` under Project Settings → Environment Variables and redeploy.

## Status

Currently at Phase 9 of the build blueprint: CSV upload + preview, in-browser SQL (DuckDB-WASM) and Python (Pyodide) execution with a router deciding which to use, charts, a safety/validation layer, self-correcting retries with error context, multi-turn conversation memory, and a real test suite + CI.
