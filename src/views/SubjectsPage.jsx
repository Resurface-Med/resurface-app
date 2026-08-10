import { useState, useMemo } from "react";
import { C, V, pageWrap, h1, primaryBtn, card, pageSub } from "../ui/theme";
import { QUESTIONS, DECK_MAP } from "../data";

const DECK_ICONS = {
  Biochemistry:          "⚗",
  Genetics:              "🧬",
  Physiology:            "⚡",
  Pathology:             "🔬",
  Immunology:            "🛡",
  Histology:             "🔭",
  Anatomy:               "🦴",
  Embryology:            "🌱",
  "Infection/Microbiology": "🦠",
  Pharmacology:          "💊",
};

// Soft blue-tinted variants — brand blue stays dominant, rainbow muted
const DECK_COLOURS = {
  Biochemistry:             { col: "#3562F5", dim: "rgba(53,98,245,0.10)",  brd: "rgba(53,98,245,0.28)"  },
  Genetics:                 { col: "#6B7FE8", dim: "rgba(107,127,232,0.10)", brd: "rgba(107,127,232,0.26)" },
  Physiology:               { col: "#4A8BC4", dim: "rgba(74,139,196,0.10)",  brd: "rgba(74,139,196,0.26)"  },
  Pathology:                { col: "#8B7AB0", dim: "rgba(139,122,176,0.10)", brd: "rgba(139,122,176,0.26)" },
  Immunology:               { col: "#7A8DB8", dim: "rgba(122,141,184,0.10)", brd: "rgba(122,141,184,0.26)" },
  Histology:                { col: "#5A9BB8", dim: "rgba(90,155,184,0.10)",  brd: "rgba(90,155,184,0.26)"  },
  Anatomy:                  { col: "#7B88B0", dim: "rgba(123,136,176,0.10)", brd: "rgba(123,136,176,0.26)" },
  Embryology:               { col: "#5A9BA0", dim: "rgba(90,155,160,0.10)",  brd: "rgba(90,155,160,0.26)"  },
  "Infection/Microbiology": { col: "#8A7AB0", dim: "rgba(138,122,176,0.10)", brd: "rgba(138,122,176,0.26)" },
  Pharmacology:             { col: "#6E7CC8", dim: "rgba(110,124,200,0.10)", brd: "rgba(110,124,200,0.26)" },
};

function ProgressRing({ pct, col, size = 44 }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const fill = ((pct || 0) / 100) * circ;
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--c-overlay2)" strokeWidth={5} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={5}
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} />
      <text x={size/2} y={size/2 + 4} textAnchor="middle" fontSize={10} fontWeight={600}
        fill={pct ? col : C.mutedDim} fontFamily="Poppins, sans-serif">
        {pct ? pct + "%" : "—"}
      </text>
    </svg>
  );
}

