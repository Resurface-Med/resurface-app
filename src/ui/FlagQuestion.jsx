import { useState } from "react";
import { remote } from "../lib/remote";
import { useAuth } from "../lib/auth";

/**
 * Reporting that a question is wrong.
 *
 * With a hundred people working the same bank, one tap is a better signal than
 * any amount of prompt tuning — and it is the only thing that catches a
 * generated question that is confidently, plausibly wrong, which is the failure
 * a fast model actually has.
 *
 * A short list of reasons. The named ones send on a tap, which is what gets
 * used. "Something else" asks for the problem in their own words — a blank
 * note would arrive in Admin as a reason with nothing to act on. It appears
 * only after answering, so it cannot be a hint that something is off with
 * the question you are still working on.
 */

const REASONS = [
  { k: "wrong-answer",    label: "Wrong answer" },
  { k: "bad-explanation", label: "Explanation is off" },
  { k: "unclear",         label: "Unclear wording" },
  { k: "duplicate",       label: "Seen this already" },
  { k: "other",           label: "Something else" },
];

export default function FlagQuestion({ questionId }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [other, setOther] = useState(false);
  const [note, setNote] = useState("");

  function close() {
    setOpen(false);
    setOther(false);
    setNote("");
  }

  function send(reason, text) {
    remote.flag(user.id, questionId, reason, text || null);
    setSent(true);
    close();
  }

  if (!user) return null;

  if (sent) {
    return (
      <p className="q-flag-done">
        Thanks — flagged.{" "}
        <button
          type="button"
          className="q-flag-undo"
          onClick={() => { remote.unflag(user.id, questionId); setSent(false); }}
        >
          Undo
        </button>
      </p>
    );
  }

  if (!open) {
    return (
      <button type="button" className="q-flag-open btn-press" onClick={() => { setSent(false); setOpen(true); }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M7 3.4v17.2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M7 5.2h11.2L14.4 9.6l3.8 4.4H7V5.2z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
        </svg>
        Report a problem
      </button>
    );
  }

  return (
    <div className="q-flag" data-in="rise">
      <span className="q-flag-title">What&apos;s wrong with it?</span>
      <div className="q-flag-reasons">
        {REASONS.map(r => (
          <button
            key={r.k}
            type="button"
            className={`q-flag-reason btn-press${r.k === "other" && other ? " is-on" : ""}`}
            aria-pressed={r.k === "other" ? other : undefined}
            onClick={() => {
              if (r.k === "other") { setOther(true); return; }
              // Fire and forget: the write is queued and retried if the network
              // is out, and making someone wait to report a typo is worse than
              // losing the odd flag.
              send(r.k);
            }}
          >
            {r.label}
          </button>
        ))}
      </div>
      {other && (
        <form
          className="q-flag-more"
          onSubmit={e => {
            e.preventDefault();
            const text = note.trim();
            if (!text) return;
            send("other", text);
          }}
        >
          <label className="q-flag-title" htmlFor={`flag-note-${questionId}`}>Describe the problem</label>
          <textarea
            id={`flag-note-${questionId}`}
            className="q-flag-note"
            value={note}
            maxLength={500}
            rows={3}
            autoFocus
            placeholder="What's wrong with this question?"
            onChange={e => setNote(e.target.value)}
          />
          <button type="submit" className="q-flag-send btn-press" disabled={!note.trim()}>
            Send
          </button>
        </form>
      )}
      <button type="button" className="q-flag-cancel" onClick={close}>
        Cancel
      </button>
    </div>
  );
}
