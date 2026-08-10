import { useState, useEffect, useRef } from "react";
import { C, pageWrap, card, h1, fieldBtn, chipBtn, chipBtnActive, label as labelStyle } from "../ui/theme";
import { shuffle, shuffleOptions } from "../ui/theme";
import { QUESTIONS } from "../data";
import ProgressBar from "../ui/ProgressBar";
import QuestionCard from "../ui/QuestionCard";
import FilterPanel, { filteredQuestions, defaultFilter } from "../ui/FilterPanel";
import SessionSummary from "../ui/SessionSummary";

function QuestionNavigator({ queue, idx, sels, results, onJump, maxHeight }) {
  const activeRef = useRef(null);
  useEffect(() => { activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [idx]);

  const answered  = Object.keys(sels).length;
  const correct   = Object.values(results).filter(r => r.correct).length;
  const wrong     = Object.values(results).filter(r => !r.correct).length;
  const pct       = queue.length > 0 ? Math.round((answered / queue.length) * 100) : 0;
  const R = 32, SW = 4, CIRC = 2 * Math.PI * R, SIZE = (R + SW) * 2;

  return (
    <div style={{
      width: 220, flexShrink: 0,
      display: "flex", flexDirection: "column",
      borderRadius: "var(--r-panel)",
      border: "1px solid var(--c-border)",
      overflow: "hidden",
      background: "var(--c-card-bg)",
      boxShadow: "var(--c-card-shadow)",
      maxHeight: maxHeight ?? undefined,
    }}>

      {/* Header */}
      <div style={{ padding: "14px 14px 12px", borderBottom: "1px solid var(--c-border)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: 1, textTransform: "uppercase" }}>Questions</div>
            <div style={{ fontSize: 13, color: C.mutedDim, marginTop: 3 }}>{answered}/{queue.length} done</div>
          </div>
          {/* Mini progress ring */}
          <svg width={SIZE} height={SIZE}>
            <circle cx={R+SW} cy={R+SW} r={R} fill="none" stroke="var(--c-border)" strokeWidth={SW} />
            <circle cx={R+SW} cy={R+SW} r={R} fill="none"
              stroke={pct === 100 ? C.success : C.accent} strokeWidth={SW}
              strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - pct / 100)}
              strokeLinecap="round" transform={`rotate(-90 ${R+SW} ${R+SW})`}
              style={{ transition: "stroke-dashoffset 0.5s ease" }}
            />
            <text x={R+SW} y={R+SW+5} textAnchor="middle" fontSize="14" fontWeight="600"
              fill={pct === 100 ? C.success : C.accentLt} fontFamily="inherit">
              {pct}%
            </text>
          </svg>
        </div>

        {/* Correct / wrong stats */}
        {answered > 0 && (
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
              <span style={{ fontSize: 20, fontWeight: 500, color: C.success, letterSpacing: -0.5 }}>{correct}</span>
              <span style={{ fontSize: 11, color: C.muted }}>correct</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
              <span style={{ fontSize: 20, fontWeight: 500, color: C.danger, letterSpacing: -0.5 }}>{wrong}</span>
              <span style={{ fontSize: 11, color: C.muted }}>wrong</span>
            </div>
          </div>
        )}
      </div>

      {/* List */}
      <div style={{ overflowY: "auto", overscrollBehavior: "contain", padding: "8px 10px" }}>
        {queue.map((qItem, i) => {
          const isCurrent  = i === idx;
          const isAnswered = sels[i] !== undefined;
          const isCorrect  = results[i]?.correct;
          const dotColor   = !isAnswered ? "var(--c-border)" : isCorrect ? C.success : C.danger;
          return (
            <button key={i} ref={isCurrent ? activeRef : null}
              onClick={() => onJump(i)} className="btn-press" style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "11px 12px", borderRadius: "var(--r-card)", border: "none",
                background: isCurrent ? "var(--c-accent-dim)" : "transparent",
                outline: isCurrent ? "1px solid var(--c-accent-brd)" : "none",
                cursor: "pointer", fontFamily: "inherit", textAlign: "left", width: "100%",
              }}>
              <div style={{
                width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                background: isCurrent ? C.accent : dotColor,
                boxShadow: isCurrent ? "0 0 0 3px var(--c-accent-glow)" : "none",
                border: !isAnswered && !isCurrent ? "1px solid var(--c-border)" : "none",
                transition: "all 0.2s",
              }} />
              <span style={{ fontSize: 14, fontWeight: isCurrent ? 600 : 400, letterSpacing: isCurrent ? -0.2 : 0, color: isCurrent ? C.text : isAnswered ? C.sub : C.muted }}>
                Q{i + 1}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const COUNT_OPTIONS = [10, 20, 50, "All"];
const SESSION_KEY = "pq_practice_session";
function loadSaved() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } }

export default function PracticeMode({ pStats, bookmarks, onAnswer, onToggleBookmark, launchFilter, onSessionActive }) {
  const [filter, setFilter] = useState(launchFilter
    ? { year: ["All"], block: ["All"], deck: launchFilter.deck ? [launchFilter.deck] : ["All"], cat: launchFilter.cat ? [launchFilter.cat] : ["All"], unseenOnly: false }
    : defaultFilter
  );
  const [countOpt, setCountOpt] = useState("All");
  const [queue, setQueue] = useState(null);
  const [idx, setIdx] = useState(0);
  const [sels, setSels] = useState({});
  const [results, setResults] = useState({});
  const [sC, setSC] = useState(0);
  const [sT, setST] = useState(0);
  const [savedSession, setSavedSession] = useState(loadSaved);
  const [sessionFilter, setSessionFilter] = useState(null);
  const cardRef = useRef(null);
  const [cardHeight, setCardHeight] = useState(null);

  // Persist session whenever active state changes
  useEffect(() => {
    if (queue) localStorage.setItem(SESSION_KEY, JSON.stringify({ queue, idx, sels, sC, sT }));
  }, [queue, idx, sels, sC, sT]);

  // Tell App whether we're mid-session (so nav block only fires then)
  useEffect(() => {
    onSessionActive?.(queue !== null);
    return () => onSessionActive?.(false);
  }, [queue]);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setCardHeight(entry.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  });

  function start(filterOverride) {
    const f = filterOverride ?? filter;
    const base = filteredQuestions(f, pStats);
    if (base.length === 0) return; // nothing matches current filter — stay on setup
    const shuffled = shuffle(base);
    const q = (countOpt === "All" ? shuffled : shuffled.slice(0, Math.min(countOpt, shuffled.length))).map(shuffleOptions);
    localStorage.removeItem(SESSION_KEY); setSavedSession(null);
    setSessionFilter(f);
    setQueue(q); setIdx(0); setSels({}); setResults({}); setSC(0); setST(0);
  }

  function resumeSession() {
    const s = savedSession;
    const restoredQueue = s.queue ?? [];
    const restoredSels  = s.sels ?? {};
    // Reconstruct results from saved selections so the navigator shows correct/wrong accurately
    const restoredResults = {};
    Object.entries(restoredSels).forEach(([idxStr, sel]) => {
      const i = parseInt(idxStr);
      const q = restoredQueue[i];
      if (q && sel !== undefined) {
        restoredResults[i] = {
          id: q.id, q: q.q, cat: q.cat,
          correct: sel === q.ans,
          correctAnswer: q.opts[q.ans],
          yourAnswer: q.opts[sel],
        };
      }
    });
    setQueue(restoredQueue); setIdx(s.idx ?? 0); setSels(restoredSels);
    setSC(s.sC ?? 0); setST(s.sT ?? 0);
    setResults(restoredResults); setSavedSession(null);
  }

  function discardSession() {
    localStorage.removeItem(SESSION_KEY); setSavedSession(null);
  }

  function handleAnswer(i) {
    if (sels[idx] !== undefined || !queue) return;
    const q = queue[idx];
    const correct = i === q.ans;
    setSels(prev => ({ ...prev, [idx]: i }));
    setST(t => t + 1); if (correct) setSC(c => c + 1);
    onAnswer(q.id, correct);
    setResults(prev => ({ ...prev, [idx]: {
      id: q.id, q: q.q, cat: q.cat,
      correct,
      correctAnswer: q.opts[q.ans],
      yourAnswer: q.opts[i],
    }}));
  }

  function handleNext() {
    if (!queue) return;
    if (idx + 1 >= queue.length) {
      localStorage.removeItem(SESSION_KEY);
      setQueue(null); return;
    }
    setIdx(i => i + 1);
  }

  function handleBack() {
    if (idx > 0) setIdx(i => i - 1);
  }

  // Session summary
  if (!queue && Object.keys(results).length > 0) {
    return (
      <SessionSummary
        title="Free Practice"
        results={Object.values(results)}
        onRestart={() => {
          const f = sessionFilter ?? filter;
          start(f.unseenOnly ? { ...f, unseenOnly: false } : f);
        }}
        onDrillWrong={(wrongIds) => {
          const qs = QUESTIONS.filter(q => wrongIds.includes(q.id)).map(shuffleOptions);
          if (qs.length === 0) return;
          localStorage.removeItem(SESSION_KEY);
          setQueue(qs); setIdx(0); setSels({}); setResults({}); setSC(0); setST(0);
        }}
        onChangeSettings={() => setResults({})}
      />
    );
  }

  // Setup screen
  if (!queue) {
    const baseCount = filteredQuestions(filter, pStats).length;
    return (
      <div style={pageWrap}>
        <h1 className="anim-fade-up delay-0" style={h1}>Free Practice</h1>
        <p className="anim-fade-up delay-50" style={{ color: C.sub, fontSize: 14, marginTop: 4, fontWeight: 500 }}>No timer, no pressure. Learn at your pace.</p>

        {/* Resume card */}
        {savedSession && (() => {
          const cats = [...new Set((savedSession.queue ?? []).map(q => q.cat))];
          const topicLabel = cats.length === 0 ? null
            : cats.length <= 2 ? cats.join(" · ")
            : `${cats.slice(0, 2).join(" · ")} +${cats.length - 2} more`;
          return (
            <div className="anim-scale-in delay-50" style={{
              ...card,
              borderColor: C.accentBrd,
              background: C.accentDim,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: C.accent, marginBottom: 6 }}>Session in progress</div>
                  <div style={{ fontSize: 15, color: C.sub }}>
                    Question {(savedSession.idx ?? 0) + 1} of {savedSession.queue?.length ?? "?"} · {savedSession.sC ?? 0}/{savedSession.sT ?? 0} correct
                  </div>
                  {topicLabel && (
                    <div style={{ fontSize: 14, color: C.muted, marginTop: 5 }}>{topicLabel}</div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="hover-lift btn-press" style={fieldBtn} onClick={resumeSession}>Continue →</button>
                  <button className="hover-lift btn-press" onClick={discardSession} style={{
                    padding: "11px 16px", borderRadius: "var(--r-pill)", border: "1px solid var(--c-border)",
                    background: "transparent", color: C.muted, fontSize: 15, cursor: "pointer", fontFamily: "inherit",
                  }}>Discard</button>
                </div>
              </div>
            </div>
          );
        })()}

        <div className="anim-fade-up delay-100" style={card}>
          <div style={{ marginBottom: 20 }}>
            <FilterPanel value={filter} onChange={f => { setFilter(f); setCountOpt("All"); }} pStats={pStats} />
          </div>
          <div className="anim-fade-up delay-200" style={{ marginBottom: 24 }}>
            <div style={labelStyle}>Number of questions</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {COUNT_OPTIONS.map((o, i) => {
                const disabled = o !== "All" && o > baseCount;
                return (
                  <button key={o} disabled={disabled}
                    className={`anim-fade-up delay-${200 + i * 50} ${!disabled ? "hover-lift btn-press" : ""}`}
                    style={{ ...chipBtn, ...(o === countOpt ? chipBtnActive : {}), opacity: disabled ? 0.35 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
                    onClick={() => !disabled && setCountOpt(o)}>
                    {o === "All" ? `All (${baseCount})` : o}
                  </button>
                );
              })}
            </div>
          </div>
          <button className="anim-fade-up delay-400 hover-lift btn-press" style={{ ...fieldBtn, width: "100%", opacity: baseCount === 0 ? 0.5 : 1 }} onClick={start} disabled={baseCount === 0}>
            Start Practice →
          </button>
        </div>
      </div>
    );
  }

  const q = queue[idx];
  const sel = sels[idx] ?? null;
  const pct = sT > 0 ? Math.round(sC / sT * 100) : null;
  const isBookmarked = bookmarks.includes(q?.id);
  const filterLabel = [
    !filter.deck.includes("All") && filter.deck.join(", "),
    !filter.cat.includes("All") && filter.cat.join(", ")
  ].filter(Boolean).join(" · ") || "All Topics";

  return (
    <div style={{ maxWidth: 1020, margin: "0 auto", padding: "40px 28px", display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="anim-fade-down delay-0" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={h1}>Free Practice</h1>
          <p style={{ color: C.sub, fontSize: 14, marginTop: 4, fontWeight: 500 }}>{filterLabel}</p>
        </div>
        {pct !== null && (
          <div className="anim-scale-in delay-100" style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 32, fontWeight: 600, color: pct >= 70 ? C.success : C.warning, lineHeight: 1, letterSpacing: -1 }}>{pct}%</div>
            <div style={{ fontSize: 11, color: C.muted }}>{sC}/{sT}</div>
          </div>
        )}
      </div>
      <div className="anim-fade-up delay-50" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={handleBack} disabled={idx === 0} className="btn-press" style={{
          flexShrink: 0, background: "none", border: "1px solid var(--c-border)",
          borderRadius: "var(--r-pill)", padding: "5px 10px", color: C.muted, fontSize: 13,
          cursor: idx === 0 ? "default" : "pointer", opacity: idx === 0 ? 0.3 : 1,
        }}>←</button>
        <ProgressBar value={(idx + 1) / queue.length * 100} colour={C.accent} />
        <span style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>{idx + 1}/{queue.length}</span>
        <button onClick={handleNext} disabled={idx + 1 >= queue.length} className="btn-press" style={{
          flexShrink: 0, background: "none", border: "1px solid var(--c-border)",
          borderRadius: "var(--r-pill)", padding: "5px 10px", color: C.muted, fontSize: 13,
          cursor: idx + 1 >= queue.length ? "default" : "pointer", opacity: idx + 1 >= queue.length ? 0.3 : 1,
        }}>→</button>
        <button onClick={() => { setQueue(null); setSels({}); setResults({}); setSC(0); setST(0); }} className="btn-press" style={{
          flexShrink: 0, background: "none", border: "1px solid var(--c-border)",
          borderRadius: "var(--r-pill)", padding: "5px 12px", color: C.muted, fontSize: 12, cursor: "pointer",
        }}>Exit</button>
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>
        <div ref={cardRef} style={{ flex: 1 }}>
          <QuestionCard q={q} sel={sel} onAnswer={handleAnswer} onNext={handleNext} onPrev={handleBack}
            onToggleBookmark={() => onToggleBookmark(q.id)} isBookmarked={isBookmarked}
            isLast={idx + 1 >= queue.length} nextLabel="Next question"
            onSaveEdit={updated => setQueue(prev => prev.map((item, i) => i === idx ? { ...item, ...updated } : item))} />
        </div>
        <QuestionNavigator queue={queue} idx={idx} sels={sels} results={results} onJump={setIdx} maxHeight={cardHeight} />
      </div>
    </div>
  );
}
