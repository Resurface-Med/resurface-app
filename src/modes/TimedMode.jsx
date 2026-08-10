import { useState, useEffect, useRef } from "react";
import { C, pageWrap, card, h1, primaryBtn, chipBtn, chipBtnActive, label as labelStyle, pageSub, OF } from "../ui/theme";
import { shuffle, shuffleOptions } from "../ui/theme";
import { remote } from "../lib/remote";
import { useAuth } from "../lib/auth";
import QuestionCard from "../ui/QuestionCard";
import GhostBtn from "../ui/GhostBtn";
import FilterPanel, { filteredQuestions, defaultFilter } from "../ui/FilterPanel";
import SessionSummary from "../ui/SessionSummary";

const COUNT_OPTIONS = [10, 20, 50, "All"];

export default function TimedMode({ pStats, onAnswer, launchFilter, timedBests = {} }) {
  const { user } = useAuth();
  const [filter, setFilter] = useState(launchFilter
    ? { year: ["All"], block: ["All"], deck: launchFilter.deck ? [launchFilter.deck] : ["All"], cat: launchFilter.cat ? [launchFilter.cat] : ["All"], unseenOnly: false }
    : defaultFilter
  );
  const [limit, setLimit] = useState(30);
  const [countOpt, setCountOpt] = useState(20);
  const [running, setRunning] = useState(false);
  const [queue, setQ] = useState([]);
  const [idx, setIdx] = useState(0);
  const [sel, setSel] = useState(null);
  const [to, setTO] = useState(false);
  const [tl, setTL] = useState(30);
  const [sC, setSC] = useState(0);
  const [sT, setST] = useState(0);
  const [fin, setFin] = useState(false);
  const [results, setResults] = useState([]);
  const timer = useRef(null);

  function start() {
    const base = filteredQuestions(filter, pStats);
    const shuffled = shuffle(base);
    const q = (countOpt === "All" ? shuffled : shuffled.slice(0, Math.min(countOpt, shuffled.length))).map(shuffleOptions);
    setQ(q); setIdx(0); setSel(null); setTO(false); setTL(limit); setSC(0); setST(0); setFin(false); setResults([]); setRunning(true);
  }

  useEffect(() => {
    if (!running || sel !== null || to || fin) { clearInterval(timer.current); return; }
    setTL(limit);
    timer.current = setInterval(() => setTL(t => {
      if (t <= 1) { clearInterval(timer.current); setTO(true); return 0; }
      return t - 1;
    }), 1000);
    return () => clearInterval(timer.current);
  }, [running, idx, sel, to, fin]);

  useEffect(() => {
    if (to && sel === null) { setST(t => t + 1); onAnswer(queue[idx]?.id, false); }
  }, [to]);

  function handleAnswer(i) {
    if (sel !== null || to) return;
    clearInterval(timer.current); setSel(i);
    const q = queue[idx];
    const ok = i === q.ans;
    setST(t => t + 1); if (ok) setSC(c => c + 1);
    onAnswer(q.id, ok);
    setResults(prev => [...prev, {
      id: q.id, q: q.q, cat: q.cat,
      correct: ok,
      correctAnswer: q.opts[q.ans],
      yourAnswer: q.opts[i],
    }]);
  }

  function handleNext() {
    if (idx + 1 >= queue.length) { setFin(true); setRunning(false); return; }
    setIdx(i => i + 1); setSel(null); setTO(false);
  }

  const timerCol = tl > limit * 0.5 ? C.success : tl > limit * 0.25 ? C.warning : C.danger;
  const _filterLabel = [
    !filter.deck.includes("All") && filter.deck.join(", "),
    !filter.cat.includes("All") && filter.cat.join(", ")
  ].filter(Boolean).join(" · ") || "All Topics";

  if (fin) {
    const pct = Math.round(sC / sT * 100);
    // Postgres keeps the best per scope; sending every result and letting the
    // row hold the max would need a merge, so only send when it improves on
    // what this session started with.
    const key = `${filter.deck}__${limit}s`;
    const bestPct = timedBests[key];
    if (user && pct > (bestPct ?? -1)) remote.timedBest(user.id, key, pct);
    return (
      <SessionSummary
        title="Timed Challenge"
        results={results}
        onRestart={start}
        onChangeSettings={() => { setFin(false); setRunning(false); }}
      />
    );
  }

  if (!running) {
    const baseCount = filteredQuestions(filter, pStats).length;
    return (
      <div style={pageWrap}>
        <h1 className="anim-fade-up delay-0" style={h1}>Timed Challenge</h1>
        <p className="anim-fade-up delay-50" style={pageSub}>Answer each question before the timer runs out.</p>
        <div className="anim-fade-up delay-100" style={card}>
          <div style={{ marginBottom: 20 }}>
            <FilterPanel value={filter} onChange={f => { setFilter(f); setCountOpt("All"); }} pStats={pStats} />
          </div>
          <div className="anim-fade-up delay-200" style={{ marginBottom: 20 }}>
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
          <div className="anim-fade-up delay-350" style={{ marginBottom: 24 }}>
            <div style={labelStyle}>Time per question</div>
            <div style={{ display: "flex", gap: 8 }}>
              {[15, 30, 45, 60].map((t, i) => (
                <button key={t} className={`anim-fade-up delay-${350 + i * 50} hover-lift btn-press`} style={{ ...chipBtn, ...(t === limit ? chipBtnActive : {}) }} onClick={() => setLimit(t)}>{t}s</button>
              ))}
            </div>
          </div>
          <button className="anim-fade-up delay-500 hover-lift btn-press" style={{ ...primaryBtn, width: "100%", opacity: baseCount === 0 ? 0.5 : 1 }} onClick={start} disabled={baseCount === 0}>
            Start Challenge →
          </button>
        </div>
      </div>
    );
  }

  const q = queue[idx];
  return (
    <div style={pageWrap}>
      <div className="anim-fade-down delay-0" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 11, color: OF.soft, letterSpacing: 1, fontWeight: 600, textTransform: "uppercase" }}>Timed Challenge</div>
          <div style={{ fontWeight: 600, fontSize: 16, marginTop: 2, color: OF.text, letterSpacing: -0.3 }}>Q{idx + 1} of {queue.length}</div>
        </div>
        <div className="anim-scale-in delay-100" style={{ textAlign: "right" }}>
          <div className={tl <= limit * 0.25 ? "anim-timer-urgent" : ""} style={{ fontSize: 40, fontWeight: 600, color: timerCol, lineHeight: 1, letterSpacing: -2 }}>{tl}</div>
          {sT > 0 && <div style={{ fontSize: 11, color: OF.soft }}>{Math.round(sC / sT * 100)}% so far</div>}
        </div>
      </div>
      <div className="anim-fade-up delay-50" style={{ height: 5, background: "var(--c-overlay2)", borderRadius: "var(--r-pill)", overflow: "hidden", marginBottom: 4 }}>
        <div style={{ height: "100%", width: (tl / limit * 100) + "%", background: timerCol, borderRadius: "var(--r-pill)", transition: "width 1s linear, background 0.3s" }} />
      </div>
      <QuestionCard q={q} sel={sel} timedOut={to} onAnswer={handleAnswer} onNext={handleNext}
        isLast={idx + 1 >= queue.length} nextLabel={idx + 1 >= queue.length ? "See Results" : "Next"}
        onSaveEdit={updated => setQ(prev => prev.map((item, i) => i === idx ? { ...item, ...updated } : item))} />
    </div>
  );
}
