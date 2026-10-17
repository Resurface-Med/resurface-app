import { Fragment, useState, useRef, useEffect, useCallback } from "react";
import { apiFetch } from "../lib/api";
import JSZip from "jszip";
import { h1, primaryBtn } from "../ui/theme";
import Wave from "../ui/Wave";
import { deckPath, indexDecks, questionsInDeck } from "../lib/decks";
import { chunk } from "../lib/chunk";
import DeckDestination from "../ui/DeckDestination";
import EditQuestionModal from "../ui/EditQuestionModal";
import { remote } from "../lib/remote";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";

/**
 * Generate — turn lecture material into questions.
 *
 * Same composition as Progress / Leaderboard: blue field for the thesis,
 * wave into a sheet for the work. The form is one card, the way a question
 * in Practice is one card, and it asks one thing at a time: the lecture,
 * then where it belongs, then how many — with the path along the top of
 * the card, Lecture › Topic › Questions, so a finished step is a page you
 * can turn back to.
 * It was a tab strip with a question for a heading on each step and
 * micro-caps labels over everything; then everything on one card, which
 * was a form; then the answered steps collapsed to lines, which hid them.
 */


// Only the images-in-a-PDF fallback is still bounded by this. The size limit
// exists because a file is base64-encoded into a JSON body — which inflates it
// by a third — and Vercel refuses a request body over 4.5MB. Text extraction
// sidesteps it entirely: the words in a 40MB deck are a few tens of kilobytes.
const MAX_FILE_BYTES = 3 * 1024 * 1024;

// Reading a file this big into browser memory is the real limit now, and it is
// far past any lecture.
const MAX_READ_BYTES = 60 * 1024 * 1024;

// Under this much extracted text, assume the pages are pictures — scanned
// notes, or slides that are one exported image each — and send the file itself
// so the model can still see them.
const MIN_USEFUL_CHARS = 220;

/*
 * The same ceiling the server enforces, which is the point of it being here:
 * the client used to allow thirty while the server clamped to twenty without
 * saying so, so the button promised thirty and twenty arrived.
 *
 * Fifty, because requests are what the free tier counts and questions are
 * not — two requests for fifty questions costs twice as much of the day as
 * one. Measured against a real generation of ten: 0.7s and 340 output
 * tokens a question, so fifty is about 35 seconds against a 55s attempt
 * timeout, and ~17,000 output tokens, which is past anything this codebase
 * had assumed before. See the note on the server's MAX_COUNT.
 *
 * Whether a lecture has forty fair questions in it is a different question,
 * and the honest answer is that it depends on the lecture.
 */
const MAX_COUNT = 50;

/*
 * Lectures per batch. A week's teaching is six to ten lectures, so ten covers
 * one in a go; at about half a minute a lecture, three at a time, that is two
 * minutes of waiting, where twenty would be five. More than ten is a second
 * batch. Each lecture is its own request — they share a free quota of 500 a
 * day across everyone, and the server caps each person's day as well.
 */
const MAX_BATCH = 10;
const BATCH_PARALLEL = 3;

const band = {
  maxWidth: 1180,
  margin: "0 auto",
  padding: "0 clamp(20px, 3vw, 40px)",
  width: "100%",
};


// ── Guessing where a file belongs ───────────────────────────────────────────

/* Words that appear in lecture filenames and mean nothing about the content.
   Without these, "Lecture 3 notes" scores against any topic containing a
   common word and the matcher starts guessing for the sake of it. */
const FILENAME_NOISE = new Set([
  "lecture", "lec", "week", "wk", "notes", "note", "slides", "slide", "final",
  "edited", "tagged", "copy", "part", "session", "year", "handout", "revision",
  "tutorial", "seminar", "workshop", "and", "the", "for", "with", "intro",
  "introduction", "draft", "updated", "new",
]);


/**
 * The part of a filename a person would recognise.
 *
 * Lecture files are named for the timetable, not the reader:
 * "ANAT-RESP-WK2-2.1 - Larynx, trachea, anterior chest wall 2025-26 ARU
 * edited - Tagged (1) (1).pdf". Truncating that from the right cuts off the
 * only words that identify it, because the course code comes first and the
 * title is in the middle. Taking the longest hyphen-separated run and dropping
 * the version noise leaves "Larynx, trachea, anterior chest wall".
 *
 * The full name is still on the element's title, so nothing is actually
 * hidden — it is just not the thing shown first.
 */
function sourceLabel(name) {
  const base = String(name).replace(/\.[a-z0-9]+$/i, "").replace(/\(.*?\)/g, " ");
  const longest = base.split(/\s+-\s+/).sort((a, b) => b.length - a.length)[0] || base;
  const kept = longest
    .split(/[\s_]+/)
    .filter(t => {
      const bare = t.toLowerCase().replace(/[^a-z]/g, "");
      return t && !FILENAME_NOISE.has(bare) && !/^\d/.test(t);
    })
    .join(" ")
    .trim();
  /* If stripping left almost nothing — "IMG_20260904.jpg" reduces to "IMG" —
     the cleaned version is less use than the name it came from. */
  return kept.length >= 6 ? kept : String(name);
}

/** A readable topic name out of a filename, for when none of the above hits. */
function suggestTopicName(name) {
  const base = String(name).replace(/\.[a-z0-9]+$/i, "");
  const longest = base.split(/\s+-\s+/).sort((a, b) => b.length - a.length)[0] || base;
  const cleaned = longest
    .replace(/\(.*?\)/g, " ")
    .split(/[\s_]+/)
    .filter(t => {
      const bare = t.toLowerCase().replace(/[^a-z]/g, "");
      return bare.length > 2 && !FILENAME_NOISE.has(bare) && !/^\d/.test(t);
    })
    .join(" ")
    .trim();
  if (cleaned.split(" ").length < 2 || cleaned.length > 60) return "";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}


/* A sub-deck's name, for a lecture in a batch. suggestTopicName refuses
   one-word results — right for guessing a whole deck, where one word is
   usually noise — but "Synapses" is a perfectly good lecture, and falling
   back to the raw file name kept "Week 3 - " on the front of it. */
function subDeckName(name) {
  const guess = suggestTopicName(name);
  if (guess) return guess;
  const base = String(name).replace(/\.[a-z0-9]+$/i, "");
  const longest = base.split(/\s+-\s+/).sort((a, b) => b.length - a.length)[0] || base;
  const t = longest.replace(/[_]+/g, " ").trim() || base;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ── File extraction ─────────────────────────────────────────────────────────

async function extractPptx(file) {
  const zip = await JSZip.loadAsync(file);
  const slideFiles = Object.keys(zip.files)
    .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)[0]), nb = parseInt(b.match(/\d+/)[0]);
      return na - nb;
    });

  let text = "";
  for (const name of slideFiles) {
    const xml = await zip.files[name].async("text");
    const matches = xml.match(/<a:t[^>]*>([^<]+)<\/a:t>/g) || [];
    const slideText = matches.map(m => m.replace(/<[^>]+>/g, "")).join(" ").trim();
    if (slideText) text += `\n--- Slide ---\n${slideText}`;
  }
  return text;
}

/**
 * The words out of a PDF, page by page.
 *
 * PowerPoint has always been handled this way and PDFs were the one path still
 * shipping raw bytes, which is why they were the only ones hitting a size
 * limit. Extracting first also costs about a third as much: a page sent as an
 * image is billed at 258 tokens whatever is on it, while the same page as text
 * is usually well under a hundred.
 */
let pdfjsPromise = null;

/**
 * pdf.js is 150KB gzipped — more than the rest of this screen put together —
 * so it is fetched when someone actually picks a PDF rather than when the page
 * opens. Cached after the first call, because a second lecture should not wait
 * for the same download twice.
 */
