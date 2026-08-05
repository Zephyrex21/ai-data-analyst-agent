# Phase 20 — Final Cross-Cutting QA Pass

A verification sweep across every page, both themes, breakpoints, and every
interactive element added since Phase 11 — hunting for anything subtly
broken that accumulated across the rapid claymorphism/animation/Phase 16-19
changes. No new features here, per the plan; fixes only.

## What was actually checked (static code audit — no live browser available in this environment)

| Area | Result |
|---|---|
| Dark-mode coverage | Checked every `bg-`/`text-` color usage for a `dark:` counterpart or a `var(--color-*)` token. All clean except three intentional `text-white` cases on `.clay-solid-accent` buttons (solid brand-colored surface — white text is correct in both themes, not a light-mode leak). |
| Reduced-motion / accessibility | `prefers-reduced-motion` already disables `.scroll-reveal`, `.float-animate`, `.splash-pulse`, `.turn-enter`, `.thinking-dot`. Splash screen dismissal is timer-based (`setTimeout`), not tied to a CSS transition event, so it can't get stuck open when animations are disabled. Icon-only buttons (`ThemeToggle`, GitHub link in `Navbar`) both have `aria-label` + `title`. |
| Responsive breakpoints | `ArchitectureVisual` and `Navbar` both collapse `flex-row` → `flex-col` below `md:`/`sm:`. Both data tables (`DataTable`, `ResultTable`) wrap in `overflow-x-auto` rather than overflowing the page. `TerminalDemo` is `w-full max-w-2xl`, no fixed pixel widths that could overflow small screens. |
| Leftover debug code | No `console.log`/`console.debug`, no `TODO`/`FIXME`/`XXX` markers anywhere in `src/`. |
| CSS hygiene | Every custom class referenced in components (`.clay*`, `.scroll-reveal*`, `.float-animate`, `.splash-*`, `.turn-enter`, `.thinking-dot`) has a matching definition in `index.css` — no orphaned classNames. |
| New interactive elements from Phases 16-19 | `ErrorBoundary` fallback and `AskBar`'s cooldown state both reuse the same `.clay*`/`var(--color-*)` system as the rest of the app, so they're dark-mode-consistent by construction rather than by a separate check. |

## Bug found and fixed

**`SampleQuestions` didn't reflect the Phase 16 cooldown.** `AskBar` shows
a live "Wait Xs" countdown and disables itself during the 3-second
post-ask cooldown; the sample-question chips (shown for the bundled
dataset) called the same `ask()` function but weren't wired to the same
`cooldownUntil` state — they stayed fully clickable and just silently did
nothing when clicked during a cooldown, which reads as broken rather than
intentional. Fixed by giving `SampleQuestions` the same cooldown-countdown
logic as `AskBar` (`src/components/SampleQuestions.tsx`), and passing
`ask.cooldownUntil` through from `ToolPage.tsx`. This is exactly the class
of thing this phase exists to catch: each individual phase's own tests
passed, but nobody had checked the two pieces of UI that both trigger the
same cooldown *against each other*.

## Full regression after the fix

- `npm test` — 72/72 passing
- `npm run build` — clean
- `npm run lint` — 0 errors (1 pre-existing, unrelated fast-refresh warning on `ThemeContext.tsx`)

## What still needs a real browser (checklist for you to run once)

Static analysis catches structural gaps like the one above, but can't
catch actual visual rendering. Before calling this phase fully closed,
worth a real pass through:

