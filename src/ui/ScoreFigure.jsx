import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/*
 * Your score in a session's question list (2026-11-10): the share right in
 * large type, with a line or two under it. The percentage can be hidden —
 * some people would rather not watch it while they revise — and stays
 * hidden on this device until shown again.
 */
const HIDE_KEY = "rs_hide_score";
const readHidden = () => { try { return localStorage.getItem(HIDE_KEY) === "1"; } catch { return false; } };

/* `lines` may be a function of whether the score is hidden, so a line that
   carries a percentage can drop it too. */
export default function ScoreFigure({ pct, lines = [] }) {
  const [hidden, setHidden] = useState(readHidden);
  const toggle = () => {
    const next = !hidden;
    setHidden(next);
    try { localStorage.setItem(HIDE_KEY, next ? "1" : "0"); } catch { /* private mode: this visit only */ }
  };
  const Icon = hidden ? Eye : EyeOff;
  return (
    <div className="score-fig">
      <div className="score-fig__top">
        <span className={`score-fig__pct${hidden ? " is-hidden" : ""}`} aria-label={hidden ? "Score hidden" : `${pct}% correct`}>
          {hidden ? "••" : pct}<span className="score-fig__unit">%</span>
        </span>
        <button type="button" className="score-fig__eye btn-press" onClick={toggle}
          aria-label={hidden ? "Show score" : "Hide score"} title={hidden ? "Show score" : "Hide score"}>
          <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
        </button>
      </div>
      {(typeof lines === "function" ? lines(hidden) : lines).map(l => <p key={l} className="score-fig__sub">{l}</p>)}
    </div>
  );
}
