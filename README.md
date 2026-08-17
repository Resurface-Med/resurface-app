# resurface-app

Spaced-repetition study app for Year 1 MBChB. React 18 + Vite, with accounts
and study data in Supabase, and AI question generation behind a server-side
proxy.

Related repos: `resurface-backend`, `resurface-landing`.

---

## Where this sits

```
   content/decks/*.json ── the question bank, bundled with the app
                        │
   sign in ─────────────┴─▶ Supabase ── progress, SR schedule, bookmarks,
   (email or Google)         (RLS)      streaks, generated questions

   Generate mode → resurface-backend → Claude (key stays server-side)
```

The server is the source of truth. Postgres enforces per-user access through
row level security rather than app code, so the browser holding an anon key
grants nothing on its own. localStorage keeps only the theme and a queue of
writes that failed, which is retried when the connection returns.

## Running locally

```bash
npm install
npm run dev            # http://localhost:5173
```

Generate mode calls `resurface-backend`. Run that repo alongside this one
(`npm run dev` there serves :3001), or point at a deployed instance:

```bash
cp .env.example .env.local
# VITE_API_BASE=https://api.resurface.example
```

## Layout

| Path | What lives there |
| --- | --- |
| `src/modes/` | Practice, Timed, SR — each owns a question queue and a scoring loop |
| `src/views/` | Dashboard, Stats, Bookmarks, Wrong Answers, Subjects, Pomodoro, Generate, Nav |
| `src/ui/` | Shared primitives and `theme.js`, the design tokens |
| `src/lib/` | Everything with no React in it — `sm2`, `storage`, `pomodoro` |
| `src/data/` | Deck loader; the only module that knows how questions are stored |
| `public/decks/` | The question bank, one JSON file per subject, fetched at runtime |
| `tests/` | Vitest, no browser environment needed |

Questions live outside `src/` on purpose. They are content, not code — edited
far more often than the app, and reviewed on their own terms. Serving them from
`public/` rather than importing them keeps 386KB of JSON out of the JS bundle
and lets the browser cache them apart from the code.

## Scripts

```bash
npm run dev          npm run build        npm run preview
npm run lint         npm test             npm run test:watch
```

## What's built

- Three study modes, SM-2 scheduling with Anki-style learning steps
- Question editing, bookmarks, wrong-answer review, per-topic stats
- Streaks, daily goals, an activity heatmap, a Pomodoro timer
- Question generation from pasted text, PDFs, images, or PowerPoint decks
- Light and dark themes; `--app-scale` in `index.css` scales the whole UI

## Known gaps

- **No offline support.** Without a service worker the app cannot load without
  a network, and every write goes to the server. A dropped connection mid-session
  is covered by the retry queue; a cold start is not.
- **Google sign-in needs OAuth credentials** configured in Supabase before the
  button works. Email sign-in uses a 6-digit code; Google is the fast path.
- `react-hooks` lint warnings (14) are unfixed — effect dependencies and
  set-state-in-effect, visible in `npm run lint`.
- The nine decks load together. Fetching only the subject being studied would
  cut it further, but needs the filter UI to know what it hasn't loaded yet.

## Out of scope

Not a question bank for other year groups or medical schools, not a flashcard
app for arbitrary subjects, and not a replacement for Anki. It is one year's
curriculum, taught the way this cohort is examined.
