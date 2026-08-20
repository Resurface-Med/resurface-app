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
 * A short list of reasons rather than a text box. A picker gets used and a
 * textarea gets skipped, and categories are what make the flags countable
 * later. It appears only after answering, so it cannot be a hint that
 * something is off with the question you are still working on.
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
      <button type="button" className="q-flag-open btn-press" onClick={() => setOpen(true)}>
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
            className="q-flag-reason btn-press"
            onClick={() => {
              // Fire and forget: the write is queued and retried if the network
              // is out, and making someone wait to report a typo is worse than
              // losing the odd flag.
              remote.flag(user.id, questionId, r.k);
              setOpen(false);
              setSent(true);
            }}
          >
            {r.label}
          </button>
        ))}
      </div>
      <button type="button" className="q-flag-cancel" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </div>
  );
}
