import { useState } from "react";
import { primaryBtn } from "../ui/theme";

/** One-time ask after Google sign-in. Email signup already collected this. */
export default function MarketingPrompt({ googleName, onContinue }) {
  const [name, setName] = useState("");
  const [emails, setEmails] = useState(false);

  function submit(e) {
    e.preventDefault();
    const trimmed = name.trim().slice(0, 32);
    onContinue({
      displayName: trimmed.length >= 2 ? trimmed : undefined,
      marketingOptIn: emails,
    });
  }

  return (
    <div className="mail-prompt-scrim" role="dialog" aria-labelledby="mail-prompt-title">
      <form className="mail-prompt" onSubmit={submit}>
        <h2 id="mail-prompt-title" className="mail-prompt__title">A couple of details</h2>
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
            onChange={e => setName(e.target.value)}
          />
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
