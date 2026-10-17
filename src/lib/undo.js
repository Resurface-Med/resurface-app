/**
 * Undo for deck changes, offered for a moment and then gone.
 *
 * Every change shows a small pill — "Deleted “Renal” · Undo" — for four
 * seconds (ui/UndoToast), and Cmd/Ctrl+Z undoes the latest ones. It replaced
 * "Delete this deck?" dialogs: a question before is worse than a way back
 * after, which is when you notice (2026-10-17).
 *
 * offer({ label, undo, commit }):
 *   undo   puts it back as it was.
 *   commit (optional) is the part that cannot be taken back — a delete's
 *          request to the server. It is held until the pill goes (or another
 *          change replaces it, or the page is left), so undoing a delete is
 *          only ever a local change. A change without one (a move, a rename)
 *          is already saved, is undone by reversing it, and stays undoable
 *          by keyboard for the last ten.
 */
const SHOW_MS = 4000;
const KEEP = 10;

let current = null;        // the entry on screen
const history = [];        // entries still undoable, oldest first
const subs = new Set();
const emit = () => subs.forEach(f => f(current));

export function subscribe(fn) {
  subs.add(fn);
  fn(current);
  return () => subs.delete(fn);
}

/* An entry with a commit stops being undoable once it is sent. */
function settle(e) {
  if (e.done) return;
  clearTimeout(e.timer);
  if (e.commit) {
    e.done = true;
    const i = history.indexOf(e);
    if (i >= 0) history.splice(i, 1);
    try { e.commit(); } catch { /* the server call reports its own failure */ }
  }
}

export function offer({ label, undo, commit = null }) {
  if (current) { const prev = current; current = null; settle(prev); }
  const e = { label, undo, commit, done: false, timer: null };
  e.timer = setTimeout(() => {
    if (current === e) { current = null; emit(); }
    settle(e);
  }, SHOW_MS);
  history.push(e);
  while (history.length > KEEP) { const old = history.shift(); settle(old); old.done = true; }
  current = e;
  emit();
}

/** Undo the latest change still undoable. Returns whether there was one. */
export function undoLast() {
  const e = history.pop();
  if (!e) return false;
  clearTimeout(e.timer);
  e.done = true;
  try { e.undo(); } finally {
    if (current === e) { current = null; emit(); }
  }
  return true;
}

/** Undo the change on screen (the pill's button). */
export function undoCurrent() {
  if (!current) return;
  const e = current;
  const i = history.indexOf(e);
  if (i >= 0) history.splice(i, 1);
  clearTimeout(e.timer);
  e.done = true;
  current = null;
  emit();
  e.undo();
}

export function dismiss() {
  if (!current) return;
  const e = current;
  current = null;
  emit();
  settle(e);
}

/* Leaving the page sends what was waiting — a delete you did not undo. */
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => { [...history].forEach(settle); });
}
