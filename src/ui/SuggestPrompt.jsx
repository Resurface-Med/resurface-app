import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Suggest a folder of yours for everyone (2026-10-23).
 *
 * Your folder sits inside a ready-made deck and only you see it. This sends
 * the whole folder to the reviewers; each question they add moves into the
 * deck for everyone, with your name on it, and the rest stay yours.
 *
 * Two faces in the NamePrompt layout: the ask, and once sent, where it
 * stands — with the reviewers' reasons for any they kept out.
 */
export default function SuggestPrompt({ folderName, deckName, owner, count, status = null, onSend, onWithdraw, onClose }) {
  const [note, setNote] = useState(status?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ref = useRef(null);
  useEffect(() => { if (!status) ref.current?.focus(); }, [status]);
  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function run(fn) {
    setBusy(true); setErr("");
    try { await fn(); onClose(); }
    catch (e) { setErr(e?.message?.includes("ready-made") ? e.message : "That didn't go through. Check your connection and try again."); setBusy(false); }
  }

  const deckLabel = owner ? `${owner}’s ${deckName}` : deckName;
  const plural = n => `${n} question${n === 1 ? "" : "s"}`;

  return createPortal(
    <div className="np-scrim" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      {status ? (
        <div className="np" role="dialog" aria-modal="true" aria-label="Your suggestion">
          <h2 className="np__title">Your suggestion</h2>
          <p className="np__sub">
            {folderName}, for {deckLabel}.{" "}
            {status.waiting > 0 ? `${plural(status.waiting)} waiting for review.` : "Everything in it has been reviewed."}
            {status.added > 0 && ` ${plural(status.added)} added for everyone.`}
          </p>
          {status.kept.length > 0 && (
            <>
              <p className="np__label">Kept as yours</p>
              <ul className="sg-kept">
                {status.kept.map(k => (
                  <li key={k.qid}>
                    <span className="sg-kept__q">{k.q}</span>
                    {k.reason && <span className="sg-kept__why">{k.reason}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
          {err && <p className="name-err" role="alert">{err}</p>}
          <div className="np__row">
            {status.waiting > 0 && (
              <button type="button" className="np__skip" disabled={busy} onClick={() => run(onWithdraw)}>Withdraw</button>
            )}
            {status.waiting === 0 && count > 0 && (
              <button type="button" className="np__skip" disabled={busy} onClick={() => run(() => onSend(note))}>Suggest again</button>
            )}
            <button type="button" className="np__save btn-press" onClick={onClose}>Done</button>
          </div>
        </div>
      ) : (
        <form className="np" role="dialog" aria-modal="true" aria-label="Suggest for everyone"
          onSubmit={e => { e.preventDefault(); if (count > 0) run(() => onSend(note)); }}>
          <h2 className="np__title">Suggest for {deckLabel}</h2>
          <p className="np__sub">
            {count > 0 ? `${plural(count)} from ${folderName}.` : `${folderName} has no questions yet.`}{" "}
            If they’re added, everyone gets them, with your name on them. Any that aren’t stay in your folder.
          </p>
          <textarea
            ref={ref}
            className="np__field sg-note"
            value={note}
            onChange={e => setNote(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Anything the reviewers should know? (optional)"
          />
          {err && <p className="name-err" role="alert">{err}</p>}
          <div className="np__row">
            <button type="button" className="np__skip" onClick={onClose}>Cancel</button>
            <button type="submit" className="np__save btn-press" disabled={busy || count === 0}>{busy ? "Sending…" : "Send"}</button>
          </div>
        </form>
      )}
    </div>,
    document.body,
  );
}
