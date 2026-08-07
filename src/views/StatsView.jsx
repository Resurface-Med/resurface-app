import { useState, useMemo, useEffect } from "react";
import { C, pageWrap, card, h1, h2 } from "../ui/theme";
import { QUESTIONS, DECK_MAP } from "../data";
import ProgressBar from "../ui/ProgressBar";


function AnimatedRing({ pct, col, size = 88 }) {
  const [displayed, setDisplayed] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setDisplayed(pct), 80);
    return () => clearTimeout(t);
  }, [pct]);

  const strokeW = 6;
  const r = (size - strokeW) / 2;
  const circ = 2 * Math.PI * r;
  const fill = (displayed / 100) * circ;
  const cx = size / 2;

  return (
    <svg width={size} height={size} style={{ flexShrink: 0, transform: "rotate(-90deg)" }}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--c-surface2)" strokeWidth={strokeW} />
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={col} strokeWidth={strokeW}
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 1.2s cubic-bezier(0.4,0,0.2,1)" }} />
      <text x={cx} y={cx} textAnchor="middle" dominantBaseline="central"
        fill={col} fontSize={16} fontWeight={300} fontFamily="Outfit,sans-serif"
        style={{ transform: `rotate(90deg)`, transformOrigin: `${cx}px ${cx}px` }}>
        {pct}%
      </text>
    </svg>
  );
}

function accColour(pct) {
  if (pct === null || pct === undefined) return C.mutedDim;
  if (pct >= 70) return C.success;
  if (pct >= 50) return C.warning;
  return C.danger;
}

function AccBadge({ pct }) {
  const col = accColour(pct);
  return (
    <span style={{
      fontSize: 13, fontWeight: 700, color: col,
      background: pct === null ? "transparent" : pct >= 70 ? C.successDim : pct >= 50 ? C.warningDim : C.dangerDim,
      border: `1px solid ${pct === null ? "transparent" : pct >= 70 ? C.successBrd : pct >= 50 ? C.warningBrd : C.dangerBrd}`,
      borderRadius: 6, padding: "2px 7px",
    }}>
      {pct === null ? "—" : pct + "%"}
    </span>
  );
}


