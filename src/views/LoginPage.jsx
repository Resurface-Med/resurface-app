import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { C, OF } from "../ui/theme";
import { useAuth } from "../lib/auth";

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
  background: "var(--c-card-solid)",
  border: "1.5px solid var(--c-border)",
  borderRadius: "var(--r-ctrl)",
  outline: "none",
};

const RESEND_SECS = 60;

export default function LoginPage() {
  const {
    signIn, signUp, signInWithGoogle, resetPassword,
    resendSignupCode, verifySignupCode, verifyRecoveryCode, updatePassword,
  } = useAuth();

  const [mode, setMode] = useState("signin"); // signin | signup | reset
  // After signup / reset request we collect the emailed code. After a recovery
  // code verifies, we collect the new password.
  const [step, setStep] = useState("form");   // form | code | newpass
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const codeBoxRef = useRef(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  useEffect(() => {
    if (step === "code") codeBoxRef.current?.focus();
  }, [step]);

  function go(next) {
    setMode(next);
    setStep("form");
    setCode("");
    setNewPassword("");
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
        setResendIn(RESEND_SECS);
        setNotice("");
      } else if (mode === "signup") {
        const { data, error: err } = await signUp(trimmed, password);
        if (err) throw err;
        setEmail(trimmed);
        // With email confirmation on, Supabase returns a user but no session.
        if (!data.session) {
          setStep("code");
          setCode("");
          setResendIn(RESEND_SECS);
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
      setError(err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e) {
    e.preventDefault();
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
      const { data, error: err } = await verifyRecoveryCode(email, token);
      if (err) throw err;
      if (!data.session) throw new Error("That code didn't work. Try again.");
      setStep("newpass");
      setNotice("");
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function submitNewPassword(e) {
    e.preventDefault();
    setError(""); setNotice(""); setBusy(true);
    try {
      if (newPassword.length < 6) {
        throw new Error("Password must be at least 6 characters.");
      }
      const { error: err } = await updatePassword(newPassword);
      if (err) throw err;
      setLeaving(true);
      return;
    } catch (err) {
      setError(err.message || "Something went wrong.");
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
      setResendIn(RESEND_SECS);
      setNotice("Sent a new code.");
      setCode("");
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const heading = step === "code" ? "Enter your code"
    : step === "newpass" ? "Choose a new password"
    : mode === "signup" ? "Create your account"
    : mode === "reset" ? "Reset your password"
    : "Welcome back";

  const sub = step === "code"
    ? `We sent a 6-digit code to ${email}.`
    : step === "newpass"
      ? "Pick something you'll remember. At least 6 characters."
      : mode === "reset"
        ? "We'll email you a code to set a new one."
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
            style={{ width: 210, height: "auto", display: "block" }}
          />

          <h2 style={{
            marginTop: 34, fontSize: 34, fontWeight: 600, lineHeight: 1.12,
            letterSpacing: -1.3, color: OF.text,
          }}>
            Don't let the lecture sink.
          </h2>

          <p style={{ marginTop: 22, fontSize: 16, color: OF.soft, lineHeight: 1.6, maxWidth: "40ch" }}>
            Built by a medical student, for medical students. Questions that
            follow your course, not a generic syllabus.
          </p>
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

          <h1 className="auth-swap" style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.9, color: C.text }}>{heading}</h1>
          <p style={{ fontSize: 14.5, color: C.sub, marginTop: 7, lineHeight: 1.5 }}>
            {sub}
          </p>

          {step === "form" && (
            <form onSubmit={submitForm} style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 13 }}>
              <div>
                <label htmlFor="email" style={labelStyle}>Email</label>
                <input id="email" type="email" required autoComplete="email" autoFocus
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@university.ac.uk" style={field} />
              </div>

              <div className={`auth-collapse${hidePassword ? " is-out" : ""}`} aria-hidden={hidePassword}>
                <div>
                  <label htmlFor="password" style={labelStyle}>Password</label>
                  <input id="password" type="password" required={!hidePassword} minLength={6}
                    disabled={hidePassword}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    value={password} onChange={e => setPassword(e.target.value)}
                    placeholder={mode === "signup" ? "At least 6 characters" : "••••••••"} style={field} />
                </div>
              </div>

              {error && <Alert kind="error">{error}</Alert>}
              {notice && <Alert kind="ok">{notice}</Alert>}

              <PrimaryButton busy={busy} label={busy ? "Working…" : formCta} />
            </form>
          )}

          {step === "code" && (
            <form onSubmit={submitCode} style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 13 }}>
              <CodeBoxes ref={codeBoxRef} value={code} onChange={setCode} />

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
                  {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
                </button>
              </div>
            </form>
          )}

          {step === "newpass" && (
            <form onSubmit={submitNewPassword} style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 13 }}>
              <div>
                <label htmlFor="new-password" style={labelStyle}>New password</label>
                <input id="new-password" type="password" required minLength={6} autoFocus
                  autoComplete="new-password"
                  value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters" style={field} />
              </div>

              {error && <Alert kind="error">{error}</Alert>}
              {notice && <Alert kind="ok">{notice}</Alert>}

              <PrimaryButton busy={busy} label={busy ? "Saving…" : "Save password"} />
            </form>
          )}

          {showGoogle && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0 15px" }}>
                <div style={{ flex: 1, height: 1, background: "var(--c-border)" }} />
                <span style={{ fontSize: 12, color: C.muted }}>or</span>
                <div style={{ flex: 1, height: 1, background: "var(--c-border)" }} />
              </div>

              <button type="button" onClick={signInWithGoogle} className="btn-press" style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                padding: "12px 20px", fontSize: 15, fontWeight: 600, fontFamily: "inherit",
                color: C.text, background: "var(--c-card-solid)",
                border: "1.5px solid var(--c-border)", borderRadius: "var(--r-pill)", cursor: "pointer",
              }}>
                <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true">
                  <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"/>
                  <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"/>
                  <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"/>
                  <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"/>
                </svg>
                Continue with Google
              </button>
            </>
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
  background: "var(--c-card-solid)",
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
      boxShadow: "0 12px 30px rgba(20, 44, 130, 0.22)",
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
