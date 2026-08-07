import { useState, useRef, useEffect } from "react";
import JSZip from "jszip";
import { C, pageWrap, card, h1, h2, primaryBtn, chipBtn, chipBtnActive } from "../ui/theme";
import { DECK_MAP } from "../data";
import { generatedStore, passcodeStore } from "../lib/storage";

// Generation lives in resurface-backend; this is the only place the app talks
// to it. Falls back to the backend's local dev port.
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";

// Vercel serverless functions cap request bodies at 4.5MB, and base64 inflates
// a file by ~33%, so anything over ~3MB will be rejected at the edge.
const MAX_FILE_BYTES = 3 * 1024 * 1024;

const DIFFICULTIES = [
  { k: "easy",   label: "Easy",   desc: "Single-fact recall — locations, products, enzyme names" },
  { k: "medium", label: "Medium", desc: "Mechanism & application — why/what would happen if..." },
  { k: "hard",   label: "Hard",   desc: "Clinical vignettes — every question opens with a patient scenario" },
];

// ── File extraction helpers ─────────────────────────────────────────────────

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

// ── Question generation ─────────────────────────────────────────────────────
// The file is parsed here (browser-only work), then handed to /api/generate,
// which holds the API key and builds the prompt server-side.

async function generateQuestions({ file, pastedText, deck, category, year, block, difficulty, count }) {
  let userContent = [];

  if (file) {
    const ext = file.name.split(".").pop().toLowerCase();

    // pptx is extracted to plain text below, so only the binary paths (which
    // get base64'd and forwarded whole) are bound by the request size cap.
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
        { type: "text", text: `Topic: ${deck} / ${category}` }
      ];

    } else if (["jpg","jpeg","png","gif","webp"].includes(ext)) {
      const b64 = await fileToBase64(file);
      const mt = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : "image/webp";
      userContent = [
        { type: "image", source: { type: "base64", media_type: mt, data: b64 } },
        { type: "text", text: `Topic: ${deck} / ${category}` }
      ];
    }
  } else if (pastedText.trim()) {
    userContent = [{ type: "text", text: `Topic: ${deck} / ${category}\n\n${pastedText}` }];
  }

  if (!userContent.length) throw new Error("No content to generate from.");

  const res = await fetch(`${API_BASE}/api/generate`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-resurface-passcode": passcodeStore.get(),
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

  if (!Array.isArray(parsed)) throw new Error("Expected a JSON array from Claude.");

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

// ── Generating animation ────────────────────────────────────────────────────

const MESSAGES = [
  "Reading your slides...",
  "Identifying key concepts...",
  "Drafting question stems...",
  "Building plausible distractors...",
  "Writing answer explanations...",
  "Checking the science...",
  "Adding why-wrong notes...",
  "Polishing the questions...",
  "Almost there...",
];

const FLOATERS = ["?", "?", "?", "✦", "?", "?", "✦", "?"];

const KEYFRAMES = `
@keyframes orb-pulse {
  0%, 100% { transform: scale(1); opacity: 0.7; }
  50% { transform: scale(1.18); opacity: 1; }
}
@keyframes orbit {
  from { transform: rotate(0deg) translateX(54px) rotate(0deg); }
  to   { transform: rotate(360deg) translateX(54px) rotate(-360deg); }
}
@keyframes orbit2 {
  from { transform: rotate(120deg) translateX(54px) rotate(-120deg); }
  to   { transform: rotate(480deg) translateX(54px) rotate(-480deg); }
}
@keyframes orbit3 {
  from { transform: rotate(240deg) translateX(54px) rotate(-240deg); }
  to   { transform: rotate(600deg) translateX(54px) rotate(-600deg); }
}
@keyframes floatup {
  0%   { transform: translateY(0) scale(1); opacity: 0.7; }
  100% { transform: translateY(-120px) scale(0.5); opacity: 0; }
}
@keyframes msg-fade {
  0%   { opacity: 0; transform: translateY(8px); }
  15%  { opacity: 1; transform: translateY(0); }
  80%  { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-8px); }
}
@keyframes bar-slide {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(400%); }
}
`;

function GeneratingScreen({ count }) {
  const [msgIdx, setMsgIdx] = useState(0);
  const [floaters, setFloaters] = useState([]);

  useEffect(() => {
    const msgInterval = setInterval(() => {
      setMsgIdx(i => (i + 1) % MESSAGES.length);
    }, 2200);

    const floatInterval = setInterval(() => {
      const id = Date.now();
      const sym = FLOATERS[Math.floor(Math.random() * FLOATERS.length)];
      const left = 10 + Math.random() * 80;
      setFloaters(f => [...f.slice(-6), { id, sym, left }]);
      setTimeout(() => setFloaters(f => f.filter(x => x.id !== id)), 2500);
    }, 600);

    return () => { clearInterval(msgInterval); clearInterval(floatInterval); };
  }, []);

  return (
    <div style={{ ...pageWrap, alignItems: "center", justifyContent: "center", minHeight: "calc(var(--app-vh) * 0.7)", position: "relative", overflow: "hidden" }}>
      <style>{KEYFRAMES}</style>

      {/* Floating question marks */}
      {floaters.map(f => (
        <div key={f.id} style={{
          position: "absolute", bottom: "30%", left: `${f.left}%`,
          fontSize: 22, color: C.accent, opacity: 0.7, pointerEvents: "none",
          animation: "floatup 2.5s ease-out forwards",
        }}>{f.sym}</div>
      ))}

      {/* Orb */}
      <div style={{ position: "relative", width: 130, height: 130, marginBottom: 40 }}>
        {/* Glow */}
        <div style={{
          position: "absolute", inset: -20,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(77,142,245,0.35) 0%, transparent 70%)",
          animation: "orb-pulse 2s ease-in-out infinite",
        }} />
        {/* Core orb */}
        <div style={{
          width: 130, height: 130, borderRadius: "50%",
          background: "radial-gradient(circle at 35% 35%, #7ab0ff, #2563eb 60%, #1a3a8f)",
          boxShadow: "0 0 40px rgba(77,142,245,0.6), 0 0 80px rgba(77,142,245,0.3)",
          display: "flex", alignItems: "center", justifyContent: "center",
          animation: "orb-pulse 2s ease-in-out infinite",
          fontSize: 36,
        }}>✦</div>

        {/* Orbiting dots */}
        {[
          { anim: "orbit 2.4s linear infinite", color: C.accentLt },
          { anim: "orbit2 2.4s linear infinite", color: C.success },
          { anim: "orbit3 2.4s linear infinite", color: C.warning },
        ].map((dot, i) => (
          <div key={i} style={{
            position: "absolute", top: "50%", left: "50%",
            width: 10, height: 10, marginTop: -5, marginLeft: -5,
            animation: dot.anim,
          }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: dot.color, boxShadow: `0 0 8px ${dot.color}` }} />
          </div>
        ))}
      </div>

      {/* Title */}
      <div style={{ fontSize: 22, fontWeight: 400, color: C.text, marginBottom: 8 }}>
        Generating {count} questions
      </div>

      {/* Rotating message */}
      <div key={msgIdx} style={{
        fontSize: 15, color: C.accent, marginBottom: 32, height: 22,
        animation: "msg-fade 2.2s ease forwards",
      }}>
        {MESSAGES[msgIdx]}
      </div>

      {/* Indeterminate progress bar */}
      <div style={{ width: 280, height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: "40%", borderRadius: 99,
          background: "linear-gradient(90deg, transparent, #4d8ef5, #7ab0ff, #4d8ef5, transparent)",
          animation: "bar-slide 1.6s ease-in-out infinite",
        }} />
      </div>
    </div>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

export default function GenerateMode() {
  const [file, setFile] = useState(null);
  const [pastedText, setPastedText] = useState("");
  const [deck, setDeck] = useState(Object.keys(DECK_MAP)[0]);
  const [category, setCategory] = useState("");
  const [year, setYear] = useState("Year 1");
  const [block, setBlock] = useState("Principles");
  const [difficulty, setDifficulty] = useState("medium");

  const [phase, setPhase] = useState("setup"); // setup | generating | review | done
  const [generated, setGenerated] = useState([]);
  const [kept, setKept] = useState(new Set());
  const [error, setError] = useState("");
  const [countRaw, setCountRaw] = useState("10"); // string so user can clear and retype
  const fileRef = useRef();

  const [savedQs, setSavedQs] = useState(() => generatedStore.load());
  const [bankOpen, setBankOpen] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);
  const [codeInput, setCodeInput] = useState(() => passcodeStore.get());

  function deleteQuestion(id) {
    const updated = savedQs.filter(q => q.id !== id);
    generatedStore.save(updated);
    setSavedQs(updated);
  }

  function clearAll() {
    generatedStore.clear();
    setSavedQs([]);
  }

  const decks = Object.keys(DECK_MAP);
  const existingCats = DECK_MAP[deck] || [];
  const countNum = Math.max(1, Math.min(30, parseInt(countRaw) || 0));

  // ── Review phase ──────────────────────────────────────────────────────
  if (phase === "review") {
    const keptList = generated.filter((_, i) => kept.has(i));
    return (
      <div style={pageWrap}>
        <h1 className="anim-fade-up delay-0" style={h1}>Review Questions</h1>
        <p className="anim-fade-up delay-50" style={{ color: C.sub, fontSize: 15, marginTop: 4 }}>
          Untick any questions you don't want to keep. {keptList.length}/{generated.length} selected.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {generated.map((q, i) => {
            const isKept = kept.has(i);
            return (
              <div key={i} className="anim-fade-up" style={{
                ...card, padding: "18px 20px",
                opacity: isKept ? 1 : 0.4,
                borderColor: isKept ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.03)",
                transition: "opacity 0.2s",
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                  <input type="checkbox" checked={isKept} onChange={() => {
                    setKept(prev => {
                      const s = new Set(prev);
                      s.has(i) ? s.delete(i) : s.add(i);
                      return s;
                    });
                  }} style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0, accentColor: C.accent, cursor: "pointer" }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: C.text, lineHeight: 1.6, marginBottom: 10 }}>{q.q}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {q.opts.map((opt, oi) => (
                        <div key={oi} style={{
                          fontSize: 14, padding: "6px 10px", borderRadius: 8,
                          background: oi === q.ans ? C.successDim : "rgba(255,255,255,0.02)",
                          border: `1px solid ${oi === q.ans ? C.successBrd : "rgba(255,255,255,0.05)"}`,
                          color: oi === q.ans ? C.success : C.sub,
                          display: "flex", gap: 8,
                        }}>
                          <span style={{ fontWeight: 700, fontFamily: "monospace" }}>{"ABCDE"[oi]}</span>
                          <span>{opt}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 10, fontSize: 13, color: C.muted, lineHeight: 1.6 }}>{q.exp}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 10, position: "sticky", bottom: 20 }}>
          <button className="hover-lift btn-press" style={{ ...primaryBtn, flex: 1 }}
            disabled={keptList.length === 0}
            onClick={() => {
              generatedStore.add(keptList);
              setPhase("done");
            }}>
            Add {keptList.length} Question{keptList.length !== 1 ? "s" : ""} to Bank →
          </button>
          <button className="hover-lift btn-press" onClick={() => { setPhase("setup"); setGenerated([]); }} style={{
            padding: "11px 18px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)",
            background: "transparent", color: C.sub, fontSize: 15, cursor: "pointer", fontFamily: "inherit",
          }}>Start Over</button>
        </div>
      </div>
    );
  }

  // ── Done phase ─────────────────────────────────────────────────────────
  if (phase === "done") {
    return (
      <div style={pageWrap}>
        <h1 className="anim-fade-up delay-0" style={h1}>AI Generate</h1>
        <div className="anim-scale-in delay-100" style={{ ...card, textAlign: "center", padding: "48px 32px" }}>
          <div className="anim-pop delay-200" style={{ fontSize: 52, marginBottom: 16 }}>✓</div>
          <div style={{ fontSize: 17, color: C.text, fontWeight: 500, marginBottom: 8 }}>Questions added!</div>
          <div style={{ fontSize: 14, color: C.muted, marginBottom: 24 }}>
            Reload the page to see them in Practice, Flashcards, and all other modes.
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button className="hover-lift btn-press" style={primaryBtn} onClick={() => window.location.reload()}>
              Reload App
            </button>
            <button className="hover-lift btn-press" onClick={() => { setPhase("setup"); setGenerated([]); setFile(null); setPastedText(""); }} style={{
              padding: "11px 18px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)",
              background: "transparent", color: C.sub, fontSize: 15, cursor: "pointer", fontFamily: "inherit",
            }}>Generate More</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Generating phase ──────────────────────────────────────────────────
  if (phase === "generating") return <GeneratingScreen count={countNum} />;

  // ── Setup phase ────────────────────────────────────────────────────────
  const canGenerate = (file || pastedText.trim()) && category.trim() && countNum >= 1;

  const inputStyle = {
    width: "100%", background: C.surface2, border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12, padding: "10px 14px", color: C.text, fontSize: 15,
    fontFamily: "inherit", outline: "none", boxSizing: "border-box",
  };
  const labelStyle2 = { fontSize: 13, color: C.muted, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 };

  return (
    <div style={pageWrap}>
      <div className="anim-fade-up delay-0">
        <h1 style={h1}>AI Generate</h1>
        <p style={{ color: C.sub, fontSize: 15, marginTop: 4, fontWeight: 300 }}>Upload your slides and Claude will write questions for you.</p>
      </div>

      {/* Single card with all settings */}
      <div className="anim-fade-up delay-50" style={card}>

        {/* Drop zone */}
        <div
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${file ? C.accentBrd : "rgba(255,255,255,0.1)"}`,
            borderRadius: 12, padding: file ? "16px 20px" : "22px 20px",
            textAlign: "center", cursor: "pointer", transition: "all 0.2s",
            background: file ? C.accentDim : "transparent", marginBottom: 16,
          }}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { setFile(f); setPastedText(""); } }}
        >
          <input ref={fileRef} type="file" accept=".pptx,.ppt,.pdf,.jpg,.jpeg,.png,.webp" style={{ display: "none" }}
            onChange={e => { if (e.target.files[0]) { setFile(e.target.files[0]); setPastedText(""); } }} />
          {file ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
              <span style={{ fontSize: 20 }}>📎</span>
              <span style={{ fontSize: 15, color: C.accent, fontWeight: 500 }}>{file.name}</span>
              <button onClick={e => { e.stopPropagation(); setFile(null); }} style={{
                background: "none", border: "none", color: C.muted, fontSize: 13, cursor: "pointer", marginLeft: 4,
              }}>✕</button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 14, color: C.sub }}>⬆ Drop a file or click to browse</div>
              <div style={{ fontSize: 13, color: C.mutedDim, marginTop: 3 }}>PowerPoint, PDF, or image</div>
            </div>
          )}
        </div>

        {!file && (
          <textarea
            value={pastedText}
            onChange={e => setPastedText(e.target.value)}
            placeholder="Or paste lecture notes / slide text here..."
            rows={4}
            style={{ ...inputStyle, resize: "vertical", marginBottom: 20 }}
          />
        )}

        {/* Year + Block row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <div style={labelStyle2}>Year</div>
            <select value={year} onChange={e => setYear(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
              {["Year 1","Year 2","Year 3","Year 4","Year 5"].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <div style={labelStyle2}>Block</div>
            <input
              type="text" value={block} onChange={e => setBlock(e.target.value)}
              placeholder="e.g. Principles"
              list="block-suggestions"
              style={inputStyle}
            />
            <datalist id="block-suggestions">
              {["Principles","Clinical","Pathology","Pharmacology","Anatomy","Physiology"].map(b => <option key={b} value={b} />)}
            </datalist>
          </div>
        </div>

        {/* Subject + count row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 12, marginBottom: 16 }}>
          <div>
            <div style={labelStyle2}>Subject</div>
            <select value={deck} onChange={e => { setDeck(e.target.value); setCategory(""); }} style={{ ...inputStyle, cursor: "pointer" }}>
              {decks.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <div style={labelStyle2}>Questions</div>
            <input
              type="text"
              inputMode="numeric"
              value={countRaw}
              onChange={e => setCountRaw(e.target.value.replace(/\D/g, ""))}
              onBlur={() => setCountRaw(String(countNum || 10))}
              style={inputStyle}
            />
          </div>
        </div>

        {/* Topic */}
        <div style={{ marginBottom: 16 }}>
          <div style={labelStyle2}>Topic</div>
          <input
            type="text" value={category} onChange={e => setCategory(e.target.value)}
            placeholder={existingCats[0] || "e.g. Glycolysis & Bioenergetics"}
            list="cat-suggestions"
            style={inputStyle}
          />
          <datalist id="cat-suggestions">
            {existingCats.map(c => <option key={c} value={c} />)}
          </datalist>
        </div>

        {/* Difficulty */}
        <div>
          <div style={labelStyle2}>Difficulty</div>
          <div style={{ display: "flex", gap: 8 }}>
            {DIFFICULTIES.map(d => (
              <button key={d.k} onClick={() => setDifficulty(d.k)}
                className="hover-lift btn-press"
                style={{
                  ...chipBtn, ...(difficulty === d.k ? chipBtnActive : {}),
                  flex: 1, textAlign: "center", padding: "9px 8px", fontSize: 14, fontWeight: 600,
                }}>
                {d.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 13, color: C.mutedDim, marginTop: 7 }}>
            {DIFFICULTIES.find(d => d.k === difficulty)?.desc}
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: "12px 16px", background: C.dangerDim, border: `1px solid ${C.dangerBrd}`, borderRadius: 12, fontSize: 14, color: C.danger }}>
          {error}
        </div>
      )}

      {needsCode && (
        <div style={card}>
          <div style={{ fontSize: 14, color: C.muted, marginBottom: 10 }}>
            Enter the access code to use question generation.
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              type="password"
              value={codeInput}
              onChange={e => setCodeInput(e.target.value)}
              placeholder="Access code"
              style={{
                flex: 1, padding: "10px 14px", borderRadius: 10, fontSize: 14,
                background: C.surface2, color: C.text, fontFamily: "inherit",
                border: `1px solid ${C.border}`,
              }}
            />
            <button
              className="btn-press"
              style={{ ...primaryBtn, width: "auto", paddingLeft: 20, paddingRight: 20 }}
              onClick={() => {
                passcodeStore.set(codeInput.trim());
                setNeedsCode(false);
                setError("");
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}

      <button
        className="hover-lift btn-press"
        style={{ ...primaryBtn, width: "100%", opacity: canGenerate ? 1 : 0.4 }}
        disabled={!canGenerate}
        onClick={async () => {
          setError("");
          setPhase("generating");
          try {
            const qs = await generateQuestions({ file, pastedText, deck, category: category.trim(), year, block: block.trim() || "Principles", difficulty, count: countNum });
            setGenerated(qs);
            setKept(new Set(qs.map((_, i) => i)));
            setPhase("review");
          } catch (e) {
            if (e.status === 401) setNeedsCode(true);
            setError(e.message || "Something went wrong.");
            setPhase("setup");
          }
        }}
      >
        Generate {countNum} Question{countNum !== 1 ? "s" : ""} →
      </button>

      {/* Generated questions bank */}
      {savedQs.length > 0 && (
        <div className="anim-fade-up" style={card}>
          <button onClick={() => setBankOpen(v => !v)} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            width: "100%", background: "none", border: "none", cursor: "pointer",
            padding: 0, fontFamily: "inherit",
          }}>
            <span style={{ ...h2, marginTop: 0, marginBottom: 0 }}>
              Generated Questions ({savedQs.length})
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 12, color: C.danger, cursor: "pointer" }}
                onClick={e => { e.stopPropagation(); if (window.confirm("Delete all generated questions?")) { clearAll(); setBankOpen(false); window.location.reload(); } }}>
                Clear all
              </span>
              <span style={{ color: C.muted, fontSize: 14, transition: "transform 0.2s", display: "inline-block", transform: bankOpen ? "rotate(180deg)" : "none" }}>▾</span>
            </div>
          </button>

          {bankOpen && (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              {savedQs.map(q => (
                <div key={q.id} style={{
                  display: "flex", alignItems: "flex-start", gap: 12,
                  padding: "12px 14px", borderRadius: 12,
                  background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: C.accent, marginBottom: 4 }}>{q.deck} · {q.cat}</div>
                    <div style={{ fontSize: 14, color: C.text, lineHeight: 1.55 }}>{q.q}</div>
                    <div style={{ fontSize: 13, color: C.success, marginTop: 4 }}>
                      ✓ {"ABCDE"[q.ans]} — {q.opts[q.ans]}
                    </div>
                  </div>
                  <button onClick={() => { deleteQuestion(q.id); window.location.reload(); }} style={{
                    flexShrink: 0, background: "none", border: "1px solid rgba(245,101,101,0.2)",
                    borderRadius: 8, padding: "4px 10px", color: C.danger, fontSize: 13,
                    cursor: "pointer", fontFamily: "inherit",
                  }}>Delete</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
