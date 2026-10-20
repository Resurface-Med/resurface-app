import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ago } from "../lib/pastSessions";

/**
 * Past sessions (2026-10-20), opened from a small link in Study's heading —
 * not a page of its own. Each one: what it was on, how far you got and your
 * score, when; then Continue (or Review, once finished) and Redo.
 *
 * Laid out like the share sheet: a card on desktop, the whole screen on a
 * phone.
 */
export default function PastSessions({ sessions, onOpen, onClose }) {
  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="shr-scrim" role="dialog" aria-modal="true" aria-label="Past sessions"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="shr-card past-card">
        <div className="shr-head">
          <h2 className="shr-title">Past sessions</h2>
          <button type="button" className="shr-x" onClick={onClose} aria-label="Close">
            <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <ul className="past-list">
          {sessions.map(s => {
            const done = s.finished;
            const pct = s.answered ? Math.round((s.correct / s.answered) * 100) : null;
            return (
              <li key={s.id} className="past-row">
                <div className="past-main">
                  <p className="past-label">{s.label || "Practice"}</p>
                  <p className="past-meta">
                    {done ? `${s.total} question${s.total === 1 ? "" : "s"}` : `${s.answered} of ${s.total} done`}
                    {pct != null && <> · {pct}%</>}
                    {" · "}{ago(s.updated_at)}
                  </p>
                </div>
                <div className="past-acts">
                  <button type="button" className="past-redo" onClick={() => onOpen(s, "redo")}>Redo</button>
                  <button type="button" className="past-go btn-press" onClick={() => onOpen(s, "continue")}>
                    {done ? "Review" : "Continue"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
