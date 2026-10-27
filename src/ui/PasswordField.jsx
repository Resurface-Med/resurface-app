import { useState } from "react";

/**
 * A password input with a show/hide eye inside it on the right
 * (2026-10-27). In place of a "confirm password" box: one tap to check
 * what you typed, and no extra step for everyone else.
 */
export default function PasswordField({ style, ...props }) {
  const [shown, setShown] = useState(false);
  return (
    <span style={{ position: "relative", display: "block" }}>
      <input {...props} type={shown ? "text" : "password"} style={{ ...style, paddingRight: 46 }} />
      <button
        type="button"
        className="pw-eye"
        onClick={() => setShown(s => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        disabled={props.disabled}
        tabIndex={props.disabled ? -1 : 0}
      >
        {shown ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 3l18 18M10.6 5.1A10.6 10.6 0 0 1 12 5c5.5 0 9.3 4.6 10 7-.3 1-1.1 2.5-2.4 3.8M6.5 6.6C4.3 8 2.6 10.2 2 12c.8 2.4 4.5 7 10 7 1.7 0 3.2-.4 4.5-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M2 12c.8-2.4 4.5-7 10-7s9.2 4.6 10 7c-.8 2.4-4.5 7-10 7S2.8 14.4 2 12z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        )}
      </button>
    </span>
  );
}