function TopicRow({ topic, pStats, divider, onPractice }) {
  const [hovered, setHovered] = useState(false);
  const qs = QUESTIONS.filter(q => q.cat === topic);
  const total = qs.length;
  let correct = 0, attempts = 0, seen = 0;
  qs.forEach(q => {
    const s = pStats[q.id];
    if (s) { correct += s.correct; attempts += s.total; seen++; }
  });
  const pct = attempts > 0 ? Math.round(correct / attempts * 100) : null;


  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...(divider ? { borderTop: "1px solid var(--c-border)", paddingTop: 8, marginTop: 8 } : {}),
        borderRadius: 8,
        padding: "6px 4px",
        transition: "background 0.15s",
        background: hovered ? "var(--c-overlay)" : "transparent",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
        <span style={{ flex: 1, fontSize: 14, color: C.text, fontWeight: 400, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {topic}
        </span>
        {hovered && onPractice ? (
          <button onClick={onPractice} className="hover-lift btn-press" style={{
            padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
            background: "var(--c-accent-dim)", border: "1px solid var(--c-accent-brd)",
            color: "var(--c-accent)", cursor: "pointer", fontFamily: "inherit",
            whiteSpace: "nowrap", flexShrink: 0,
          }}>Practice →</button>
        ) : (
          <>
            <span style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>{seen}/{total}</span>
            <AccBadge pct={pct} />
          </>
        )}
      </div>
      <ProgressBar value={pct ?? 0} colour={accColour(pct)} />
    </div>
  );
}

function DeckSection({ deck, cats, pStats, collapsed, onToggle, onPractice }) {
  const qs = QUESTIONS.filter(q => q.deck === deck);
  let dc_correct = 0, dc_attempts = 0, dc_seen = 0;
  qs.forEach(q => {
    const s = pStats[q.id];
    if (s) { dc_correct += s.correct; dc_attempts += s.total; dc_seen++; }
  });
  const deckPct = dc_attempts > 0 ? Math.round(dc_correct / dc_attempts * 100) : null;

  const sortedCats = [...cats].sort((a, b) => {
    const pctA = (() => {
      const qs2 = QUESTIONS.filter(q => q.cat === a);
      let c = 0, t = 0;
      qs2.forEach(q => { const s = pStats[q.id]; if (s) { c += s.correct; t += s.total; } });
      return t > 0 ? c / t : null;
    })();
    const pctB = (() => {
      const qs2 = QUESTIONS.filter(q => q.cat === b);
      let c = 0, t = 0;
      qs2.forEach(q => { const s = pStats[q.id]; if (s) { c += s.correct; t += s.total; } });
      return t > 0 ? c / t : null;
    })();
    if (pctA === null && pctB === null) return 0;
    if (pctA === null) return 1;
    if (pctB === null) return -1;
    return pctA - pctB;
  });

  const isOpen = !collapsed;

  return (
    <div style={{ ...card, padding: 0, overflow: "hidden" }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "12px 16px",
          background: "transparent",
          border: "none", cursor: "pointer", fontFamily: "inherit",
          borderBottom: isOpen ? "1px solid var(--c-border)" : "none",
        }}
      >
        <span style={{ fontWeight: 400, fontSize: 15, color: C.text, flex: 1, textAlign: "left" }}>{deck}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {deckPct !== null && (
            <span style={{ fontSize: 13, fontWeight: 700, color: deckPct >= 70 ? C.success : deckPct >= 50 ? C.warning : C.danger }}>
              {deckPct}%
            </span>
          )}
          <span style={{ fontSize: 12, color: C.muted }}>{dc_seen}/{qs.length}</span>
          <span style={{ fontSize: 12, color: C.muted, transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s", display: "inline-block" }}>▾</span>
        </div>
      </button>

      {isOpen && (
        <div style={{ padding: "8px 12px 12px" }}>
          {sortedCats.map((cat, i) => (
            <TopicRow key={cat} topic={cat} deck={deck} pStats={pStats} divider={i > 0} onPractice={() => onPractice(deck, cat)} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function StatsView({ pStats, srCards, setView, setLaunchFilter }) {
  const [collapsed, setCollapsed] = useState(new Set(Object.keys(DECK_MAP)));

  function handlePractice(deck, cat) {
    setLaunchFilter({ deck, cat });
    setView("practice");
  }

  function toggleDeck(deck) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(deck)) next.delete(deck);
      else next.add(deck);
      return next;
    });
  }

  const stats = useMemo(() => {
    const totalC = Object.values(pStats).reduce((s, v) => s + v.correct, 0);
    const totalT = Object.values(pStats).reduce((s, v) => s + v.total, 0);
    const oPct = totalT > 0 ? Math.round(totalC / totalT * 100) : 0;
    const seen = Object.keys(pStats).length;
    const learned = Object.values(srCards).filter(c => c.repetitions > 0).length;
    return { totalC, totalT, oPct, seen, learned };
  }, [pStats, srCards]);

  const { needsAttention, notStarted, mastered, decks } = useMemo(() => {
    const allDecks = Object.keys(DECK_MAP);
    const needsAttention = [];
    const notStarted = [];
    const mastered = [];

    QUESTIONS.reduce((acc, q) => {
      if (!acc.includes(q.cat)) acc.push(q.cat);
      return acc;
    }, []).forEach(cat => {
      const qs = QUESTIONS.filter(q => q.cat === cat);
      let c = 0, t = 0, seen = 0;
      qs.forEach(q => { const s = pStats[q.id]; if (s) { c += s.correct; t += s.total; seen++; } });
      const pct = t > 0 ? Math.round(c / t * 100) : null;
      const deck = qs[0]?.deck ?? "";

      if (pct === null) {
        notStarted.push({ cat, deck, pct: null, seen: 0, total: qs.length });
      } else if (seen === qs.length && pct >= 70) {
        mastered.push({ cat, deck, pct, seen, total: qs.length });
      } else if (pct < 60) {
        needsAttention.push({ cat, deck, pct, seen, total: qs.length });
      }
    });

    needsAttention.sort((a, b) => a.pct - b.pct);

    return {
      needsAttention: needsAttention.slice(0, 5),
      notStarted,
      mastered,
      decks: allDecks,
    };
  }, [pStats]);

  const [showNotStarted, setShowNotStarted] = useState(false);
  const [showMastered, setShowMastered] = useState(false);

  const { oPct, seen, learned, totalC, totalT } = stats;
  const accCol = oPct >= 70 ? C.success : oPct >= 50 ? C.warning : C.danger;

  return (
    <div style={pageWrap}>
      {/* Title */}
      <h1 className="anim-fade-up delay-0" style={h1}>Statistics</h1>

      {/* Header — circle indicator */}
      <div className="anim-scale-in delay-100" style={{ ...card, display: "flex", alignItems: "center", gap: 28 }}>
        <AnimatedRing pct={oPct} col={accCol} />
        <div className="anim-fade-up delay-400">
          <div style={{ fontWeight: 400, fontSize: 18, color: C.text }}>Overall Accuracy</div>
          <div style={{ color: C.muted, fontSize: 15, marginTop: 4, fontWeight: 300 }}>{totalC} correct of {totalT} attempts</div>
          <div style={{ color: C.muted, fontSize: 14, marginTop: 3, fontWeight: 300 }}>
            {seen} of {QUESTIONS.length} questions seen · {learned} cards learned
          </div>
        </div>
      </div>

      {/* Needs Attention */}
      {needsAttention.length > 0 && (
        <>
          <h2 className="anim-fade-up delay-200" style={h2}>Needs Attention</h2>
          <div className="anim-fade-up delay-300" style={{
            ...card,
            background: C.dangerDim,
            border: `1px solid ${C.dangerBrd}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
              <span style={{ fontSize: 14 }}>⚠</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: C.danger }}>Topics below 60% accuracy</span>
            </div>
            {needsAttention.map(({ cat, deck, pct }, i) => (
              <div key={cat} style={i > 0 ? { borderTop: "1px solid var(--c-border)", paddingTop: 12, marginTop: 12 } : {}}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ flex: 1, fontSize: 14, color: C.text, fontWeight: 500 }}>{cat}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: C.muted,
                    background: "var(--c-overlay2)", borderRadius: 5, padding: "2px 6px",
                  }}>
                    {deck}
                  </span>
                  <AccBadge pct={pct} />
                </div>
                <ProgressBar value={pct ?? 0} colour={C.danger} />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Deck sections */}
      <h2 className="anim-fade-up delay-200" style={h2}>By Deck</h2>
      {decks.map((deck, i) => (
        <div key={deck} className={`anim-fade-up delay-${Math.min(200 + i * 50, 500)}`}>
          <DeckSection
            deck={deck}
            cats={DECK_MAP[deck] || []}
            pStats={pStats}
            collapsed={collapsed.has(deck)}
            onToggle={() => toggleDeck(deck)}
            onPractice={handlePractice}
          />
        </div>
      ))}

      {/* Not Started */}
      {notStarted.length > 0 && (
        <>
          <h2 className="anim-fade-up delay-400" style={h2}>Not Started</h2>
          <div className="anim-fade-up delay-500" style={{ ...card, padding: 0, overflow: "hidden" }}>
            <button
              onClick={() => setShowNotStarted(v => !v)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "14px 20px", background: "transparent", border: "none",
                cursor: "pointer", fontFamily: "inherit",
                borderBottom: showNotStarted ? "1px solid var(--c-border)" : "none",
              }}
            >
              <span style={{ fontSize: 14, color: C.muted, flex: 1, textAlign: "left", fontWeight: 600 }}>
                {notStarted.length} topic{notStarted.length !== 1 ? "s" : ""} not yet attempted
              </span>
              <span style={{
                fontSize: 13, color: C.muted,
                transform: showNotStarted ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s", display: "inline-block",
              }}>▾</span>
            </button>
            {showNotStarted && (
              <div style={{ padding: "12px 20px", display: "flex", flexWrap: "wrap", gap: 8 }}>
                {notStarted.map(({ cat, deck }) => (
                  <div key={cat} style={{
                    fontSize: 13, color: C.muted, background: "var(--c-surface2)",
                    border: "1px solid var(--c-border)", borderRadius: 8, padding: "5px 10px",
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <span>{cat}</span>
                    <span style={{ fontSize: 11, opacity: 0.6 }}>{deck}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Mastered */}
      {mastered.length > 0 && (
        <>
          <h2 className="anim-fade-up delay-400" style={h2}>Mastered</h2>
          <div className="anim-fade-up delay-500" style={{
            ...card, padding: 0, overflow: "hidden",
            background: C.successDim, border: `1px solid ${C.successBrd}`,
          }}>
            <button
              onClick={() => setShowMastered(v => !v)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "14px 20px", background: "transparent", border: "none",
                cursor: "pointer", fontFamily: "inherit",
                borderBottom: showMastered ? `1px solid ${C.successBrd}` : "none",
              }}
            >
              <span style={{ fontSize: 14 }}>✓</span>
              <span style={{ fontSize: 14, color: C.success, flex: 1, textAlign: "left", fontWeight: 600 }}>
                {mastered.length} topic{mastered.length !== 1 ? "s" : ""} mastered (100% seen, ≥70%)
              </span>
              <span style={{
                fontSize: 13, color: C.success,
                transform: showMastered ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s", display: "inline-block",
              }}>▾</span>
            </button>
            {showMastered && (
              <div style={{ padding: "12px 20px" }}>
                {mastered.map(({ cat, pct }, i) => (
                  <div key={cat} style={i > 0 ? { borderTop: "1px solid var(--c-border)", paddingTop: 10, marginTop: 10 } : {}}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                      <span style={{ flex: 1, fontSize: 14, color: C.text, fontWeight: 500 }}>{cat}</span>
                      <AccBadge pct={pct} />
                    </div>
                    <ProgressBar value={pct} colour={C.success} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
