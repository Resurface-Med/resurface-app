# Resurface — project context

Spaced-repetition question bank for Year 1 MBChB at ARU. React 18 + Vite 7
SPA, no TypeScript, with generation served by `resurface-backend`. Formerly
"Ascend", and "principles-quiz" before that.

*Last verified against the code on 2026-10-05. Everything below was checked,
not remembered — if you change one of these things, change this too.*

## Where things are

| | |
| --- | --- |
| `resurface-app` | this repo — the SPA |
| `resurface-backend` | Next 16 on Vercel: `/api/generate`, `/api/explain`, `/api/keepalive` |
| `resurface-landing` | the marketing page |
| `resurface-film` | Remotion. Also where the headless Chrome binary lives, which the scripts here borrow |

Live on the Vercel team `resurface`: the app at **app.tryresurface.com**, the
backend at **api.tryresurface.com**, the landing page at
**tryresurface.com**. Repos are public (Hobby plan refuses org-owned private
repos), so the question bank is publicly readable.

`npm run dev` on :5173. `npx vite preview --port 4173` is what the scripts in
`scripts/` expect to be running.

## The shape of it

**Server-first.** Postgres is the single source of truth. localStorage holds
the theme and a queue of writes that failed mid-session, and nothing else.
`pq_*` keys are legacy from "principles-quiz" and must never be renamed —
they are invisible to users and renaming them wipes everyone's progress.

**Folders and decks.** A deck holds questions. A folder holds decks and
folders and never holds questions. Both rules are enforced by triggers rather
than only by the interface, and `decks.is_folder` is which. Everything is a
row you own — the app ships none. Questions filter by `leaf` (a deck id),
never by name.

Before 2026-10-09 there was one container called a deck that did both jobs,
which is what forced "sub-deck" and "top level" into the menus and made every
picker offer destinations that could not accept what you were moving.

**There is no shipped bank.** It used to be `public/decks/*.json`, 506
questions for ARU Year 1, fetched on sign-in; `2148149` removed it because
being matched to one paper is what capped the product at a single cohort. The
files are kept out of the build in `content/decks/`. `GEN_ID_BASE = 1_000_000`
in `src/data/index.js` survives it: it separated your questions from the
bank's ids 1–510, and `practice_stats`, `sr_cards` and `bookmarks` all still
key on a bare question id, so the offset stays.

**Generation runs on Gemini**, `gemini-3.5-flash-lite`, free tier, 500
requests a day shared across all users. `/api/generate` and `/api/explain`
both verify a Supabase JWT and rate-limit per user. The prompt lives in
`resurface-backend/lib/prompt.js`, imported by both the route and
`scripts/build-bank.mjs` so the two cannot drift.

**Auth is Google-first.** Google sign-in is live and is the primary path;
email with a 6-digit code is the fallback. Of accounts created so far, 7 of
12 email signups never confirmed and 0 of 5 Google ones failed — which is
why Google is above the form. Display name is asked once *after* sign-up, to
people whose name was invented from their email; `profiles.name_chosen`
records which.

## Decisions already made — don't relitigate

**No TypeScript.** Lint plus real tests catch more here for far less work.

**Vercel, not Railway.** The backend is a separate origin, so it keeps a CORS
allowlist (`ALLOWED_ORIGINS`, union with the built-in list, not a override).

**The Supabase URL and publishable key are committed** in
`src/lib/supabase.js`. They compile into the bundle regardless and RLS is the
real boundary. The service_role key must never appear there.

**Admin is enforced in Postgres, not the client.** An `admins` table with RLS
on and no policies at all, read only by SECURITY DEFINER functions that check
it themselves (`is_admin`, `admin_overview`, `admin_people`, `admin_flags`,
`admin_tokens_*`, …). Hiding the nav item hides nothing — `leaderboard_week()`
was anon-callable and leaked every display name until 2026-09-27.

## Scripts

| | |
| --- | --- |
| `scripts/build-bank.mjs` | lectures → bank. `ingest` / `generate` / `merge`, with a review stop between each |
| `scripts/make-posts.mjs` | bank questions → Instagram carousels |
| `scripts/make-qr.mjs` | QR codes, decoded back out of their own PNGs to prove they scan |
| `scripts/netcheck.sh` | which hosts the app needs are reachable — for filtered campus wifi |
| `scripts/audit-questions.mjs` | the bank's own checks |

Several render HTML through the headless Chrome in `resurface-film` and
screenshot it. That is also the way to check any visual work in this repo:
build, preview, screenshot, look. Do not reason about appearance.

## Open, in priority order

1. **Rotate the Gemini API key.** Pasted into a transcript on 2026-08-19 and
   still live. Oldest open risk, and only Rafil can do it.
2. **Fill the bank.** The lopsidedness above is the product's biggest gap. A
   student whose week is anatomy finds 26 questions.
3. **Supabase leaked-password protection** is off. A toggle.
4. **Lazy-load decks.** `src/data/index.js` fetches all nine at startup.
5. **A transparent books mark.** Every icon in the repo is an app-icon tile,
   so the mark cannot sit on a coloured background without a white square.

## How to work here

Push straight to main; production auto-deploys and that is how Rafil reviews.
Check `git status` and `git log` in all three repos first — other agents edit
the same working copies between and during sessions.

Never use `npx vercel` — the CLI is signed in to the wrong account. Use the
Vercel MCP.

See `~/.claude/.../memory/` for Rafil's UI taste, the question spec, and the
running list of what has already been tried and rejected.