async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const [pdfjs, worker] = await chunk(() => Promise.all([
        import("pdfjs-dist"),
        import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
      ]))();
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

async function extractPdf(file) {
  const pdfjs = await loadPdfjs();
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;

  let text = "";
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map(it => it.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (pageText) text += `\n--- Slide ${i} ---\n${pageText}`;
    page.cleanup();
  }

  doc.destroy();
  return text.trim();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/**
 * The cards out of an Anki deck.
 *
 * An .apkg is a zip holding a SQLite database: `collection.anki2` in older
 * exports, `collection.anki21b` — the same database, zstd-compressed — in
 * anything from Anki 23.10 on. Both are read in the browser: the zip with
 * JSZip, the compression with fzstd, the database with sql.js. All lazy, so
 * nobody who never drops a deck pays for the wasm.
 *
 * Only the notes' fields are wanted. HTML, sound tags and cloze markup are
 * stripped, and each note becomes one line, front then back. The review log
 * is in there too; it is not the point.
 */
let sqlJsPromise = null;
function loadSqlJs() {
  if (!sqlJsPromise) {
    sqlJsPromise = (async () => {
      const [{ default: initSqlJs }, wasm] = await chunk(() => Promise.all([
        import("sql.js"),
        import("sql.js/dist/sql-wasm.wasm?url"),
      ]))();
      return initSqlJs({ locateFile: () => wasm.default });
    })();
  }
  return sqlJsPromise;
}

const APKG_MAX_NOTES = 400;

function cleanField(html) {
  return html
    .replace(/\[sound:[^\]]*\]/g, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<img[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\{\{c\d+::([^}:]*)(?:::[^}]*)?\}\}/g, "$1")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function extractApkg(file) {
  const zip = await JSZip.loadAsync(file);
  let bytes;
  if (zip.files["collection.anki21b"]) {
    const { decompress } = await chunk(() => import("fzstd"))();
    bytes = decompress(await zip.files["collection.anki21b"].async("uint8array"));
  } else {
    const name = ["collection.anki21", "collection.anki2"].find(n => zip.files[n]);
    if (!name) throw new Error("That doesn’t look like an Anki deck — there’s no collection inside it.");
    bytes = await zip.files[name].async("uint8array");
  }

  const SQL = await loadSqlJs();
  const db = new SQL.Database(bytes);
  let rows;
  try {
    rows = db.exec("SELECT flds FROM notes ORDER BY id")[0]?.values ?? [];
  } finally {
    db.close();
  }

  const lines = [];
  for (const [flds] of rows) {
    const fields = String(flds).split("\x1f").map(cleanField).filter(Boolean);
    if (!fields.length) continue;
    const [front, ...back] = fields;
    lines.push(back.length ? `• ${front} — ${back.join(" · ")}` : `• ${front}`);
    if (lines.length >= APKG_MAX_NOTES) break;
  }
  if (!lines.length) throw new Error("That deck has no cards with text in them.");

  const note = rows.length > APKG_MAX_NOTES
    ? `\n(The first ${APKG_MAX_NOTES} of ${rows.length} cards.)`
    : "";
  return `Flashcards from an Anki deck, front — back. Write questions that test the same facts; the other cards' answers are the natural distractors.${note}\n\n${lines.join("\n")}`;
}

/* What a deck already holds, for the server to steer away from and filter
   out: each stem with its correct answer, which is what shows which fact a
   question tested — a rewording keeps the answer. */
function alreadyIn(deckId) {
  return questionsInDeck(deckId)
    .filter(q => typeof q.q === "string" && q.q)
    .map(q => ({ q: q.q, a: Array.isArray(q.opts) && typeof q.opts[q.ans] === "string" ? q.opts[q.ans] : "" }));
}

async function generateQuestions({ file, pastedText, deckLabel, count, avoid, signal }) {
  let userContent = [];

  if (file) {
    const ext = file.name.split(".").pop().toLowerCase();

    const isDoc = ext === "pptx" || ext === "ppt" || ext === "pdf" || ext === "apkg";

    if (isDoc && file.size > MAX_READ_BYTES) {
      throw new Error(`That file is ${(file.size / 1024 / 1024).toFixed(0)}MB, which is more than the browser can open. Split it and try again.`);
    }
    if (!isDoc && file.size > MAX_FILE_BYTES) {
      throw new Error(`That image is ${(file.size / 1024 / 1024).toFixed(1)}MB — the limit is 3MB for images. Try a smaller one.`);
    }

    if (ext === "pptx" || ext === "ppt") {
      const text = await extractPptx(file);
      userContent = [{ type: "text", text: `Topic: ${deckLabel}\n\n${text}` }];
    } else if (ext === "apkg") {
      const text = await extractApkg(file);
      userContent = [{ type: "text", text: `Topic: ${deckLabel}\n\n${text}` }];
    } else if (ext === "pdf") {
      const text = await extractPdf(file);

      if (text.length >= MIN_USEFUL_CHARS) {
        userContent = [{ type: "text", text: `Topic: ${deckLabel}\n\n${text}` }];
      } else if (file.size <= MAX_FILE_BYTES) {
        // Nothing to read, so the pages must be pictures. Send them.
        const b64 = await fileToBase64(file);
        userContent = [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
          { type: "text", text: `Topic: ${deckLabel}` },
        ];
      } else {
        throw new Error("That PDF has no selectable text — the pages look like images — and it's too large to send as one. Try splitting it, or paste the text in instead.");
      }
    } else if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) {
      const b64 = await fileToBase64(file);
      const mt = ext === "jpg" || ext === "jpeg" ? "image/jpeg"
        : ext === "png" ? "image/png"
        : ext === "gif" ? "image/gif"
        : "image/webp";
      userContent = [
        { type: "image", source: { type: "base64", media_type: mt, data: b64 } },
        { type: "text", text: `Topic: ${deckLabel}` },
      ];
    }
  } else if (pastedText.trim()) {
    userContent = [{ type: "text", text: `Topic: ${deckLabel}\n\n${pastedText}` }];
  }

  if (!userContent.length) throw new Error("No content to generate from.");

  const { data: { session } } = await supabase.auth.getSession();

  const res = await apiFetch("/api/generate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session?.access_token ?? ""}`,
    },
    body: JSON.stringify({ userContent, count, avoid }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e = new Error(err?.error || `Request failed (${res.status})`);
    e.status = res.status;
    throw e;
  }

  const { questions: parsed, removed } = await res.json();
  if (!Array.isArray(parsed)) throw new Error("The generator returned something unexpected. Try again.");

  const out = parsed.map(q => ({
    gen: true,
    q: q.q,
    opts: q.opts,
    ans: q.ans,
    exp: q.exp,
    optExp: q.optExp,
  }));
  /* How many the server threw out for repeating the deck (lib/dedupe.js). */
  out.removed = Number(removed) || 0;
  return out;
}

const PAGES = [
  { k: "source", label: "Lecture" },
  { k: "place", label: "Deck" },
  { k: "detail", label: "Questions" },
];

/** An empty question, for writing one rather than correcting one. */
const BLANK_QUESTION = { q: "", opts: ["", "", "", "", ""], ans: 0, exp: "", optExp: [] };

// ── Quiet generating state ──────────────────────────────────────────────────

/**
 * These rotate on a timer, not on progress — nothing reports back from the
 * model mid-request. So each one names a real part of the job rather than a
 * position in it: "Almost there" was here and it was simply untrue, since the
 * line has no idea how far along anything is. Anything of that shape belongs
 * nowhere near this list.
 */
const MESSAGES = [
  "Reading your material",
  "Working out what's examinable",
  "Writing the questions",
  "Making the wrong answers plausible",
  "Checking each one has a single right answer",
  "Writing the explanations",
];

