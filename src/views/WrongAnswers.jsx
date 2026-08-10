import { useState, useMemo } from "react";
import { C, pageWrap, card, h1, primaryBtn, selectBtn, label as labelStyle, pageSub } from "../ui/theme";
import { QUESTIONS } from "../data";
import { shuffle, shuffleOptions } from "../ui/theme";
import ProgressBar from "../ui/ProgressBar";
import QuestionCard from "../ui/QuestionCard";
import Dropdown from "../ui/Dropdown";

export default function WrongAnswers({ pStats, bookmarks, onAnswer, onToggleBookmark }) {
  const [cat, setCat] = useState("All");
  const [queue, setQueue] = useState(null);
  const [idx, setIdx] = useState(0);
  const [sels, setSels] = useState({});
  const [sC, setSC] = useState(0);
  const [sT, setST] = useState(0);
  const [showDD, setDD] = useState(false);
  const [allCleared, setAllCleared] = useState(false);

  // Questions with a success rate below 60%, sorted worst accuracy first
  const wrongQs = useMemo(() =>
    QUESTIONS.filter(q => {
      const s = pStats[q.id];
      return s && s.total > 0 && (s.correct / s.total) < 0.6;
    }).sort((a, b) => {
      const sa = pStats[a.id], sb = pStats[b.id];
      return (sa.correct / sa.total) - (sb.correct / sb.total);
    }),
  [pStats]);

  const filtered = cat === "All" ? wrongQs : wrongQs.filter(q => q.cat === cat);
  const cats = [...new Set(wrongQs.map(q => q.cat))];

  function start() {
    setQueue(shuffle(filtered).map(shuffleOptions));
    setIdx(0); setSels({}); setSC(0); setST(0); setAllCleared(false);
  }

  function handleAnswer(i) {
    if (sels[idx] !== undefined || !queue) return;
    const q = queue[idx];
    const correct = i === q.ans;
    setSels(prev => ({ ...prev, [idx]: i }));
    setST(t => t + 1); if (correct) setSC(c => c + 1);
    onAnswer(q.id, correct);
  }

  function handleNext() {
    if (!queue) return;
    if (idx + 1 >= queue.length) {
      if (filtered.length === 0) {
        setQueue(null); setAllCleared(true);
      } else {
        setQueue(shuffle(filtered).map(shuffleOptions));
        setIdx(0); setSels({});
      }
      return;
    }
    setIdx(i => i + 1);
  }

  function exitSession() {
    setQueue(null); setAllCleared(false); setSels({}); setSC(0); setST(0);
  }

  function handleBack() {
    if (idx > 0) setIdx(i => i - 1);
  }

  // All cleared
  if (allCleared) {
    return (
      <div style={pageWrap}>
        <h1 className="anim-fade-up delay-0" style={h1}>Wrong Answers</h1>
        <div className="anim-scale-in delay-100" style={{ ...card, textAlign: "center", padding: "56px 32px" }}>
          <div className="anim-pop delay-200" style={{ fontSize: 56, color: C.success }}>✓</div>
          <div className="anim-fade-up delay-300" style={{ fontSize: 18, color: C.text, marginTop: 12, fontWeight: 600, letterSpacing: -0.3 }}>All cleared!</div>
          <div className="anim-fade-up delay-400" style={{ fontSize: 14, color: C.muted, marginTop: 6 }}>Every question is now above 60% accuracy.</div>
          <button className="anim-fade-up delay-500 hover-lift btn-press" style={{ ...primaryBtn, marginTop: 24 }} onClick={() => setAllCleared(false)}>
            Back to Menu
          </button>
        </div>
      </div>
    );
  }

  // Empty state
  if (wrongQs.length === 0) {
    return (
      <div style={pageWrap}>
        <h1 className="anim-fade-up delay-0" style={h1}>Wrong Answers</h1>
        <div className="anim-scale-in delay-100" style={{ ...card, textAlign: "center", padding: "64px 32px" }}>
          <div className="anim-pop delay-300" style={{ fontSize: 48, marginBottom: 16 }}>🎯</div>
          <div className="anim-fade-up delay-400" style={{ fontWeight: 600, fontSize: 22, color: C.text, letterSpacing: -0.4 }}>No mistakes yet!</div>
          <div className="anim-fade-up delay-500" style={{ color: C.muted, marginTop: 8, fontSize: 15, fontWeight: 500 }}>
            Questions you answer incorrectly will appear here for targeted revision.
          </div>
        </div>
      </div>
    );
  }

  // Active session
  if (queue) {
    const q = queue[idx];
    const sel = sels[idx] ?? null;
    const pct = sT > 0 ? Math.round(sC / sT * 100) : null;
    const isBookmarked = bookmarks.includes(q?.id);
    const prevStat = pStats[q?.id];
    const prevPct = prevStat ? Math.round(prevStat.correct / prevStat.total * 100) : null;

    return (
      <div style={pageWrap}>
        <div className="anim-fade-down delay-0" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={h1}>Wrong Answers</h1>
            <p style={pageSub}>
              {cat === "All" ? "All topics" : cat}
            </p>
          </div>
          {pct !== null && (
            <div className="anim-scale-in delay-100" style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 32, fontWeight: 600, color: pct >= 70 ? C.success : C.warning, lineHeight: 1, letterSpacing: -1 }}>{pct}%</div>
              <div style={{ fontSize: 12, color: C.muted }}>{sC}/{sT} this session</div>
            </div>
          )}
        </div>

        <div className="anim-fade-up delay-50" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {idx > 0 && (
            <button onClick={handleBack} className="hover-lift btn-press" style={{
              flexShrink: 0, background: "none", border: "1px solid var(--c-border)",
              borderRadius: "var(--r-pill)", padding: "5px 10px", color: C.muted, fontSize: 14,
              cursor: "pointer", fontFamily: "inherit",
            }}>←</button>
          )}
          <ProgressBar value={(idx + 1) / queue.length * 100} colour={C.danger} />
          <span style={{ fontSize: 13, color: C.muted, whiteSpace: "nowrap" }}>{idx + 1}/{queue.length}</span>
          <button onClick={exitSession} className="btn-press" style={{
            flexShrink: 0, background: "none", border: "1px solid var(--c-border)",
            borderRadius: "var(--r-pill)", padding: "5px 12px", color: C.muted, fontSize: 13,
            cursor: "pointer", fontFamily: "inherit",
          }}>Exit</button>
        </div>

        {/* Previous accuracy badge */}
        {prevPct !== null && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 13, color: C.muted,
          }}>
            <span>Previous accuracy:</span>
            <span style={{ fontWeight: 600, color: prevPct >= 60 ? C.success : C.danger }}>{prevPct}%</span>
          </div>
        )}

        <QuestionCard q={q} sel={sel} onAnswer={handleAnswer} onNext={handleNext}
          onToggleBookmark={() => onToggleBookmark(q.id)} isBookmarked={isBookmarked}
          isLast={idx + 1 >= queue.length} nextLabel="Next question"
          onSaveEdit={updated => setQueue(prev => prev.map((item, i) => i === idx ? { ...item, ...updated } : item))} />
      </div>
    );
  }

  // Setup screen
  return (
    <div style={pageWrap}>
      <div className="anim-fade-up delay-0">
        <h1 style={h1}>Wrong Answers</h1>
        <p style={pageSub}>
          Targeted revision of your weakest questions.
        </p>
      </div>

      {/* Summary stat */}
      <div className="anim-scale-in delay-100" style={{
        ...card,
        border: `1px solid ${C.dangerBrd}`,
        borderLeft: `3px solid ${C.danger}`,
        display: "flex", alignItems: "center", gap: 20,
      }}>
        <div style={{ fontSize: 48, fontWeight: 600, color: C.danger, lineHeight: 1, letterSpacing: -2 }}>{wrongQs.length}</div>
        <div>
          <div style={{ fontSize: 16, color: C.text, fontWeight: 600, letterSpacing: -0.2 }}>questions need revision</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 3 }}>
            sorted by worst accuracy first
          </div>
        </div>
      </div>

      <div className="anim-fade-up delay-200" style={{ ...card, position: "relative", zIndex: 10 }}>
        {/* Category filter */}
        <div style={{ marginBottom: 20 }}>
          <div style={labelStyle}>Filter by topic</div>
          <div style={{ position: "relative" }}>
            <button className="hover-lift btn-press" style={{ ...selectBtn, borderColor: cat !== "All" ? C.dangerBrd : "var(--c-border)", color: cat !== "All" ? C.danger : C.text }}
              onClick={() => setDD(v => !v)}>
              <span>{cat}</span>
              <span style={{ marginLeft: "auto", color: C.muted, fontSize: 13 }}>▾</span>
            </button>
            {showDD && (
              <Dropdown
                items={["All", ...cats]}
                active={cat}
                onSelect={c => { setCat(c); setDD(false); }}
              />
            )}
          </div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 8 }}>
            {filtered.length} question{filtered.length !== 1 ? "s" : ""} in this selection
          </div>
        </div>

        <button className="hover-lift btn-press"
          style={{ ...primaryBtn, width: "100%", background: C.danger, boxShadow: "0 12px 30px rgba(214, 69, 69, 0.22)" }}
          onClick={start}
          disabled={filtered.length === 0}
        >
          Start Revision →
        </button>
      </div>

      {/* Worst categories preview */}
      {cats.length > 0 && (
        <div className="anim-fade-up delay-300" style={card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.muted, letterSpacing: -0.2, textTransform: "uppercase", marginBottom: 16 }}>Weakest Topics</div>
          {cats.slice(0, 5).map((c, i) => {
            const qs = wrongQs.filter(q => q.cat === c);
            const totalC = qs.reduce((s, q) => s + (pStats[q.id]?.correct || 0), 0);
            const totalT = qs.reduce((s, q) => s + (pStats[q.id]?.total || 0), 0);
            const pct = totalT > 0 ? Math.round(totalC / totalT * 100) : 0;
            return (
              <div key={c} className={`anim-fade-up delay-${300 + i * 50}`} style={i > 0 ? { borderTop: "1px solid var(--c-border)", paddingTop: 12, marginTop: 12 } : {}}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 14, color: C.text, fontWeight: 600, letterSpacing: -0.15 }}>{c}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: pct < 50 ? C.danger : C.warning }}>{pct}% · {qs.length} wrong</span>
                </div>
                <ProgressBar value={pct} colour={pct < 50 ? C.danger : C.warning} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
