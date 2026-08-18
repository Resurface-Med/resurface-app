import { useState, useEffect, useRef } from "react";
import { C, h1, sectionH, lg, primaryBtn, fieldBtn, fieldGhostBtn, glassCard, OF, chipBtn, chipBtnActive } from "../ui/theme";
import { shuffle, shuffleOptions } from "../ui/theme";
import { QUESTIONS } from "../data";
import { isReviewDue } from "../lib/sm2";
import Wave from "../ui/Wave";
import QuestionCard from "../ui/QuestionCard";
import { filteredQuestions, defaultFilter } from "../ui/FilterPanel";
import TopicPicker from "../ui/TopicPicker";
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

/** Same measure as the dashboard, so the two screens sit on one grid. */
const band = {
  maxWidth: 1180,
  margin: "0 auto",
  padding: "0 clamp(20px, 3vw, 40px)",
  width: "100%",
};

const SCOPES = [
  { k: "all",   label: "Everything" },
  { k: "due",   label: "Due now" },
  { k: "wrong", label: "Got wrong" },
  { k: "saved", label: "Saved" },
];

const SCOPE_COPY = {
  all:   "Work through questions at your own pace.",
  due:   "Questions due to resurface, before you forget them.",
  wrong: "The ones that caught you out.",
  saved: "Questions you bookmarked.",
};
const SESSION_KEY = "pq_practice_session";
function loadSaved() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } }

/**
 * The one place questions get answered.
 *
 * Practice, Review, Wrong Answers, Bookmarks and Timed were five destinations
 * for this same screen with a different WHERE clause. They are now scopes,
 * picked here, so the nav describes the task rather than the implementation.
 */
