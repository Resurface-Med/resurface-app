import { primaryBtn } from "../ui/theme";

/** One-time ask after Google sign-in. Email signup already collected this. */
export default function MarketingPrompt({ onYes, onNo }) {
  return (
    <div className="mail-prompt-scrim" role="dialog" aria-labelledby="mail-prompt-title">
      <div className="mail-prompt">
        <img src="/books.webp" alt="" width="64" height="64" className="mail-prompt__mark" />
        <h2 id="mail-prompt-title" className="mail-prompt__title">Want the occasional email?</h2>
        <p className="mail-prompt__copy">
          News, study tips, and product updates. Off unless you say yes — you can change this in Profile.
        </p>
        <div className="mail-prompt__actions">
          <button type="button" className="btn-press" style={primaryBtn} onClick={onYes}>
            Yes, email me
          </button>
          <button type="button" className="mail-prompt__skip btn-press" onClick={onNo}>
            No thanks
          </button>
        </div>
      </div>
    </div>
  );
}
