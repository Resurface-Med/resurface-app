import { useEffect, useRef, useState } from "react";

/**
 * My note on a question (2026-10-30). Opened from "Add a note" under the
 * explanation, and open by itself once the question has a note, so you meet
 * what you wrote the next time the question comes round. Saves as you type,
 * the same as Edit question; emptying it removes the note.
 */
export default function NoteBox({ body = "", onSave, autoFocus = false, onEmptyBlur = null, lead = false }) {
  const [text, setText] = useState(body);
  const [state, setState] = useState("idle");      // idle | saving | saved
  const timer = useRef(null);
  const latest = useRef(body);
  const ref = useRef(null);

  /* The textarea grows with what's in it rather than scrolling. */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [text]);

  function flush() {
    clearTimeout(timer.current);
    if (latest.current === text) return;
    latest.current = text;
    onSave(text);
    setState("saved");
  }
  const textRef = useRef(text);
  useEffect(() => { textRef.current = text; }, [text]);
  useEffect(() => () => {
    /* Leaving the question mid-word still saves it. */
    clearTimeout(timer.current);
    if (latest.current !== textRef.current) onSave(textRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function change(v) {
    setText(v);
    setState("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      latest.current = v;
      onSave(v);
      setState("saved");
    }, 700);
  }

  return (
    <div className={`q-mynote${lead ? " q-mynote--lead" : ""}`} data-in="rise">
      <div className="q-mynote__head">
        <label className="q-mynote__label" htmlFor="q-mynote">{lead ? "Your note" : "My note"}</label>
        <span className="q-mynote__state" aria-live="polite">
          {state === "saving" ? "Saving…" : state === "saved" ? (text.trim() ? "Saved" : "Removed") : ""}
        </span>
      </div>
      <textarea
        id="q-mynote"
        ref={ref}
        className="q-mynote__field"
        value={text}
        rows={2}
        maxLength={4000}
        autoFocus={autoFocus}
        placeholder="Anything you want to remember about this question. Only you can see it."
        onChange={e => change(e.target.value)}
        onBlur={() => { flush(); if (!text.trim()) onEmptyBlur?.(); }}
      />
    </div>
  );
}
