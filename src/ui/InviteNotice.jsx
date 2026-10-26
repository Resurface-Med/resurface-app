import { useEffect, useRef, useState } from "react";
import { logStep } from "../lib/remote";

/**
 * "Resurface is better with your friends on it." (2026-10-26)
 *
 * The same bar as the update notice, asking someone who uses Resurface to
 * pass it on. Sharing a deck is how most people have arrived so far; this
 * asks for the app itself. The button shares the sign-up link alone, no
 * message: the link's preview card (index.html) does the explaining, and
 * people write their own words (Rafil: he never sends the canned ones).
 *
 * When, and how often (agreed with Rafil):
 *  - only once someone has studied on 3 or more days;
 *  - only right after they finish a session, never during one or on opening;
 *  - dismissed, it waits 10 days, and after 3 dismissals it never comes back;
 *  - shared, it waits 30 days;
 *  - never on top of another bar (the update notice).
 * Remembered per account on this device.
 */
const LINK = "https://app.tryresurface.com/?ref=invite";
const DAY = 864e5;
const keyFor = id => `invite:${id}`;
function load(id) { try { return JSON.parse(localStorage.getItem(keyFor(id))) ?? {}; } catch { return {}; } }
function save(id, v) { try { localStorage.setItem(keyFor(id), JSON.stringify(v)); } catch { /* fine */ } }

export default function InviteNotice({ userId, studyDays, sessionActive }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const was = useRef(sessionActive);

  /* A session just ended: is this a moment to ask? */
  useEffect(() => {
    const ended = was.current && !sessionActive;
    was.current = sessionActive;
    if (!ended || !userId || studyDays < 3) return;
    const st = load(userId);
    if ((st.dismissed ?? 0) >= 3 || Date.now() < (st.nextAt ?? 0)) return;
    const t = setTimeout(() => {
      if (document.querySelector(".update-note")) return;   // one bar at a time
      setOpen(true);
      logStep(userId, "invite_shown");
    }, 1200);
    return () => clearTimeout(t);
  }, [sessionActive, userId, studyDays]);

  if (!open) return null;

  function close(how) {
    const st = load(userId);
    if (how === "dismiss") save(userId, { ...st, dismissed: (st.dismissed ?? 0) + 1, nextAt: Date.now() + 10 * DAY });
    else save(userId, { ...st, nextAt: Date.now() + 30 * DAY });
    setOpen(false);
  }
  async function share() {
    logStep(userId, "invite_shared");
    if (navigator.share) {
      try { await navigator.share({ url: LINK }); close("shared"); }
      catch { /* they backed out of the share sheet; leave the bar */ }
      return;
    }
    try { await navigator.clipboard.writeText(LINK); } catch { window.prompt("Copy this link", LINK); }
    setCopied(true);
    setTimeout(() => close("shared"), 1600);
  }

  return (
    <div className="update-note" role="status" aria-live="polite">
      <span className="update-note-text">{copied ? "Link copied. Paste it to your friends." : "Resurface is better with your friends on it."}</span>
      {!copied && <button type="button" className="update-note-btn btn-press" onClick={share}>Share Resurface</button>}
      <button type="button" className="update-note-x" onClick={() => close("dismiss")} aria-label="Not now">
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
      </button>
    </div>
  );
}
