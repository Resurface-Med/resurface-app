import { useState, useMemo, useRef, useEffect } from "react";
import { C, selectBtn, label as labelStyle } from "./theme";
import { QUESTIONS } from "../data";
import Dropdown from "./Dropdown";

function unique(arr) { return ["All", ...Array.from(new Set(arr)).sort()]; }
function hasAll(arr) { return arr.includes("All") || arr.length === 0; }
function matches(val, arr) { return hasAll(arr) || arr.includes(val); }

// Defined at module scope so React never unmounts/remounts it on parent re-renders
function CompactEnrichedDropdown({ opts, activeVal, statsMap, onSelect }) {
  const dropRef = useRef(null);
  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    const stop = (e) => e.stopPropagation();
    el.addEventListener("wheel",     stop, { passive: false });
    el.addEventListener("touchmove", stop, { passive: false });
    return () => {
      el.removeEventListener("wheel",     stop);
      el.removeEventListener("touchmove", stop);
    };
  }, []);
  return (
    <div ref={dropRef} style={{
      position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
      background: "var(--c-card-bg)",
      border: "1px solid var(--c-border)",
      borderRadius: "var(--r-card)", zIndex: 200,
      maxHeight: 300, overflowY: "auto",
      overscrollBehavior: "contain",
      boxShadow: "var(--c-card-shadow)",
    }}>
      {opts.map(c => {
        const isSel = activeVal.includes(c);
        const isAll = c === "All";
        const s = isAll ? null : (statsMap[c] || { total: 0, seen: 0 });
        const seenPct = s ? (s.seen / s.total) * 100 : 0;
        return (
          <button key={c} type="button" onClick={e => { e.preventDefault(); e.stopPropagation(); onSelect(c); }} style={{
            display: "flex", flexDirection: "column", width: "100%",
            padding: isAll ? "10px 16px" : "8px 16px 7px",
            background: isSel ? "var(--c-accent-dim)" : "transparent",
            border: "none", borderBottom: "1px solid var(--c-border)",
            color: isSel ? C.accentLt : C.sub,
            fontSize: 14, fontWeight: isSel ? 600 : 400,
            letterSpacing: isSel ? -0.15 : 0,
            textAlign: "left", cursor: "pointer", fontFamily: "inherit",
            transition: "background 0.12s",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                border: `1px solid ${isSel ? C.accent : "var(--c-border)"}`,
                background: isSel ? C.accent : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {isSel && <span style={{ color: "#fff", fontSize: 12, lineHeight: 1 }}>✓</span>}
              </div>
              <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c}</span>
              {!isAll && s && (
                <span style={{ fontSize: 11, color: C.mutedDim, flexShrink: 0 }}>{s.seen}/{s.total}</span>
              )}
            </div>
            {!isAll && s && s.total > 0 && (
              <div style={{ marginTop: 5, marginLeft: 26, height: 2, borderRadius: "var(--r-pill)", background: "var(--c-overlay2)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: seenPct + "%", background: C.accent, borderRadius: "var(--r-pill)" }} />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function FilterPanel({ value, onChange, pStats = {} }) {
  const { year = ["All"], block = ["All"], deck = ["All"], cat = ["All"], unseenOnly = false } = value;
  const [open, setOpen] = useState(null);

  const years  = useMemo(() => unique(QUESTIONS.map(q => q.year)), []);
  const blocks = useMemo(() => unique(QUESTIONS.filter(q => matches(q.year, year)).map(q => q.block)), [year]);
  const decks  = useMemo(() => unique(QUESTIONS.filter(q => matches(q.year, year) && matches(q.block, block)).map(q => q.deck)), [year, block]);
  const cats   = useMemo(() => unique(QUESTIONS.filter(q => matches(q.year, year) && matches(q.block, block) && matches(q.deck, deck)).map(q => q.cat)), [year, block, deck]);

  // Stats maps for enriched dropdowns
  function buildStatsMap(filterFn, groupKey) {
    const result = {};
    for (const q of QUESTIONS) {
      if (!filterFn(q)) continue;
      const key = q[groupKey];
      if (!result[key]) result[key] = { total: 0, seen: 0 };
      result[key].total++;
      const s = pStats[q.id];
      if (s && s.total > 0) result[key].seen++;
    }
    return result;
  }

  const blockStatsMap = useMemo(() =>
    buildStatsMap(q => matches(q.year, year), "block"),
  [pStats, year]);

  const deckStatsMap = useMemo(() =>
    buildStatsMap(q => matches(q.year, year) && matches(q.block, block), "deck"),
  [pStats, year, block]);

  const catStatsMap = useMemo(() =>
    buildStatsMap(q => matches(q.year, year) && matches(q.block, block) && matches(q.deck, deck), "cat"),
  [pStats, year, block, deck]);

  function handleSelect(field, val) {
    let current = value[field] || ["All"];
    let nextArr = [...current];
    if (val === "All") {
      nextArr = ["All"];
      setOpen(null);
    } else {
      nextArr = nextArr.filter(v => v !== "All");
      if (nextArr.includes(val)) {
        nextArr = nextArr.filter(v => v !== val);
      } else {
        nextArr.push(val);
      }
      if (nextArr.length === 0) nextArr = ["All"];
    }
    const next = { ...value, [field]: nextArr };
    if (field === "year")  { next.block = ["All"]; next.deck = ["All"]; next.cat = ["All"]; }
    if (field === "block") { next.deck = ["All"]; next.cat = ["All"]; }
    if (field === "deck")  { next.cat = ["All"]; }
    onChange(next);
  }



  function renderTrigger(key, label, val, opts) {
    const active = !hasAll(val);
    const isOpen = open === key;
    const onlyAll = opts.length <= 2 && !active;
    const displayLabel = active ? (val.length === 1 ? val[0] : `${val.length} selected`) : `All ${label}s`;
    return (
      <div key={key} style={{ position: "relative" }}>
        <div style={labelStyle}>{label}</div>
        <button
          style={{
            ...selectBtn,
            borderColor: active ? C.accentBrd : "var(--c-border)",
            color: active ? C.accentLt : onlyAll ? C.mutedDim : C.text,
            opacity: opts.length <= 1 ? 0.4 : 1,
            cursor: opts.length <= 1 ? "not-allowed" : "pointer",
            fontSize: 15, padding: "11px 14px",
          }}
          onClick={() => opts.length > 1 && setOpen(isOpen ? null : key)}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayLabel}</span>
          <span style={{ marginLeft: "auto", color: C.muted, fontSize: 11, flexShrink: 0 }}>▾</span>
        </button>
        {isOpen && { year: <Dropdown items={opts} active={val} onSelect={v => handleSelect(key, v)} multiple={true} />, block: <CompactEnrichedDropdown opts={opts} activeVal={val} statsMap={blockStatsMap} onSelect={c => handleSelect(key, c)} />, deck: <CompactEnrichedDropdown opts={opts} activeVal={val} statsMap={deckStatsMap} onSelect={c => handleSelect(key, c)} />, cat: <CompactEnrichedDropdown opts={opts} activeVal={val} statsMap={catStatsMap} onSelect={c => handleSelect(key, c)} /> }[key]}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px 12px", marginBottom: 12 }}>
        {renderTrigger("year",  "Year",    year,  years)}
        {renderTrigger("block", "Block",   block, blocks)}
        {renderTrigger("deck",  "Subject", deck,  decks)}
      </div>
      <div style={{ marginBottom: 12 }}>
        {renderTrigger("cat", "Topic", cat, cats)}
      </div>

      <div
        onClick={() => onChange({ ...value, unseenOnly: !unseenOnly })}
        style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", width: "fit-content" }}
      >
        <div style={{
          width: 36, height: 20, borderRadius: 99, flexShrink: 0,
          background: unseenOnly ? C.accent : "var(--c-surface3)",
          border: `1px solid ${unseenOnly ? C.accentBrd : "var(--c-border)"}`,
          transition: "background 0.2s, border-color 0.2s", position: "relative",
        }}>
          <div style={{
            position: "absolute", top: 2, left: 2,
            width: 14, height: 14, borderRadius: "50%",
            background: unseenOnly ? "#fff" : "var(--c-muted)",
            transform: `translateX(${unseenOnly ? 15 : 0}px)`,
            transition: "transform 0.2s, background 0.2s",
          }} />
        </div>
        <span style={{ fontSize: 14, color: unseenOnly ? C.text : C.muted, transition: "color 0.2s" }}>
          Only show unseen questions
        </span>
      </div>
    </div>
  );
}

export function filteredQuestions(filter, pStats = {}) {
  const { year = ["All"], block = ["All"], deck = ["All"], cat = ["All"], unseenOnly = false } = filter;
  return QUESTIONS.filter(q => {
    if (unseenOnly && pStats[q.id]) return false;
    if (!matches(q.year, year)) return false;
    if (!matches(q.block, block)) return false;
    if (!matches(q.deck, deck)) return false;
    if (!matches(q.cat, cat)) return false;
    return true;
  });
}

export const defaultFilter = { year: ["All"], block: ["All"], deck: ["All"], cat: ["All"], unseenOnly: false };
