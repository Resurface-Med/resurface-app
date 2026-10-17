import { useState } from "react";

/* The number beside a count slider (Practice, Generate), as a box you can
   type in (2026-10-17): for "exactly 37" without nudging the thumb. Typing is free; the number is kept to 1…max as it changes, and
   a cleared box puts the last good number back when you leave it. */
export default function CountField({ value, max, onCommit, showMax = true }) {
  const [draft, setDraft] = useState(null);
  const commit = raw => {
    const n = Math.round(Number(raw));
    if (raw === "" || !Number.isFinite(n)) return;
    onCommit(Math.min(Math.max(1, n), Math.max(1, max)));
  };
  return (
    <label className="setup-count-field">
      <input
        className="setup-count-input"
        type="number"
        inputMode="numeric"
        min={1}
        max={Math.max(1, max)}
        disabled={max === 0}
        value={draft ?? value}
        onFocus={e => { setDraft(String(value)); e.target.select(); }}
        onChange={e => { setDraft(e.target.value); commit(e.target.value); }}
        onBlur={() => setDraft(null)}
        onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
        aria-label="Number of questions"
      />
      {showMax && <span className="setup-count-of">of {max}</span>}
    </label>
  );
}
