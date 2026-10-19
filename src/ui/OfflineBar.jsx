import { useEffect, useRef, useState } from "react";
import { useOnline } from "../lib/online";
import { h1 } from "./theme";
import Wave from "./Wave";

/**
 * "You're offline" (2026-10-19).
 *
 * A pill where the update notice goes, while the app is working from the
 * device's copy: you can carry on, and what you answer is sent when the
 * connection is back. Closed, it stays away until the next time you go
 * offline. Coming back, it says so for a moment, then goes. Held back
 * during a practice session (`hold`), where it would sit on the progress
 * bar — answering offline needs nothing from you.
 */
export default function OfflineBar({ hold = false }) {
  const online = useOnline();
  const [dismissed, setDismissed] = useState(false);
  const [back, setBack] = useState(false);
  const was = useRef(online);

  useEffect(() => {
    if (online && !was.current) {
      setBack(true);
      setDismissed(false);
      const t = setTimeout(() => setBack(false), 3000);
      was.current = online;
      return () => clearTimeout(t);
    }
    if (!online) setBack(false);
    was.current = online;
  }, [online]);

  if (hold || (online && !back)) return null;
  if (!online && dismissed) return null;
  return (
    <div className={`offline-note${online ? " is-back" : ""}`} role="status" aria-live="polite">
      <span className={`offline-note-dot${online ? " is-on" : ""}`} aria-hidden="true" />
      <span className="offline-note-text">
        {online ? "Back online. Everything’s saved." : "You’re offline. Answers sync later."}
      </span>
      {!online && (
        <button type="button" className="offline-note-x" onClick={() => setDismissed(true)} aria-label="Hide">
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
      )}
    </div>
  );
}

/* A whole screen that is only the server's — Admin — while offline. */
const band = { maxWidth: 1180, margin: "0 auto", padding: "0 clamp(20px, 3vw, 40px)", width: "100%" };
export function NeedsConnection({ title, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "var(--app-vh)" }}>
      <div className="page-band" style={{ ...band, paddingTop: "clamp(22px, 3.6vh, 36px)", paddingBottom: "clamp(18px, 2.8vh, 28px)" }}>
        <h1 style={{ ...h1, margin: 0 }}>{title}</h1>
      </div>
      <Wave from="transparent" to="var(--c-card-solid)" />
      <div style={{ background: "var(--c-card-solid)", flex: 1 }}>
        <div className="needs-net">
          <p className="needs-net__title">You’re offline</p>
          <p>{children}</p>
        </div>
      </div>
    </div>
  );
}
