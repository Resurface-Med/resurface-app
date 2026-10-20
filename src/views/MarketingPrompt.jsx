import { useEffect, useRef, useState } from "react";
import { isInappropriate, NAME_NOT_ALLOWED } from "../lib/nameFilter";
import YearSelect from "../ui/YearSelect";

/**
 * One-time ask after Google sign-in: the name (theirs from Google, to keep
 * or change), the year, and the emails box that email sign-up asks on the
 * way in.
 *
 * Laid out exactly as the name pop-up (ui/NamePrompt) — the same card,
 * title, fields and buttons, so the first thing a new person sees is the
 * same whichever way they signed up (Rafil, 2026-10-20).
 */
export default function MarketingPrompt({ googleName, onContinue }) {
  const [name, setName] = useState(googleName || "");
  const [emails, setEmails] = useState(false);
  const [year, setYear] = useState(null);
  const [nameErr, setNameErr] = useState("");
  const ref = useRef(null);

  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);

  function submit(e) {
    e.preventDefault();
    const trimmed = name.trim().slice(0, 32);
    if (trimmed.length >= 2 && isInappropriate(trimmed)) { setNameErr(NAME_NOT_ALLOWED); return; }
    onContinue({
      displayName: trimmed.length >= 2 ? trimmed : undefined,
      marketingOptIn: emails,
      studyYear: year,
    });
  }

  return (
    <div className="np-scrim" role="presentation">
      <form className="np" onSubmit={submit} role="dialog" aria-modal="true" aria-label="Your details">
        {/* Two questions as labels of one size, and no heading over them
            (Rafil, 2026-10-20). */}
        <label className="np__label is-first is-top" htmlFor="mp-name">What should we call you?</label>

        <input
          ref={ref}
          id="mp-name"
          className="np__field is-labelled"
          value={name}
          onChange={e => { setName(e.target.value); setNameErr(""); }}
          maxLength={32}
          autoComplete="nickname"
          placeholder="Your name"
        />
        <p className="np__hint">This is the name on the leaderboard. You can change it any time in your profile.</p>
        {nameErr && <p className="name-err" role="alert">{nameErr}</p>}

        <label className="np__label" htmlFor="mp-year">Which year are you in?</label>
        <YearSelect id="mp-year" value={year} onChange={setYear} />

        <label className="np__check">
          <input type="checkbox" checked={emails} onChange={e => setEmails(e.target.checked)} />
          <span>Email me news, tips and study updates</span>
        </label>

        <div className="np__row">
          <button type="submit" className="np__save btn-press">Continue</button>
        </div>
      </form>
    </div>
  );
}
