import { useEffect, useState } from "react";
import { subscribe, undoCurrent, undoLast } from "../lib/undo";

/**
 * The pill that offers to undo the last deck change, and Cmd/Ctrl+Z.
 *
 * The same object as Practice's Next bar, smaller: the band's blue, white
 * text, a white button. It rises in, stays a few seconds, and goes; a new
 * change replaces it. Kept off the middle of the bottom on a desktop, where
 * the Next bar sits.
 */
export default function UndoToast() {
  const [entry, setEntry] = useState(null);
  const [shown, setShown] = useState(null);   // kept through the exit animation
  useEffect(() => subscribe(setEntry), []);
  useEffect(() => {
    if (entry) { setShown(entry); return; }
    const t = setTimeout(() => setShown(null), 220);
    return () => clearTimeout(t);
  }, [entry]);

  useEffect(() => {
    function onKey(e) {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== "z") return;
      const t = e.target;
      if (t?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (undoLast()) e.preventDefault();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (!shown) return null;
  return (
    <div className={`undo${entry ? " is-in" : " is-out"}`} role="status" aria-live="polite">
      <span className="undo-label">{shown.label}</span>
      <button type="button" className="undo-btn btn-press" onClick={undoCurrent}>Undo</button>
    </div>
  );
}