export default function PracticeMode({ pStats, bookmarks, onAnswer, onToggleBookmark, launchFilter, onSessionActive, srCards = {}, scope: initialScope = "all" }) {
  const [scope, setScope] = useState(initialScope);

  /** Live counts, so a scope with nothing in it says so before you pick it. */
  function scopeCount(k) {
    if (k === "due")   return QUESTIONS.filter(q => isReviewDue(srCards[q.id])).length;
    if (k === "saved") return bookmarks.length;
    if (k === "wrong") return QUESTIONS.filter(q => {
      const s = pStats[q.id];
      return s && s.total > 0 && s.correct / s.total < 0.6;
    }).length;
    return QUESTIONS.length;
  }
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

  /** The scope is the only thing that separates what used to be five modes. */
  function applyScope(list) {
    if (scope === "due")   return list.filter(q => isReviewDue(srCards[q.id]));
    if (scope === "saved") return list.filter(q => bookmarks.includes(q.id));
    if (scope === "wrong") return list.filter(q => {
      const s = pStats[q.id];
      return s && s.total > 0 && s.correct / s.total < 0.6;
    });
    return list;
  }

  /** Exactly what a Start press would queue, so the button can say so. */
  function scopedCount(f) {
    return applyScope(filteredQuestions(f, pStats)).length;
  }

  function start(filterOverride) {
    const f = filterOverride ?? filter;
    const base = applyScope(filteredQuestions(f, pStats));
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
        title={SCOPES.find(s => s.k === scope)?.label ?? "Practice"}
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
    // Scope first, topic second: the scope decides which questions exist at
    // all, so the topic rows can show how many each would actually give you.
    const inScope = applyScope(QUESTIONS.filter(q => !filter.unseenOnly || !pStats[q.id]));
    const eligibleIds = inScope.map(q => q.id);
    const scoped = scopedCount(filter);
    const willAsk = countOpt === "All" ? scoped : Math.min(countOpt, scoped);
    const topicLabel = !filter.cat.includes("All") ? filter.cat[0]
      : !filter.deck.includes("All") ? filter.deck[0]
      : null;

    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "var(--app-vh)" }}>
        {/* ── Blue field: what this is, and anything left unfinished ─── */}
        <div style={{ ...band, paddingTop: "clamp(22px, 3.6vh, 36px)", paddingBottom: "clamp(20px, 3vh, 30px)" }}>
          <h1 style={h1}>Practice</h1>

          {savedSession && (
            <div style={{
              ...glassCard, marginTop: 20,
              display: "flex", justifyContent: "space-between", alignItems: "center",
              flexWrap: "wrap", gap: 14,
            }}>
              <div>
                <div style={{ fontSize: 15.5, fontWeight: 600, color: OF.text }}>
                  You left a session at question {(savedSession.idx ?? 0) + 1} of {savedSession.queue?.length ?? 0}
                </div>
                <div style={{ fontSize: 14, color: OF.soft, marginTop: 4 }}>
                  {savedSession.sC ?? 0} of {savedSession.sT ?? 0} right so far
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button className="btn-press" style={fieldBtn} onClick={resumeSession}>Continue →</button>
                <button className="btn-press" style={fieldGhostBtn} onClick={discardSession}>Discard</button>
              </div>
            </div>
          )}
        </div>

        <Wave from="transparent" to="var(--c-card-solid)" />

        {/* ── Sheet: the topic is the screen ───────────────────────── */}
        <div style={{ background: "var(--c-card-solid)", flex: 1, paddingBottom: "clamp(24px, 4vh, 48px)" }}>
          <div style={{ ...band, maxWidth: 760, paddingTop: "clamp(18px, 3vh, 28px)" }}>

            <h2 style={sectionH}>What are you revising?</h2>
            <div className="topic-scroll" style={{ marginTop: 12 }}>
              <TopicPicker
                value={filter}
                onChange={next => { setFilter(f => ({ ...f, ...next })); setCountOpt("All"); }}
                pStats={pStats}
                eligibleIds={eligibleIds}
              />
            </div>

            {/* Refinements. Deliberately smaller and below: they modify the
                choice above rather than competing with it. */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
              marginTop: "clamp(20px, 3vh, 28px)", paddingTop: "clamp(16px, 2.4vh, 22px)",
              borderTop: "1px solid var(--c-border)",
            }}>
              {SCOPES.map(s => {
                const n = scopeCount(s.k);
                const disabled = n === 0 && s.k !== "all";
                return (
                  <button key={s.k} className="btn-press" disabled={disabled}
                    onClick={() => !disabled && setScope(s.k)}
                    style={{
                      ...chipBtn,
                      ...(scope === s.k ? chipBtnActive : {}),
                      opacity: disabled ? 0.38 : 1,
                      cursor: disabled ? "not-allowed" : "pointer",
                    }}>
                    {s.label}
                  </button>
                );
              })}

              <label style={{
                display: "flex", alignItems: "center", gap: 8, marginLeft: "auto",
                fontSize: 14, color: C.sub, cursor: "pointer", userSelect: "none",
              }}>
                <input
                  type="checkbox"
                  checked={filter.unseenOnly}
                  onChange={e => { setFilter(f => ({ ...f, unseenOnly: e.target.checked })); setCountOpt("All"); }}
                  style={{ width: 16, height: 16, accentColor: "var(--c-accent)", cursor: "pointer" }}
                />
                Only ones I haven't seen
              </label>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
              <span style={{ fontSize: 14, color: C.sub, marginRight: 4 }}>How many</span>
              {COUNT_OPTIONS.map(o => {
                const disabled = o !== "All" && o > scoped;
                return (
                  <button key={o} disabled={disabled} className="btn-press"
                    style={{ ...chipBtn, ...(o === countOpt ? chipBtnActive : {}), opacity: disabled ? 0.35 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
                    onClick={() => !disabled && setCountOpt(o)}>
                    {o === "All" ? `All ${scoped}` : o}
                  </button>
                );
              })}
            </div>

            {/* States the outcome before you commit to it. */}
            <button
              className="btn-press"
              disabled={willAsk === 0}
              onClick={() => start()}
              style={{
                ...primaryBtn, ...lg, width: "100%",
                marginTop: "clamp(22px, 3vh, 30px)",
                opacity: willAsk === 0 ? 0.5 : 1,
                cursor: willAsk === 0 ? "not-allowed" : "pointer",
              }}
            >
              {willAsk === 0
                ? "Nothing left here — try another topic"
                : `Start · ${willAsk} question${willAsk === 1 ? "" : "s"}${topicLabel ? ` from ${topicLabel}` : ""} →`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const q = queue[idx];
  const sel = sels[idx] ?? null;
  const isBookmarked = bookmarks.includes(q?.id);
  const topic = [
    !filter.deck.includes("All") && filter.deck.join(", "),
    !filter.cat.includes("All") && filter.cat.join(", "),
  ].filter(Boolean).join(" · ") || SCOPES.find(s => s.k === scope)?.label || "Everything";

  /**
   * A session is one object — the question. Everything else is a thin rail.
   *
   * The old header carried a page title, the filter label and a live accuracy
   * percentage set in 32px and coloured green or amber. The title and label
   * restate what you chose one screen ago, and the running score is the exact
   * thing the research on question banks warns about: students reported real
   * anxiety watching it, and some skipped hard questions to protect it.
   * Accuracy belongs in the summary, once the answering is done.
   *
   * The rail keeps position — the one thing you cannot know by looking — and
   * the way out. The prev/next arrows are gone because the card already owns
   * them, and two sets of the same control is how the other screens got noisy.
   */
  return (
    <div style={{ ...band, maxWidth: 1020, paddingTop: "clamp(18px, 3vh, 30px)", paddingBottom: "clamp(24px, 4vh, 48px)", display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <button
          onClick={() => { setQueue(null); setSels({}); setResults({}); setSC(0); setST(0); }}
          className="btn-press"
          style={{
            flexShrink: 0, background: "rgba(255,255,255,0.12)", border: "none",
            borderRadius: "var(--r-pill)", padding: "8px 16px",
            color: OF.text, fontFamily: "inherit", fontSize: 14, fontWeight: 500, cursor: "pointer",
          }}
        >Exit</button>

        <span style={{ fontSize: 14, color: OF.soft, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {topic}
        </span>

        <span style={{
          marginLeft: "auto", flexShrink: 0,
          fontSize: 14, fontWeight: 600, color: OF.text, fontVariantNumeric: "tabular-nums",
        }}>
          {idx + 1} / {queue.length}
        </span>
      </div>

      {/* Position, full width. One mark, one meaning. */}
      <div style={{ height: 4, borderRadius: 99, background: "rgba(255,255,255,0.22)", overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${((idx + 1) / queue.length) * 100}%`,
          background: "#fff", borderRadius: 99,
          transition: "width 0.3s cubic-bezier(0.22,1,0.36,1)",
        }} />
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 18 }}>
        <div ref={cardRef} style={{ flex: 1, minWidth: 0 }}>
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
