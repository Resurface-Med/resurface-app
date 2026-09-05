import { useState, useRef, useEffect, useCallback } from "react";
import JSZip from "jszip";
import { h1, sectionH, primaryBtn, chipBtn, chipBtnActive } from "../ui/theme";
import Wave from "../ui/Wave";
import { DECK_MAP, BLOCKS, CURRICULUM } from "../data";
import EditQuestionModal from "../ui/EditQuestionModal";
import { remote } from "../lib/remote";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";

/**
 * Generate — turn lecture material into questions.
 *
 * Same composition as Progress / Leaderboard: blue field for the thesis,
 * wave into a white sheet for the work. One job per phase. No nested cards
 * for display; chips and flat rows carry the interaction.
 */

const API_BASE = import.meta.env.VITE_API_BASE
  || (import.meta.env.DEV ? "http://localhost:3001" : "https://api.tryresurface.com");

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

const DIFFICULTIES = [
  { k: "easy",   label: "Easy",   hint: "Single-fact recall" },
  { k: "medium", label: "Medium", hint: "Mechanism & application" },
  { k: "hard",   label: "Hard",   hint: "Clinical vignettes" },
];

const COUNT_PRESETS = [5, 10, 15, 20];

const band = {
  maxWidth: 1180,
  margin: "0 auto",
  padding: "0 clamp(20px, 3vw, 40px)",
  width: "100%",
};

const whisper = {
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
  color: "var(--c-muted-dim)",
  lineHeight: 1,
};

const field = {
  width: "100%",
  boxSizing: "border-box",
  padding: "11px 14px",
  fontSize: 15,
  fontFamily: "inherit",
  color: "var(--c-text)",
  background: "var(--c-surface3)",
  border: "1.5px solid transparent",
  borderRadius: "var(--r-ctrl)",
  outline: "none",
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

function fileWords(str) {
  return String(str)
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[^a-z]+/g, " ")
    .split(" ")
    .filter(t => t.length > 2 && !FILENAME_NOISE.has(t));
}

/**
 * Where a file probably belongs, or nothing.
 *
 * Topics are searched across every subject rather than inside a guessed one.
 * A topic name is far more distinctive than a subject name — "Glycolysis"
 * identifies one topic on its own, while plenty of lectures never say
 * "Biochemistry" anywhere in the filename — so the subject is taken from
 * whichever topic wins.
 *
 * Three gates, all of them about refusing to guess: half the topic's words
 * must appear, one of them must be a real word rather than a short common
 * one, and the runner-up must be clearly behind. That last gate is what makes
 * "Immunity.pdf" return nothing instead of picking Innate or Adaptive at
 * random, which is the failure that would matter — a wrong topic files
 * questions somewhere they will not be found again.
 */
