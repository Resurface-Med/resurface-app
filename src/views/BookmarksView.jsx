import { useState } from "react";
import { C, pageWrap, card, h1, chipBtn, chipBtnActive } from "../ui/theme";
import { QUESTIONS } from "../data";
import CatTag from "../ui/CatTag";
import BmBtn from "../ui/BmBtn";

export default function BookmarksView({ bookmarks, pStats, onToggleBookmark }) {
  const bqs = QUESTIONS.filter(q => bookmarks.includes(q.id));
  const [filter, setFilter] = useState("All");
  const cats = [...new Set(bqs.map(q => q.cat))];
  const filtered = filter === "All" ? bqs : bqs.filter(q => q.cat === filter);

  return (
    <div style={pageWrap}>
      <div className="anim-fade-down delay-0" style={{ marginBottom: 4 }}>
        <h1 style={h1}>Saved Questions</h1>
        <p style={{ color: C.muted, fontSize: 15, marginTop: 4 }}>{bqs.length} bookmarked</p>
      </div>

      {bqs.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {["All", ...cats].map((c, i) => (
            <button key={c} className={`anim-fade-up delay-${Math.min(100 + i * 50, 500)} hover-lift btn-press`} style={{ ...chipBtn, ...(c === filter ? chipBtnActive : {}) }} onClick={() => setFilter(c)}>{c}</button>
          ))}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="anim-scale-in delay-200" style={{ ...card, textAlign: "center", padding: "48px 32px", color: C.muted }}>
          <div className="anim-pop delay-400" style={{ fontSize: 36, marginBottom: 12 }}>☆</div>
          {bqs.length === 0 ? "Bookmark questions while practising to save them here." : "No bookmarks in this category."}
        </div>
      )}

      {filtered.map((q, i) => {
        const s = pStats[q.id];
        const pct = s ? Math.round(s.correct / s.total * 100) : null;
        return (
          <div key={q.id} className={`anim-fade-up delay-${Math.min(200 + i * 50, 500)}`} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <CatTag label={q.cat} />
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {pct !== null && <span style={{ fontSize: 13, fontWeight: 700, color: pct >= 70 ? C.success : C.warning }}>{pct}%</span>}
                <BmBtn active={true} onClick={() => onToggleBookmark(q.id)} />
              </div>
            </div>
            <p style={{ fontSize: 15, fontWeight: 600, color: C.text, lineHeight: 1.55, marginBottom: 12, letterSpacing: -0.2 }}>{q.q}</p>
            <div style={{ display: "flex", gap: 8, padding: "10px 14px", background: C.successDim, border: `1px solid ${C.successBrd}`, borderRadius: "var(--r-card)", fontSize: 14, color: C.success }}>
              <span style={{ fontWeight: 700 }}>{"ABCDE"[q.ans]}</span>
              <span>{q.opts[q.ans]}</span>
            </div>
            <div style={{ marginTop: 10, padding: "10px 14px", background: C.accentDim, border: `1px solid ${C.accentBrd}`, borderRadius: "var(--r-card)", fontSize: 13, color: C.sub, lineHeight: 1.7 }}>{q.exp}</div>
          </div>
        );
      })}
    </div>
  );
}
