import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ago, dayLabel, wrongIds, waitingMistakes } from "../lib/pastSessions";

/**
 * Past sessions (2026-10-20, again — a student asked for it back: "sometimes
 * I cba to go through the incorrect ones in that moment and only get back to
 * them ages later").
 *
 * So it leads with the mistakes: the questions got wrong in past sessions
 * and not got right since, as one count and one button. Then every session,
 * by day: a score ring, a strip of how each question went, and the one
 * thing worth doing with it — Continue an unfinished one, Redo the ones you
 * got wrong, or look back over a clean run.
 *
 * Opened from a link in Study's heading and from the end of a session; the
 * pop-up's own card (np-scrim / np), whole-screen on a phone. Everything
 * arrives in sequence: the card, the count, the rings filling, the strips
 * drawing across, the rows one after another.
 */

const tone = pct => (pct >= 80 ? "good" : pct >= 50 ? "mid" : "low");

/* A number that counts up to itself. */
function CountUp({ to, ms = 700 }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setN(to); return; }
    let raf; const t0 = performance.now();
    const tick = now => {
      const p = Math.min(1, (now - t0) / ms);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return n;
}

function Ring({ s, delay }) {
  const done = s.finished;
  const pct = s.answered ? Math.round((s.correct / s.answered) * 100) : 0;
  const fill = done ? pct : Math.round((s.answered / Math.max(1, s.total)) * 100);
  const r = 19, c = 2 * Math.PI * r;
  const [shown, setShown] = useState(0);
  useEffect(() => { const t = setTimeout(() => setShown(fill), delay); return () => clearTimeout(t); }, [fill, delay]);
  return (
    <span className={`ps-ring is-${done ? tone(pct) : "open"}`} aria-hidden="true">
      <svg width="48" height="48" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r={r} className="ps-ring__track" />
        <circle cx="24" cy="24" r={r} className="ps-ring__fill"
          strokeDasharray={c} strokeDashoffset={c * (1 - shown / 100)} />
      </svg>
      <span className="ps-ring__n">{done ? `${pct}%` : `${s.answered}/${s.total}`}</span>
    </span>
  );
}

/* How each question went, left to right: right, wrong, not reached. */
function Strip({ s }) {
  const items = s.items ?? [];
  return (
    <span className="ps-strip" aria-hidden="true">
      {items.map((it, i) => (
        <span key={i} className={`ps-strip__q ${it.pick == null ? (s.finished ? "is-wrong" : "is-open") : it.ok ? "is-right" : "is-wrong"}`} />
      ))}
    </span>
  );
}

export default function PastSessions({ sessions, srCards = {}, liveIds = null, onOpen, onFix, onClose }) {
  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const waiting = useMemo(() => waitingMistakes(sessions, srCards, liveIds), [sessions, srCards, liveIds]);
  const fromN = useMemo(() => sessions.filter(s => wrongIds(s).some(id => waiting.includes(id))).length, [sessions, waiting]);
  const anyMistakes = useMemo(() => sessions.some(s => wrongIds(s).length > 0), [sessions]);

  /* By day, newest first; rows numbered across groups for the stagger. */
  const groups = useMemo(() => {
    const out = [];
    for (const s of sessions) {
      const label = dayLabel(s.updated_at);
      const g = out[out.length - 1];
      if (g && g.label === label) g.rows.push(s); else out.push({ label, rows: [s] });
    }
    return out;
  }, [sessions]);
  let i = 0;

  return createPortal(
    <div className="np-scrim ps-scrim" role="presentation" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="np ps" role="dialog" aria-modal="true" aria-labelledby="ps-title">
        <div className="ps-head">
          <h2 className="np__title" id="ps-title">Past sessions</h2>
          <button type="button" className="ps-x" onClick={onClose} aria-label="Close">
            <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>
          </button>
        </div>

        {waiting.length > 0 ? (
          <section className="ps-fix">
            <div className="ps-fix__text">
              <span className="ps-fix__n"><CountUp to={waiting.length} /></span>
              <span className="ps-fix__what">
                {waiting.length === 1 ? "mistake" : "mistakes"} to go back to
                <span className="ps-fix__from">from {fromN} session{fromN === 1 ? "" : "s"}</span>
              </span>
            </div>
            <button type="button" className="ps-fix__go btn-press" onClick={() => onFix(waiting)}>
              Go through them <span aria-hidden="true">→</span>
            </button>
          </section>
        ) : anyMistakes ? (
          <p className="ps-clear">Nothing waiting. Every mistake since put right.</p>
        ) : null}

        <div className="ps-list">
          {groups.map(g => (
            <div key={g.label} className="ps-day">
              <h3 className="ps-day__h">{g.label}</h3>
              {g.rows.map(s => {
                const n = i++;
                const w = wrongIds(s).filter(id => !liveIds || liveIds.has(id)).length;
                const primary = !s.finished ? ["continue", "Continue"]
                  : w > 0 ? ["wrong", `Redo ${w} wrong`]
                  : ["continue", "Look back"];
                const secondary = !s.finished ? ["redo", "Start again"]
                  : w > 0 ? ["continue", "Look back"]
                  : ["redo", "Redo"];
                return (
                  <article key={s.id} className="ps-row" style={{ "--i": n }}>
                    <Ring s={s} delay={260 + n * 70} />
                    <div className="ps-main">
                      <p className="ps-label">{s.label || "Practice"}</p>
                      <p className="ps-meta">
                        {s.finished ? `${s.correct} of ${s.total} right` : `${s.answered} of ${s.total} done`}
                        {" · "}{ago(s.updated_at)}
                      </p>
                      <Strip s={s} />
                    </div>
                    <div className="ps-acts">
                      <button type="button" className={`ps-go btn-press${primary[0] === "wrong" ? " is-wrong" : ""}`} onClick={() => onOpen(s, primary[0])}>
                        {primary[1]}
                      </button>
                      <button type="button" className="ps-alt" onClick={() => onOpen(s, secondary[0])}>{secondary[1]}</button>
                    </div>
                  </article>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
