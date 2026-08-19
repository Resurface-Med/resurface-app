import { useState, useEffect, useRef } from "react";
import { C, h1, sectionH, lg, primaryBtn, fieldBtn, fieldGhostBtn, OF, chipBtn, chipBtnActive } from "../ui/theme";
import { shuffle, shuffleOptions } from "../ui/theme";
import { QUESTIONS } from "../data";
import { isReviewDue } from "../lib/sm2";
import Wave from "../ui/Wave";
import QuestionCard from "../ui/QuestionCard";
import { filteredQuestions, defaultFilter } from "../ui/FilterPanel";
import TopicPicker from "../ui/TopicPicker";
import SessionSummary from "../ui/SessionSummary";

const NAV_PCT_KEY = "pq_nav_show_pct";
function loadNavPct() {
  try {
    const v = localStorage.getItem(NAV_PCT_KEY);
    if (v === null) return true;
    return v === "1";
  } catch {
    return true;
  }
}

function QuestionNavigator({ queue, idx, sels, results, onJump, maxHeight }) {
  const activeRef = useRef(null);
  const [showPct, setShowPct] = useState(loadNavPct);

  useEffect(() => { activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [idx]);

  useEffect(() => {
    try { localStorage.setItem(NAV_PCT_KEY, showPct ? "1" : "0"); } catch { /* ignore */ }
  }, [showPct]);

  const answered = Object.keys(sels).length;
  const pct = queue.length > 0 ? Math.round((answered / queue.length) * 100) : 0;

  return (
    <nav
      className="q-nav"
      aria-label="Question list"
      style={{ maxHeight: maxHeight ?? undefined }}
    >
      <div className="q-nav-head">
        <div className="q-nav-head-main">
          <div className="q-nav-head-text">
            <span className="q-nav-count">{answered}/{queue.length}</span>
            <span className="q-nav-label">answered</span>
          </div>
          {showPct && (
            <span className="q-nav-pct" aria-label={`${pct}% complete`}>
              {pct}%
            </span>
          )}
        </div>
        <button
          type="button"
          className="q-nav-pct-toggle"
          onClick={() => setShowPct(v => !v)}
          aria-pressed={showPct}
        >
          {showPct ? "Hide %" : "Show %"}
        </button>
      </div>

      <div className="q-nav-list">
        {queue.map((_, i) => {
          const isCurrent  = i === idx;
          const isAnswered = sels[i] !== undefined;
          const isCorrect  = results[i]?.correct;
          let state = "idle";
          if (isCurrent) state = "current";
          else if (isAnswered) state = isCorrect ? "ok" : "bad";

          return (
            <button
              key={i}
              ref={isCurrent ? activeRef : null}
              type="button"
              onClick={() => onJump(i)}
              className={`q-nav-item is-${state} btn-press`}
              aria-current={isCurrent ? "true" : undefined}
              aria-label={`Question ${i + 1}${isAnswered ? (isCorrect ? ", correct" : ", wrong") : ""}`}
            >
              <span className="q-nav-dot" aria-hidden="true" />
              <span className="q-nav-num">{i + 1}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

const COUNT_OPTIONS = [10, 20, 50, "All"];

/** Categories carry their subject as a prefix; the button already names it. */
function shortLabel(cat, deck) {
  return cat && deck && cat.startsWith(`${deck}: `) ? cat.slice(deck.length + 2) : cat;
}

/** Same measure as the dashboard, so the two screens sit on one grid. */
const band = {
  maxWidth: 1180,
  margin: "0 auto",
  padding: "0 clamp(20px, 3vw, 40px)",
  width: "100%",
};

const SCOPES = [
  { k: "all",   label: "Any" },
  { k: "due",   label: "Due" },
  { k: "wrong", label: "Wrong" },
  { k: "saved", label: "Saved" },
];

const SCOPE_HINT = {
  all:   "Any question in this topic",
  due:   "Due to resurface now",
  wrong: "Ones you got wrong",
  saved: "Ones you bookmarked",
};

/** Compact chips for the setup dock — secondary choices, not a second page. */
/**
 * Whether we are on a phone.
 *
 * The two-step setup is a genuine branch in the flow, not a restyle, so CSS
 * cannot express it — this is the one place a breakpoint has to be known to
 * JavaScript. It listens rather than reading once, so a rotation or a resized
 * window lands on the right shape.
 */
function useIsPhone() {
  const [isPhone, setIsPhone] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const onChange = e => setIsPhone(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isPhone;
}

/** A toggle that stands on its own needs a resting state you can see. Inside a
 *  segmented track the track is the affordance, so `dockChip` goes transparent
 *  when off — standing alone that reads as a label, not a control. */
function toggleChip(active) {
  return {
    ...chipBtn,
    ...(active ? { ...chipBtnActive, boxShadow: "none" } : {}),
    padding: "7px 12px",
    fontSize: 13,
    whiteSpace: "nowrap",
  };
}

function dockChip(active, disabled) {
  return {
    ...chipBtn,
    ...(active ? {
      ...chipBtnActive,
      boxShadow: "none",
    } : {
      background: "transparent",
      border: "1.5px solid transparent",
      boxShadow: "none",
    }),
    minWidth: "auto",
    padding: "7px 12px",
    fontSize: 13,
    textAlign: "center",
    justifyContent: "center",
    whiteSpace: "nowrap",
    opacity: disabled ? 0.35 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

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
  const [countOpt, setCountOpt] = useState(20);
  const [topicQuery, setTopicQuery] = useState("");
  const isPhone = useIsPhone();
  // Phones split the setup in two. A phone screen cannot hold a scrolling list
  // and a full set of controls at once without the controls eating half of it,
  // so the list gets the screen, then the options do.
  const [step, setStep] = useState("topic");
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
    // Scope decides which questions exist at all, so the topic rows can each
    // say how many they would actually give you under it.
    const inScope = applyScope(QUESTIONS.filter(x => !filter.unseenOnly || !pStats[x.id]));
    const eligibleIds = inScope.map(x => x.id);
    const scoped = scopedCount(filter);
    const willAsk = countOpt === "All" ? scoped : Math.min(countOpt, scoped);
    const topicLabel = !filter.cat.includes("All") ? shortLabel(filter.cat[0], filter.deck[0])
      : !filter.deck.includes("All") ? filter.deck[0]
      : null;

    // ── Phones: one decision per screen ───────────────────────────
    if (isPhone) {
      return (
        <div className="setup-frame" style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
          <div className="page-band tab-rise" style={{ ...band, paddingBottom: "clamp(10px, 1.6vh, 16px)", flexShrink: 0, "--d": 0 }}>
            {step === "topic" ? (
              <h1 style={{ ...h1, fontSize: 27, margin: 0 }}>Practice</h1>
            ) : (
              <>
                <button
                  type="button"
                  className="btn-press setup-back"
                  onClick={() => setStep("topic")}
                >
                  <span aria-hidden="true">←</span> {topicLabel ?? "All subjects"}
                </button>
                <h1 style={{ ...h1, fontSize: 27, margin: "10px 0 0" }}>How much?</h1>
              </>
            )}

            {savedSession && step === "topic" && (
              <div className="setup-resume">
                <span>Unfinished · {(savedSession.idx ?? 0) + 1}/{savedSession.queue?.length ?? 0}</span>
                <button className="btn-press" style={fieldBtn} onClick={resumeSession}>Continue →</button>
                <button className="btn-press" style={fieldGhostBtn} onClick={discardSession}>Discard</button>
              </div>
            )}
          </div>

          <Wave from="transparent" to="var(--c-card-solid)" />

          <div style={{ background: "var(--c-card-solid)", flex: 1 }}>
            <div className="tab-rise" style={{ ...band, maxWidth: 720, paddingTop: 14, paddingBottom: "calc(24px + var(--safe-b))", "--d": 90 }}>

              {step === "topic" ? (
                <>
                  <input
                    type="search"
                    value={topicQuery}
                    onChange={e => setTopicQuery(e.target.value)}
                    placeholder="Search topics"
                    aria-label="Search topics"
                    className="setup-search"
                  />
                  {/* Choosing is the whole job of this screen, so a choice
                      finishes it rather than waiting for a confirm nobody
                      would understand the purpose of. */}
                  <TopicPicker
                    value={filter}
                    onChange={next => {
                      setFilter(f => ({ ...f, ...next }));
                      setCountOpt("All");
                      setStep("options");
                    }}
                    pStats={pStats}
                    eligibleIds={eligibleIds}
                    query={topicQuery}
                  />
                </>
              ) : (
                <div className="setup-options">
                  <div className="setup-opt-group">
                    <span className="setup-dock-label">From</span>
                    <div className="setup-seg" role="radiogroup" aria-label="Question pool">
                      {SCOPES.map(s => {
                        const n = scopeCount(s.k);
                        const disabled = n === 0 && s.k !== "all";
                        const on = scope === s.k;
                        return (
                          <button key={s.k} role="radio" aria-checked={on} disabled={disabled}
                            className="btn-press" onClick={() => !disabled && setScope(s.k)}
                            style={dockChip(on, disabled)}>
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="setup-opt-group">
                    <span className="setup-dock-label">How many</span>
                    <div className="setup-seg" role="radiogroup" aria-label="Session length">
                      {COUNT_OPTIONS.map(o => {
                        const disabled = o !== "All" && o > scoped;
                        const on = o === countOpt;
                        return (
                          <button key={o} role="radio" aria-checked={on} disabled={disabled}
                            className="btn-press" onClick={() => !disabled && setCountOpt(o)}
                            style={dockChip(on, disabled)}>
                            {o === "All" ? "All" : o}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="setup-opt-group">
                    <span className="setup-dock-label">Filter</span>
                    <button
                      type="button"
                      className="btn-press"
                      onClick={() => setFilter(f => ({ ...f, unseenOnly: !f.unseenOnly }))}
                      aria-pressed={filter.unseenOnly}
                      style={{ ...toggleChip(filter.unseenOnly), alignSelf: "flex-start" }}
                    >
                      Unseen only
                    </button>
                  </div>

                  <p className="setup-dock-hint" aria-live="polite">
                    {SCOPE_HINT[scope]}
                    {filter.unseenOnly ? " · unseen only" : ""}
                  </p>

                  <button
                    className="btn-press setup-start"
                    disabled={willAsk === 0}
                    onClick={() => start()}
                    style={{ ...primaryBtn, ...lg, width: "100%", opacity: willAsk === 0 ? 0.5 : 1 }}
                  >
                    {willAsk === 0
                      ? "Nothing here — pick another topic"
                      : `Start · ${willAsk} question${willAsk === 1 ? "" : "s"} →`}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      /* Topics own the page. Secondary choices sit in a slim dock so the list
         gets height without a second screen or a tall settings stack. */
      <div className="setup-frame" style={{ display: "flex", flexDirection: "column", height: "var(--screen-h)" }}>
        <div className="page-band tab-rise" style={{ ...band, paddingTop: "clamp(16px, 2.6vh, 26px)", paddingBottom: "clamp(10px, 1.6vh, 16px)", flexShrink: 0, "--d": 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <h1 style={{ ...h1, fontSize: "clamp(26px, 3vw, 34px)", margin: 0 }}>Practice</h1>

            {savedSession && (
              <div style={{
                display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
                background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.28)",
                borderRadius: "var(--r-pill)", padding: "6px 6px 6px 14px",
              }}>
                <span style={{ fontSize: 13.5, color: OF.soft, fontWeight: 500 }}>
                  {(savedSession.idx ?? 0) + 1}/{savedSession.queue?.length ?? 0} left
                </span>
                <button className="btn-press" style={{ ...fieldBtn, padding: "8px 16px" }} onClick={resumeSession}>Continue</button>
                <button className="btn-press" style={{ ...fieldGhostBtn, padding: "8px 14px", border: "none" }} onClick={discardSession}>Discard</button>
              </div>
            )}
          </div>
        </div>

        <Wave from="transparent" to="var(--c-card-solid)" />

        <div className="setup-sheet" style={{ background: "var(--c-card-solid)", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div className="setup-col tab-rise" style={{ ...band, maxWidth: 720, flex: 1, minHeight: 0, display: "flex", flexDirection: "column", paddingTop: "clamp(12px, 2vh, 18px)", "--d": 90 }}>

            <div style={{ flexShrink: 0, marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, marginBottom: 10 }}>
                <h2 style={{ ...sectionH, margin: 0 }}>What are you revising?</h2>
                <span style={{ fontSize: 13, color: C.muted, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                  {scoped} available
                </span>
              </div>
              <input
                type="search"
                value={topicQuery}
                onChange={e => setTopicQuery(e.target.value)}
                placeholder="Search subjects or topics"
                aria-label="Search subjects or topics"
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "11px 16px", fontSize: 14.5, fontFamily: "inherit",
                  color: C.text, background: "var(--c-surface3)",
                  border: "1.5px solid transparent", borderRadius: "var(--r-ctrl)",
                  outline: "none",
                }}
              />
            </div>

            <div className="topic-scroll" style={{ marginTop: 2 }}>
              <TopicPicker
                value={filter}
                onChange={next => setFilter(f => ({ ...f, ...next }))}
                pStats={pStats}
                eligibleIds={eligibleIds}
                query={topicQuery}
              />
            </div>

            <div className="setup-dock">
              <div className="setup-dock-row">
                <div className="setup-dock-group">
                  <span className="setup-dock-label">From</span>
                  <div className="setup-seg setup-seg-dock" role="radiogroup" aria-label="Question pool">
                    {SCOPES.map(s => {
                      const n = scopeCount(s.k);
                      const disabled = n === 0 && s.k !== "all";
                      const active = scope === s.k;
                      return (
                        <button
                          key={s.k}
                          role="radio"
                          aria-checked={active}
                          className="btn-press"
                          disabled={disabled}
                          onClick={() => !disabled && setScope(s.k)}
                          style={dockChip(active, disabled)}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="setup-dock-group">
                  <span className="setup-dock-label">How many</span>
                  <div className="setup-seg setup-seg-dock" role="radiogroup" aria-label="Session length">
                    {COUNT_OPTIONS.map(o => {
                      const disabled = o !== "All" && o > scoped;
                      const active = o === countOpt;
                      return (
                        <button
                          key={o}
                          role="radio"
                          aria-checked={active}
                          disabled={disabled}
                          className="btn-press"
                          style={dockChip(active, disabled)}
                          onClick={() => !disabled && setCountOpt(o)}
                        >
                          {o === "All" ? "All" : o}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="setup-dock-group">
                  <span className="setup-dock-label">Filter</span>
                  <button
                    type="button"
                    className="btn-press"
                    onClick={() => { setFilter(f => ({ ...f, unseenOnly: !f.unseenOnly })); }}
                    aria-pressed={filter.unseenOnly}
                    style={toggleChip(filter.unseenOnly)}
                  >
                    Unseen only
                  </button>
                </div>
              </div>

              <p className="setup-dock-hint" aria-live="polite">
                {SCOPE_HINT[scope]}
                {filter.unseenOnly ? " · unseen only" : ""}
              </p>

              <button
                className="btn-press"
                disabled={willAsk === 0}
                onClick={() => start()}
                style={{
                  ...primaryBtn, ...lg, width: "100%",
                  opacity: willAsk === 0 ? 0.5 : 1,
                  cursor: willAsk === 0 ? "not-allowed" : "pointer",
                }}
              >
                {willAsk === 0
                  ? "Nothing left here — try another topic"
                  : `Start · ${willAsk} question${willAsk === 1 ? "" : "s"}${topicLabel ? ` · ${topicLabel}` : ""} →`}
              </button>
            </div>
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
    <div className="session-wrap" style={{ ...band, maxWidth: 1100, paddingTop: "clamp(18px, 3vh, 30px)", paddingBottom: "clamp(24px, 4vh, 48px)", display: "flex", flexDirection: "column", gap: 18 }}>
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
          background: "var(--c-field-object)", borderRadius: 99,
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