- [ ] Both themes (light/dark toggle) on the homepage and the tool page
- [ ] Mobile width (~375px), tablet (~768px), and desktop — homepage scroll animations, terminal demo, architecture diagram, navbar collapse
- [ ] Full flow: upload → ask → SQL answer → Python answer → follow-up question → error/decline case, in both themes
- [ ] Trigger the Phase 16 error boundary deliberately (e.g. temporarily throw in a component) and confirm the fallback renders correctly in both themes
- [ ] Trigger the Phase 16 cooldown and confirm **both** the Ask bar and the sample-question chips now show it consistently
- [ ] Upload a non-UTF-8 file (Phase 17) and confirm the encoding warning actually renders and is legible in both themes
- [ ] Confirm the CI badge and eval-set links in the README actually resolve once pushed to the real GitHub repo
- [ ] **Phase 25** — time the first Python-routed question with a fresh upload; confirm it's noticeably faster than the old ~10-20s now that warm-up starts right after upload. Also confirm a fast follow-up Python question right after upload (while warm-up might still be in flight) doesn't double-load or error.
- [ ] **Phase 26** — this is the important one: the batched insights query (multiple `MIN`/`MAX`/`AVG`/`STDDEV`/`COUNT(*) FILTER`/`corr()` expressions in one `SELECT`, plus the per-category `GROUP BY` queries) has only ever been unit-tested against a **mocked** `runSql` — never executed against real DuckDB-WASM. Ask an insights question for real and confirm it doesn't throw a SQL syntax error; check Dev Mode isn't relevant here since insights has no code to show, so this needs an actual live insights answer to verify. Also try a question naming a specific column (e.g. "what's typical for revenue") and confirm the scoped-columns note appears correctly.
- [ ] **Phase 28** — the answer cache's core logic (`answerCache.ts`: get/set/clear, question normalization, provider-scoping) is fully unit-tested, but its *wiring into* `useAskQuestion.ts` is React-hook integration code this project has never unit-tested (no React Testing Library dependency exists here, consistent with `duckdb.ts`/`pyodide.ts` having zero tests either — verified via manual/browser QA instead, same as those). Verify for real: (1) ask a question, then ask the *exact same* question again — the second one should resolve instantly with no "Thinking…" stage and no cooldown; (2) ask a question, switch the model provider, ask the identical question again — this one should NOT be instant, it should make a real fresh call; (3) ask a question, click Reset/upload a new file, ask the original question again on the new data — should NOT be instant (cache was cleared).
- [ ] **Phase 29 (chart tweaks + regenerate + follow-ups)** — all pure-logic parsers (`chartTweaks.ts`, `followUpSuggestions.ts`) are unit-tested, but the React wiring in `AnswerCard.tsx`/`useAskQuestion.ts` isn't (same category as Phase 28, same reason). Verify: ask a chartable question, then "make it a bar chart" / "sort descending" / "show as a table" as follow-ups — each should update instantly with no LLM call. Click Regenerate on a done answer and confirm it **replaces that same card in place** (re-shows the "Thinking…" stages inside the existing card, same position, same number) rather than appending a new answer below it. Confirm follow-up suggestion chips render in one consistent spot right below the Ask bar — not at the bottom of the latest answer card — and that clicking one respects the cooldown/busy state the same way the main Ask bar does.
- [ ] **Phase 29 fix — detailed welcome message** — the welcome message now waits on a real DuckDB stats query (same batched query the insights engine uses) before rendering, showing "Looking at your data…" briefly first. Verify it actually resolves to real numbers (a numeric range, a date span, a top category, or a correlation — whichever the dataset has) rather than getting stuck on the loading text or silently falling back to the bare structural version. Upload a second file quickly after the first and confirm the welcome message reflects the *second* file's real stats, not a stale computation from the first (the race-condition guard for this was written carefully but never executed against real timing).
- [ ] **Phase 29 fix — Python reliability** — `ensurePyodide()` was restructured so a scipy load failure no longer permanently breaks the Python engine (it used to: once broken, every future Python question failed with no way to recover short of a page reload). Genuinely hard to test without forcing a real network failure mid-load; worth keeping in mind if Python questions ever start failing repeatedly in a way that doesn't look like a Groq/Gemini rate limit.
- [ ] **Phase 30 (5-provider automatic failover)** — the fallback logic itself is thoroughly unit-tested (mocked fetch), but never executed against real provider APIs. Verify for real: (1) with only `GROQ_API_KEY` set, confirm everything still works exactly as before (single-provider mode); (2) add a second key (e.g. Mistral) and force a Groq 429 (or just wait for one under real load) and confirm the answer still comes back instead of erroring, with an "auto-switched" badge on that answer; (3) confirm the badge shows the model that *actually* answered, not whichever was selected in the dropdown; (4) confirm a cached answer, when replayed, still shows the correct original actual-provider badge, not the currently-selected one.
- [ ] **Phase 30 (dropdown selector)** — new `<details>/<summary>`-based dropdown replacing the old pill row. Verify it opens/closes correctly, closes itself after picking an option, doesn't visually clip or overflow oddly at narrow widths, and that the disabled (mid-question) state actually prevents opening it.
- [ ] **Phase 30 (Cohere's distinct response shape)** — `cohere.ts` parses a different JSON structure (`message.content[]` array of typed blocks) than the other 4 (OpenAI-compatible `choices[0].message.content`). This was written from Cohere's documented API shape but never executed against the real API — worth an explicit real test once a Cohere key is added, since a shape mismatch here would fail silently into "empty response" rather than a clear parsing error.
- [ ] **Phase 29 (PNG chart export)** — the riskiest single item in this phase: SVG→canvas→PNG rasterization was written carefully following a standard, well-documented browser pattern, but genuinely never executed anywhere. Click "Download chart as PNG" on a real bar/line/pie chart and confirm a real, correctly-rendered image downloads — this is the one item here that could plausibly just not work and needs a real check, not a skim.
- [ ] **Phase 29 (welcome summary + data quality)** — upload a file with some genuinely missing values in a column (e.g. blank cells) and confirm the welcome message's "Heads up: some columns have missing values" callout appears with a sane percentage. Upload a clean file and confirm it's absent.
- [ ] **Phase 29 (greetings)** — say "hi", "thanks!", and "who are you" to a loaded dataset and confirm each gets a friendly meta-engine reply, not the "I can only answer questions about your dataset" off-topic decline.

This phase doesn't fully "complete" until that manual pass comes back
clean too — the checklist above is what to run it against.
