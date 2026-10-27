import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import PasswordField from "../ui/PasswordField";
import { C, OF } from "../ui/theme";
import { useAuth } from "../lib/auth";

/* Offline, Supabase says "Failed to fetch", which reads as a fault. */
function friendly(err) {
  const msg = err?.message || "";
  if (navigator.onLine === false || err instanceof TypeError || /failed to fetch|network|load failed/i.test(msg)) {
    return "You’re offline. Signing in needs a connection.";
  }
  return msg || "Something went wrong.";
}

// Two panels: the blue field carries the brand, the white sheet carries the
// form. Same split the landing page uses, so arriving here from the marketing
// site doesn't feel like a different product. Below 900px the brand panel is
// dropped rather than stacked — on a phone, nobody needs the pitch twice.
//
// Day-to-day auth is email + password (+ Google). A 6-digit email code is only
// used to confirm a new signup, and to prove ownership before a password reset
// — so mail apps that prefetch links can't burn the session.

const field = {
  width: "100%",
  padding: "12px 15px",
  fontSize: 15,
  fontFamily: "inherit",
  color: "var(--c-text)",
  background: "var(--c-surface3)",
  border: "1.5px solid var(--c-border)",
  borderRadius: "var(--r-ctrl)",
  outline: "none",
};

const RESEND_SECS = 60;
/* University mail systems hold mail from new senders for a few minutes
   (ARU's took 3, 2026-10-17). A resend in that window replaces the code
   that is still on its way, so the old one fails when it lands — which is
   how most university sign-ups were being lost. Longer wait, and say so. */
const UNI = /\.(ac\.uk|edu)$/i;
/* University mail is held by ARU's Check Point scan for about 2½ minutes
   (headers, 2026-10-27). A resend at 2:00 cancelled the code 30 seconds
   from arriving, so the wait is 3 minutes there. */
const resendSecsFor = email => (UNI.test(String(email).trim()) ? 180 : RESEND_SECS);
/* After this long with no code, offer a way out. */
const UNI_GIVE_UP_SECS = 240;
const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/* `sentDeck`: they followed a link to someone's deck (lib/pendingShare).
   Nearly always a new person, so it opens on sign-up, and says the deck is
   waiting — it is added straight after, however they sign in. */
