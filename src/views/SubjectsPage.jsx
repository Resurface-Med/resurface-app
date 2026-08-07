import { useState, useMemo } from "react";
import { C, V, pageWrap, h1, primaryBtn } from "../ui/theme";
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

const DECK_COLOURS = {
  Biochemistry:          { col: "#4d8ef5", dim: "rgba(77,142,245,0.1)",  brd: "rgba(77,142,245,0.25)"  },
  Genetics:              { col: "#a78bfa", dim: "rgba(167,139,250,0.1)", brd: "rgba(167,139,250,0.25)" },
  Physiology:            { col: "#34d399", dim: "rgba(52,211,153,0.1)",  brd: "rgba(52,211,153,0.25)"  },
  Pathology:             { col: "#f87171", dim: "rgba(248,113,113,0.1)", brd: "rgba(248,113,113,0.25)" },
  Immunology:            { col: "#fbbf24", dim: "rgba(251,191,36,0.1)",  brd: "rgba(251,191,36,0.25)"  },
  Histology:             { col: "#67e8f9", dim: "rgba(103,232,249,0.1)", brd: "rgba(103,232,249,0.25)" },
  Anatomy:               { col: "#fb923c", dim: "rgba(251,146,60,0.1)",  brd: "rgba(251,146,60,0.25)"  },
  Embryology:            { col: "#86efac", dim: "rgba(134,239,172,0.1)", brd: "rgba(134,239,172,0.25)" },
  "Infection/Microbiology": { col: "#f472b6", dim: "rgba(244,114,182,0.1)", brd: "rgba(244,114,182,0.25)" },
  Pharmacology:          { col: "#c084fc", dim: "rgba(192,132,252,0.1)", brd: "rgba(192,132,252,0.25)" },
};

function ProgressRing({ pct, col, size = 44 }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const fill = ((pct || 0) / 100) * circ;
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={5} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={5}
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ filter: `drop-shadow(0 0 4px ${col}88)` }} />
      <text x={size/2} y={size/2 + 4} textAnchor="middle" fontSize={10} fontWeight={600}
        fill={pct ? col : C.mutedDim} fontFamily="Outfit, sans-serif">
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
        <p style={{ color: C.sub, fontSize: 15, marginTop: 5, fontWeight: 300 }}>
          Browse your question bank by deck and subdeck.
        </p>
      </div>

      {/* Year / Block header */}
      <div className="anim-fade-up delay-100" style={{
        background: "linear-gradient(135deg, rgba(77,142,245,0.08) 0%, rgba(77,142,245,0.03) 100%)",
        border: "1px solid rgba(77,142,245,0.2)",
        borderRadius: 12, padding: "14px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: 12, color: C.muted, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600 }}>Year 1 · Principles Block</div>
          <div style={{ fontSize: 16, color: C.text, fontWeight: 400, marginTop: 3 }}>
            {QUESTIONS.length} questions · {decks.length} decks
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, color: C.muted, letterSpacing: 0.5 }}>Coming soon</div>
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
                  background: `linear-gradient(145deg, #0d1a35 0%, #070d1c 100%)`,
                  border: `1px solid ${isExpanded ? brd : "rgba(255,255,255,0.07)"}`,
                  borderRadius: isExpanded ? "14px 14px 0 0" : 14,
                  padding: "16px 20px",
                  cursor: "pointer",
                  transition: "border-color 0.2s, transform 0.2s",
                  display: "flex", alignItems: "center", gap: 14,
                }}
              >
                {/* Icon */}
                <div style={{
                  width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                  background: dim, border: `1px solid ${brd}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18,
                }}>{DECK_ICONS[deck] || "📚"}</div>

                {/* Name + meta */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 16, color: C.text }}>{deck}</div>
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
                  background: "rgba(5,10,25,0.6)",
                  border: `1px solid ${brd}`,
                  borderTop: "none",
                  borderRadius: "0 0 14px 14px",
                  overflow: "hidden",
                  transformOrigin: "top",
                }}>
                  {/* Quick launch for whole deck */}
                  <div className="anim-fade-up delay-50" style={{ padding: "14px 20px 10px", display: "flex", gap: 8, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <button className="hover-lift btn-press" onClick={() => launch(V.PRACTICE, deck, null)} style={{
                      ...primaryBtn, padding: "7px 14px", fontSize: 13,
                      background: `linear-gradient(135deg, ${col}, ${col}bb)`,
                      boxShadow: `0 0 14px ${col}33`,
                    }}>Practice</button>
                    <button className="hover-lift btn-press" onClick={() => launch(V.SR, deck, null)} style={{
                      ...primaryBtn, padding: "7px 14px", fontSize: 13,
                      background: "rgba(255,255,255,0.06)",
                      boxShadow: "none", border: "1px solid rgba(255,255,255,0.1)",
                      color: stats.due > 0 ? C.success : C.sub,
                    }}>Flashcards {stats.due > 0 ? `(${stats.due})` : ""}</button>
                    <button className="hover-lift btn-press" onClick={() => launch(V.TIMED, deck, null)} style={{
                      ...primaryBtn, padding: "7px 14px", fontSize: 13,
                      background: "rgba(255,255,255,0.06)",
                      boxShadow: "none", border: "1px solid rgba(255,255,255,0.1)",
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
                        borderBottom: si < subcats.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                      }}>
                        <div style={{ width: 4, height: 4, borderRadius: "50%", background: col, flexShrink: 0, opacity: 0.6 }} />
                        <div style={{ flex: 1, fontSize: 14, color: C.sub }}>{cat}</div>
                        <div style={{ fontSize: 13, color: C.mutedDim, marginRight: 12 }}>
                          {cs.total} q
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: catPctCol, minWidth: 32, textAlign: "right" }}>
                          {catPct !== null ? catPct + "%" : "—"}
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="hover-lift btn-press" onClick={() => launch(V.PRACTICE, deck, cat)} style={{
                            padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500,
                            background: dim, border: `1px solid ${brd}`, color: col,
                            cursor: "pointer", fontFamily: "inherit",
                          }}>Practice</button>
                          <button className="hover-lift btn-press" onClick={() => launch(V.SR, deck, cat)} style={{
                            padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500,
                            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
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
