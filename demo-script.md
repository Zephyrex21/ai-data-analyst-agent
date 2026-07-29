# Demo Video Script (~60–90 seconds)

Goal: show the thing that actually differentiates this from a chat-wrapper
demo — that answers are executed and verified, not generated prose — in
under 90 seconds, without narration feeling rushed.

| Time | Show | Say (rough) |
|---|---|---|
| 0:00–0:08 | Land on the homepage | "Most 'AI + your data' tools are chat wrappers — the model just describes your data. This one actually runs the analysis." |
| 0:08–0:15 | Click "Try it live," load the bundled sample dataset (one click, no upload) | "One click loads a sample dataset — no setup." |
| 0:15–0:28 | Ask a simple question: *"total revenue by region"* → watch it resolve to a pie chart | "Ask a plain-English question — this one becomes real SQL, run against the data in DuckDB, right in the browser." |
| 0:28–0:32 | Click "show the code" to reveal the generated SQL | "Every answer shows its work — the exact SQL or Python that produced it." |
| 0:32–0:48 | Ask a harder one: *"are there any outliers in revenue?"* → watch it route to Python/pandas this time, show the engine badge switching | "Some questions need real statistics, not just SQL — this one automatically routes to Python and pandas instead." |
| 0:48–1:00 | Ask a deliberately bad one: *"what's the profit margin?"* (no cost column exists) → show it honestly declining instead of inventing a number | "And when a question can't actually be answered from the data, it says so — instead of making something up." |
| 1:00–1:12 | Follow-up question referencing the earlier result: *"now just show me the top 2"* | "It remembers context, too — this narrows the previous answer, it doesn't start over." |
| 1:12–1:20 | Quick cut to the GitHub README — CI badge, test count | "Fully tested, CI on every push, zero server cost — everything except the LLM call runs in your browser." |

**Cut it here if aiming for 60s** — the profit-margin decline (0:48) is the
single highest-signal moment if only one thing survives an edit; the
multi-turn follow-up is the second cut candidate to trim if needed.

**Recording notes:**
- Use the bundled sample dataset, not a fresh upload — keeps setup time out of the clip entirely.
- Let each result render fully before talking over the next question — a chart popping in mid-sentence reads as sluggish even when the actual latency is fine.
- Record light mode and dark mode separately if there's room for a second short cut; not required for the primary demo.
