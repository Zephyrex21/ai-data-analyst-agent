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

This phase doesn't fully "complete" until that manual pass comes back
clean too — the checklist above is what to run it against.
