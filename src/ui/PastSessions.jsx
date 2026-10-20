import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { dayLabel, wrongIds, waitingMistakes } from "../lib/pastSessions";

/**
 * Past sessions (2026-10-20): a plain history, newest first, by day. Each
 * session is a line — what it was on, how it went, when — with Continue or
 * Review, and Redo wrong where there were any.
 *
 * Simple on purpose. A version led by a big mistakes count, score rings and
 * coloured strips read as "AI-looking" (Rafil), so the mistakes still
 * waiting are one quiet line at the top, and nothing animates but the card.
 */

const time = iso => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export default function PastSessions({ sessions, srCards = {}, liveIds = null, onOpen, onFix, onClose }) {
  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const waiting = useMemo(() => waitingMistakes(sessions, srCards, liveIds), [sessions, srCards, liveIds]);

  const groups = useMemo(() => {
    const out = [];
    for (const s of sessions) {
      const label = dayLabel(s.updated_at);
      const g = out[out.length - 1];
      if (g && g.label === label) g.rows.push(s); else out.push({ label, rows: [s] });
    }
    return out;
  }, [sessions]);

  return createPortal(
    <div className="np-scrim ps-scrim" role="presentation" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="np ps" role="dialog" aria-modal="true" aria-labelledby="ps-title">
        <div className="ps-head">
          <h2 className="np__title" id="ps-title">Past sessions</h2>
          <button type="button" className="ps-x" onClick={onClose} aria-label="Close">
            <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>
          </button>
        </div>

        {waiting.length > 0 && (
          <p className="ps-note">
            {waiting.length} {waiting.length === 1 ? "question" : "questions"} you got wrong {waiting.length === 1 ? "hasn’t" : "haven’t"} been answered again.{" "}
            <button type="button" className="gen-link" onClick={() => onFix(waiting)}>Go through them</button>
          </p>
        )}

        <div className="ps-list">
          {groups.map(g => (
            <section key={g.label} className="ps-day">
              <h3 className="ps-day__h">{g.label}</h3>
              {g.rows.map(s => {
                const w = wrongIds(s).filter(id => !liveIds || liveIds.has(id)).length;
                return (
                  <div key={s.id} className="ps-row">
                    <div className="ps-main">
                      <p className="ps-label">{s.label || "Practice"}</p>
                      <p className="ps-meta">
                        {s.finished ? `${s.correct} of ${s.total} right` : `${s.answered} of ${s.total} answered`}
                        {" · "}{time(s.updated_at)}
                      </p>
                    </div>
                    <div className="ps-acts">
                      {w > 0 && s.finished && (
                        <button type="button" className="ps-alt" onClick={() => onOpen(s, "wrong")}>Redo wrong</button>
                      )}
                      <button type="button" className="ps-go" onClick={() => onOpen(s, "continue")}>
                        {s.finished ? "Review" : "Continue"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
