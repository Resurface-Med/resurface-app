# Resurface — project context

Spaced-repetition study app for Year 1 MBChB. React 18 + Vite 5 SPA, no
backend yet. Formerly "Ascend", and "principles-quiz" before that.

## State as of 2026-08-07

- One commit (`bb5c539`), branch `main`. Repo was created from a working copy
  that had never been under version control.
- Runs with `npm run dev` on :5173. Builds clean (654KB JS / 190KB gzip).
- **Not yet renamed to Resurface in code** — 7 references still say Ascend
  (`index.html:6`, `Nav.jsx:45,161`, `api/generate.js:35-36`,
  `GenerateMode.jsx:92`, `.env.example:10`).

## Decisions already made — don't relitigate

**Three repos** under a `resurfacehq` GitHub org (org not created yet):
`resurface-app` (this), `resurface-backend`, `resurface-landing`. The split is
justified by a real backend coming — auth, progress sync, server-served
question bank — not by the single proxy function that exists today.

**No TypeScript.** Belpa (the user's other project) is TS because it passes
typed contracts between four services and a database. This is a self-contained
SPA where lint plus a few real tests catch more for far less work. Converting
5,700 lines would be days of work with no user-visible change.

**`content/` belongs outside `src/`.** The 497 questions are product, not
source — hand-edited, changed far more often than the app, and 294KB of the
654KB bundle. Splitting to JSON per deck gives readable diffs and lazy loading.

**`pq_*` localStorage keys must never be renamed.** They are legacy from
"principles-quiz" and invisible to users. Renaming them silently wipes
everyone's spaced-repetition progress for zero benefit.

**Deployment target is unsettled.** `api/generate.js` is written as a Vercel
serverless function (file-convention routing, coded around Vercel's 4.5MB
request cap). The user thinks they want Railway for Resurface, which would mean
a long-running server instead — a better fit for auth and sync anyway. Settle
this before writing the backend; nothing in the app repo depends on it.

## Planned structure (agreed, not yet applied)

```
resurface-app/
├── .github/workflows/ci.yml   ← install → lint → test → audit (no typecheck)
├── api/generate.js            ← moves to resurface-backend eventually
├── content/decks/*.json       ← questions, split per deck
├── scripts/audit-questions.mjs
├── src/
│   ├── modes/                 ← Practice, Timed, SR — own a queue + scoring loop
│   ├── views/                 ← Dashboard, Stats, Bookmarks, WrongAnswers,
│   │                            Subjects, Pomodoro, Generate — just render state
│   ├── ui/                    ← shared primitives + theme.js
│   ├── lib/                   ← sm2, storage, pomodoro, extract, generate-client
│   └── data/                  ← deck loader
└── tests/
```

The restructure must land **before** the user's planned redesign. Their design
values are 380 hardcoded `px` literals in inline styles; pulling colours,
spacing, radii, and font sizes into `ui/theme.js` first is what makes the
redesign tractable.

## Security

The Anthropic API key was hardcoded in `src/config.js` and compiled into a
committed `dist/` bundle. That file is deleted and generation now runs through
`/api/generate` with the key server-side — verified zero `sk-ant` references in
the built bundle. **The old key still needs rotating**; treat it as public.

`ASCEND_PASSCODE` gates the endpoint (rename to `RESURFACE_PASSCODE`). The
in-memory rate limiter in `api/generate.js` resets on cold starts — it catches
runaway loops, not real abuse. Upstash Redis if the code ever leaks.

## Not built yet, roughly in priority order

1. **Export/import.** Everything is localStorage. One cleared browser wipes
   months of progress — the likeliest way to lose a user's trust.
2. Tests: `sm2.js` first (silent breakage corrupts review schedules), then
   question-bank integrity (`opts.length === 5`, `ans` in range, `optExp`
   null at the answer index, unique ids — the bank is hand-edited).
3. CI, ESLint, README.
4. PWA manifest — med students study on iPads; this is how they install it.
5. Upgrade Vite 5 → 7. Two high-severity dev-only advisories (esbuild, postcss)
   would fail `npm audit --audit-level=high` on the first CI run.

## Branding

Deep blue `#1D4ED8` and bright blue `#4D8EF5` (both already in `index.css`),
with the two tones encoding depth — submerged versus surfaced. Logo is being
generated externally; the sidebar is dark in both themes, so the nav ships a
white monochrome lockup while blue-on-white is for the landing page and favicon.

`--app-scale` in `index.css` is a single knob for overall UI size (currently
1.12). Viewport units ignore CSS `zoom`, so full-height regions use `--app-vh`
rather than `100vh` — four call sites depend on this.

## Open questions for the user

- Exact Resurface domain (bought at an outside registrar, not on Vercel)
- Railway or Vercel for the backend
- GitHub org still needs creating — org creation has no API on github.com
