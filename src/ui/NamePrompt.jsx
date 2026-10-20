import { isInappropriate, NAME_NOT_ALLOWED } from "../lib/nameFilter";
import { useEffect, useRef, useState } from "react";
import YearSelect from "./YearSelect";

/**
 * What should we call you?
 *
 * Asked once, after someone is already in, rather than as a third field on
 * the way. A name field at sign-up is a stranger asking for something before
 * giving anything — and the reason given for it, a leaderboard, is a screen
 * they have not seen. Afterwards it is a different question entirely: they
 * are here, there is a leaderboard with their name on it, and the name is
 * currently the first half of their email address.
 *
 * Only for the people it applies to. The database records whether a name was
 * chosen or invented from an email, so anyone who signed in with Google —
 * and therefore already has their real name — is never asked.
 *
 * Dismissing counts as answering. A prompt that returns until it gets what
 * it wants is a worse thing than the field it replaced, so "Not now" settles
 * it for good; Profile is where it gets changed afterwards, by anyone who
 * cares, at a moment of their choosing.
 */
/* With the year of study too (2026-10-20): onSave(name, year) and
   onSkip(year), year being null if it was left unchosen. */
export default function NamePrompt({ suggestion, onSave, onSkip }) {
  const [name, setName] = useState(suggestion || "");
  const [year, setYear] = useState(null);
  const [busy, setBusy] = useState(false);
  const [nameErr, setNameErr] = useState("");
  const ref = useRef(null);

  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") onSkip(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSkip]);

  function submit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) return;
    if (isInappropriate(trimmed)) { setNameErr(NAME_NOT_ALLOWED); return; }
    setBusy(true);
    onSave(trimmed, year);
  }

  return (
    <div className="np-scrim" role="presentation">
      <form className="np" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="np-title">
        <h2 className="np__title is-welcome" id="np-title">Welcome to{" "}
          <img className="np__logo is-day" src="/logo-lockup.png" alt="Resurface" width="560" height="131" />
          <img className="np__logo is-night" src="/logo-lockup-white.png" alt="" aria-hidden="true" width="560" height="131" />
        </h2>

        {/* Both questions as labels of one size, under a title that is
            neither (Rafil, 2026-10-20). */}
        <label className="np__label is-first" htmlFor="np-name">What should we call you?</label>

        <input
          ref={ref}
          id="np-name"
          className="np__field is-labelled"
          value={name}
          onChange={e => { setName(e.target.value); setNameErr(""); }}
          maxLength={32}
          placeholder="Your name"
        />

        <p className="np__hint">This is the name on the leaderboard. You can change it any time in your profile.</p>
        {nameErr && <p className="name-err" role="alert">{nameErr}</p>}

        <label className="np__label" htmlFor="np-year">Which year are you in?</label>
        <YearSelect id="np-year" value={year} onChange={setYear} />
        <div className="np__row">
          <button type="submit" className="np__save btn-press" disabled={busy || name.trim().length < 2}>
            {busy ? "Saving…" : "Continue"}
          </button>
          <button type="button" className="np__skip" onClick={() => onSkip(year)} disabled={busy}>
            Not now
          </button>
        </div>
      </form>
    </div>
  );
}
