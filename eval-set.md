# Eval Set — Phase 18

This used to be a manual 18-question checklist you'd run by hand after any
prompt change. It's now a real script: **`eval/eval-set.ts`**, run with
**`npm run eval`**. The 28 questions and their expected engine/shape live
there now as data, not prose — this file is just the "how and why."

## Run it

```bash
vercel dev          # terminal 1 — needs GROQ_API_KEY set locally
npm run eval         # terminal 2
```

Against a deployed URL instead of local:

```bash
EVAL_BASE_URL=https://your-app.vercel.app npm run eval
```

Runs preferring Groq by default; to prefer a different provider instead
(Phase 30 note: this is a *preference* — if that provider is itself busy,
the server automatically falls back to another configured one):

```bash
EVAL_PROVIDER=mistral npm run eval   # or gemini / cerebras / cohere
```

## What it checks

For each question: right engine (SQL vs Python), non-empty code, the
generated SQL actually passes `validateSql` (so a destructive or
hallucinated-column query would be caught), and destructive/impossible
questions (`"delete all rows..."`, `"what's the profit margin"`) are
genuinely rejected rather than silently answered. It does **not** execute
the query or check exact numbers — that needs a real DuckDB/Pyodide
runtime, which is what the browser-based testing in earlier phases covers.
This is a regression net for the prompt specifically.

## Why it's not in CI

`npm test` (the suite CI runs on every push) never calls a live LLM. This
one does, on every single run, against a shared free-tier Groq key — so it:

- costs real API budget every time, which a check running on every push
  would burn through fast for no benefit on commits that don't touch the prompt
- needs a live server (`vercel dev` or a deployment), not just the static
  Vite dev server CI already has
- calls a non-deterministic model — an occasional flaky LLM response
  failing the build on an unrelated PR is worse than not gating on it

Run it manually after touching `SYSTEM_PROMPT` in `api/generate-query.ts`.
Pass bar: all 28 cases green in one run, without needing more retries than
the app's own built-in 3-attempt self-correction already allows.
