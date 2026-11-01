import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * An in-app "are you sure?" — the Leave-session dialog, generalised.
 *
 * Call `confirm({ title, body, action })` from anywhere and await the
 * answer. One host renders whichever question is open. The action button
 * is the app's own; a destructive one is red.
 *
 * `typeToConfirm` adds a field that must be typed before the button works.
 * For the few things a mis-click should not be able to do — deleting an
 * account is the only one so far — where the cost of being wrong is total
 * and there is nothing to undo it with. Reaching for it on anything less
 * teaches people to type past it.
 */
let listener = null;

export function confirm(opts) {
  return new Promise(resolve => {
    if (!listener) { resolve(window.confirm(opts.title)); return; }
    listener({ ...opts, resolve });
  });
}

export function confirmDelete(what, count) {
  const n = Number(count) || 0;
  return confirm({
    title: `Delete ${what}?`,
    body: n ? `Its ${n} question${n === 1 ? "" : "s"} go${n === 1 ? "es" : ""} with it. This can’t be undone.` : "This can’t be undone.",
    action: "Delete",
    danger: true,
  });
}

export function ConfirmHost() {
  const [q, setQ] = useState(null);
  const [typed, setTyped] = useState("");
  useEffect(() => {
    listener = setQ;
    return () => { if (listener === setQ) listener = null; };
  }, []);
  useEffect(() => { setTyped(""); }, [q]);
  useEffect(() => {
    if (!q) return;
    const onKey = e => {
      if (e.key === "Escape") answer(false);
      /* Enter is the shortcut for yes, which is exactly wrong when the point
         is that you had to type something first. */
      if (e.key === "Enter" && !q.typeToConfirm) answer(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [q]);
  function answer(yes) { q.resolve(yes); setQ(null); }
  if (!q) return null;
  const locked = Boolean(q.typeToConfirm) && typed.trim().toLowerCase() !== q.typeToConfirm.toLowerCase();
  /* The standard popup (NamePrompt's np-* layout, 2026-11-01), white, and
     above every window — the old one sat beneath Review questions and My
     notes, so a confirmation asked from inside them was hidden. */
  return createPortal(
    <div className="np-scrim confirm-scrim" role="presentation"
      onMouseDown={e => { if (e.target === e.currentTarget) answer(false); }}>
      <div className="np confirm-prompt" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 className="np__title" id="confirm-title">{q.title}</h2>
        {q.body && <p className="np__sub">{q.body}</p>}
        {q.typeToConfirm && (
          <>
            <label className="np__label" htmlFor="confirm-type">
              Type <strong>{q.typeToConfirm}</strong> to confirm
            </label>
            <input id="confirm-type" className="np__field is-labelled" value={typed} autoFocus autoComplete="off"
              onChange={e => setTyped(e.target.value)} />
          </>
        )}
        <div className="np__row">
          <button type="button" className={`np__save btn-press${q.danger ? " is-danger" : ""}`}
            autoFocus={!q.typeToConfirm} disabled={locked} onClick={() => answer(true)}>
            {q.action ?? "OK"}
          </button>
          {q.cancel !== null && (
            <button type="button" className="np__skip" onClick={() => answer(false)}>{q.cancel ?? "Cancel"}</button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
