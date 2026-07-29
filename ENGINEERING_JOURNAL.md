# Engineering Journal

Five real bugs hit while building this, and how they got found and fixed.
Not a highlight reel — the point of writing this down is that "I built a
thing that works" and "I can explain why it broke and how I knew the fix
was right" are different claims, and only the second one is actually
useful to demonstrate.

---

## 1. Locale-dependent number formatting

**Symptom:** Numbers displayed fine on my machine. They wouldn't necessarily
display fine on a visitor's — `value.toLocaleString()` with no explicit
locale argument formats using the *browser's* regional settings, not a
fixed standard. The same underlying number — say `361540.22` — renders as
`361,540.22` under an en-US browser locale, but as `3,61,540.22` under an
en-IN locale (Indian digit grouping uses a different pattern past the
first three digits). Same data, visibly different output depending on who's
looking at it.

**Root cause:** `toLocaleString()` without an explicit locale argument is
non-deterministic across visitors by design — that's the entire point of
the API, but it's the wrong tool when you specifically want everyone to see
the same thing, like in an analytics tool where the read has to be exact.

**Fix:** Hardcode the locale in `formatDisplayValue` (`src/lib/formatValue.ts`):
`value.toLocaleString("en-US", ...)` instead of `value.toLocaleString(...)`.
Deliberate choice, not a default — the comment in that file spells out why,
so a future me (or anyone else reading it) doesn't "fix" it back.

**Lesson:** Any API with an implicit "current environment" default
(locale, timezone, `Date.now()`) is a bug waiting for a second reader.
Explicit > default, anywhere the output needs to be consistent.

---

## 2. The CSS cascade-layer bug (twice)

**Symptom:** A Tailwind utility class silently did nothing. First time: a
`rounded-[20px]` arbitrary-value utility on a claymorphism surface had no
visible effect — the element kept its old radius. Second time, same shape
of bug: `bg-[var(--color-accent)]` on a CTA button rendered with the wrong
background, like the utility wasn't applied at all.

**Root cause:** Tailwind v4 emits its utility classes inside a CSS
`@layer utilities` block. This project also has hand-written custom CSS for
the claymorphism surfaces (`.clay`, `.clay-accent`, etc. in `src/index.css`)
that is **not** wrapped in any `@layer`. Per the CSS cascade spec, layered
rules always lose to unlayered rules of equal specificity, regardless of
which one comes later in the file or in the DOM. So `.clay`'s own
`background`/`border-radius` declarations were always going to beat a
Tailwind utility targeting the same property, no matter the class order in
`className`. It wasn't a specificity fight I was going to win by rearranging
classes — it's structural to how the two stylesheets are layered.

**Fix:** Stopped reaching for Tailwind arbitrary-value utilities to
override anything already styled by the custom `.clay*` classes. Added real,
purpose-built classes instead — `.clay-solid-accent` for the CTA background
case — so the override lives in the same (unlayered) stylesheet and
actually wins. The comment left in `index.css` calls out that this is "the
same class of bug" as the first one, specifically so it wouldn't get
mis-diagnosed as a one-off the second time it showed up.

**Lesson:** The first time looked like a one-off arbitrary-value quirk.
Recognizing the *second* occurrence as the same root cause — rather than
debugging it from scratch again — is what actually turned it into a rule
("don't fight `.clay*` with Tailwind arbitrary values") instead of a
one-time patch.

---

## 3. The outlier-grouping analytical flaw

**Symptom:** Asking "are there any outliers in revenue?" against the
sample dataset (4 products at very different price points) returned a
list of outliers that were really just... Widget C's normal price range.
The numbers weren't wrong, but the *answer* was misleading — it read like
"these transactions are unusual" when the real story was "this product
costs more than the others."

**Root cause:** A naive z-score/outlier calculation pools every row
together before computing mean and standard deviation. When the underlying
categories have genuinely different scales (a $15 widget and a $200
widget), pooling makes the cheaper product's normal range look artificially
tight and the pricier product's normal range look like it's "full of
outliers" — the statistic is technically correct and analytically wrong.

**Fix:** Added an explicit instruction in the model's system prompt
(`api/generate-query.ts`): before computing an outlier/average/z-score on a
numeric column, check whether a categorical column the metric plausibly
depends on exists (product, region, category...), and if pooling would let
one group's normal scale get flagged as anomalous relative to another's,
compute the statistic **within each group** instead — unless the question
explicitly asks for a global figure.

**Lesson:** "The math is correct" and "the answer is right" aren't the
same claim. This is the one bug in this project that wasn't a code defect
at all — it was a modeling/prompt decision, and the fix lives in English
in the system prompt, not in a function.

---

## 4. Mid-build Groq model deprecation

**Symptom:** The model this project was built and tuned against
(`llama-3.3-70b-versatile`) got a deprecation notice from Groq mid-build —
announced with a shutdown date on the calendar, not immediate, but a clock
running.

**Root cause:** Not a bug in the traditional sense — a dependency on a
third-party model that isn't guaranteed to exist forever. Zero-cost,
API-based projects inherit the provider's roadmap whether you plan for it
or not.

**Fix:** Swapped `MODEL` in `api/generate-query.ts` to Groq's recommended
replacement (`openai/gpt-oss-120b`), documented with a code comment
recording *why* — the deprecation announcement date and shutdown date —
so the swap doesn't look arbitrary to a future reader, and re-ran the
eval set (Phase 18) against the new model to confirm the prompt still held
up before considering it done.

**Lesson:** A model name in code is a dependency like any other; the fix
itself was one line, but treating "does the whole prompt still behave the
same way against a different model" as a real question — not an
assumption — is what the eval set in Phase 18 exists for.

---

## 5. `npm ci` / lockfile cross-platform issue

*(Flagged for follow-up — the fix already landed in this codebase, but the
original incident details didn't leave a trace in code comments the way the
other four did. Rather than reconstruct specifics I can't verify from
what's actually in the repo, this section is intentionally left as a
placeholder: what broke, which platforms were involved, the exact error,
and the fix, from whoever was there when it happened.)*

---

**Pattern across all five:** none of these were caught by "it works on my
machine." #1 needed a second locale. #2 needed a second occurrence to
become a rule instead of a patch. #3 needed a domain read of the *answer*,
not just the math. #4 needed watching an external dependency's own
announcements. #3 and #4 both got a regression check added (the grouping
rule is exercised by the eval set's outlier case; the model swap was
re-validated against the same eval set) specifically so the fix wouldn't
silently regress on the next prompt change.