function guessPlacement(name) {
  const w = fileWords(name);
  if (!w.length) return { deck: null, cat: null };

  const scored = [];
  for (const [deck, cats] of Object.entries(DECK_MAP)) {
    for (const cat of cats || []) {
      const ct = fileWords(shortCat(cat, deck));
      if (!ct.length) continue;
      const hits = ct.filter(t => w.some(f =>
        f === t || (t.length >= 4 && f.startsWith(t)) || (f.length >= 4 && t.startsWith(f))));
      scored.push({ deck, cat, score: hits.length / ct.length, strong: hits.some(t => t.length >= 5) });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const [top, second] = scored;
  const confident = top && top.score >= 0.5 && top.strong
    && (!second || top.score - second.score >= 0.2);
  if (confident) return { deck: top.deck, cat: top.cat };

  // No topic, but the subject may still be named outright.
  for (const deck of Object.keys(DECK_MAP)) {
    const d = deck.toLowerCase();
    if (w.some(t => t.length >= 4 && (d.startsWith(t) || t.startsWith(d)))) {
      return { deck, cat: null };
    }
  }
  return { deck: null, cat: null };
}

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

function shortCat(cat, deck) {
  return cat.startsWith(`${deck}: `) ? cat.slice(deck.length + 2) : cat;
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
      const [pdfjs, worker] = await Promise.all([
        import("pdfjs-dist"),
        import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
      ]);
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

async function generateQuestions({ file, pastedText, deck, category, year, block, difficulty, count, signal }) {
  let userContent = [];

  if (file) {
    const ext = file.name.split(".").pop().toLowerCase();

    const isDoc = ext === "pptx" || ext === "ppt" || ext === "pdf";

    if (isDoc && file.size > MAX_READ_BYTES) {
      throw new Error(`That file is ${(file.size / 1024 / 1024).toFixed(0)}MB, which is more than the browser can open. Split it and try again.`);
    }
    if (!isDoc && file.size > MAX_FILE_BYTES) {
      throw new Error(`That image is ${(file.size / 1024 / 1024).toFixed(1)}MB — the limit is 3MB for images. Try a smaller one.`);
    }

    if (ext === "pptx" || ext === "ppt") {
      const text = await extractPptx(file);
      userContent = [{ type: "text", text: `Topic: ${deck} / ${category}\n\n${text}` }];
    } else if (ext === "pdf") {
      const text = await extractPdf(file);

      if (text.length >= MIN_USEFUL_CHARS) {
        userContent = [{ type: "text", text: `Topic: ${deck} / ${category}\n\n${text}` }];
      } else if (file.size <= MAX_FILE_BYTES) {
        // Nothing to read, so the pages must be pictures. Send them.
        const b64 = await fileToBase64(file);
        userContent = [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
          { type: "text", text: `Topic: ${deck} / ${category}` },
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
        { type: "text", text: `Topic: ${deck} / ${category}` },
      ];
    }
  } else if (pastedText.trim()) {
    userContent = [{ type: "text", text: `Topic: ${deck} / ${category}\n\n${pastedText}` }];
  }

  if (!userContent.length) throw new Error("No content to generate from.");

  const { data: { session } } = await supabase.auth.getSession();

  const res = await fetch(`${API_BASE}/api/generate`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session?.access_token ?? ""}`,
    },
    body: JSON.stringify({ userContent, difficulty, count }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e = new Error(err?.error || `Request failed (${res.status})`);
    e.status = res.status;
    throw e;
  }

  const { questions: parsed } = await res.json();
  if (!Array.isArray(parsed)) throw new Error("The generator returned something unexpected. Try again.");

  return parsed.map(q => ({
    gen: true,
    cat: category,
    year,
    block,
    deck,
    q: q.q,
    opts: q.opts,
    ans: q.ans,
    exp: q.exp,
    optExp: q.optExp,
  }));
}

/**
 * The form, split into three.
 *
 * It was one page asking seven things at once — source, subject, topic, year,
 * block, difficulty and count — with a button at the end that would not say
 * which of them was still missing.
 *
 * Two questions carry it: what you have, and what it is about. The last step
 * holds the four that already have the right answer filled in, so it is a
 * place to change your mind rather than a place to make a decision. Each step
 * gates on its own requirement, which means Continue is what tells you
 * something is missing, at the point where you would fix it.
 */
/** An empty question, for writing one rather than correcting one. */
const BLANK_QUESTION = { q: "", opts: ["", "", "", "", ""], ans: 0, exp: "", optExp: [] };

const STEPS = [
  { k: "source", label: "Lecture/notes", heading: "Drop in your lectures or notes" },
  { k: "place", label: "Topic", heading: "Where does it belong?" },
  { k: "detail", label: "Questions", heading: "How many, and how hard?" },
];

/* The last step is a different question when you are writing them yourself. */
const MANUAL_LAST = { k: "detail", label: "Questions", heading: "Write your questions" };



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

function Shell({ title, sub, children, footer, maxWidth = 720 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "var(--app-vh)" }}>
      <div style={{ ...band, paddingTop: "clamp(22px, 3.6vh, 36px)", paddingBottom: "clamp(18px, 2.8vh, 28px)" }}>
        <h1 data-in="left" style={{ ...h1, margin: 0, "--i": 0 }}>{title}</h1>
        {sub ? <p className="gen-field-sub">{sub}</p> : null}
      </div>
      <Wave from="transparent" to="var(--c-card-solid)" />
      <div style={{ background: "var(--c-card-solid)", flex: 1 }}>
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

export default function GenerateMode({ savedGenerated = [], onGeneratedChange }) {
  const { user } = useAuth();
  const [file, setFile] = useState(null);
  const [pastedText, setPastedText] = useState("");
  const [deck, setDeck] = useState(Object.keys(DECK_MAP)[0]);
  const [category, setCategory] = useState("");
  const [year, setYear] = useState("Year 1");
  const [block, setBlock] = useState("Principles");
  const [difficulty, setDifficulty] = useState("medium");
  const [countRaw, setCountRaw] = useState("10");

  const [phase, setPhase] = useState("setup");
  const [step, setStep] = useState(0);
  /* Whether Topic is being chosen or written. Chosen by default: the lists are
     two to twelve long, so picking is nearly always the right control and
     typing is the exception. */
  const [newTopic, setNewTopic] = useState(false);
  const [newBlock, setNewBlock] = useState(false);
  /* "ai" writes them from a lecture, "manual" is you writing them. The steps
     are the same either way until the last one, which is where the two
     diverge: difficulty and count mean nothing for a question you are typing
     out yourself. */
  const [mode, setMode] = useState("ai");
  const [written, setWritten] = useState([]);
  const [writing, setWriting] = useState(false);
  // Cancel has to stop the request, not just hide the window — otherwise the
  // reply lands later and drops the user into a review screen they backed out
  // of. Held in a ref because aborting must not itself trigger a render.
  const abortRef = useRef(null);
  const [generated, setGenerated] = useState([]);
  const [kept, setKept] = useState(new Set());
  const [error, setError] = useState("");
  const fileRef = useRef();

  const [savedQs, setSavedQs] = useState(savedGenerated);
  const [bankOpen, setBankOpen] = useState(false);

  /* Both ways in — the picker and the drop target — go through here, so the
     guess cannot be wired to one and forgotten on the other. */
  function acceptFile(f) {
    if (!f) return;
    setFile(f);
    setPastedText("");
    const { deck: d, cat } = guessPlacement(f.name);
    if (d) setDeck(d);
    if (cat) { setCategory(cat); setNewTopic(false); }
    else if (d) setCategory("");
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
  async function withIds(list) {
    if (!user) return list;
    const ids = await remote.addGenerated(user.id, list);
    return ids ? list.map((q, i) => ({ ...q, id: ids[i] })) : list;
  }

  function deleteQuestion(id) {
    // Local-only removal used to be all this did, so a deleted question came
    // straight back on the next load.
    if (user) remote.removeGenerated(user.id, id);
    const updated = savedQs.filter(q => q.id !== id);
    setSavedQs(updated);
    onGeneratedChange?.(updated);
  }

  function clearAll() {
    if (user) remote.clearGenerated(user.id);
    setSavedQs([]);
    onGeneratedChange?.([]);
  }

  const decks = Object.keys(DECK_MAP);
  /* Scoped to the block, because the same subject carries different topics in
     each one — Physiology in Principles is not Physiology in Respiratory. */
  const blockNode = CURRICULUM.find(b => b.block === block);
  const deckNode = blockNode?.decks.find(d => d.deck === deck);
  const existingCats = deckNode?.cats ?? (blockNode ? [] : DECK_MAP[deck] || []);
  const countNum = Math.max(1, Math.min(30, parseInt(countRaw) || 0));
  const canGenerate = (file || pastedText.trim()) && category.trim() && countNum >= 1;
  /* One requirement per step. The last has none — everything on it is already
     answered — so it is gated by canGenerate, which is the first two. */
  const stepReady = [Boolean(file || pastedText.trim()), Boolean(category.trim())];

  // ── Review ────────────────────────────────────────────────────────────
  if (phase === "review") {
    const keptList = generated.filter((_, i) => kept.has(i));
    return (
      <Shell
        title="Review"
        sub={`Keeping ${keptList.length} of ${generated.length}. Untick any you don’t want.`}
        footer={(
          <div className="gen-sticky">
            <div className="gen-sticky-inner">
              <button
                type="button"
                className="btn-press"
                style={{ ...primaryBtn, flex: 1 }}
                disabled={keptList.length === 0}
                onClick={async () => {
                  const saved = await withIds(keptList);
                  const merged = [...savedQs, ...saved];
                  setSavedQs(merged);
                  onGeneratedChange?.(merged);
                  setPhase("done");
                }}
              >
                Add {keptList.length} to bank →
              </button>
              <button
                type="button"
                className="btn-press gen-ghost"
                onClick={() => { setPhase("setup"); setGenerated([]); }}
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
            return (
              <li key={i} className={`gen-review-item${isKept ? "" : " is-out"}`}>
                <label className="gen-review-row">
                  <input
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
                  <span className="gen-review-body">
                    <span className="gen-review-num" aria-hidden="true">{i + 1}</span>
                    <span className="gen-review-q">{q.q}</span>
                    <span className="gen-review-opts">
                      {q.opts.map((opt, oi) => (
                        <span
                          key={oi}
                          className={`gen-review-opt${oi === q.ans ? " is-ans" : ""}`}
                        >
                          <span className="gen-review-letter">{"ABCDE"[oi]}</span>
                          {opt}
                        </span>
                      ))}
                    </span>
                    {q.exp ? <span className="gen-review-exp">{q.exp}</span> : null}
                  </span>
                </label>
              </li>
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
        title="Added"
        sub="Reload once so Practice and the rest of the app pick them up."
      >
        <div className="gen-done-actions">
          <button type="button" className="btn-press" style={primaryBtn} onClick={() => window.location.reload()}>
            Reload app
          </button>
          <button
            type="button"
            className="btn-press gen-text-btn"
            onClick={() => {
              setPhase("setup");
              setGenerated([]);
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
  return (
    <Shell
      title="Generate"
      sub="Drop slides or notes — Resurface writes the questions."
      maxWidth={680}
    >
      {phase === "generating" && (
        <GeneratingWindow count={countNum} onCancel={cancelGenerate} />
      )}

      {/* Two labels on one rule, the live one lit. No circles and no fills —
          a circle needs a fill to read as anything. Going back is allowed;
          skipping ahead is not, which is the only rule the rail enforces. */}
      <nav className="gen-steps" aria-label="Progress">
        {STEPS.map((st, i) => (
          <button
            key={st.k}
            type="button"
            className={`gen-step${i === step ? " is-current" : ""}${i < step ? " is-done" : ""}`}
            onClick={() => i < step && setStep(i)}
            disabled={i > step}
            aria-current={i === step ? "step" : undefined}
          >
            {st.label}
          </button>
        ))}
      </nav>

      <h2 key={`${step}-${mode}`} className="gen-step-heading" data-in="rise">
        {step === 2 && mode === "manual" ? MANUAL_LAST.heading : STEPS[step].heading}
      </h2>

      {/* What you uploaded, carried forward. Two steps later you are being
          asked to name a topic for something you can no longer see, and if the
          subject and topic were guessed from the filename then this is the
          evidence for that guess — a pre-filled answer next to the thing it
          was inferred from is checkable, the same answer on its own is just a
          decision made for you. */}
      {step > 0 && (file || pastedText.trim()) && (
        <p className="gen-source-note">
          <span className="gen-source-label">From</span>
          <span className="gen-source-name" title={file ? file.name : undefined}>
            {file ? sourceLabel(file.name) : `pasted text · ${pastedText.trim().split(/\s+/).length} words`}
          </span>
        </p>
      )}

      {/* Source */}
      {step === 0 && (<>
      <section className="gen-block" data-in="rise" style={{ "--i": 1 }}>
        <span style={whisper}>Source</span>
        <button
          type="button"
          className={`gen-drop${file ? " has-file" : ""}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            acceptFile(e.dataTransfer.files[0]);
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".pptx,.ppt,.pdf,.jpg,.jpeg,.png,.webp"
            style={{ display: "none" }}
            onChange={e => acceptFile(e.target.files[0])}
          />
          {file ? (
            <span className="gen-drop-file">
              <span className="gen-drop-name">{file.name}</span>
              <span
                role="button"
                tabIndex={0}
                className="gen-drop-clear"
                onClick={e => { e.stopPropagation(); setFile(null); }}
                onKeyDown={e => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    setFile(null);
                  }
                }}
              >
                Remove
              </span>
            </span>
          ) : (
            <span className="gen-drop-empty">
              <span className="gen-drop-lead">Drop a file or browse</span>
              <span className="gen-drop-meta">PowerPoint, PDF, or image · max 3MB</span>
            </span>
          )}
        </button>

        {!file && (
          <textarea
            className="gen-paste"
            value={pastedText}
            onChange={e => setPastedText(e.target.value)}
            placeholder="Or paste lecture notes here…"
            rows={3}
          />
        )}
        {/* The third way in. Text rather than a third box, because it is not a
            third kind of source — it is the case where there is no source at
            all and you are the one writing. */}
        <button
          type="button"
          className="gen-scratch"
          onClick={() => { setMode("manual"); setStep(1); }}
        >
          Or write your own questions from scratch
        </button>
      </section>
      </>)}

      {/* Placement */}
      {step === 1 && (<>
      {/* No group label here. Subject, Topic, Year and Block each carry their
          own, so a heading over them was a second level of hierarchy naming
          what four labels already named — and on a phone it cost a whole row
          to do it. */}
      {/* Year, Block, Subject, Topic — widest first. Each row narrows the one
          under it, and Topic, the only required field of the four, is the last
          thing you fill and the one nearest Continue. */}
      <section className="gen-block" data-in="rise" style={{ "--i": 2 }}>
        <div className="gen-grid">
          <label className="gen-field">
            <span className="gen-field-label">Year</span>
            <select value={year} onChange={e => setYear(e.target.value)} style={{ ...field, cursor: "pointer" }}>
              {["Year 1", "Year 2", "Year 3", "Year 4", "Year 5"].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
          {/* Blocks come from the bank rather than from a fixed list. The old
              suggestions had Pathology and Anatomy in them, which are subjects
              — a block is Principles, then Respiratory, then Cardiovascular,
              with those subjects taught inside each. Starting a new one is a
              real case, since every block after the first begins empty. */}
          <label className="gen-field">
            <span className="gen-field-label">Block</span>
            {newBlock || BLOCKS.length === 0 ? (
              <input
                type="text"
                value={block}
                onChange={e => setBlock(e.target.value)}
                placeholder="e.g. Respiratory"
                style={field}
                autoFocus={newBlock}
              />
            ) : (
              <select
                value={block}
                onChange={e => {
                  if (e.target.value === "__new__") { setNewBlock(true); setBlock(""); }
                  else setBlock(e.target.value);
                }}
                style={{ ...field, cursor: "pointer" }}
              >
                {BLOCKS.map(b => <option key={b} value={b}>{b}</option>)}
                <option value="__new__">＋ New block…</option>
              </select>
            )}
            {newBlock && BLOCKS.length > 0 && (
              <button
                type="button"
                className="gen-topic-back"
                onClick={() => { setNewBlock(false); setBlock(BLOCKS[0]); }}
              >
                Pick an existing block instead
              </button>
            )}
          </label>
          <label className="gen-field">
            <span className="gen-field-label">Subject</span>
            <select
              value={deck}
              onChange={e => { setDeck(e.target.value); setCategory(""); setNewTopic(false); }}
              style={{ ...field, cursor: "pointer" }}
            >
              {decks.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          {/* A picker, not a text field. A subject has between two and twelve
              topics, so the whole set fits on screen — asking someone to
              recall and retype an exact string from a list that short is how
              you end up with "Glycolysis" and "Glycolysis & Bioenergetics" as
              two different topics, and a near-miss name fragments Progress
              permanently.

              Writing one stays available, because the bank does not cover
              everything: Anatomy has two topics, so a respiratory lecture has
              nowhere to go and needs a new one. */}
          <label className="gen-field">
            <span className="gen-field-label">Topic</span>
            {newTopic || existingCats.length === 0 ? (
              <input
                type="text"
                value={category}
                onChange={e => setCategory(e.target.value)}
                placeholder="e.g. Glycolysis"
                style={field}
                autoFocus={newTopic}
                required
              />
            ) : (
              <select
                value={category}
                onChange={e => {
                  if (e.target.value === "__new__") {
                    setNewTopic(true);
                    setCategory(file ? suggestTopicName(file.name) : "");
                  } else {
                    setCategory(e.target.value);
                  }
                }}
                style={{ ...field, cursor: "pointer" }}
                required
              >
                <option value="">Choose a topic…</option>
                {existingCats.map(c => (
                  <option key={c} value={c}>{shortCat(c, deck)}</option>
                ))}
                <option value="__new__">＋ New topic…</option>
              </select>
            )}
            {newTopic && existingCats.length > 0 && (
              <button
                type="button"
                className="gen-topic-back"
                onClick={() => { setNewTopic(false); setCategory(""); }}
              >
                Pick an existing topic instead
              </button>
            )}
          </label>
        </div>

      </section>
      </>)}

      {/* Writing them yourself: the same editor used for correcting a
          question, opened empty, with what you have written so far listed
          under it. Reusing that form rather than building a second one means
          per-option explanations come along for free. */}
      {step === 2 && mode === "manual" && (
        <section className="gen-block" data-in="rise" style={{ "--i": 1 }}>
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
        </section>
      )}

      {/* Both of these already have an answer, so this step is somewhere to
          change one rather than somewhere to supply one. */}
      {step === 2 && mode === "ai" && (<>
      <section className="gen-block" data-in="rise" style={{ "--i": 1 }}>
        <div className="gen-chip-row">
          <div className="gen-chip-group">
            <span style={whisper}>Difficulty</span>
            <div className="gen-chips" role="radiogroup" aria-label="Difficulty">
              {DIFFICULTIES.map(d => (
                <button
                  key={d.k}
                  type="button"
                  className="btn-press"
                  onClick={() => setDifficulty(d.k)}
                  style={difficulty === d.k ? { ...chipBtnActive, boxShadow: "none" } : chipBtn}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <p className="gen-hint">{DIFFICULTIES.find(d => d.k === difficulty)?.hint}</p>
          </div>
          <div className="gen-chip-group">
            <span style={whisper}>How many</span>
            <div className="gen-count-row">
              <div className="gen-chips" role="radiogroup" aria-label="Question count">
                {COUNT_PRESETS.map(n => (
                  <button
                    key={n}
                    type="button"
                    className="btn-press"
                    onClick={() => setCountRaw(String(n))}
                    style={countNum === n ? { ...chipBtnActive, boxShadow: "none" } : chipBtn}
                  >
                    {n}
                  </button>
                ))}
              </div>
              {/* Outside the radiogroup on purpose — a textbox is not one of
                  the radios, and putting it inside would say it was.

                  Empty while a preset is chosen. Bound straight to countRaw it
                  showed the selected number too, so the row read as five
                  options with 10 offered twice; blank with a placeholder makes
                  it plainly the box for a number that is not on the list. */}
              <input
                type="text"
                inputMode="numeric"
                aria-label="Or type a number of questions"
                className="gen-count-input"
                placeholder="Other"
                value={COUNT_PRESETS.includes(countNum) ? "" : countRaw}
                onChange={e => setCountRaw(e.target.value.replace(/\D/g, ""))}
                onBlur={e => { if (!e.target.value.trim()) setCountRaw(String(countNum || 10)); }}
              />
            </div>
          </div>
        </div>
      </section>
      </>)}

      {writing && (
        <EditQuestionModal
          q={BLANK_QUESTION}
          onClose={() => setWriting(false)}
          onSave={qn => {
            setWriting(false);
            setWritten(list => [...list, { ...qn, gen: true, cat: category.trim(), year, block, deck }]);
          }}
        />
      )}

      {error && <p className="gen-error">{error}</p>}

      <div className="gen-nav">
        {step > 0 && (
          <button
            type="button"
            className="gen-nav-back btn-press"
            onClick={() => { if (step === 1) setMode("ai"); setStep(step - 1); }}
          >
            <span aria-hidden="true">←</span> Back
          </button>
        )}

        {step < 2 && (
          <button
            type="button"
            className="btn-press gen-nav-go"
            style={{ ...primaryBtn, opacity: stepReady[step] ? 1 : 0.45 }}
            disabled={!stepReady[step]}
            onClick={() => setStep(step + 1)}
          >
            Continue <span aria-hidden="true">→</span>
          </button>
        )}

        {step === 2 && mode === "manual" && (
          <button
            type="button"
            className="btn-press gen-nav-go"
            style={{ ...primaryBtn, opacity: written.length ? 1 : 0.45 }}
            disabled={!written.length}
            onClick={async () => {
              const saved = await withIds(written);
              const merged = [...savedQs, ...saved];
              setSavedQs(merged);
              onGeneratedChange?.(merged);
              setWritten([]);
              setPhase("done");
            }}
          >
            Add {written.length} to bank →
          </button>
        )}

        {step === 2 && mode === "ai" && (
      <button
        type="button"
        className="btn-press gen-nav-go"
        style={{ ...primaryBtn, opacity: canGenerate ? 1 : 0.45 }}
        disabled={!canGenerate}
        onClick={async () => {
          setError("");
          const ctrl = new AbortController();
          abortRef.current = ctrl;
          setPhase("generating");
          try {
            const qs = await generateQuestions({
              file,
              pastedText,
              deck,
              category: category.trim(),
              year,
              block: block.trim() || "Principles",
              difficulty,
              count: countNum,
              signal: ctrl.signal,
            });
            setGenerated(qs);
            setKept(new Set(qs.map((_, i) => i)));
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
        }}
      >
        Generate {countNum} question{countNum !== 1 ? "s" : ""} →
      </button>
        )}
      </div>

      {/* The bank belongs to the screen, not to a step: there when you arrive,
          gone once you have started. */}
      {step === 0 && savedQs.length > 0 && (
        <section className="gen-bank">
          <div className="prog-section-head" style={{ marginBottom: 8 }}>
            <button
              type="button"
              className="gen-bank-toggle"
              onClick={() => setBankOpen(v => !v)}
            >
              <h2 style={{ ...sectionH, margin: 0 }}>In your bank</h2>
              <span className="prog-section-note">{savedQs.length}</span>
              <span className={`gen-bank-chevron${bankOpen ? " is-open" : ""}`} aria-hidden="true">▾</span>
            </button>
            <button
              type="button"
              className="gen-text-btn is-danger"
              onClick={() => {
                if (window.confirm("Delete all generated questions?")) {
                  clearAll();
                  setBankOpen(false);
                  window.location.reload();
                }
              }}
            >
              Clear all
            </button>
          </div>

          {bankOpen && (
            <ul className="gen-bank-list">
              {savedQs.map(q => (
                <li key={q.id} className="gen-bank-row">
                  <div className="gen-bank-main">
                    <span className="gen-bank-meta">{q.deck} · {q.cat}</span>
                    <span className="gen-bank-q">{q.q}</span>
                    <span className="gen-bank-ans">
                      {"ABCDE"[q.ans]} — {q.opts[q.ans]}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="gen-text-btn is-danger"
                    onClick={() => { deleteQuestion(q.id); window.location.reload(); }}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </Shell>
  );
}