/**
 * The generating window.
 *
 * This used to be a whole page: the setup screen was replaced by a field band
 * with the status line hanging off the top left, which put the one thing you
 * are waiting on in the corner of an otherwise empty screen. It is a centred
 * window over the form now — same scrim-and-window vocabulary as Resurface AI,
 * so the app has one way of interrupting you rather than two.
 *
 * The drawing is the work, on a loop: a page of lecture text, which resolves
 * into a stem with four options, one of which is the answer, and back. Five
 * bars play both parts — five lines of prose, then one stem and four options —
 * so the change is those same bars rearranging rather than one picture being
 * swapped for another.
 */
function GeneratingWindow({ count, onCancel }) {
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setMsgIdx(i => (i + 1) % MESSAGES.length), 2400);
    return () => clearInterval(t);
  }, []);

  // Escape cancels, and the form behind must not scroll under the window.
  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") onCancel(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onCancel]);

  return (
    <div className="genw-scrim">
      <div
        className="genw"
        role="dialog"
        aria-modal="true"
        aria-label="Generating questions"
      >
        <svg className="genw-stage" viewBox="0 0 200 124" aria-hidden="true">
          <circle className="genw-dot d1" cx="25" cy="45" r="3.5" />
          <circle className="genw-dot d2" cx="25" cy="67" r="3.5" />
          <circle className="genw-dot d3 is-answer" cx="25" cy="89" r="3.5" />
          <circle className="genw-dot d4" cx="25" cy="111" r="3.5" />

          <rect className="genw-ln l1" x="18" y="16" width="164" height="8" rx="4" />
          <rect className="genw-ln l2" x="18" y="38" width="164" height="8" rx="4" />
          <rect className="genw-ln l3" x="18" y="60" width="164" height="8" rx="4" />
          <rect className="genw-ln l4" x="18" y="82" width="164" height="8" rx="4" />
          <rect className="genw-ln l5" x="18" y="104" width="164" height="8" rx="4" />
        </svg>

        <p className="genw-title">
          Writing {count} question{count !== 1 ? "s" : ""}
        </p>
        <div aria-live="polite" className="genw-status-live">
          <p key={msgIdx} className="genw-status">
            {MESSAGES[msgIdx]}
          </p>
        </div>

        <div className="genw-track" aria-hidden="true">
          <div className="genw-track-fill" />
        </div>

        <button type="button" className="genw-cancel btn-press" onClick={onCancel} autoFocus>
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * The generating window, for a batch: the same scrim, window and drawing,
 * with a line per lecture saying where it is. While anything is running it
 * only offers Cancel; once all have finished, any that failed can be tried
 * again, or left.
 */
function BatchWindow({ jobs, onCancel, onRetry, onContinue }) {
  const done = jobs.filter(j => j.status === "done").length;
  const failed = jobs.filter(j => j.status === "failed").length;
  const running = jobs.some(j => j.status === "working" || j.status === "waiting");

  useEffect(() => {
    const onKey = e => { if (e.key === "Escape" && running) onCancel(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onCancel, running]);

  const state = j =>
    j.status === "done" ? `${j.n} added`
    : j.status === "working" ? "Writing…"
    : j.status === "failed" ? "Didn’t work"
    : "Waiting";

  return (
    <div className="genw-scrim">
      <div className="genw genw-batch" role="dialog" aria-modal="true" aria-label="Writing questions">
        {running && (
          <svg className="genw-stage" viewBox="0 0 200 124" aria-hidden="true">
            <circle className="genw-dot d1" cx="25" cy="45" r="3.5" />
            <circle className="genw-dot d2" cx="25" cy="67" r="3.5" />
            <circle className="genw-dot d3 is-answer" cx="25" cy="89" r="3.5" />
            <circle className="genw-dot d4" cx="25" cy="111" r="3.5" />
            <rect className="genw-ln l1" x="18" y="16" width="164" height="8" rx="4" />
            <rect className="genw-ln l2" x="18" y="38" width="164" height="8" rx="4" />
            <rect className="genw-ln l3" x="18" y="60" width="164" height="8" rx="4" />
            <rect className="genw-ln l4" x="18" y="82" width="164" height="8" rx="4" />
            <rect className="genw-ln l5" x="18" y="104" width="164" height="8" rx="4" />
          </svg>
        )}
        <p className="genw-title">
          {running ? `${done} of ${jobs.length} lectures done` : `${failed} of ${jobs.length} didn’t work`}
        </p>
        <ul className="genw-jobs" aria-live="polite">
          {jobs.map((j, i) => (
            <li key={i} className={`genw-job is-${j.status}`} title={j.error || undefined}>
              <span className="genw-job-name">{j.name}</span>
              <span className="genw-job-state">{state(j)}</span>
            </li>
          ))}
        </ul>
        {running ? (
          <button type="button" className="genw-cancel btn-press" onClick={onCancel} autoFocus>Cancel</button>
        ) : (
          <div className="genw-batch-acts">
            <button type="button" className="btn-press" style={primaryBtn} onClick={onRetry}>Try again</button>
            {done > 0 && <button type="button" className="genw-cancel btn-press" onClick={onContinue}>Review the {done} that worked</button>}
          </div>
        )}
      </div>
    </div>
  );
}

/* The sheet is white for lists of things (review, done) and the practice
   surface when it holds a card, so the card has something to sit on. */
function Shell({ title, sub, children, footer, maxWidth = 720, sheet = "var(--c-card-solid)" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "var(--app-vh)" }}>
      <div className="page-band" style={{ ...band, paddingTop: "clamp(22px, 3.6vh, 36px)", paddingBottom: "clamp(18px, 2.8vh, 28px)" }}>
        <h1 data-in="left" style={{ ...h1, margin: 0, "--i": 0 }}>{title}</h1>
        {sub ? <p className="gen-field-sub">{sub}</p> : null}
      </div>
      <Wave from="transparent" to={sheet} />
      <div style={{ background: sheet, flex: 1 }}>
        <div style={{
          ...band,
          maxWidth,
          paddingTop: "clamp(20px, 3vh, 28px)",
          paddingBottom: footer ? "clamp(100px, 14vh, 120px)" : "clamp(36px, 5vh, 56px)",
        }}>
          {children}
        </div>
      </div>
      {footer}
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

export default function GenerateMode({ savedGenerated = [], onGeneratedChange, decks = [], deckActions = null, targetDeckId = null, onTargetDeckChange = null, onOpenDeck = null, onBusyChange = null, onPractise = null }) {
  const { user } = useAuth();
  /* One file, or a batch of up to MAX_BATCH. One behaves exactly as it
     always has (review, then save); two or more each become a sub-deck. */
  const [files, setFiles] = useState([]);
  const file = files[0] ?? null;
  const setFile = f => setFiles(f ? [f] : []);
  const batch = files.length > 1;
  /* A batch run: one row per lecture. */
  const [jobs, setJobs] = useState([]);
  /* A batch under review: each lecture's name and how many it wrote. */
  const [reviewJobs, setReviewJobs] = useState([]);
  /* Questions the server left out for repeating the deck, said on review. */
  const [repeatsRemoved, setRepeatsRemoved] = useState(0);
  const [pastedText, setPastedText] = useState("");
  /* Where the questions go: an existing deck, or a new one (named, and
     placed under a parent or at the top). Came here from a deck's ＋ Add and
     that deck is the parent by default, with the lecture as a new sub-deck. */
  /*
   * Where the questions go, as one name.
   *
   * Anki's convention: a deck is a name, and "::" puts one inside another, so
   * "Week 1 - Renal::Upper Renal Tract" is a deck inside a deck. Most people
   * coming to this have used Anki, and it collapses four separate problems
   * into typing — choosing an existing deck, making a new one, saying what to
   * put it inside, and changing your mind about the name — which were a
   * dropdown, a second dropdown, a modal and nowhere respectively.
   *
   * Arriving from a deck's ＋ Add prefills that deck and a "::", so whatever
   * the file is called lands inside it.
   */
  const [deckName, setDeckName] = useState("");
  const [picking, setPicking] = useState(false);
  /* Our own suggestion list rather than <datalist>. Chrome draws a dropdown
     marker on any input with a `list` and will not reliably let it go —
     ::-webkit-calendar-picker-indicator { display: none } is deployed and the
     triangle is still there — and it sat beside a Browse button already
     offering the same thing. Rendering the list ourselves also means it can
     show what is in each deck. */
  const [sugOpen, setSugOpen] = useState(false);
  const [countRaw, setCountRaw] = useState("10");

  const [phase, setPhase] = useState("setup");
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  /* Pasting is the second way in and hidden until asked for. Two boxes on
     the card — one for a file, one for text — made every visit look like a
     choice to be made, when nearly everyone has a file. */
  const [pasting, setPasting] = useState(false);
  /* A file held over the drop surface. Drives the drawing, nothing else. */
  const [over, setOver] = useState(false);
  /* Whether Topic is being chosen or written. Chosen by default: the lists are
     two to twelve long, so picking is nearly always the right control and
     typing is the exception. */
  /* "ai" writes them from a lecture, "manual" is you writing them. The card
     is the same either way except for its top and its bottom: manual has no
     source, and a count means nothing for a question you are typing out
     yourself. */
  const [mode, setMode] = useState("ai");
  useEffect(() => {
    if (!targetDeckId) return;
    /*
     * The deck you pressed Add on, and nothing after it.
     *
     * This used to append "::", which means "make a new deck inside this
     * one" — so the file name completed it and the questions landed in a
     * sub-deck named after the PDF. Nobody asked for that. Making the deck
     * was the decision; putting the questions somewhere else is the app
     * overruling it, and "Generate into this" ought to go into this.
     *
     * A sub-deck is still a keystroke away: type "::Lecture 2". That is the
     * point of the convention — nesting is something you ask for rather than
     * something that happens to you.
     *
     * It also means the deck exists, so its questions are sent as the list
     * to avoid. The trailing "::" was why that list was always empty.
     */
    setDeckName(cur => (cur.trim() ? cur : deckPath(targetDeckId, indexDecks(decks)).map(p => p.name).join("::")));
  }, [targetDeckId, decks]);
  const [written, setWritten] = useState([]);
  const [writing, setWriting] = useState(false);
  // Cancel has to stop the request, not just hide the window — otherwise the
  // reply lands later and drops the user into a review screen they backed out
  // of. Held in a ref because aborting must not itself trigger a render.
  const abortRef = useRef(null);
  /* Leaving mid-generation (after the warning) cancels the request rather
     than letting it finish into a screen that is gone. */
  useEffect(() => () => abortRef.current?.abort(), []);
  const [generated, setGenerated] = useState([]);
  const [kept, setKept] = useState(new Set());
  /* Which review rows have had their answer opened. The list itself stays blind. */
  const [revealed, setRevealed] = useState(() => new Set());
  const [error, setError] = useState("");
  const fileRef = useRef();

  const [savedQs, setSavedQs] = useState(savedGenerated);
  /* The saved list as of the last finished lecture: a batch appends to it as
     each one lands, and three can land between renders. */
  const savedRef = useRef(savedQs);
  useEffect(() => { savedRef.current = savedQs; }, [savedQs]);
  /* The deck a batch is going into, kept for retrying the ones that failed. */
  const batchParent = useRef(null);

  /*
   * Work that leaving would throw away.
   *
   * Generated questions live only here until they are saved, and each batch
   * is a request out of the day's shared five hundred. A tap on the nav, or
   * closing the tab, while one was generating or waiting to be kept dropped it
   * without a word — as did questions typed by hand and not yet added. App
   * asks before navigating away; the browser asks before closing.
   */
  const busy = phase === "generating" || phase === "batch"
    || (phase === "review" && generated.length > 0)
    || (phase !== "done" && written.length > 0);
  useEffect(() => {
    onBusyChange?.(busy);
    if (!busy) return;
    const warn = e => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  /* Both ways in — the picker and the drop target — go through here, so the
     guess cannot be wired to one and forgotten on the other. Adds to what
     is already chosen, up to MAX_BATCH, skipping a file already in. */
  function acceptFiles(list) {
    const incoming = [...(list ?? [])].filter(Boolean);
    if (!incoming.length) return;
    setPastedText("");
    setPasting(false);
    setError("");
    const same = (a, b) => a.name === b.name && a.size === b.size;
    const next = [...files];
    for (const f of incoming) if (!next.some(g => same(f, g))) next.push(f);
    if (next.length > MAX_BATCH) setError(`Up to ${MAX_BATCH} at a time. The first ${MAX_BATCH} are in; add the rest as a second batch.`);
    const kept = next.slice(0, MAX_BATCH);
    setFiles(kept);

    /* One file names the deck, unless you have already named it yourself.
       Trailing "::" means you have chosen a parent and not yet said what goes
       in it, so the file finishes the sentence. With several, the deck is the
       one they all go inside, so a name taken from the first file is undone. */
    const firstGuess = suggestTopicName(kept[0].name);
    if (kept.length > 1) {
      setDeckName(cur => (firstGuess && cur.trim() === firstGuess ? "" : cur.trim().endsWith("::" + firstGuess) ? cur.trim().slice(0, -firstGuess.length) : cur));
      return;
    }
    if (!firstGuess) return;
    setDeckName(cur => {
      const t = cur.trim();
      if (!t) return firstGuess;
      if (t.endsWith("::")) return t + firstGuess;
      return cur;
    });
  }
  function removeFile(i) {
    setFiles(fs => fs.filter((_, j) => j !== i));
  }

  const cancelGenerate = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  /**
   * Saves a batch and stamps the ids the database gave them.
   *
   * Without this the questions sit in the bank with no id until a reload, and
   * an id is what progress and spaced repetition are keyed on — a question
   * answered before that reload would have nowhere to record the answer.
   */
  /* The deck the questions are going into — created now if it is new. */
  /**
   * Turns the typed name into a deck id, making whatever does not exist yet.
   *
   * Each segment is matched against the decks that already sit at that level,
   * case-insensitively, so typing a name you already have uses it rather than
   * making a second one beside it with different capitals.
   */
  async function resolveDeck() {
    const parts = deckName.split("::").map(x => x.trim()).filter(Boolean);
    if (!parts.length) throw new Error("Give the deck a name first.");
    return (await resolvePath(parts, decks)).id;
  }
  /* Finds or makes each level of a path. Created ones are carried in `known`
     and handed back, because the decks prop will not have updated between
     awaits — a batch threads it through so a level made for one lecture is
     found, not made again, by the next. */
  async function resolvePath(parts, known) {
    let parentId = null;
    for (const name of parts) {
      const hit = known.find(d => (d.parentId ?? null) === parentId
        && d.name.trim().toLowerCase() === name.toLowerCase());
      if (hit) { parentId = hit.id; continue; }
      const made = await deckActions.createDeck(name, parentId);
      known = [...known, { ...made, parentId }];
      parentId = made.id;
    }
    return { id: parentId, known };
  }
  /**
   * Saves the kept questions, and says which of the two things happened.
   *
   * addGenerated parks the rows in the retry queue and returns null when the
   * write fails, so nothing is lost — but this used to turn that into an empty
   * array, and the caller went to "Added" regardless. You were told it had
   * worked, found nothing there, and the obvious response is to generate the
   * same lecture again: another few thousand tokens out of five hundred
   * requests a day, to replace questions that were never gone.
   *
   * So the two outcomes are now distinguishable, and the screen says which.
   */
  async function withIds(list, deckId) {
    if (!user) return { rows: list, queued: false };
    const payloads = list.map(({ q, opts, ans, exp, optExp, img }) => ({ q, opts, ans, exp, optExp, ...(img ? { img } : {}) }));
    const ids = await remote.addGenerated(user.id, payloads, deckId);
    /* Queued rows have no id yet, and an id is what progress is keyed on, so
       they cannot join the pool until the queue drains. */
    if (!ids) return { rows: [], queued: true };
    return { rows: payloads.map((q, i) => ({ ...q, id: ids[i], gen: true, deckId })), queued: false };
  }
  const [savedDeckId, setSavedDeckId] = useState(null);
  /* Written, or only queued because the network was not there. */
  const [savedQueued, setSavedQueued] = useState(false);
  /* The ids of what was just saved, so Done can start a session on them. */
  const [justSaved, setJustSaved] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const decksById = indexDecks(decks);
  /* Decks in reading order, with depth, for the picker. */
  /* What the picker offers as the new deck's name: whatever is already
     pending, else the file's own name cleaned up. Naming needs no cleverness
     — "2.1 Larynx, trachea, chest wall.pdf" is already the answer — and it is
     visible and correctable, unlike a guess at which existing deck to use. */
  /** "Week 1 - Renal::Upper Renal Tract" for a deck that already exists. */
  function fullName(id) {
    return deckPath(id, decksById).map(p => p.name).join("::");
  }

  /**
   * The id of the typed deck if every level of it already exists, else null.
   *
   * Deliberately not resolveDeck: that one creates what is missing, and this
   * runs before you have committed to anything. A name that is only half
   * real has nothing in it to duplicate anyway.
   */
  function existingDeckId(name) {
    const parts = name.split("::").map(x => x.trim()).filter(Boolean);
    if (!parts.length) return null;
    let parentId = null;
    for (const part of parts) {
      const hit = decks.find(d => (d.parentId ?? null) === parentId
        && d.name.trim().toLowerCase() === part.toLowerCase());
      if (!hit) return null;
      parentId = hit.id;
    }
    return parentId;
  }

  /* What is already in the deck being added to, so a second pass over the
     same lecture covers new ground. Oldest first: the server keeps the tail,
     and the recent ones are the likely collisions. */
  function avoidStems() {
    const id = existingDeckId(deckName);
    return id ? alreadyIn(id) : [];
  }
  const deckLabel = deckName.split("::").map(x => x.trim()).filter(Boolean).join(" › ");
  const countNum = Math.max(1, Math.min(MAX_COUNT, parseInt(countRaw) || 0));
  const hasPlace = deckName.split("::").some(x => x.trim());
  const canGenerate = (file || pastedText.trim()) && hasPlace && countNum >= 1;
  // ── Review ────────────────────────────────────────────────────────────
  if (phase === "review") {
    const keptList = generated.filter((_, i) => kept.has(i));
    return (
      <Shell
        title="Review"
        sub={`Keeping ${keptList.length} of ${generated.length}. Untick any you don’t want.${repeatsRemoved ? ` ${repeatsRemoved} left out for repeating questions already in the deck.` : ""}`}
        footer={(
          <div className="gen-sticky">
            {saveError && (
              <p className="gen-save-error" role="alert">
                {saveError}
              </p>
            )}
            <div className="gen-sticky-inner">
              <button
                type="button"
                className="btn-press"
                style={{ ...primaryBtn, flex: 1 }}
                disabled={keptList.length === 0 || saving}
                onClick={async () => {
                  /* Staying on this screen is the whole point of catching it:
                     the questions exist only here until they are written, and
                     they cost a generation to make. Dropping the user
                     somewhere else with an error would throw them away. */
                  setSaveError(null);
                  setSaving(true);
                  try {
                    if (reviewJobs.length) { await saveBatch(keptList); return; }
                    const deckId = await resolveDeck();
                    const { rows, queued } = await withIds(keptList, deckId);
                    const merged = [...savedQs, ...rows];
                    setSavedQs(merged);
                    onGeneratedChange?.(merged);
                    setSavedDeckId(deckId);
                    setSavedQueued(queued);
                    setJustSaved(rows.map(r => r.id).filter(id => typeof id === "number"));
                    setPhase("done");
                  } catch (e) {
                    setSaveError(e?.message || "Could not save them. Your questions are still here — try again.");
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? "Saving…" : <>Save {keptList.length} question{keptList.length === 1 ? "" : "s"} →</>}
              </button>
              <button
                type="button"
                className="btn-press gen-ghost"
                onClick={() => { setPhase("setup"); setGenerated([]); setRevealed(new Set()); setReviewJobs([]); }}
              >
                Start over
              </button>
            </div>
          </div>
        )}
      >
        <ol className="gen-review-list">
          {generated.map((q, i) => {
            const isKept = kept.has(i);
            const isOpen = revealed.has(i);
            /* A batch: the lecture's name before its first question, with how
               many it wrote against how many were asked for. */
            const job = reviewJobs.length && q._job !== undefined && (i === 0 || generated[i - 1]._job !== q._job)
              ? reviewJobs[q._job] : null;
            return (
              <Fragment key={i}>
              {job && (
                <li className="gen-review-group">
                  <span className="gen-review-group-name">{job.name}</span>
                  <span className="gen-review-group-n">{job.n < countNum ? `${job.n} of ${countNum}` : `${job.n}`}</span>
                </li>
              )}
              <li className={`gen-review-item${isKept ? "" : " is-out"}`}>
                <div className="gen-review-row">
                  <label className="gen-review-keep" htmlFor={`gen-keep-${i}`}>
                    <input
                      id={`gen-keep-${i}`}
                      type="checkbox"
                      checked={isKept}
                      onChange={() => {
                        setKept(prev => {
                          const s = new Set(prev);
                          s.has(i) ? s.delete(i) : s.add(i);
                          return s;
                        });
                      }}
                    />
                  </label>
                  <span className="gen-review-body">
                    <span className="gen-review-num" aria-hidden="true">{q._job !== undefined ? i - generated.findIndex(x => x._job === q._job) + 1 : i + 1}</span>
                    <label htmlFor={`gen-keep-${i}`} className="gen-review-q">{q.q}</label>
                    <span className="gen-review-opts">
                      {q.opts.map((opt, oi) => (
                        <span
                          key={oi}
                          className={`gen-review-opt${isOpen && oi === q.ans ? " is-ans" : ""}`}
                        >
                          <span className="gen-review-letter">{"ABCDE"[oi]}</span>
                          {opt}
                        </span>
                      ))}
                    </span>
                    <button
                      type="button"
                      className="gen-review-peek"
                      aria-expanded={isOpen}
                      onClick={() => {
                        setRevealed(prev => {
                          const s = new Set(prev);
                          s.has(i) ? s.delete(i) : s.add(i);
                          return s;
                        });
                      }}
                    >
                      {isOpen ? "Hide the answer" : "Show the answer"}
                    </button>
                    {isOpen && q.exp ? <span className="gen-review-exp">{q.exp}</span> : null}
                  </span>
                </div>
              </li>
              </Fragment>
            );
          })}
        </ol>
      </Shell>
    );
  }

  // ── Done ──────────────────────────────────────────────────────────────
  if (phase === "done") {
    return (
      <Shell
        title={savedQueued ? "Saved, not sent yet" : "Added"}
        sub={savedQueued
          ? "They are on this device and will sync the moment you are back online. Don't generate them again."
          : "They are in Study now."}
      >
        <div className="gen-done-actions">
          {/* Answer them now, while you want to. This used to file them
              ("Added", then the deck list), and the people who generated and
              never answered a question had all stopped right here. */}
          {justSaved.length > 0 && onPractise ? (
            <>
              <button type="button" className="btn-press" style={primaryBtn} onClick={() => { onTargetDeckChange?.(null); onPractise(justSaved); }}>
                Practise {justSaved.length === 1 ? "it" : `these ${justSaved.length}`} now <span aria-hidden="true">→</span>
              </button>
              {savedDeckId && onOpenDeck && (
                <button type="button" className="btn-press gen-text-btn" onClick={() => {
                  const root = deckPath(savedDeckId, decksById)[0]?.id ?? savedDeckId;
                  onTargetDeckChange?.(null); onOpenDeck(root);
                }}>
                  Open {deckPath(savedDeckId, decksById)[0]?.name ?? "deck"}
                </button>
              )}
            </>
          ) : savedDeckId && onOpenDeck ? (
            <button type="button" className="btn-press" style={primaryBtn} onClick={() => {
              /* Study opens on the root tab holding this deck. */
              const root = deckPath(savedDeckId, decksById)[0]?.id ?? savedDeckId;
              onTargetDeckChange?.(null); onOpenDeck(root);
            }}>
              Open {deckPath(savedDeckId, decksById)[0]?.name ?? "deck"} <span aria-hidden="true">→</span>
            </button>
          ) : (
            <button type="button" className="btn-press" style={primaryBtn} onClick={() => window.location.reload()}>
              Reload app
            </button>
          )}
          <button
            type="button"
            className="btn-press gen-text-btn"
            onClick={() => {
              setPhase("setup");
              setGenerated([]);
              setRevealed(new Set());
              setFile(null);
              setPastedText("");
            }}
          >
            Generate more
          </button>
        </div>
      </Shell>
    );
  }

  // ── Setup ─────────────────────────────────────────────────────────────
  // The generating window sits over this rather than replacing it, so backing
  // out returns you to a form still holding everything you filled in.
  const hasSource = Boolean(file || pastedText.trim());
  /* Manual has no source, so its first step is placement. */
  const first = mode === "manual" ? 1 : 0;
  const last = 2;
  /* Nothing is gated but the last button. What is missing is said in one
     sentence beside it, with each word a link to the page it is on. */
  const missing = [
    !hasSource && mode === "ai" ? { k: "lecture", label: "a lecture", step: 0 } : null,
    !hasPlace ? { k: "deck", label: "a deck", step: 1 } : null,
  ].filter(Boolean);
  /* Forward slides in from the right, back from the left — the same
     direction the page is being turned. */
  function turnTo(i) {
    setDir(i > step ? 1 : -1);
    setStep(i);
  }
  function back() {
    if (step > first) turnTo(step - 1);
  }
  function next() {
    turnTo(step + 1);
  }

  async function generate() {
    setError("");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setPhase("generating");
    try {
      const qs = await generateQuestions({
        file,
        pastedText,
        deckLabel,
        count: countNum,
        avoid: avoidStems(),
        signal: ctrl.signal,
      });
      setGenerated(qs);
      setRepeatsRemoved(qs.removed || 0);
      setKept(new Set(qs.map((_, i) => i)));
      setRevealed(new Set());
      setPhase("review");
    } catch (e) {
      // Cancelling is a decision, not a fault. Saying "The user aborted a
      // request" back to someone who pressed Cancel is the app telling
      // them off for doing what it offered.
      if (e.name === "AbortError") { setPhase("setup"); return; }
      setError(e.message || "Something went wrong.");
      setPhase("setup");
    } finally {
      abortRef.current = null;
    }
  }

  /*
   * A batch: every lecture its own sub-deck inside the chosen one, written
   * BATCH_PARALLEL at a time and saved as each finishes — no review step,
   * because reviewing ten lectures of questions before keeping any would
   * undo the point of a batch; any question can still be deleted after.
   *
   * The parent is found or made once, before anything runs, so three
   * lectures finishing together cannot each make their own copy of it. A
   * lecture's sub-deck is only made once its questions exist, so a failure
   * or a cancel leaves no empty deck behind.
   */
  async function runJobs(list, parent) {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const results = [...list];
    const update = (i, patch) => { results[i] = { ...results[i], ...patch }; setJobs([...results]); };
    let next = 0;
    async function worker() {
      while (next < results.length) {
        const i = next++;
        if (results[i].status === "done") continue;
        if (ctrl.signal.aborted) return;
        update(i, { status: "working", error: "" });
        try {
          const subParts = [...parent.parts, results[i].name];
          const existing = existingDeckId(subParts.join("::"));
          const qs = await generateQuestions({
            file: results[i].file,
            pastedText: "",
            deckLabel: subParts.join(" › "),
            count: countNum,
            avoid: existing ? alreadyIn(existing) : [],
            signal: ctrl.signal,
          });
          /* Held, not saved: they go to review first, like a single lecture. */
          update(i, { status: "done", n: qs.length, qs, removed: qs.removed || 0 });
        } catch (e) {
          if (e?.name === "AbortError") { update(i, { status: "waiting" }); return; }
          update(i, { status: "failed", error: e?.message || "Something went wrong." });
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(BATCH_PARALLEL, results.length) }, worker));
    abortRef.current = null;
    if (ctrl.signal.aborted) { setPhase("setup"); return; }
    if (results.every(j => j.status === "done")) reviewBatch(results);
  }
  /* Into the ordinary review screen: one list, each question tagged with
     its lecture, which is what the screen groups by and Save files by. */
  function reviewBatch(results) {
    const done = results.filter(j => j.status === "done" && j.qs?.length);
    const list = done.flatMap((j, ji) => j.qs.map(q => ({ ...q, _job: ji })));
    setReviewJobs(done.map(j => ({ name: j.name, n: j.qs.length })));
    setRepeatsRemoved(done.reduce((t, j) => t + (j.removed || 0), 0));
    setGenerated(list);
    setKept(new Set(list.map((_, i) => i)));
    setRevealed(new Set());
    setJobs([]);
    setPhase("review");
  }
  /* Saving a reviewed batch: each lecture's kept questions into its own
     sub-deck, made in order now (one at a time, threading what has been
     made so the parent is never made twice). A lecture with nothing kept
     gets no deck. */
  async function saveBatch(keptList) {
    const parent = batchParent.current;
    let known = decks;
    const ids = [];
    let queuedAny = false;
    for (let ji = 0; ji < reviewJobs.length; ji++) {
      const mine = keptList.filter(q => q._job === ji);
      if (!mine.length) continue;
      const made = await resolvePath([...parent.parts, reviewJobs[ji].name], known);
      known = made.known;
      const { rows, queued } = await withIds(mine, made.id);
      queuedAny = queuedAny || queued;
      savedRef.current = [...savedRef.current, ...rows];
      setSavedQs(savedRef.current);
      onGeneratedChange?.(savedRef.current);
      ids.push(...rows.map(r => r.id).filter(id => typeof id === "number"));
    }
    setJustSaved(ids);
    setSavedDeckId(parent.id);
    setSavedQueued(queuedAny);
    setFiles([]);
    setReviewJobs([]);
    setPhase("done");
  }
  async function generateBatch() {
    setError("");
    const parts = deckName.split("::").map(x => x.trim()).filter(Boolean);
    if (!parts.length) { setError("Give the deck a name first."); return; }
    let parent;
    try {
      const r = await resolvePath(parts, decks);
      parent = { id: r.id, known: r.known, parts };
    } catch (e) {
      setError(e?.message || "Could not make the deck. Try again.");
      return;
    }
    batchParent.current = parent;
    /* Sub-deck names from the files, made unique within the batch. */
    const used = new Map();
    const list = files.map(f => {
      const base = subDeckName(f.name);
      const k = base.toLowerCase();
      const n = (used.get(k) ?? 0) + 1;
      used.set(k, n);
      return { file: f, name: n > 1 ? `${base} (${n})` : base, status: "waiting" };
    });
    setJobs(list);
    setPhase("batch");
    runJobs(list, parent);
  }
  function retryFailed() {
    const list = jobs.map(j => (j.status === "failed" ? { ...j, status: "waiting", error: "" } : j));
    setJobs(list);
    runJobs(list, { ...batchParent.current, known: decks });
  }

  /* The same two outcomes as the generated path, and the same rule: on a
     failure stay where the questions are. These were typed by hand, so losing
     them costs somebody their afternoon rather than their quota. */
  async function addWritten() {
    setSaveError(null);
    setSaving(true);
    try {
      const deckId = await resolveDeck();
      const { rows, queued } = await withIds(written, deckId);
      const merged = [...savedQs, ...rows];
      setSavedQs(merged);
      onGeneratedChange?.(merged);
      setSavedDeckId(deckId);
      setSavedQueued(queued);
      setJustSaved(rows.map(r => r.id).filter(id => typeof id === "number"));
      if (!queued) setWritten([]);
      setPhase("done");
    } catch (e) {
      setSaveError(e?.message || "Could not save them. They are still here — try again.");
    } finally {
      setSaving(false);
    }
  }


  /*
   * Two ways into one value.
   *
   * The field is the truth: a deck's name, with Anki's "::" to put one inside
   * another. Typing it is the fast path once you know what your decks are
   * called, and it is the only way to change a name the file chose for you —
   * which is what was missing when this was a picker alone.
   *
   * Browse fills the same field by pointing instead of typing, for when you
   * have forgotten what you called something, or have never used Anki and do
   * not know that "::" means anything. Neither is a mode: whatever the picker
   * chooses lands in the box as text, where it can still be edited.
   */
  /* What you have, narrowed by what you have typed. An exact match is
     dropped: there is nothing to suggest when the box already says it. */
  const suggestions = (() => {
    const typed = deckName.trim().toLowerCase();
    return decks
      .map(d => ({ id: d.id, name: fullName(d.id), count: questionsInDeck(d.id).length }))
      .filter(x => x.name.toLowerCase() !== typed && (!typed || x.name.toLowerCase().includes(typed)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 8);
  })();

  /* Recomputed as the name is typed, so the note under the field tracks it. */
  const existingCount = (() => {
    const id = existingDeckId(deckName);
    return id ? questionsInDeck(id).length : 0;
  })();

  const placement = (
    <div className="gen-deck">
      <label className="gen-field">
        <span className="gen-field-label">Deck</span>
        <span className="gen-deck-row">
          <span className="gen-deck-field">
            <input
              type="text"
              value={deckName}
              onChange={e => { setDeckName(e.target.value); setSugOpen(true); }}
              onFocus={() => setSugOpen(true)}
              onBlur={() => setSugOpen(false)}
              onKeyDown={e => { if (e.key === "Escape") setSugOpen(false); }}
              placeholder="e.g. Week 1 - Renal::Upper Renal Tract"
              className="gen-deck-input"
              maxLength={200}
              autoComplete="off"
              spellCheck={false}
            />
            {sugOpen && suggestions.length > 0 && (
              <ul className="gen-sug">
                {suggestions.map(sg => (
                  <li key={sg.id}>
                    {/* mousedown, not click: blur would close the list first */}
                    <button
                      type="button"
                      className="gen-sug-row"
                      onMouseDown={e => { e.preventDefault(); setDeckName(sg.name); setSugOpen(false); }}
                    >
                      <span className="gen-sug-name">{sg.name}</span>
                      <span className="gen-sug-count">{sg.count === 0 ? "empty" : `${sg.count}`}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </span>
          <button type="button" className="gen-deck-browse" onClick={() => setPicking(true)}>
            Browse
          </button>
        </span>
      </label>
      <p className="gen-deck-hint">
        Type <code>::</code> to put one deck inside another, or browse what you have.
        Anything that doesn’t exist yet gets made.
      </p>
      {hasPlace && (
        <p className="gen-deck-path">
          Going into <strong>{deckLabel}</strong>
          {/* Whether duplicate-avoidance is actually going to happen, said
              before you spend a generation rather than discovered after.
              It depends on the typed name matching a deck that exists, and
              when it silently did not there was nothing on screen to say
              so — which is exactly how the first attempt at this looked
              like the model ignoring instructions. */}
          {batch
            ? <span className="gen-deck-note"> · each lecture gets its own sub-deck inside it</span>
            : existingCount > 0
            ? <span className="gen-deck-note"> · avoiding the {existingCount} question{existingCount === 1 ? "" : "s"} already in it</span>
            : <span className="gen-deck-note"> · new deck, nothing to avoid</span>}
        </p>
      )}

      <DeckDestination
        open={picking}
        onClose={() => setPicking(false)}
        decks={decks}
        countFor={id => questionsInDeck(id).length}
        chosenId={decks.find(d => fullName(d.id).toLowerCase() === deckName.trim().toLowerCase())?.id ?? null}
        onChooseExisting={id => setDeckName(fullName(id))}
        suggestedName={deckName.split("::").pop().trim() || (file ? suggestTopicName(file.name) : "")}
        /* A new deck from the picker is not created there either — it becomes
           text in the field like everything else, and is made when you
           generate. */
        onCreate={(name, parentId) => setDeckName(parentId ? `${fullName(parentId)}::${name}` : name)}
      />
    </div>
  );

  return (
    <Shell
      title="Generate"
      sub="Drop an Anki deck, slides or notes — Resurface writes the questions."
      maxWidth={640}
      sheet="var(--c-surface2)"
    >
      {phase === "generating" && (
        <GeneratingWindow count={countNum} onCancel={cancelGenerate} />
      )}
      {phase === "batch" && (
        <BatchWindow
          jobs={jobs}
          onCancel={cancelGenerate}
          onRetry={retryFailed}
          onContinue={() => reviewBatch(jobs)}
        />
      )}

      <div className="gen-card anim-scale-in">
        {/* The steps, as a path: Lecture › Topic › Questions. Every page
            is open — the path is navigation, not a record of what is done.
            Only the last button is held back, and it says why. */}
        <nav className="gen-path" aria-label="Steps">
          {PAGES.map((pg, i) => {
            if (i < first) return null;
            const current = i === step;
            return (
              <span key={pg.k} className="gen-path-item">
                {i > first && (
                  <svg className="gen-path-sep" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                <button
                  type="button"
                  className={`gen-path-step${current ? " is-current" : ""}`}
                  disabled={current}
                  aria-current={current ? "step" : undefined}
                  onClick={() => turnTo(i)}
                >
                  {pg.label}
                </button>
              </span>
            );
          })}
        </nav>

        {targetDeckId && decksById.get(targetDeckId) && (
          <p className="gen-target">
            Adding to <strong>{decksById.get(targetDeckId).name}</strong>
          </p>
        )}

        <div key={`${mode}-${step}`} className="gen-step" style={{ "--dir": dir }}>
          {step === 0 && (
            <>
              <h2 className="gen-card-title">Upload an Anki deck, lecture or notes</h2>
              {files.length > 0 ? (
                <div className="gen-files">
                  {files.map((f, i) => (
                    <div key={`${f.name}:${f.size}`} className="gen-source is-file">
                      <span className="gen-source-name" title={f.name}>{sourceLabel(f.name)}</span>
                      <button type="button" className="gen-link" onClick={() => removeFile(i)}>Remove</button>
                    </div>
                  ))}
                  {files.length < MAX_BATCH && (
                    <button type="button" className="gen-link gen-source-alt" onClick={() => fileRef.current?.click()}>
                      Add another lecture
                    </button>
                  )}
                  {error && <p className="gen-error">{error}</p>}
                </div>
              ) : pasting ? (
                <div className="gen-source is-text">
                  <textarea
                    className="gen-paste"
                    value={pastedText}
                    onChange={e => setPastedText(e.target.value)}
                    placeholder="Paste lecture notes here…"
                    rows={6}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="gen-link"
                    onClick={() => { setPasting(false); setPastedText(""); }}
                  >
                    Drop a file instead
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className={`gen-source${over ? " is-over" : ""}`}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setOver(true); }}
                  onDragLeave={() => setOver(false)}
                  onDrop={e => { e.preventDefault(); setOver(false); acceptFiles(e.dataTransfer.files); }}
                >
                  {/* The dashed edge is drawn rather than a CSS border, so
                      the dashes can be spaced. Sits under everything. */}
                  <svg className="gen-source-edge" aria-hidden="true">
                    <rect />
                  </svg>
                  {/* A page of lecture lines. Hover, or hold a file over it,
                      and the lines become a stem and options — the
                      generating window's drawing, held still. */}
                  <svg className="gen-sheet" viewBox="0 0 64 78" aria-hidden="true">
                    <rect className="gen-sheet-page" x="0.75" y="0.75" width="62.5" height="76.5" rx="8" />
                    <circle className="gen-sheet-dot d1" cx="12" cy="31" r="2.4" />
                    <circle className="gen-sheet-dot d2" cx="12" cy="45" r="2.4" />
                    <circle className="gen-sheet-dot d3 is-answer" cx="12" cy="59" r="2.4" />
                    <rect className="gen-sheet-ln l1" x="12" y="14" width="40" height="5.5" rx="2.75" />
                    <rect className="gen-sheet-ln l2" x="12" y="28" width="32" height="5.5" rx="2.75" />
                    <rect className="gen-sheet-ln l3" x="12" y="42" width="40" height="5.5" rx="2.75" />
                    <rect className="gen-sheet-ln l4" x="12" y="56" width="27" height="5.5" rx="2.75" />
                  </svg>
                  <span className="gen-source-text">
                    <span className="gen-source-lead">Drop a file here, or browse</span>
                    <span className="gen-source-meta">Anki deck, PowerPoint, PDF or image · up to {MAX_BATCH} at once</span>
                  </span>
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".pptx,.ppt,.pdf,.apkg,.jpg,.jpeg,.png,.webp"
                multiple
                style={{ display: "none" }}
                onChange={e => { acceptFiles(e.target.files); e.target.value = ""; }}
              />
              {!file && !pasting && (
                <button type="button" className="gen-link gen-source-alt" onClick={() => setPasting(true)}>
                  Paste notes instead
                </button>
              )}
            </>
          )}

          {step === 1 && (
            <>
              <h2 className="gen-card-title">Where does it belong?</h2>
              {placement}
            </>
          )}

          {step === 2 && mode === "ai" && (
            <>
              {/*
                * A slider, not chips and an "Other" box.
                *
                * The chips offered four numbers and sent anything else to a
                * text field, which is two controls for one value and made the
                * uncommon answer the awkward one. A range says what the
                * possible answers are by existing, and the ceiling is a fact
                * about the track rather than a message after you overshoot.
                */}
              <div className="gen-count">
                {/* The value sits on the heading row as a value, not above
                    the track as a headline. It was 40px at weight 800 —
                    larger and bolder than the card title it sat under, which
                    is why it read as shouting. */}
                <div className="gen-count-head">
                  <h2 className="gen-card-title">{batch ? "Questions per lecture" : "How many questions"}</h2>
                  <output className="gen-count-value" htmlFor="gen-count">{countNum}</output>
                </div>
                <input
                  id="gen-count"
                  className="gen-count-slider"
                  type="range"
                  min={1}
                  max={MAX_COUNT}
                  step={1}
                  value={countNum}
                  onChange={e => setCountRaw(e.target.value)}
                  aria-label="How many questions"
                  aria-valuetext={`${countNum} question${countNum === 1 ? "" : "s"}`}
                />
                <div className="gen-count-ends" aria-hidden="true">
                  <span>1</span>
                  <span>{MAX_COUNT}</span>
                </div>
              </div>
              {error && <p className="gen-error">{error}</p>}
            </>
          )}

          {step === 2 && mode === "manual" && (
            <>
              <h2 className="gen-card-title">Your questions</h2>
              {/* The same editor used for correcting a question, opened
                  empty, with what you have written so far listed above. */}
              {written.length > 0 && (
                <ol className="gen-written">
                  {written.map((w, i) => (
                    <li key={i} className="gen-written-item">
                      <span className="gen-written-n">{i + 1}</span>
                      <span className="gen-written-q">{w.q}</span>
                      <button
                        type="button"
                        className="gen-written-del"
                        onClick={() => setWritten(list => list.filter((_, j) => j !== i))}
                        aria-label={`Remove question ${i + 1}`}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              <button type="button" className="gen-write-btn btn-press" onClick={() => setWriting(true)}>
                <span aria-hidden="true">＋</span>
                {written.length === 0 ? "Write a question" : "Write another"}
              </button>
            </>
          )}
        </div>

        {/* Why the last button is held back, said once on its own line
            above it — never beside it, where it fought the button for the
            row and wrapped into a ragged right-aligned pair of lines. */}
        {step === last && mode === "ai" && missing.length > 0 && (
          <p className="gen-missing">
            Add{" "}
            {missing.map((m, i) => (
              <span key={m.k}>
                {i > 0 ? " and " : ""}
                <button type="button" className="gen-link" onClick={() => turnTo(m.step)}>{m.label}</button>
              </span>
            ))}
            {" "}first.
          </p>
        )}
        {step === last && mode === "manual" && !hasPlace && written.length > 0 && (
          <p className="gen-missing">
            Choose <button type="button" className="gen-link" onClick={() => turnTo(1)}>a deck</button> first.
          </p>
        )}

        {/* Back undoes, forward commits — so one is text and one is filled. */}
        <div className="gen-card-nav">
          {step > first && (
            <button type="button" className="gen-link gen-back" onClick={back}>
              <span aria-hidden="true">←</span> Back
            </button>
          )}
          {step < last && (
            <button
              type="button"
              className="btn-press gen-go"
              style={primaryBtn}
              onClick={next}
            >
              Continue <span aria-hidden="true">→</span>
            </button>
          )}
          {step === last && mode === "ai" && (
            <button
              type="button"
              className="btn-press gen-go"
              style={{ ...primaryBtn, opacity: canGenerate ? 1 : 0.45 }}
              disabled={!canGenerate}
              onClick={batch ? generateBatch : generate}
            >
              {batch
                ? <>Write {countNum} for each of {files.length} lectures <span aria-hidden="true">→</span></>
                : <>Write {countNum} question{countNum !== 1 ? "s" : ""} <span aria-hidden="true">→</span></>}
            </button>
          )}
          {step === last && mode === "manual" && (
            <button
              type="button"
              className="btn-press gen-go"
              style={{ ...primaryBtn, opacity: written.length && hasPlace ? 1 : 0.45 }}
              disabled={!written.length || !hasPlace}
              onClick={addWritten}
            >
              Add {written.length} to bank <span aria-hidden="true">→</span>
            </button>
          )}
        </div>
      </div>

      {/* The other way in, as a sentence under the card rather than a third
          box on it: it is not another kind of source, it is having none. */}
      <p className="gen-aside">
        {mode === "ai" ? (
          <>Or <button type="button" className="gen-link" onClick={() => { setMode("manual"); turnTo(1); }}>write your own questions</button> from scratch.</>
        ) : (
          <>Or <button type="button" className="gen-link" onClick={() => { setMode("ai"); turnTo(0); }}>generate them from a lecture</button> instead.</>
        )}
      </p>

      {writing && (
        <EditQuestionModal
          q={BLANK_QUESTION}
          onClose={() => setWriting(false)}
          onSave={qn => {
            setWriting(false);
            setWritten(list => [...list, { ...qn, gen: true }]);
          }}
        />
      )}
    </Shell>
  );
}
