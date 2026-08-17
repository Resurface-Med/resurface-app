import { useState } from "react";
import { C, OF } from "../ui/theme";
import { useAuth } from "../lib/auth";

// Two panels: the blue field carries the brand, the white sheet carries the
// form. Same split the landing page uses, so arriving here from the marketing
// site doesn't feel like a different product. Below 900px the brand panel is
// dropped rather than stacked — on a phone, nobody needs the pitch twice.

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

export default function LoginPage() {
  const { signIn, signUp, signInWithGoogle, resetPassword } = useAuth();

  const [mode, setMode] = useState("signin");   // signin | signup | reset
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [leaving, setLeaving] = useState(false);

  // A successful sign-in lifts the screen away. Supabase fires the session
  // change a moment later and App swaps this out, so the animation covers the
  // handover instead of the page simply being replaced.

  function go(next) {
    setMode(next); setError(""); setNotice("");
  }

  async function submit(e) {
    e.preventDefault();
    setError(""); setNotice(""); setBusy(true);
    try {
      if (mode === "reset") {
        const { error } = await resetPassword(email);
        if (error) throw error;
        setNotice("Check your email for a reset link.");
      } else if (mode === "signup") {
        const { data, error } = await signUp(email, password);
        if (error) throw error;
        // With email confirmation on, Supabase returns a user but no session.
        if (!data.session) setNotice("Check your email to confirm your account.");
      } else {
        const { error } = await signIn(email, password);
        if (error) throw error;
        setLeaving(true);
        return;   // leave `busy` set: the screen is on its way out
      }
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const heading = mode === "signup" ? "Create your account"
    : mode === "reset" ? "Reset your password"
    : "Welcome back";

  const cta = mode === "signup" ? "Create account"
    : mode === "reset" ? "Send reset link"
    : "Sign in";

  return (
    <div className={`login-split${leaving ? " is-leaving" : ""}`}>
      {/* ── Brand panel ─────────────────────────────────────────────── */}
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

          {/* Anyone on this screen has already decided; listing features again
              is wasted space. Who made it is the thing they don't know. */}
          <p style={{ marginTop: 22, fontSize: 16, color: OF.soft, lineHeight: 1.6, maxWidth: "40ch" }}>
            Built by a medical student, for medical students — questions that
            follow your course, not a generic syllabus.
          </p>
        </div>

        <img
          src="/books.webp" alt="" aria-hidden="true"
          className="login-books"
          width="580" height="839"
        />
      </aside>

      {/* ── Form panel ──────────────────────────────────────────────── */}
      <main className="login-form-panel">
        <div className="auth-stagger" style={{ width: "100%", maxWidth: 380 }} key={mode}>
          <img
            src="/logo-lockup.png"
            alt="Resurface"
            width="560" height="131"
            className="login-form-logo"
          />

          <h1 className="auth-swap" style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.9, color: C.text }}>{heading}</h1>
          <p style={{ fontSize: 14.5, color: C.sub, marginTop: 7, lineHeight: 1.5 }}>
            {mode === "reset"
              ? "We'll email you a link to set a new one."
              : "Your progress, flashcards and generated questions follow you everywhere."}
          </p>

          <form onSubmit={submit} style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 13 }}>
            <div>
              <label htmlFor="email" style={labelStyle}>Email</label>
              <input id="email" type="email" required autoComplete="email" autoFocus
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@university.ac.uk" style={field} />
            </div>

            <div className={`auth-collapse${mode === "reset" ? " is-out" : ""}`} aria-hidden={mode === "reset"}>
              <div>
                <label htmlFor="password" style={labelStyle}>Password</label>
                <input id="password" type="password" required={mode !== "reset"} minLength={6}
                  disabled={mode === "reset"}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder={mode === "signup" ? "At least 6 characters" : "••••••••"} style={field} />
              </div>
            </div>

            {error && (
              <div role="alert" className="auth-alert" style={{
                fontSize: 14, color: C.danger, background: C.dangerDim,
                border: `1px solid ${C.dangerBrd}`, borderRadius: "var(--r-ctrl)", padding: "10px 14px",
              }}>{error}</div>
            )}

            {notice && (
              <div className="auth-notice" style={{
                fontSize: 14, color: C.success, background: C.successDim,
                border: `1px solid ${C.successBrd}`, borderRadius: "var(--r-ctrl)", padding: "10px 14px",
              }}>{notice}</div>
            )}

            <button type="submit" disabled={busy} className="btn-press" style={{
              width: "100%", marginTop: 3, padding: "13px 26px",
              background: busy ? "var(--c-accent-lt)" : "var(--c-accent)",
              color: "#fff", border: "none", borderRadius: "var(--r-pill)",
              fontWeight: 600, fontSize: 15, fontFamily: "inherit",
              cursor: busy ? "default" : "pointer",
              boxShadow: "0 12px 30px rgba(20, 44, 130, 0.22)",
            }}>
              {busy ? "Working…" : cta}
            </button>
          </form>

          {mode !== "reset" && (
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

          <p style={{ textAlign: "center", fontSize: 12.5, color: C.muted, marginTop: 26 }}>
            Free while it's in testing.
          </p>
        </div>
      </main>
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
