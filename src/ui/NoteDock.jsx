import { useEffect, useRef, useState } from "react";
import { useNotes } from "../lib/notes";

/**
 * Your note, written beside the question (2026-10-30).
 *
 * A popup over the question hid the very thing people want to jot down —
 * the explanation, the topic note — so the note opens where Resurface AI
 * does: a panel on the right on a laptop, a half-height sheet on a phone,
 * with the question still there to read, scroll and copy from. Text you
 * highlight in the question arrives here through `append`.
 *
 * Save is a clear moment of done (or Cmd/Ctrl+Enter); closing without it
 * keeps nothing. Saving an emptied note deletes it.
 */
export default function NoteDock({ q, append = null, closing = false, onClose }) {
  const ctx = useNotes();
  const saved = ctx?.notes?.[q.id]?.body ?? "";
  const editing = Boolean(saved.trim());
  const [text, setText] = useState(saved);
  const ref = useRef(null);

  /* A new question: start from its own note. */
  const [forId, setForId] = useState(q.id);
  if (forId !== q.id) { setForId(q.id); setText(saved); }

  useEffect(() => { ref.current?.focus(); }, [q.id]);

  /* On a phone the sheet sits on the bottom edge, and iOS draws the
     keyboard over fixed things there. Lift it by the keyboard's height. */
  const [lift, setLift] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const fit = () => setLift(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    fit();
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    return () => { vv.removeEventListener("resize", fit); vv.removeEventListener("scroll", fit); };
  }, []);

  /* Highlighted text, added on a line of its own at the end. */
  const lastAppend = useRef(0);
  useEffect(() => {
    if (!append || append.n === lastAppend.current) return;
    lastAppend.current = append.n;
    setText(t => (t.trim() ? `${t.replace(/\s+$/, "")}\n${append.text}` : append.text));
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      el.scrollTop = el.scrollHeight;
    });
  }, [append]);

  const dirty = text.trim() !== saved.trim();
  function save() {
    if (!dirty) { onClose(); return; }
    ctx?.setNote(q.id, text.trim());
    onClose();
  }

  return (
    <aside className={`ai-dock note-dock${closing ? " is-closing" : ""}`} aria-label="Your note" style={{ "--kb": `${lift}px` }}
      onKeyDown={e => {
        /* Typing here must never reach the quiz's own keys. */
        e.stopPropagation();
        if (e.key === "Escape") { e.preventDefault(); onClose(); }
        else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
      }}>
      <header className="ai-dock__head note-dock__head">
        <h2 className="note-dock__title">{editing ? "Your note" : "Note on this question"}</h2>
        <button type="button" className="ai-dock__close btn-press" onClick={onClose} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4l8 8M12 4L4 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      <div className="note-dock__body">
        <textarea
          ref={ref}
          className="note-dock__field"
          value={text}
          onChange={e => setText(e.target.value)}
          maxLength={4000}
          aria-label="Your note"
          placeholder="What do you want to remember? Highlight text in the question or explanation to add it here."
        />
      </div>
      <footer className="note-dock__foot">
        <p className="note-dock__hint">Only you can see this.</p>
        <div className="note-dock__acts">
          {editing && (
            <button type="button" className="np__skip note-prompt__del" onClick={() => { ctx?.setNote(q.id, ""); onClose(); }}>Delete</button>
          )}
          <button type="button" className="np__skip" onClick={onClose}>Cancel</button>
          <button type="button" className="note-dock__save btn-press" onClick={save} disabled={!dirty && !editing}>Save</button>
        </div>
      </footer>
    </aside>
  );
}
