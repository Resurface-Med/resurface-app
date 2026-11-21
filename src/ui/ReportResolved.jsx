/**
 * "Thanks, we fixed the question you reported" (2026-11-21).
 *
 * Shown once, on opening the app, to someone whose report has been dealt
 * with (migration 0091). Rafil: it says fixed whatever happened (edited,
 * judged fine, or deleted), so that reporting feels worth doing. Mockup I:
 * the combo's self-drawing tick, the title, then the question as they
 * reported it in the field grey, with their reason under it.
 *
 * "See the question" opens it in a one-question session when it is still in
 * their pool; a deleted question only gets "Got it". Several at once share
 * one popup rather than stacking.
 */
const REASON = {
  "wrong-answer": "Wrong answer",
  "bad-explanation": "Explanation is off",
  unclear: "Unclear wording",
  duplicate: "Seen this already",
  other: "Something else",
};
const SHOW = 3;

export default function ReportResolved({ reports, canOpen, onOpen, onClose }) {
  const one = reports.length === 1 ? reports[0] : null;
  const open = one && canOpen(one.questionId);
  const shown = reports.slice(0, SHOW);
  const more = reports.length - shown.length;

  return (
    <div className="np-scrim" role="presentation">
      <div className="np" role="dialog" aria-modal="true" aria-labelledby="rr-title">
        <svg className="rr-tick" viewBox="0 0 52 52" aria-hidden="true">
          <circle className="rr-tick__disc" cx="26" cy="26" r="26" />
          <path className="rr-tick__check" pathLength="1" d="M15.5 26.8l7 7 14-15" />
        </svg>
        <h2 className="np__title" id="rr-title">
          {one ? "Thanks, we fixed the question you reported" : `Thanks, we fixed the ${reports.length} questions you reported`}
        </h2>
        <div className="rr-fields">
          {shown.map(r => (
            <div className="rr-field" key={r.questionId}>
              {r.stem && <p className="rr-field__q">{r.stem}</p>}
              {/* Reports restored from the request logs (2026-11-21) have no
                  reason on record, so the line is left out rather than guessed. */}
              {REASON[r.reason] && <p className="rr-field__why">You reported it as <b>{REASON[r.reason]}</b></p>}
            </div>
          ))}
        </div>
        {more > 0 && <p className="np__sub">And {more} more.</p>}
        <div className="np__row">
          {open ? (
            <>
              <button type="button" className="np__save btn-press" onClick={() => onOpen(one.questionId)}>See the question</button>
              <button type="button" className="np__skip" onClick={onClose}>Close</button>
            </>
          ) : (
            <button type="button" className="np__save btn-press" onClick={onClose} autoFocus>Got it</button>
          )}
        </div>
      </div>
    </div>
  );
}
