import { useState, useMemo } from "react";
import { C, pageWrap, card, h1, fieldBtn, chipBtn, chipBtnActive, label as labelStyle } from "../ui/theme";
import { QUESTIONS } from "../data";
import { shuffle, shuffleOptions } from "../ui/theme";
import { isDue, getNextIntervals } from "../lib/sm2";
import ProgressBar from "../ui/ProgressBar";
import CatTag from "../ui/CatTag";
import BmBtn from "../ui/BmBtn";
import FilterPanel, { filteredQuestions, defaultFilter } from "../ui/FilterPanel";

const COUNT_OPTIONS = [10, 20, 50, "All"];

const RATINGS = [
  { label: "Again", quality: 1, col: C.danger,  dim: C.dangerDim,  brd: C.dangerBrd },
  { label: "Hard",  quality: 2, col: C.warning, dim: C.warningDim, brd: C.warningBrd },
  { label: "Good",  quality: 3, col: C.success, dim: C.successDim, brd: C.successBrd },
  { label: "Easy",  quality: 4, col: C.accent,  dim: C.accentDim,  brd: C.accentBrd },
];

export default function SRMode({ pStats, srCards, bookmarks, onReview, onToggleBookmark, launchFilter }) {
  const allDue = useMemo(() => shuffle(QUESTIONS.filter(q => isDue(srCards[q.id]))), [srCards]);
  const [filter, setFilter] = useState(launchFilter
    ? { year: ["All"], block: ["All"], deck: launchFilter.deck ? [launchFilter.deck] : ["All"], cat: launchFilter.cat ? [launchFilter.cat] : ["All"], unseenOnly: false }
    : defaultFilter
  );
  const [countOpt, setCountOpt] = useState("All");
  const [sessionQueue, setSessionQueue] = useState(null); // front = current card
  const [totalCards, setTotalCards] = useState(0);
  const [cleared, setCleared] = useState(0);             // graduated (Good/Easy)
  const [learningIds, setLearningIds] = useState(new Set()); // cards re-queued (Again/Hard-new)
  const [revealed, setRev] = useState(false);

  const filteredDue = useMemo(() => {
    const validIds = new Set(filteredQuestions(filter, pStats).map(q => q.id));
    return allDue.filter(q => validIds.has(q.id));
  }, [allDue, filter, pStats]);

  function startSession() {
    const q = (countOpt === "All" ? filteredDue : filteredDue.slice(0, Math.min(countOpt, filteredDue.length))).map(shuffleOptions);
    setSessionQueue(q);
    setTotalCards(q.length);
    setCleared(0);
    setLearningIds(new Set());
    setRev(false);
  }

  function handleRate(quality) {
    if (!sessionQueue?.length) return;
    const q = sessionQueue[0];

    // Check if card is new BEFORE saving (repetitions will change after)
    const isNew = !srCards[q.id] || srCards[q.id].repetitions === 0;
    const shouldRequeue = quality === 1 || (quality === 2 && isNew);

    onReview(q.id, quality);

    if (shouldRequeue) {
      // Card goes back to end of queue — still needs to be learned
      setLearningIds(prev => new Set([...prev, q.id]));
      setSessionQueue(prev => [...prev.slice(1), prev[0]]);
    } else {
      // Card graduated — remove from queue and learning set
      setLearningIds(prev => { const s = new Set(prev); s.delete(q.id); return s; });
      setSessionQueue(prev => prev.slice(1));
      setCleared(c => c + 1);
    }
    setRev(false);
  }

  // All caught up
  if (allDue.length === 0) {
    const nextDue = Object.values(srCards).filter(c => c.dueDate && c.dueDate > Date.now()).map(c => c.dueDate).sort()[0];
    const nextIn = nextDue ? Math.round((nextDue - Date.now()) / 3600000) : null;
    return (
      <div style={pageWrap}>
        <h1 className="anim-fade-up delay-0" style={h1}>Flashcards</h1>
        <div className="anim-scale-in delay-100" style={{ ...card, textAlign: "center", padding: "64px 32px" }}>
          <div className="anim-pop delay-300" style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
          <div className="anim-fade-up delay-400" style={{ fontWeight: 600, fontSize: 22, color: C.text, letterSpacing: -0.4 }}>All caught up!</div>
          <div className="anim-fade-up delay-500" style={{ color: C.muted, marginTop: 8, fontSize: 15, fontWeight: 500 }}>{nextIn !== null ? `Next cards due in ~${nextIn}h` : "Check back tomorrow."}</div>
          {cleared > 0 && <div className="anim-fade-up delay-600" style={{ color: C.success, marginTop: 12, fontSize: 15 }}>Cleared {cleared} cards this session</div>}
        </div>
      </div>
    );
  }

  // Session complete — queue emptied (all cards cleared)
  if (sessionQueue !== null && sessionQueue.length === 0) {
    const moreLeft = allDue.length > 0;
    return (
      <div style={pageWrap}>
        <h1 className="anim-fade-up delay-0" style={h1}>Flashcards</h1>
        <div className="anim-scale-in delay-100" style={{ ...card, textAlign: "center", padding: "64px 32px" }}>
          <div className="anim-pop delay-300" style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
          <div className="anim-fade-up delay-400" style={{ fontWeight: 600, fontSize: 22, color: C.text, letterSpacing: -0.4 }}>All cards cleared!</div>
          <div className="anim-fade-up delay-500" style={{ color: C.success, marginTop: 8, fontSize: 15 }}>
            {cleared} card{cleared !== 1 ? "s" : ""} graduated this session
          </div>
          {moreLeft && (
            <div className="anim-fade-up delay-600" style={{ color: C.muted, marginTop: 6, fontSize: 15 }}>
              {allDue.length} more card{allDue.length !== 1 ? "s" : ""} still due
            </div>
          )}
          <div className="anim-fade-up delay-700" style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 28 }}>
            {moreLeft && <button className="hover-lift btn-press" style={fieldBtn} onClick={() => setSessionQueue(null)}>Keep Going</button>}
            {!moreLeft && <button className="hover-lift btn-press" style={fieldBtn} onClick={() => setSessionQueue(null)}>Done</button>}
          </div>
        </div>
      </div>
    );
  }

  // Setup screen
  if (!sessionQueue) {
    return (
      <div style={pageWrap}>
        <h1 className="anim-fade-up delay-0" style={h1}>Flashcards</h1>
        <p className="anim-fade-up delay-50" style={{ color: C.sub, fontSize: 15, marginTop: 4, fontWeight: 500 }}>Flip each card and rate your recall to schedule the next review.</p>
        <div className="anim-fade-up delay-100" style={card}>
          <div style={{ marginBottom: 20 }}>
            <FilterPanel value={filter} onChange={f => { setFilter(f); setCountOpt("All"); }} pStats={pStats} />
          </div>
          <div className="anim-fade-up delay-150" style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>
            {filteredDue.length} card{filteredDue.length !== 1 ? "s" : ""} due in this selection
          </div>
          <div className="anim-fade-up delay-200" style={{ marginBottom: 24 }}>
            <div style={labelStyle}>Cards this session</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {COUNT_OPTIONS.map((o, i) => {
                const disabled = o !== "All" && o > filteredDue.length;
                return (
                  <button key={o} disabled={disabled}
                    className={`anim-fade-up delay-${200 + i * 50} ${!disabled ? "hover-lift btn-press" : ""}`}
                    style={{ ...chipBtn, ...(o === countOpt ? chipBtnActive : {}), opacity: disabled ? 0.35 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
                    onClick={() => !disabled && setCountOpt(o)}>
                    {o === "All" ? `All (${filteredDue.length})` : o}
                  </button>
                );
              })}
            </div>
          </div>
          <button className="anim-fade-up delay-400 hover-lift btn-press" style={{ ...fieldBtn, width: "100%", opacity: filteredDue.length === 0 ? 0.5 : 1 }} onClick={startSession} disabled={filteredDue.length === 0}>
            Start Session →
          </button>
        </div>
      </div>
    );
  }

  const q = sessionQueue[0];
  const cardData = srCards[q.id];
  const intervals = getNextIntervals(cardData);
  const isBookmarked = bookmarks.includes(q.id);
  const isLearning = learningIds.has(q.id);

  return (
    <div style={pageWrap}>
      {/* Header */}
      <div className="anim-fade-down" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={h1}>Flashcards</h1>
          <p style={{ color: C.sub, fontSize: 15, marginTop: 4, fontWeight: 500 }}>Click the card to reveal the answer.</p>
        </div>
        <div className="anim-scale-in delay-100" style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 32, fontWeight: 600, color: C.success, lineHeight: 1, letterSpacing: -1 }}>{cleared}<span style={{ fontSize: 18, color: C.muted }}>/{totalCards}</span></div>
          <div style={{ fontSize: 12, color: C.muted }}>cleared</div>
          {learningIds.size > 0 && (
            <div style={{ fontSize: 12, color: C.warning, marginTop: 2 }}>{learningIds.size} learning</div>
          )}
        </div>
      </div>

      <div className="anim-fade-up delay-50" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <ProgressBar value={(cleared / totalCards) * 100} colour={C.success} />
        <button onClick={() => setSessionQueue(null)} className="btn-press" style={{
          flexShrink: 0, background: "none", border: "1px solid var(--c-border)",
          borderRadius: "var(--r-pill)", padding: "5px 12px", color: C.muted, fontSize: 13,
          cursor: "pointer", fontFamily: "inherit",
        }}>Exit</button>
      </div>

      {/* Learning badge */}
      {isLearning && (
        <div className="anim-fade-up" style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "4px 12px", borderRadius: "var(--r-pill)",
          background: C.warningDim, border: `1px solid ${C.warningBrd}`,
          fontSize: 13, color: C.warning,
        }}>
          ↻ Still learning — answer correctly to clear this card
        </div>
      )}

      {/* Flip card */}
      <div className="anim-scale-in delay-100" style={{ perspective: "1200px" }}>
        <div
          onClick={!revealed ? () => setRev(true) : undefined}
          style={{
            position: "relative",
            minHeight: 320,
            transformStyle: "preserve-3d",
            transform: revealed ? "rotateY(180deg)" : "rotateY(0deg)",
            transition: "transform 0.55s cubic-bezier(0.4, 0, 0.2, 1)",
            cursor: revealed ? "default" : "pointer",
          }}
        >
          {/* FRONT */}
          <div style={{
            position: "absolute", inset: 0,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            background: "var(--c-card-bg)",
            borderRadius: "var(--r-panel)",
            border: "1px solid var(--c-border)",
            boxShadow: "var(--c-card-shadow)",
            padding: "36px 32px",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            textAlign: "center",
          }}>
            <CatTag label={q.cat} />
            <p style={{ fontSize: 19, fontWeight: 600, color: C.text, lineHeight: 1.7, margin: "28px 0 36px", letterSpacing: -0.3 }}>{q.q}</p>
            <div style={{ color: C.muted, fontSize: 14, letterSpacing: 0.3 }}>Click to reveal answer</div>
          </div>

          {/* BACK */}
          <div style={{
            position: "absolute", inset: 0,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            background: "var(--c-card-bg)",
            borderRadius: "var(--r-panel)",
            border: `1px solid ${C.accentBrd}`,
            boxShadow: "var(--c-card-shadow)",
            padding: "28px 28px",
            display: "flex", flexDirection: "column",
            overflowY: "auto",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <CatTag label={q.cat} />
              <BmBtn active={isBookmarked} onClick={() => onToggleBookmark(q.id)} />
            </div>

            {/* Correct answer */}
            <div style={{
              display: "flex", alignItems: "center", gap: 14,
              padding: "16px 20px",
              background: C.successDim,
              border: `1px solid ${C.successBrd}`,
              borderRadius: "var(--r-card)",
              marginBottom: 16,
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: "var(--r-card)", flexShrink: 0,
                background: C.successDim,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: 16, color: C.success,
              }}>{"ABCDE"[q.ans]}</div>
              <span style={{ fontSize: 16, color: C.text, lineHeight: 1.45, fontWeight: 600, letterSpacing: -0.2 }}>{q.opts[q.ans]}</span>
            </div>

            {/* Explanation */}
            <div style={{
              fontSize: 14, color: C.sub, lineHeight: 1.8,
              padding: "16px 18px",
              background: C.accentDim,
              border: `1px solid ${C.accentBrd}`,
              borderRadius: "var(--r-card)",
            }}>
              {q.exp}
            </div>

            {cardData && (
              <div style={{ textAlign: "center", fontSize: 12, color: C.mutedDim, marginTop: 14 }}>
                Reviews: {cardData.repetitions || 0} · Ease: {(cardData.easeFactor || 2.5).toFixed(2)} · Lapses: {cardData.lapses || 0}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Rating buttons — appear after flip */}
      {revealed && (
        <div className="anim-fade-up delay-100">
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 12, textAlign: "center", letterSpacing: 0.3 }}>
            How well did you know this?
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
            {RATINGS.map((r, ri) => (
              <button key={r.label} onClick={() => handleRate(r.quality)} className={`anim-fade-up delay-${100 + ri * 50} hover-lift btn-press`} style={{
                padding: "13px 4px", borderRadius: "var(--r-pill)",
                border: `1px solid ${r.brd}`,
                background: r.dim,
                cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                fontFamily: "inherit", transition: "all 0.15s",
              }}>
                <span style={{ fontWeight: 600, fontSize: 15, color: r.col, letterSpacing: -0.2 }}>{r.label}</span>
                <span style={{ fontSize: 12, color: C.muted }}>{intervals[ri].display}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
