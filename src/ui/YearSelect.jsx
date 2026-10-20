import { useState } from "react";

/**
 * Year of study, as a dropdown (2026-10-20, migration 0031): in the first
 * pop-up after sign-up, and the one-off pop-up for accounts from before.
 * `value` is 1–5, 0 for something else, or null for not chosen yet.
 */
export default function YearSelect({ value, onChange, id }) {
  return (
    <select id={id} className="year-select" value={value ?? ""}
      onChange={e => onChange(e.target.value === "" ? null : Number(e.target.value))}>
      <option value="" disabled>Choose your year</option>
      {[1, 2, 3, 4, 5].map(y => <option key={y} value={y}>Year {y}</option>)}
      <option value={0}>Something else</option>
    </select>
  );
}

/* For accounts from before the question: just the year, once. "Not now"
   counts as an answer (something else), so it does not come back. */
export function YearPrompt({ onAnswer }) {
  const [year, setYear] = useState(null);
  return (
    <div className="np-scrim" role="presentation">
      <form className="np" role="dialog" aria-modal="true" aria-labelledby="yp-title"
        onSubmit={e => { e.preventDefault(); if (year !== null) onAnswer(year); }}>
        <h2 className="np__title" id="yp-title">Which year are you in?</h2>
        <p className="np__sub">You can change it any time in your profile.</p>
        <div style={{ marginTop: 18 }}><YearSelect value={year} onChange={setYear} /></div>
        <div className="np__row">
          <button type="submit" className="np__save btn-press" disabled={year === null}>Save</button>
          <button type="button" className="np__skip" onClick={() => onAnswer(0)}>Not now</button>
        </div>
      </form>
    </div>
  );
}