export default function SubjectsPage({ pStats, srCards, setView, setLaunchFilter }) {
  const [expandedDeck, setExpandedDeck] = useState(null);

  const deckStats = useMemo(() => {
    const result = {};
    for (const deck of Object.keys(DECK_MAP)) {
      const qs = QUESTIONS.filter(q => q.deck === deck);
      const attempted = qs.filter(q => pStats[q.id]);
      const totalC = attempted.reduce((s, q) => s + pStats[q.id].correct, 0);
      const totalT = attempted.reduce((s, q) => s + pStats[q.id].total, 0);
      const due = qs.filter(q => {
        const c = srCards[q.id];
        return !c || !c.dueDate || Date.now() >= c.dueDate;
      }).length;
      result[deck] = {
        total: qs.length,
        seen: attempted.length,
        pct: totalT > 0 ? Math.round(totalC / totalT * 100) : null,
        due,
      };
    }
    return result;
  }, [pStats, srCards]);

  const catStats = useMemo(() => {
    const result = {};
    for (const q of QUESTIONS) {
      if (!result[q.cat]) result[q.cat] = { total: 0, correct: 0, attempts: 0 };
      result[q.cat].total++;
      const s = pStats[q.id];
      if (s) { result[q.cat].correct += s.correct; result[q.cat].attempts += s.total; }
    }
    return result;
  }, [pStats]);

  function launch(mode, deck, cat) {
    setLaunchFilter({ deck: deck || "All", cat: cat || "All" });
    setView(mode);
  }

  const decks = Object.keys(DECK_MAP);

  return (
    <div style={pageWrap}>
      {/* Header */}
      <div className="anim-fade-up delay-0">
        <h1 style={h1}>Subjects</h1>
        <p style={pageSub}>
          Browse your question bank by deck and subdeck.
        </p>
      </div>

      {/* Year / Block header */}
      <div className="anim-fade-up delay-100" style={{
        ...card,
        padding: "14px 20px",
        background: "var(--c-accent-dim)",
        border: "1px solid var(--c-accent-brd)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: 12, color: C.muted, letterSpacing: -0.1, textTransform: "uppercase", fontWeight: 600 }}>Year 1 · Principles Block</div>
          <div style={{ fontSize: 16, color: C.text, fontWeight: 600, marginTop: 3, letterSpacing: -0.2 }}>
            {QUESTIONS.length} questions · {decks.length} decks
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, color: C.muted, letterSpacing: -0.1 }}>Coming soon</div>
          <div style={{ fontSize: 13, color: C.mutedDim, marginTop: 2 }}>Gastro · Resp · Cardio</div>
        </div>
      </div>

      {/* Deck cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {decks.map((deck, i) => {
          const { col, dim, brd } = DECK_COLOURS[deck] || DECK_COLOURS.Biochemistry;
          const stats = deckStats[deck];
          const isExpanded = expandedDeck === deck;
          const subcats = DECK_MAP[deck];

          return (
            <div key={deck} className={`anim-fade-up delay-${Math.min(200 + i * 50, 500)}`}>
              {/* Deck row */}
              <div
                onClick={() => setExpandedDeck(isExpanded ? null : deck)}
                className="hover-lift"
                style={{
                  background: "var(--c-card-bg)",
                  border: `1px solid ${isExpanded ? brd : "var(--c-border)"}`,
                  borderRadius: isExpanded ? "var(--r-panel) var(--r-panel) 0 0" : "var(--r-panel)",
                  boxShadow: isExpanded ? "none" : "var(--c-card-shadow)",
                  padding: "16px 20px",
                  cursor: "pointer",
                  transition: "border-color 0.2s, transform 0.2s",
                  display: "flex", alignItems: "center", gap: 14,
                }}
              >
                {/* Icon */}
                <div style={{
                  width: 40, height: 40, borderRadius: "var(--r-card)", flexShrink: 0,
                  background: dim, border: `1px solid ${brd}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18,
                }}>{DECK_ICONS[deck] || "📚"}</div>

                {/* Name + meta */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 16, color: C.text, letterSpacing: -0.2 }}>{deck}</div>
                  <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
                    {stats.seen}/{stats.total} seen
                    {stats.due > 0 && <span className="anim-badge-pulse" style={{ color: C.orange, marginLeft: 8 }}>· {stats.due} due</span>}
                  </div>
                </div>

                {/* Progress ring */}
                <ProgressRing pct={stats.pct} col={col} />

                {/* Expand arrow */}
                <div style={{ color: C.mutedDim, fontSize: 13, transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>▾</div>
              </div>

              {/* Expanded: subdecks + quick launch */}
              {isExpanded && (
                <div className="anim-scale-in" style={{
                  background: "var(--c-card-bg)",
                  border: `1px solid ${brd}`,
                  borderTop: "1px solid var(--c-border)",
                  borderRadius: "0 0 var(--r-panel) var(--r-panel)",
                  overflow: "hidden",
                  boxShadow: "var(--c-card-shadow)",
                  transformOrigin: "top",
                }}>
                  {/* Quick launch for whole deck */}
                  <div className="anim-fade-up delay-50" style={{ padding: "14px 20px 10px", display: "flex", gap: 8, borderBottom: "1px solid var(--c-border)" }}>
                    <button className="hover-lift btn-press" onClick={() => launch(V.PRACTICE, deck, null)} style={{
                      ...primaryBtn, padding: "7px 14px", fontSize: 13,
                      background: col,
                      boxShadow: `0 8px 20px ${col}33`,
                    }}>Practice</button>
                    <button className="hover-lift btn-press" onClick={() => launch(V.SR, deck, null)} style={{
                      ...primaryBtn, padding: "7px 14px", fontSize: 13,
                      background: "var(--c-surface2)",
                      boxShadow: "none", border: "1px solid var(--c-border)",
                      color: stats.due > 0 ? C.success : C.sub,
                    }}>Flashcards {stats.due > 0 ? `(${stats.due})` : ""}</button>
                    <button className="hover-lift btn-press" onClick={() => launch(V.TIMED, deck, null)} style={{
                      ...primaryBtn, padding: "7px 14px", fontSize: 13,
                      background: "var(--c-surface2)",
                      boxShadow: "none", border: "1px solid var(--c-border)",
                      color: C.sub,
                    }}>Timed</button>
                  </div>

                  {/* Subdecks */}
                  {subcats.map((cat, si) => {
                    const cs = catStats[cat] || { total: 0, correct: 0, attempts: 0 };
                    const catPct = cs.attempts > 0 ? Math.round(cs.correct / cs.attempts * 100) : null;
                    const catPctCol = catPct === null ? C.mutedDim : catPct >= 70 ? C.success : catPct >= 50 ? C.warning : C.danger;
                    return (
                      <div key={cat} className={`anim-fade-up delay-${Math.min(100 + si * 50, 500)}`} style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "11px 20px 11px 32px",
                        borderBottom: si < subcats.length - 1 ? "1px solid var(--c-border)" : "none",
                      }}>
                        <div style={{ width: 4, height: 4, borderRadius: "50%", background: col, flexShrink: 0, opacity: 0.6 }} />
                        <div style={{ flex: 1, fontSize: 14, color: C.sub, fontWeight: 500 }}>{cat}</div>
                        <div style={{ fontSize: 13, color: C.mutedDim, marginRight: 12 }}>
                          {cs.total} q
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: catPctCol, minWidth: 32, textAlign: "right" }}>
                          {catPct !== null ? catPct + "%" : "—"}
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="hover-lift btn-press" onClick={() => launch(V.PRACTICE, deck, cat)} style={{
                            padding: "4px 10px", borderRadius: "var(--r-pill)", fontSize: 12, fontWeight: 600,
                            background: dim, border: `1px solid ${brd}`, color: col,
                            cursor: "pointer", fontFamily: "inherit", letterSpacing: -0.1,
                          }}>Practice</button>
                          <button className="hover-lift btn-press" onClick={() => launch(V.SR, deck, cat)} style={{
                            padding: "4px 10px", borderRadius: "var(--r-pill)", fontSize: 12, fontWeight: 500,
                            background: "var(--c-surface2)", border: "1px solid var(--c-border)",
                            color: C.muted, cursor: "pointer", fontFamily: "inherit",
                          }}>Cards</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
