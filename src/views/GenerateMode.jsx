import { useState, useRef, useEffect } from "react";
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

const MAX_FILE_BYTES = 3 * 1024 * 1024;

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

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function generateQuestions({ file, pastedText, deck, category, year, block, difficulty, count }) {
  let userContent = [];

  if (file) {
    const ext = file.name.split(".").pop().toLowerCase();

    if (ext !== "pptx" && ext !== "ppt" && file.size > MAX_FILE_BYTES) {
      throw new Error(`That file is ${(file.size / 1024 / 1024).toFixed(1)}MB — the limit is 3MB. Try splitting it or pasting the text instead.`);
    }

    if (ext === "pptx" || ext === "ppt") {
      const text = await extractPptx(file);
      userContent = [{ type: "text", text: `Topic: ${deck} / ${category}\n\n${text}` }];
    } else if (ext === "pdf") {
      const b64 = await fileToBase64(file);
      userContent = [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
        { type: "text", text: `Topic: ${deck} / ${category}` },
      ];
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

function GeneratingScreen({ count }) {
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setMsgIdx(i => (i + 1) % MESSAGES.length), 2400);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "var(--app-vh)" }}>
      <div style={{ ...band, paddingTop: "clamp(22px, 3.6vh, 36px)", paddingBottom: "clamp(28px, 4vh, 48px)" }}>
        <h1 data-in="left" style={{ ...h1, margin: 0, "--i": 0 }}>Generating</h1>
        <p className="gen-field-sub">
          {count} question{count !== 1 ? "s" : ""} from your material
        </p>
        <p key={msgIdx} className="gen-status">
          {MESSAGES[msgIdx]}
        </p>
        <div className="gen-bar" aria-hidden="true">
          <div className="gen-bar-fill" />
        </div>
      </div>
      <Wave from="transparent" to="var(--c-card-solid)" />
      <div style={{ background: "var(--c-card-solid)", flex: 1 }} />
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
  const [generated, setGenerated] = useState([]);
  const [kept, setKept] = useState(new Set());
  const [error, setError] = useState("");
  const fileRef = useRef();

  const [savedQs, setSavedQs] = useState(savedGenerated);
  const [bankOpen, setBankOpen] = useState(false);

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

  if (phase === "generating") return <GeneratingScreen count={countNum} />;

  // ── Setup ─────────────────────────────────────────────────────────────
  return (
    <Shell
      title="Generate"
      sub="Drop slides or notes — Resurface writes the questions."
      maxWidth={680}
    >
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
            });
            setGenerated(qs);
            setKept(new Set(qs.map((_, i) => i)));
            setPhase("review");
          } catch (e) {
            setError(e.message || "Something went wrong.");
            setPhase("setup");
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
