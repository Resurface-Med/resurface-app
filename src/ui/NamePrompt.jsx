import { useEffect, useRef, useState } from "react";

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
export default function NamePrompt({ suggestion, onSave, onSkip }) {
  const [name, setName] = useState(suggestion || "");
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") onSkip(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSkip]);

  function submit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) return;
    setBusy(true);
    onSave(trimmed);
  }

  return (
    <div className="np-scrim" role="presentation">
      <form className="np" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="np-title">
        <h2 className="np__title" id="np-title">What should we call you?</h2>
        <p className="np__sub">
          This is the name on the leaderboard. You can change it any time in your profile.
        </p>

        <input
          ref={ref}
          className="np__field"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={32}
          aria-label="Your name"
          placeholder="Your name"
        />

        <div className="np__row">
          <button type="submit" className="np__save btn-press" disabled={busy || name.trim().length < 2}>
            {busy ? "Saving…" : "That's me"}
          </button>
          <button type="button" className="np__skip" onClick={onSkip} disabled={busy}>
            Not now
          </button>
        </div>
      </form>
    </div>
  );
}
