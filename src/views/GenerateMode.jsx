import { useState, useRef, useEffect, useCallback } from "react";
import JSZip from "jszip";
import { h1, sectionH, primaryBtn, chipBtn, chipBtnActive } from "../ui/theme";
import Wave from "../ui/Wave";
import { DECK_MAP } from "../data";
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

// ── Quiet generating state ──────────────────────────────────────────────────

const MESSAGES = [
  "Reading your slides…",
  "Finding the examinable bits…",
  "Drafting stems…",
  "Building distractors…",
  "Writing explanations…",
  "Almost there…",
];

/* ── The morph loader ──────────────────────────────────────────────────────
 *
 * A ring that turns while changing shape: triangle, square, pentagon, hexagon,
 * circle, back to triangle. Two of them, nested and counter-rotating.
 *
 * The trick that makes a morph look effortless is that there is no trick — the
 * browser can only interpolate one path into another if both have the same
 * commands in the same order, so every shape here is built as the same twelve
 * cubic segments and only the coordinates differ. A triangle is not three
 * lines; it is twelve points sampled around a triangle, four to an edge.
 *
 * Generated rather than hand-written, because twelve cubics per shape times
 * five shapes is 60 curves of path data that would be unreadable, unverifiable
 * and impossible to retune by hand.
 */

/** n points spaced evenly around a regular polygon's outline. */
function polyPoints(sides, r, n = 12, rot = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * sides;
    const edge = Math.floor(t);
    const f = t - edge;
    const a0 = rot + (edge / sides) * Math.PI * 2;
    const a1 = rot + ((edge + 1) / sides) * Math.PI * 2;
    const x0 = Math.cos(a0) * r, y0 = Math.sin(a0) * r;
    const x1 = Math.cos(a1) * r, y1 = Math.sin(a1) * r;
    pts.push([x0 + (x1 - x0) * f, y0 + (y1 - y0) * f]);
  }
  return pts;
}

/**
 * A closed Catmull-Rom spline through those points, written as cubics.
 *
 * Splining rather than joining them is what rounds the corners, and it is why
 * one function covers every shape: a spline through twelve points on a circle
 * is a circle, and through twelve points on a triangle is a rounded triangle.
 */
