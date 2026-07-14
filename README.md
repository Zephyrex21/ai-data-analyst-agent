# AI Data Analyst Agent

Upload a CSV, ask questions in plain English, get real SQL executed against your data — entirely client-side (DuckDB-WASM) except for the LLM call, which is proxied through a tiny serverless function so the API key never reaches the browser.

Zero cost: Vite/React frontend on Vercel's free tier, DuckDB running in-browser via WASM (no backend, no server execution risk), and Groq's free API tier for the LLM.

## Local development

This project has a Vercel serverless function (`/api/generate-sql.ts`), so plain `npm run dev` will run the frontend but the API route won't work — you need the Vercel CLI:

```
npm install -g vercel
npm install
cp .env.local.example .env.local   # then paste your real Groq key into .env.local
vercel dev
```

Get a free Groq API key (no card required) at https://console.groq.com.

## Deploying

Push to GitHub, import the repo in Vercel, then add `GROQ_API_KEY` under Project Settings → Environment Variables and redeploy.

## Status

Currently at Phase 3 of the build blueprint: CSV upload + preview, real in-browser SQL execution via DuckDB-WASM, and the core NL-question → LLM-generated SQL → executed-and-shown loop.
