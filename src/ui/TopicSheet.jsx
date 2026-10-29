import { useEffect, useRef, useState } from "react";
import EditorialNote, { readTime } from "./EditorialNote";

/**
 * A topic note, slid in from the right during a session (2026-10-29).
 *
 * The same sheet as lab values: over the question on a narrow window, and
 * on a wide one the session steps left so the answer stays put. The article
 * used to open inside the card, under the explanation, which is what made
 * a short clinical note read as a generated post.
 */
export default function TopicSheet({ topic, open, onClose }) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  /* Kept while the sheet slides away, so a question change does not swap
     the title in the last frames of the close. */
  const last = useRef(topic);
  if (topic?.body) last.current = topic;

  useEffect(() => {
    if (open) {
      setMounted(true);
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(r);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 320);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  const current = last.current;
  if (!mounted || !current?.body) return null;

  return (
    <aside className={`note-sheet${shown ? " is-open" : ""}`} aria-label={current.title} aria-hidden={!open}>
      <header className="note-sheet__head">
        <div className="note-sheet__titles">
          <h2 className="note-sheet__title">{current.title}</h2>
          <p className="note-sheet__time">{readTime(current.body)}</p>
        </div>
        <button type="button" className="note-sheet__x btn-press" onClick={onClose} aria-label="Close note">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
      </header>
      <div className="note-sheet__body">
        <EditorialNote text={current.body} />
      </div>
    </aside>
  );
}