function closedSpline(pts, tension = 1) {
  const n = pts.length;
  const f = ([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`;
  let d = `M${f(pts[0])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + ((p2[0] - p0[0]) / 6) * tension, p1[1] + ((p2[1] - p0[1]) / 6) * tension];
    const c2 = [p2[0] - ((p3[0] - p1[0]) / 6) * tension, p2[1] - ((p3[1] - p1[1]) / 6) * tension];
    d += ` C${f(c1)} ${f(c2)} ${f(p2)}`;
  }
  return `${d}Z`;
}

/* 48 sides is a circle at this size — its twelve sample points land on the
   arc, and the spline through them closes the gaps. */
const SIDES = [3, 4, 5, 6, 48];

/** The cycle, returning to its first shape so the loop has no seam. */
function morphValues(r, order = SIDES) {
  const shapes = order.map(n => closedSpline(polyPoints(n, r)));
  return [...shapes, shapes[0]].join(";");
}

const MORPH_OUTER = morphValues(26);
/* The inner ring runs the sequence from a different corner, so the two are
   never the same shape at the same time. */
const MORPH_INNER = morphValues(14, [5, 6, 48, 3, 4]);

const MORPH_KEYTIMES = "0;0.2;0.4;0.6;0.8;1";
const MORPH_SPLINES = Array(5).fill("0.65 0 0.35 1").join(";");

/* Each ring's first shape, set as a plain `d`. It stops the paths being empty
   for the frame before SMIL takes over, and it is what stays on screen when
   the morph is switched off below. */
const STILL_OUTER = closedSpline(polyPoints(SIDES[0], 26));
const STILL_INNER = closedSpline(polyPoints(5, 14));

/**
 * SMIL does not honour prefers-reduced-motion — a CSS media query cannot stop
 * an <animate>, so the only way to respect the setting is to not render it.
 */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

/**
 * The generating window.
 *
 * This used to be a whole page: the setup screen was replaced by a field band
 * with the status line hanging off the top left, which put the one thing you
 * are waiting on in the corner of an otherwise empty screen. It is a centred
 * window over the form now — same scrim-and-window vocabulary as Resurface AI,
 * so the app has one way of interrupting you rather than two.
 *
 * The mark at the top is two rings that turn while changing shape, on periods
 * that do not divide into each other — 6s and 4.6s morphing against 5.2s and
 * 3.4s of rotation — so the pair never returns to an arrangement you have
 * already watched and the loop has no visible restart.
 */
function GeneratingWindow({ count, onCancel }) {
  const [msgIdx, setMsgIdx] = useState(0);
  const stillOnly = usePrefersReducedMotion();

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
        <div className="genw-stage" aria-hidden="true">
          <svg className="genw-morph is-outer" viewBox="-32 -32 64 64">
            <path className="genw-morph-path" d={STILL_OUTER}>
              {!stillOnly && (
                <animate
                  attributeName="d"
                  dur="6s"
                  repeatCount="indefinite"
                  values={MORPH_OUTER}
                  keyTimes={MORPH_KEYTIMES}
                  calcMode="spline"
                  keySplines={MORPH_SPLINES}
                />
              )}
            </path>
          </svg>

          <svg className="genw-morph is-inner" viewBox="-32 -32 64 64">
            <path className="genw-morph-path" d={STILL_INNER}>
              {!stillOnly && (
                <animate
                  attributeName="d"
                  dur="4.6s"
                  repeatCount="indefinite"
                  values={MORPH_INNER}
                  keyTimes={MORPH_KEYTIMES}
                  calcMode="spline"
                  keySplines={MORPH_SPLINES}
                />
              )}
            </path>
          </svg>
        </div>

        <p className="genw-title">
          Writing {count} question{count !== 1 ? "s" : ""}
        </p>
        <div aria-live="polite" className="genw-status-live">
          <p key={msgIdx} className="genw-status">
            {MESSAGES[msgIdx]}
          </p>
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

  const cancelGenerate = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  function deleteQuestion(id) {
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
  const existingCats = DECK_MAP[deck] || [];
  const countNum = Math.max(1, Math.min(30, parseInt(countRaw) || 0));
  const canGenerate = (file || pastedText.trim()) && category.trim() && countNum >= 1;

  // ── Review ────────────────────────────────────────────────────────────
  if (phase === "review") {
    const keptList = generated.filter((_, i) => kept.has(i));
    return (
      <Shell
        title="Review"
        sub={`${keptList.length} of ${generated.length} kept — untick anything you don’t want.`}
        footer={(
          <div className="gen-sticky">
            <div className="gen-sticky-inner">
              <button
                type="button"
                className="btn-press"
                style={{ ...primaryBtn, flex: 1 }}
                disabled={keptList.length === 0}
                onClick={async () => {
                  if (user) await remote.addGenerated(user.id, keptList);
                  const merged = [...savedQs, ...keptList];
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
      {/* Source */}
      <section className="gen-block" data-in="rise" style={{ "--i": 1 }}>
        <span style={whisper}>Source</span>
        <button
          type="button"
          className={`gen-drop${file ? " has-file" : ""}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) { setFile(f); setPastedText(""); }
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".pptx,.ppt,.pdf,.jpg,.jpeg,.png,.webp"
            style={{ display: "none" }}
            onChange={e => {
              if (e.target.files[0]) {
                setFile(e.target.files[0]);
                setPastedText("");
              }
            }}
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
            rows={4}
          />
        )}
      </section>

      {/* Placement */}
      <section className="gen-block" data-in="rise" style={{ "--i": 2 }}>
        <span style={whisper}>Where they belong</span>
        <div className="gen-grid">
          <label className="gen-field">
            <span className="gen-field-label">Subject</span>
            <select
              value={deck}
              onChange={e => { setDeck(e.target.value); setCategory(""); }}
              style={{ ...field, cursor: "pointer" }}
            >
              {decks.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="gen-field">
            <span className="gen-field-label">Topic</span>
            <input
              type="text"
              value={category}
              onChange={e => setCategory(e.target.value)}
              placeholder={existingCats[0] || "e.g. Glycolysis"}
              list="gen-cat-suggestions"
              style={field}
              required
            />
            <datalist id="gen-cat-suggestions">
              {existingCats.map(c => <option key={c} value={c} />)}
            </datalist>
          </label>
          <label className="gen-field">
            <span className="gen-field-label">Year</span>
            <select value={year} onChange={e => setYear(e.target.value)} style={{ ...field, cursor: "pointer" }}>
              {["Year 1", "Year 2", "Year 3", "Year 4", "Year 5"].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
          <label className="gen-field">
            <span className="gen-field-label">Block</span>
            <input
              type="text"
              value={block}
              onChange={e => setBlock(e.target.value)}
              placeholder="e.g. Principles"
              list="gen-block-suggestions"
              style={field}
            />
            <datalist id="gen-block-suggestions">
              {["Principles", "Clinical", "Pathology", "Pharmacology", "Anatomy", "Physiology"].map(b => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </label>
        </div>
      </section>

      {/* Difficulty + count */}
      <section className="gen-block" data-in="rise" style={{ "--i": 3 }}>
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
              {!COUNT_PRESETS.includes(countNum) && (
                <span className="gen-count-custom">{countNum}</span>
              )}
            </div>
            <label className="gen-count-edit">
              <span className="gen-field-label">Or type</span>
              <input
                type="text"
                inputMode="numeric"
                value={countRaw}
                onChange={e => setCountRaw(e.target.value.replace(/\D/g, ""))}
                onBlur={() => setCountRaw(String(countNum || 10))}
                style={{ ...field, width: 72, textAlign: "center" }}
              />
            </label>
          </div>
        </div>
      </section>

      {error && <p className="gen-error">{error}</p>}

      <button
        type="button"
        className="btn-press"
        style={{ ...primaryBtn, width: "100%", opacity: canGenerate ? 1 : 0.45 }}
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

      {/* Bank */}
      {savedQs.length > 0 && (
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
