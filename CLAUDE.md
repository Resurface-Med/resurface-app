# Resurface — project context

Spaced-repetition study app for Year 1 MBChB. React 18 + Vite 7 SPA, with
generation served by `resurface-backend`. Formerly "Ascend", and
"principles-quiz" before that.

## State as of 2026-08-07

- Lives at `~/resurface/resurface-app`, org is `Resurface-Med` on GitHub.
- Restructured and renamed. Lint clean (14 react-hooks warnings remain),
  24 tests passing, build 655KB / 189KB gzip.
- See README for layout. `npm run dev` on :5173; Generate mode talks to
  `resurface-backend`, which serves `/api/generate` on :3001 locally.

## Deployed (2026-08-07)

All three repos are live on the Vercel team `resurface`, public, with
deployment protection off. The repos themselves stay **private**.

| Repo | URL |
| --- | --- |
| `resurface-app` | https://resurface-app-eight.vercel.app |
| `resurface-landing` | https://resurface-landing.vercel.app |
| `resurface-backend` | https://resurface-backend-resurface.vercel.app |

`VITE_API_BASE` is set on the Vercel project and inlined at build time, so
changing it needs a redeploy — as does any backend env var, since Vercel only
applies env changes to deployments built after the change.

Generate mode returns 500 until `ANTHROPIC_API_KEY` is set on
`resurface-backend`. The endpoint is currently unauthenticated by choice;
a login page is the intended gate.

## Decisions already made — don't relitigate

**Three repos** under the `Resurface-Med` GitHub org:
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

**Vercel, not Railway** — decided 2026-08-07. Generation lives in
`resurface-backend` (Next 16), reached via `VITE_API_BASE`, so the two are
separate origins and the backend keeps a CORS allowlist (`ALLOWED_ORIGINS`).

**Server-first, not local-first** — decided 2026-08-10, and the user was right
to push back on the offline argument: without a service worker the app cannot
load offline at all, so local-first was protecting a case that mostly cannot
happen. Postgres is the single source of truth, which is why none of the merge
rules a local-first design needs exist here. localStorage keeps only the theme
and a queue of writes that failed mid-session.

**Repos are public** — Vercel's Hobby plan refuses to connect org-owned private
repositories, so the question bank is publicly readable. Moving the repos to a
personal account would allow private and stay free, at the cost of the org.

**The Supabase URL and publishable key are committed** in `src/lib/supabase.js`.
They compile into the bundle regardless and RLS is the real boundary, so making
them env vars bought nothing but a deploy that silently built into "sign-in
isn't configured". Env vars still take precedence. The service_role key must
never appear there — anything `VITE_` is inlined into the build.

## Structure (applied)

```
resurface-app/
├── .github/workflows/ci.yml   ← install → lint → test → audit (no typecheck)
├── content/decks/*.json       ← questions, split per deck
├── scripts/audit-questions.mjs
├── src/
│   ├── modes/                 ← Practice, Timed, SR — own a queue + scoring loop
│   ├── views/                 ← Dashboard, Stats, Bookmarks, WrongAnswers,
│   │                            Subjects, Pomodoro, Generate — just render state
│   ├── ui/                    ← shared primitives + theme.js
│   ├── lib/                   ← sm2, storage, pomodoro
│   └── data/                  ← deck loader
└── tests/
```

**Next: the redesign.** Design values are still ~380 hardcoded `px` literals in
inline styles. `src/ui/theme.js` exists (it was `constants.js`) but does not yet
hold spacing, radii, or font sizes — pulling those in is what makes the redesign
tractable, and should happen before any visual work starts.

## Security

The Anthropic API key was hardcoded in `src/config.js` and compiled into a
committed `dist/` bundle. That file is deleted and generation now runs through
`/api/generate` with the key server-side — verified zero `sk-ant` references in
the built bundle. **The old key still needs rotating**; treat it as public.

`RESURFACE_PASSCODE` is deliberately unset (decided 2026-08-07) — the route
skips the check when it is empty, so `/api/generate` is open on a public URL
and its only brake is an in-memory rate limiter that serverless recycling
makes best-effort. A login page is the intended fix. Both live in
`resurface-backend`; see that repo for details.

## Not built yet, roughly in priority order

1. **Google sign-in** is coded but disabled — Supabase reports `google: false`
   until OAuth credentials are configured. Email and password work.
2. **No migration of old `pq_*` data** into accounts. Deliberate: it is only the
   author's own test progress, and an importer was not worth writing unasked.
3. PWA manifest — med students study on iPads; this is how they install it.
4. Lazy-load decks. `src/data/index.js` imports all nine eagerly; making it
   async is the change, and App.jsx consumes `QUESTIONS` synchronously today.
5. The 14 `react-hooks` warnings — effect deps and set-state-in-effect.

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
- Whether Generate mode stays open or moves behind the planned login. Decided
  2026-08-07 not to use `RESURFACE_PASSCODE`; a login page supersedes it.
