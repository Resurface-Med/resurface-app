# resurface-app

Spaced-repetition study app for Year 1 MBChB. React 18 + Vite, all state in the
browser, with AI question generation behind a server-side proxy.

Related repos: `resurface-backend`, `resurface-landing`.

---

## Where this sits

```
                       ┌─ practice / timed / spaced repetition
   content/decks/*.json ┤
   (497 questions)      └─ progress + SR schedule → localStorage

   Generate mode → POST /api/generate → Claude (key stays server-side)
                                     └─ new questions → localStorage
```

Everything except question generation works offline. There is no database and
no accounts yet — a user's progress lives in the browser they studied in.

## Running locally

```bash
npm install
npm run dev            # http://localhost:5173
```

Generate mode needs the serverless function, which `vite` alone does not serve.
For that path use `vercel dev` (or the backend, once it exists) with:

```bash
cp .env.example .env.local
# ANTHROPIC_API_KEY=sk-ant-...      server-side only, never prefix with VITE_
# RESURFACE_PASSCODE=<shared code>
```

## Layout

| Path | What lives there |
| --- | --- |
| `src/modes/` | Practice, Timed, SR — each owns a question queue and a scoring loop |
| `src/views/` | Dashboard, Stats, Bookmarks, Wrong Answers, Subjects, Pomodoro, Generate, Nav |
| `src/ui/` | Shared primitives and `theme.js`, the design tokens |
| `src/lib/` | Everything with no React in it — `sm2`, `storage`, `pomodoro` |
| `src/data/` | Deck loader; the only module that knows how questions are stored |
| `content/decks/` | The question bank, one JSON file per subject |
| `api/` | `generate.js` — Anthropic proxy, holds the API key |
| `tests/` | Vitest, no browser environment needed |

Questions live outside `src/` on purpose. They are content, not code — edited
far more often than the app, and reviewed on their own terms.

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

- **No export or import.** Everything is in localStorage, so clearing a browser
  loses every streak and review schedule. Highest-priority gap.
- **No accounts or sync**, so progress does not follow a user between devices.
- The rate limiter in `api/generate.js` is in-memory and resets on cold starts.
  It stops runaway loops, not real abuse.
- `react-hooks` lint warnings (14) are unfixed — effect dependencies and
  set-state-in-effect, visible in `npm run lint`.
- One 655KB bundle. Decks are eagerly imported; lazy-loading them per subject
  is the obvious win when it matters.

## Out of scope

Not a question bank for other year groups or medical schools, not a flashcard
app for arbitrary subjects, and not a replacement for Anki. It is one year's
curriculum, taught the way this cohort is examined.
