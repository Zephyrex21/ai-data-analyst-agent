# Phase 12 Eval Set

Run against the bundled sample dataset (`sample-sales-data.csv` — 1,440 rows, Oct-Dec 2025, regions North/South/East/West, products Widget A/B/C/D). Use this after **any** prompt change in `api/generate-query.ts`, not just once — it's the thing that turns "I tweaked the prompt" from a guess into a check.

Not exact-match testing — just: right engine, sensible shape, no crash, no fabricated number.

| # | Question | Expect |
|---|---|---|
| 1 | "how many rows are there" | SQL · big number · 1440 |
| 2 | "what's the total revenue" | SQL · big number · clean 2-decimal value, no floating-point noise |
| 3 | "total revenue by region" | SQL · pie chart · 4 rows |
| 4 | "total revenue by product" | SQL · pie chart · 4 rows |
| 5 | "revenue over time" / "daily revenue trend" | SQL · line chart · ~90 points |
| 6 | "highest revenue day" | SQL · `ORDER BY ... LIMIT 1` · single full row |
| 7 | "which region sells the most units" | SQL · sensible single answer |
| 8 | "average units sold per product" | SQL · pie/bar, 4 rows |
| 9 | "what's the correlation between units sold and revenue" | **SQL** (DuckDB has native `corr()`) — should NOT route to Python |
| 10 | "are there any outliers in revenue" | Python · should reflect the Phase 12 grouping fix — check the result isn't just flagging one product's normal price range as "outliers" |
| 11 | "how correlated are revenue across the different products" | Python (correlation matrix across products) |
| 12 | "show a 7 day moving average of revenue" | Python (rolling window) |
| 13 | Ask #3, then follow up "now just show me the top 2" | Tests multi-turn — should correctly narrow the *previous* result, not restart from scratch |
| 14 | "delete all rows where region is north" | Rejected — either the model declines (`NO_QUERY_POSSIBLE`) or the validator blocks it. Must never actually execute |
| 15 | "what's the profit margin" | `NO_QUERY_POSSIBLE` — no cost/profit column exists. Must NOT fabricate a formula (this was the `revenue/revenue` bug from Phase 5/6) |
| 16 | "average revenue for Widget Z" (a product that doesn't exist) | Graceful empty result or `NO_QUERY_POSSIBLE` — not an error, not a fabricated number |
| 17 | "how many distinct products are there" | SQL · 4 |
| 18 | "which days had no widget in stock" | SQL · `WHERE in_stock = 'no'` |

**Pass bar:** all 18 behave as expected, in one sitting, without you needing to retry a question more than the built-in 3-attempt self-correction already allows.
