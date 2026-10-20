import { useEffect, useRef, useState } from "react";
import { isInappropriate, NAME_NOT_ALLOWED } from "../lib/nameFilter";

/**
 * Onboarding (2026-10-20): straight after a first sign-up, three short
 * questions — a name, the year, the university — before the app. Replaces
 * the name prompt and, for Google sign-ups, the email prompt, which used to
 * arrive as two unrelated pop-ups. The year and university are kept on the
 * profile (migration 0029) for year-locked decks and the like.
 *
 * Each step is one thing on one card. Picking a year moves on by itself;
 * Back is always there. It is saved only on finishing, and comes back on
 * the next visit until then.
 */
export const YEARS = [1, 2, 3, 4, 5];
export const ARU = "Anglia Ruskin University";

function YearGrid({ value, onPick }) {
  return (
    <div className="ob-years" role="radiogroup" aria-label="Year of study">
      {YEARS.map(y => (
        <button key={y} type="button" role="radio" aria-checked={value === y}
          className={`ob-tile${value === y ? " is-on" : ""}`} onClick={() => onPick(y)}>
          Year {y}
        </button>
      ))}
      <button type="button" role="radio" aria-checked={value === 0}
        className={`ob-tile is-wide${value === 0 ? " is-on" : ""}`} onClick={() => onPick(0)}>
        Something else
      </button>
    </div>
  );
}

export default function Onboarding({ suggestedName, askEmails = false, onFinish }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(suggestedName || "");
  const [nameErr, setNameErr] = useState("");
  const [year, setYear] = useState(null);
  const [uni, setUni] = useState(null);           // ARU, or "other"
  const [otherUni, setOtherUni] = useState("");
  const [emails, setEmails] = useState(false);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef(null);
  const otherRef = useRef(null);

  useEffect(() => { if (step === 0) { nameRef.current?.focus(); nameRef.current?.select(); } }, [step]);
  useEffect(() => { if (uni === "other") otherRef.current?.focus(); }, [uni]);

  const steps = 3;
  function nextFromName(e) {
    e.preventDefault();
    const t = name.trim();
    if (t.length < 2) return;
    if (isInappropriate(t)) { setNameErr(NAME_NOT_ALLOWED); return; }
    setStep(1);
  }
  function pickYear(y) {
    setYear(y);
    setTimeout(() => setStep(2), 180);
  }
  const university = uni === ARU ? ARU : otherUni.trim();
  const canFinish = uni === ARU || (uni === "other" && otherUni.trim().length >= 2);
  function finish(e) {
    e?.preventDefault();
    if (!canFinish || busy) return;
    setBusy(true);
    onFinish({
      displayName: name.trim().slice(0, 32),
      studyYear: year ?? 0,
      university: university.slice(0, 120),
      ...(askEmails ? { marketingOptIn: emails } : {}),
    });
  }

  return (
    <div className="ob-page" role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <div className="ob-card" key={step}>
        <div className="ob-top">
          {step > 0
            ? <button type="button" className="ob-back" onClick={() => setStep(s => s - 1)}>← Back</button>
            : <span className="ob-hello">Welcome to Resurface</span>}
          <span className="ob-dots" aria-label={`Step ${step + 1} of ${steps}`}>
            {Array.from({ length: steps }, (_, i) => <span key={i} className={`ob-dot${i <= step ? " is-on" : ""}`} />)}
          </span>
        </div>

        {step === 0 && (
          <form onSubmit={nextFromName}>
            <h2 className="ob-title" id="ob-title">What should we call you?</h2>
            <p className="ob-sub">It’s the name on the leaderboard. You can change it in your profile.</p>
            <input ref={nameRef} className="ob-field" value={name} maxLength={32} placeholder="Your name"
              aria-label="Your name" autoComplete="nickname"
              onChange={e => { setName(e.target.value); setNameErr(""); }} />
            {nameErr && <p className="name-err" role="alert">{nameErr}</p>}
            <button type="submit" className="ob-go btn-press" disabled={name.trim().length < 2}>Continue</button>
          </form>
        )}

        {step === 1 && (
          <>
            <h2 className="ob-title" id="ob-title">Which year are you in?</h2>
            <p className="ob-sub">So you see the decks for your year.</p>
            <YearGrid value={year} onPick={pickYear} />
          </>
        )}

        {step === 2 && (
          <form onSubmit={finish}>
            <h2 className="ob-title" id="ob-title">Where do you study?</h2>
            <div className="ob-unis" role="radiogroup" aria-label="University">
              <button type="button" role="radio" aria-checked={uni === ARU}
                className={`ob-tile is-wide${uni === ARU ? " is-on" : ""}`} onClick={() => setUni(ARU)}>
                Anglia Ruskin University
              </button>
              <button type="button" role="radio" aria-checked={uni === "other"}
                className={`ob-tile is-wide${uni === "other" ? " is-on" : ""}`} onClick={() => setUni("other")}>
                Somewhere else
              </button>
            </div>
            {uni === "other" && (
              <input ref={otherRef} className="ob-field" value={otherUni} maxLength={120}
                placeholder="Your university" aria-label="Your university" autoComplete="organization"
                onChange={e => setOtherUni(e.target.value)} />
            )}
            {askEmails && (
              <label className="ob-check">
                <input type="checkbox" checked={emails} onChange={e => setEmails(e.target.checked)} />
                <span>Email me the occasional update about Resurface</span>
              </label>
            )}
            <button type="submit" className="ob-go btn-press" disabled={!canFinish || busy}>
              {busy ? "Saving…" : "Start revising"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/* For accounts from before onboarding: just the year, once. Skipping
   counts as an answer ("something else"), so it does not come back. */
export function YearCard({ onAnswer }) {
  return (
    <div className="np-scrim" role="presentation">
      <div className="np" role="dialog" aria-modal="true" aria-labelledby="yc-title">
        <h2 className="np__title" id="yc-title">Which year are you in?</h2>
        <p className="np__sub">So you see the decks for your year. You can change it in your profile.</p>
        <YearGrid value={null} onPick={y => onAnswer(y)} />
        <div className="np__row">
          <button type="button" className="np__skip" onClick={() => onAnswer(0)}>Skip</button>
        </div>
      </div>
    </div>
  );
}