export default function LoginPage({ sentDeck = false }) {
  const {
    signIn, signUp, signInWithGoogle, resetPassword,
    resendSignupCode, verifySignupCode, verifyRecoveryCode,
    beginRecovery, endRecovery,
  } = useAuth();

  const [mode, setMode] = useState(sentDeck ? "signup" : "signin"); // signin | signup | reset
  // After signup / reset request we collect the emailed code. After a recovery
  // code verifies, we collect the new password.
  const [step, setStep] = useState("form");   // form | code
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  /* When the latest code went out, and seconds since, for "Sent 1:12 ago". */
  const [sentAt, setSentAt] = useState(0);
  const [, setTick] = useState(0);
  const codeBoxRef = useRef(null);
  // Last code auto-submitted, so a wrong one is not retried on every keystroke.
  const lastTried = useRef("");

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const uniWait = step === "code" && UNI.test(email.trim()) && sentAt > 0;
  useEffect(() => {
    if (!uniWait) return;
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, [uniWait]);
  const sentAgo = sentAt ? Math.max(0, Math.floor((Date.now() - sentAt) / 1000)) : 0;

  useEffect(() => {
    if (step === "code") codeBoxRef.current?.focus();
    if (step !== "code") lastTried.current = "";
  }, [step]);

  function go(next) {
    setMode(next);
    setStep("form");
    setCode("");
    setError("");
    setNotice("");
    setResendIn(0);
  }

  function readCode() {
    const token = code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(token)) {
      throw new Error("Enter the 6-digit code from your email.");
    }
    return token;
  }

  async function submitForm(e) {
    e.preventDefault();
    setError(""); setNotice(""); setBusy(true);
    try {
      const trimmed = email.trim();
      if (mode === "reset") {
        const { error: err } = await resetPassword(trimmed);
        if (err) throw err;
        setEmail(trimmed);
        setStep("code");
        setCode("");
        setResendIn(resendSecsFor(trimmed)); setSentAt(Date.now());
        setNotice("");
      } else if (mode === "signup") {
        /* No name is passed: handle_new_user falls back to the Google
           profile's name and then to the email's local part, so a profile
           always has one and nobody is asked for it on the way in. */
        const { data, error: err } = await signUp(trimmed, password, "", marketingOptIn);
        if (err) throw err;
        setEmail(trimmed);
        // With email confirmation on, Supabase returns a user but no session.
        if (!data.session) {
          setStep("code");
          setCode("");
          setResendIn(resendSecsFor(trimmed)); setSentAt(Date.now());
          setNotice("");
        } else {
          setLeaving(true);
          return;
        }
      } else {
        const { error: err } = await signIn(trimmed, password);
        if (err) throw err;
        setLeaving(true);
        return;
      }
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy(false);
    }
  }

  // Submits itself once six digits are in, so nobody types the last digit and
  // then hunts for a button. Guarded by the code it last tried: a wrong code
  // must not resubmit on every keystroke while the user corrects it.
  useEffect(() => {
    if (step !== "code" || busy) return;
    if (code.length !== 6 || code === lastTried.current) return;
    lastTried.current = code;
    submitCode();
  }, [code, step, busy]);   // eslint-disable-line react-hooks/exhaustive-deps

  async function submitCode(e) {
    e?.preventDefault();
    setError(""); setNotice(""); setBusy(true);
    try {
      const token = readCode();
      if (mode === "signup") {
        const { data, error: err } = await verifySignupCode(email, token);
        if (err) throw err;
        if (!data.session) throw new Error("That code didn't work. Try again.");
        setLeaving(true);
        return;
      }
      beginRecovery();          // before the await: the session lands mid-flight
      const { data, error: err } = await verifyRecoveryCode(email, token);
      if (err) { endRecovery(); throw err; }
      if (!data.session) { endRecovery(); throw new Error("That code didn't work. Try again."); }
      // App swaps in NewPasswordPage as soon as `recovering` is set, so there
      // is nothing further to do here.
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (resendIn > 0 || busy) return;
    setError(""); setNotice(""); setBusy(true);
    try {
      if (mode === "signup") {
        const { error: err } = await resendSignupCode(email);
        if (err) throw err;
      } else {
        const { error: err } = await resetPassword(email);
        if (err) throw err;
      }
      setResendIn(resendSecsFor(email)); setSentAt(Date.now());
      setNotice("Sent a new code. Use the newest one; earlier codes stop working.");
      setCode("");
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy(false);
    }
  }

  const heading = step === "code" ? "Enter your code"
    : mode === "signup" ? "Create your account"
    : mode === "reset" ? "Reset your password"
    : "Welcome back";

  /* One short sentence, the address in ink so it can be checked at a
     glance. University mail's wait is said under the boxes, where eyes
     are while waiting — five sentences up here read as one grey block
     and were skimmed (Rafil, 2026-10-27). */
  const sub = step === "code"
    ? <>We sent a 6-digit code to <strong style={{ color: C.text, fontWeight: 600 }}>{email}</strong>. It’s in the subject line.</>
    : mode === "reset"
        ? "We'll email you a code to set a new one."
      : sentDeck
        ? `${mode === "signup" ? "Sign up" : "Sign in"} to add the deck you were sent. It’ll be waiting for you.`
      : "Your progress and generated questions follow you everywhere.";

  const formCta = mode === "signup" ? "Create account"
    : mode === "reset" ? "Send reset code"
    : "Sign in";

  const staggerKey = `${mode}-${step}`;
  const showGoogle = step === "form" && mode !== "reset";
  const hidePassword = mode === "reset" && step === "form";

  return (
    <div className={`login-split${leaving ? " is-leaving" : ""}`}>
      <aside className="login-brand">
        <span className="login-blob b1" aria-hidden="true" />
        <span className="login-blob b2" aria-hidden="true" />

        <div style={{ position: "relative", zIndex: 1, maxWidth: 420 }}>
          <img
            src="/logo-lockup-white.png"
            alt="Resurface"
            width="720" height="190"
            className="login-brand-logo login-brand-logo--white"
          />
          <img
            src="/logo-lockup.png"
            alt="Resurface"
            width="720" height="190"
            className="login-brand-logo login-brand-logo--ink"
          />

          <h2 style={{
            marginTop: 34, fontSize: 34, fontWeight: 600, lineHeight: 1.12,
            letterSpacing: -1.3, color: OF.text,
          }}>
            Don't let the lecture sink.
          </h2>
        </div>

        <img
          src="/books.webp" alt="" aria-hidden="true"
          className="login-books"
          width="580" height="839"
        />
      </aside>

      <main className="login-form-panel">
        <div className="auth-stagger" style={{ width: "100%", maxWidth: 380 }} key={staggerKey}>
          <img
            src="/logo-lockup.png"
            alt="Resurface"
            width="560" height="131"
            className="login-form-logo"
          />
          <img
            src="/logo-lockup-white.png"
            alt="Resurface"
            width="560" height="131"
            className="login-form-logo login-form-logo--night"
          />

          <h1 className="auth-swap" style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.9, color: C.text }}>{heading}</h1>
          <p style={{ fontSize: 14.5, color: C.sub, marginTop: 7, lineHeight: 1.5 }}>
            {sub}
          </p>

          {/*
            * Google first, and not as a courtesy.
            *
            * Of the accounts that have ever started here, seven of twelve
            * email signups never confirmed and all five Google ones did. The
            * email path asks for three fields and then sends you out of the
            * app to fetch six digits from your inbox; more than half of
            * people do not come back. It stays, because not everyone has a
            * Google account, but it stops being the thing presented first.
            */}
          {showGoogle && (
            <>
              <button type="button" onClick={signInWithGoogle} className="btn-press" style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                padding: "12px 20px", fontSize: 15, fontWeight: 600, fontFamily: "inherit",
                color: C.text, background: "var(--c-card-solid)",
                border: "1.5px solid var(--c-border)", borderRadius: "var(--r-pill)", cursor: "pointer",
                marginTop: 24,
              }}>
                <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true">
                  <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"/>
                  <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"/>
                  <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"/>
                  <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"/>
                </svg>
                Continue with Google
              </button>

              {/* The rule belongs under Google, not over it: it separates the
                  way in from the other way in, and the one above the line is
                  the one that works. */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "18px 0 2px" }}>
                <div style={{ flex: 1, height: 1, background: "var(--c-border)" }} />
                <span style={{ fontSize: 12, color: C.muted }}>{mode === "signup" ? "or use a personal email" : "or use your email"}</span>
                <div style={{ flex: 1, height: 1, background: "var(--c-border)" }} />
              </div>
            </>
          )}

          {step === "form" && (
            <form onSubmit={submitForm} style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 13 }}>
              <div>
                <label htmlFor="email" style={labelStyle}>Email</label>
                <input id="email" type="email" required autoComplete="email" autoFocus={mode !== "signup"}
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com" style={field} />
                {/* Codes to ARU student email can take a long time or never
                    arrive: 3 of the first 4 never confirmed, against 0 of 13
                    on Gmail at a median of 18 seconds (2026-10-27). Only
                    where a code is sent: sign-up and reset. */}
                {mode !== "signin" && UNI.test(email.trim()) && (
                  <p style={{ fontSize: 13, color: C.sub, lineHeight: 1.5, margin: "8px 2px 0" }}>
                    Codes sent to university email can take a long time to arrive. A personal email or Continue with Google is much quicker.
                  </p>
                )}
              </div>

              {/* No display name here any more.
                *
                * It was required, asked third, and justified by a leaderboard
                * nobody has seen yet — a field between a person and the thing
                * they came for, in exchange for nothing they wanted. The
                * database already falls back to the Google profile's name and
                * then to the email's local part, so an account always has
                * one, and Profile is where it gets changed to something they
                * actually chose. */}

              <div className={`auth-collapse${hidePassword ? " is-out" : ""}`} aria-hidden={hidePassword}>
                <div>
                  <label htmlFor="password" style={labelStyle}>Password</label>
                  <PasswordField id="password" required={!hidePassword} minLength={6}
                    disabled={hidePassword}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    value={password} onChange={e => setPassword(e.target.value)}
                    placeholder={mode === "signup" ? "At least 6 characters" : "••••••••"} style={field} />
                </div>
              </div>

              {mode === "signup" && (
                <label className="auth-consent">
                  <input
                    type="checkbox"
                    checked={marketingOptIn}
                    onChange={e => setMarketingOptIn(e.target.checked)}
                  />
                  <span>I agree to receive news, tips, and study emails</span>
                </label>
              )}

              {error && <Alert kind="error">{error}</Alert>}
              {notice && <Alert kind="ok">{notice}</Alert>}

              <PrimaryButton busy={busy} label={busy ? "Working…" : formCta} />
            </form>
          )}

          {step === "code" && (
            <form onSubmit={submitCode} style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 13 }}>
              <CodeBoxes ref={codeBoxRef} value={code} onChange={setCode} />

              {/* University mail: that it is still on its way, and after four
                  minutes a way out. */}
              {uniWait && (
                <div style={{ margin: "2px 2px 0", lineHeight: 1.45 }}>
                  <p style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: 0 }}>
                    University email takes about 3 minutes. Keep this page open.
                  </p>
                  <p style={{ fontSize: 13.5, color: C.sub, margin: "3px 0 0", fontVariantNumeric: "tabular-nums" }}>
                    {sentAgo >= UNI_GIVE_UP_SECS ? (
                      <>Still nothing after {mmss(sentAgo)}? Check Junk, or{" "}
                        <button type="button" style={{ ...linkBtn, padding: 0, fontSize: 13.5 }}
                          onClick={() => { setStep("form"); setCode(""); setError(""); setNotice(""); setEmail(""); setSentAt(0); }}>
                          use a personal email instead
                        </button>.
                      </>
                    ) : `Sent ${mmss(sentAgo)} ago`}
                  </p>
                </div>
              )}

              {error && <Alert kind="error">{error}</Alert>}
              {notice && <Alert kind="ok">{notice}</Alert>}

              <PrimaryButton busy={busy} label={busy ? "Checking…" : (mode === "reset" ? "Continue" : "Confirm email")} />

              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 4 }}>
                <button type="button" onClick={() => { setStep("form"); setCode(""); setError(""); setNotice(""); }} style={linkBtn}>
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={resend}
                  disabled={resendIn > 0 || busy}
                  style={{
                    ...linkBtn,
                    color: resendIn > 0 || busy ? "var(--c-muted)" : "var(--c-accent)",
                    cursor: resendIn > 0 || busy ? "default" : "pointer",
                  }}
                >
                  {resendIn > 0 ? `Resend in ${resendIn >= 60 ? mmss(resendIn) : `${resendIn}s`}` : "Resend code"}
                </button>
              </div>
            </form>
          )}



          {step === "form" && (
            <div style={{ marginTop: 22, fontSize: 14, color: C.sub, textAlign: "center" }}>
              {mode === "signin" ? (
                <>
                  <button type="button" onClick={() => go("signup")} style={linkBtn}>Create an account</button>
                  <span style={{ color: C.mutedDim, margin: "0 8px" }}>·</span>
                  <button type="button" onClick={() => go("reset")} style={linkBtn}>Forgot password?</button>
                </>
              ) : (
                <button type="button" onClick={() => go("signin")} style={linkBtn}>← Back to sign in</button>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// Six cells instead of one stretched field — same tokens as the rest of the
// form, sized for a single digit. Paste and SMS autofill land on the first box.
const CodeBoxes = forwardRef(function CodeBoxes({ value, onChange }, ref) {
  const cells = useRef([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] || "");

  useImperativeHandle(ref, () => ({
    focus: () => cells.current[0]?.focus(),
  }));

  function setAt(index, digit) {
    const next = digits.slice();
    next[index] = digit;
    onChange(next.join("").slice(0, 6));
  }

  function writeMany(start, text) {
    const chars = text.replace(/\D/g, "").slice(0, 6 - start).split("");
    if (!chars.length) return;
    const next = digits.slice();
    chars.forEach((ch, i) => { next[start + i] = ch; });
    onChange(next.join("").slice(0, 6));
    cells.current[Math.min(start + chars.length, 5)]?.focus();
  }

  function onKeyDown(i, e) {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (digits[i]) setAt(i, "");
      else if (i > 0) {
        setAt(i - 1, "");
        cells.current[i - 1]?.focus();
      }
      return;
    }
    if (e.key === "ArrowLeft" && i > 0) {
      e.preventDefault();
      cells.current[i - 1]?.focus();
    }
    if (e.key === "ArrowRight" && i < 5) {
      e.preventDefault();
      cells.current[i + 1]?.focus();
    }
  }

  function onChangeCell(i, e) {
    const raw = e.target.value.replace(/\D/g, "");
    if (raw.length > 1) {
      writeMany(i, raw);
      return;
    }
    if (!raw) {
      setAt(i, "");
      return;
    }
    setAt(i, raw);
    if (i < 5) cells.current[i + 1]?.focus();
  }

  return (
    <div role="group" aria-label="6-digit code" style={{ display: "flex", gap: 8 }}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => { cells.current[i] = el; }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${i + 1}`}
          maxLength={i === 0 ? 6 : 1}
          value={d}
          onChange={e => onChangeCell(i, e)}
          onKeyDown={e => onKeyDown(i, e)}
          onPaste={e => {
            e.preventDefault();
            writeMany(i, e.clipboardData.getData("text") || "");
          }}
          onFocus={e => e.target.select()}
          className="code-cell"
          style={codeCell}
        />
      ))}
    </div>
  );
});

const codeCell = {
  flex: "1 1 0",
  width: 0,
  height: 52,
  padding: 0,
  textAlign: "center",
  fontSize: 22,
  fontWeight: 600,
  fontFamily: "inherit",
  fontVariantNumeric: "tabular-nums",
  color: "var(--c-text)",
  background: "var(--c-surface3)",
  border: "1.5px solid var(--c-border)",
  borderRadius: "var(--r-ctrl)",
  outline: "none",
  caretColor: "var(--c-accent)",
};

function PrimaryButton({ busy, label }) {
  return (
    <button type="submit" disabled={busy} className="btn-press" style={{
      width: "100%", marginTop: 3, padding: "13px 26px",
      background: busy ? "var(--c-accent-lt)" : "var(--c-accent)",
      color: "#fff", border: "none", borderRadius: "var(--r-pill)",
      fontWeight: 600, fontSize: 15, fontFamily: "inherit",
      cursor: busy ? "default" : "pointer",
      boxShadow: "0 12px 30px rgba(var(--c-shade), 0.22)",
    }}>
      {label}
    </button>
  );
}

function Alert({ kind, children }) {
  const ok = kind === "ok";
  return (
    <div
      role={ok ? undefined : "alert"}
      className={ok ? "auth-notice" : "auth-alert"}
      style={{
        fontSize: 14,
        color: ok ? C.success : C.danger,
        background: ok ? C.successDim : C.dangerDim,
        border: `1px solid ${ok ? C.successBrd : C.dangerBrd}`,
        borderRadius: "var(--r-ctrl)",
        padding: "10px 14px",
      }}
    >
      {children}
    </div>
  );
}

const labelStyle = {
  display: "block", fontSize: 13, fontWeight: 600,
  color: "var(--c-sub)", marginBottom: 7,
};

const linkBtn = {
  background: "none", border: "none", padding: 0, cursor: "pointer",
  fontFamily: "inherit", fontSize: 14, fontWeight: 600, color: "var(--c-accent)",
};
