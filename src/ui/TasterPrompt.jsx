import { useState } from "react";

/**
 * "Which have you covered so far?" (2026-10-26).
 *
 * Between the welcome note's "Try Year N questions" and the first question:
 * the year's ready-made decks as big toggles, all on, and Start. One tap if
 * they don't mind, one more to leave out a block they haven't reached. The
 * deck level and no deeper: which block someone has been through is where
 * they are in their revision; subjects (anatomy, physiology) aren't.
 */
export default function TasterPrompt({ decks, count = 5, onStart, onClose }) {
  const [on, setOn] = useState(() => new Set(decks.map(d => d.id)));
  const toggle = id => setOn(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  return (
    <div className="np-scrim" role="presentation" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="np" role="dialog" aria-modal="true" aria-label="Which have you covered?"
        onSubmit={e => { e.preventDefault(); if (on.size) onStart(decks.filter(d => on.has(d.id)).map(d => d.id)); }}>
        <p className="np__label is-first is-top">Which have you covered so far?</p>
        <div className="tp-chips" role="group" aria-label="Decks">
          {decks.map(d => (
            <button key={d.id} type="button" className={`tp-chip btn-press${on.has(d.id) ? " is-on" : ""}`}
              aria-pressed={on.has(d.id)} onClick={() => toggle(d.id)}>
              <span className="tp-chip__tick" aria-hidden="true">{on.has(d.id) ? "✓" : ""}</span>
              {d.name}
            </button>
          ))}
        </div>
        <p className="np__hint">{count} sample questions from across them. Don&apos;t worry if some are on things you haven&apos;t had yet.</p>
        <div className="np__row">
          <button type="button" className="np__skip" onClick={onClose}>Cancel</button>
          <button type="submit" className="np__save btn-press" disabled={!on.size}>Start {count} questions →</button>
        </div>
      </form>
    </div>
  );
}
