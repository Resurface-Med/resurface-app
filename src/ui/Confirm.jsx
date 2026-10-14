import { useEffect, useState } from "react";
import { C, card, primaryBtn, btnGhost } from "./theme";

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

const dialogBtn = { flex: 1, padding: "12px 18px", fontSize: 14.5, whiteSpace: "nowrap" };

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
  return (
    <div
      role="dialog" aria-modal="true" aria-label={q.title}
      style={{
        position: "fixed", inset: 0, background: "rgba(26, 47, 122, 0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        backdropFilter: "blur(4px)",
      }}
      onClick={e => { if (e.target === e.currentTarget) answer(false); }}
    >
      <div className="anim-scale-in" style={{ ...card, maxWidth: 380, width: "90%", textAlign: "center", padding: "36px 28px" }}>
        <div style={{ fontSize: 18, color: C.text, fontWeight: 600, marginBottom: 8, letterSpacing: -0.3 }}>{q.title}</div>
        {q.body && (
          <div style={{ fontSize: 14, color: C.sub, marginBottom: 28, lineHeight: 1.55 }}>{q.body}</div>
        )}
        {q.typeToConfirm && (
          <div style={{ marginBottom: 22, textAlign: "left" }}>
            <label htmlFor="confirm-type" style={{ display: "block", fontSize: 13, color: C.sub, marginBottom: 7 }}>
              Type <strong style={{ color: C.text }}>{q.typeToConfirm}</strong> to confirm
            </label>
            <input
              id="confirm-type"
              value={typed}
              autoFocus
              autoComplete="off"
              onChange={e => setTyped(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box", padding: "11px 14px",
                fontFamily: "inherit", fontSize: 15, color: C.text,
                background: "var(--c-surface2)", border: "1.5px solid var(--c-border)",
                borderRadius: "var(--r-ctrl)",
              }}
            />
          </div>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: q.body ? 0 : 24 }}>
          <button
            type="button"
            className="btn-press"
            autoFocus={!q.typeToConfirm}
            disabled={locked}
            onClick={() => answer(true)}
            style={{
              ...primaryBtn, ...dialogBtn,
              ...(q.danger ? { background: "var(--c-danger)", boxShadow: "none" } : {}),
              ...(locked ? { opacity: 0.4, cursor: "default" } : {}),
            }}
          >
            {q.action ?? "OK"}
          </button>
          <button type="button" className="btn-press" onClick={() => answer(false)} style={{ ...btnGhost, ...dialogBtn }}>
            {q.cancel ?? "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}
