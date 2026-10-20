import { useState } from "react";
import { primaryBtn } from "../ui/theme";
import { isInappropriate, NAME_NOT_ALLOWED } from "../lib/nameFilter";
import YearSelect from "../ui/YearSelect";

/** One-time ask after Google sign-in. Email signup already collected this. */
export default function MarketingPrompt({ googleName, onContinue }) {
  const [name, setName] = useState("");
  const [emails, setEmails] = useState(false);
  const [year, setYear] = useState(null);
  const [nameErr, setNameErr] = useState("");

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
    <div className="mail-prompt-scrim" role="dialog" aria-labelledby="mail-prompt-title">
      <form className="mail-prompt" onSubmit={submit}>
        <h2 id="mail-prompt-title" className="mail-prompt__title">A couple of details first</h2>
        <div className="mail-prompt__block">
          <label className="mail-prompt__field" htmlFor="google-display-name">
            Display name
            <span className="mail-prompt__optional">optional</span>
          </label>
          <input
            id="google-display-name"
            type="text"
            maxLength={32}
            autoComplete="nickname"
            placeholder={googleName || "Shown on the leaderboard"}
            value={name}
            onChange={e => { setName(e.target.value); setNameErr(""); }}
          />
          {nameErr && <p className="name-err" role="alert">{nameErr}</p>}
        </div>
        <div className="mail-prompt__block">
          <label className="mail-prompt__field" htmlFor="google-year">Which year are you in?</label>
          <YearSelect id="google-year" value={year} onChange={setYear} />
        </div>
        <label className="auth-consent">
          <input
            type="checkbox"
            checked={emails}
            onChange={e => setEmails(e.target.checked)}
          />
          <span>I agree to receive news, tips, and study emails</span>
        </label>
        <button type="submit" className="btn-press" style={primaryBtn}>
          Next
        </button>
      </form>
    </div>
  );
}
