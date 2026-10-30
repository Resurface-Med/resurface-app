import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Writing a note on a question (2026-10-30). A popup of its own, in the
 * NamePrompt style every popup uses, rather than a field left open in the
 * middle of the explanation: the question screen doesn't move while you
 * write, and Save is a clear moment of done. The question is shown, small,
 * so you know what the note is about.
 *
 * Save with the button or Cmd/Ctrl+Enter; Escape or a tap outside cancels.
 * Saving an empty note on one that existed deletes it.
 */
export default function NotePrompt({ question, initial = "", onSave, onDelete = null, onClose }) {
  const [text, setText] = useState(initial);
  const ref = useRef(null);
  const editing = Boolean(initial.trim());

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  /* The box grows with the note, up to a point, then scrolls. */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + 2, 320)}px`;
  }, [text]);

  function save(e) {
    e?.preventDefault();
    const body = text.trim();
    if (!body && !editing) { onClose(); return; }
    onSave(body);
    onClose();
  }

  return createPortal(
    <div className="np-scrim" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="np note-prompt" onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="note-prompt-title"
        onKeyDown={e => {
          /* Typing here must never reach the quiz's own keys. */
          e.stopPropagation();
          if (e.key === "Escape") { e.preventDefault(); onClose(); }
          else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save(e);
        }}>
        <h2 className="np__title" id="note-prompt-title">{editing ? "Your note" : "Note on this question"}</h2>
        <p className="np__sub note-prompt__q">{question}</p>
        <textarea
          ref={ref}
          className="np__field note-prompt__field"
          value={text}
          onChange={e => setText(e.target.value)}
          maxLength={4000}
          rows={4}
          aria-label="Your note"
          placeholder="What do you want to remember?"
        />
        <p className="np__hint">Only you can see this. Find it again in My notes.</p>
        <div className="np__row">
          <button type="submit" className="np__save btn-press" disabled={!text.trim() && !editing}>Save</button>
          <button type="button" className="np__skip" onClick={onClose}>Cancel</button>
          {editing && onDelete && (
            <button type="button" className="np__skip note-prompt__del" onClick={() => { onDelete(); onClose(); }}>Delete note</button>
          )}
        </div>
      </form>
    </div>,
    document.body,
  );
}
