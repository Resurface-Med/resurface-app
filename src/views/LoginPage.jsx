import { useState } from "react";
import { C, cardSolid, primaryBtn, OF } from "../ui/theme";
import { useAuth } from "../lib/auth";

const field = {
  width: "100%",
  padding: "12px 16px",
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
      }
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const title = mode === "signup" ? "Create your account" : mode === "reset" ? "Reset your password" : "Welcome back";
  const cta   = mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in";

  return (
    <div style={{
      minHeight: "var(--app-vh)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24,
    }}>
      <div style={{ width: "100%", maxWidth: 400 }}>

        <img
          src="/logo-lockup-white.png"
          alt="Resurface"
          width="720" height="190"
          style={{ width: 190, height: "auto", margin: "0 auto 28px", display: "block" }}
        />

        <div className="anim-fade-up" style={{ ...cardSolid, padding: "30px 28px" }}>
          <h1 style={{ fontSize: 23, fontWeight: 600, letterSpacing: -0.7, color: C.text }}>{title}</h1>
          <p style={{ fontSize: 14.5, color: C.sub, marginTop: 6 }}>
            {mode === "reset"
              ? "We'll email you a link to set a new one."
              : "Your progress, flashcards and generated questions follow you everywhere."}
          </p>

          <form onSubmit={submit} style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label htmlFor="email" style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.sub, marginBottom: 7 }}>
                Email
              </label>
              <input id="email" type="email" required autoComplete="email"
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@university.ac.uk" style={field} />
            </div>

            {mode !== "reset" && (
              <div>
                <label htmlFor="password" style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.sub, marginBottom: 7 }}>
                  Password
                </label>
                <input id="password" type="password" required minLength={6}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder={mode === "signup" ? "At least 6 characters" : "••••••••"} style={field} />
              </div>
            )}

            {error && (
              <div role="alert" style={{
                fontSize: 14, color: C.danger, background: C.dangerDim,
                border: `1px solid ${C.dangerBrd}`, borderRadius: "var(--r-ctrl)", padding: "10px 14px",
              }}>{error}</div>
            )}

            {notice && (
              <div style={{
                fontSize: 14, color: C.success, background: C.successDim,
                border: `1px solid ${C.successBrd}`, borderRadius: "var(--r-ctrl)", padding: "10px 14px",
              }}>{notice}</div>
            )}

            <button type="submit" disabled={busy} className="btn-press"
              style={{ ...primaryBtn, width: "100%", marginTop: 4, opacity: busy ? 0.6 : 1 }}>
              {busy ? "Working…" : cta}
            </button>
          </form>

          {mode !== "reset" && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0 16px" }}>
                <div style={{ flex: 1, height: 1, background: "var(--c-border)" }} />
                <span style={{ fontSize: 12, color: C.muted }}>or</span>
                <div style={{ flex: 1, height: 1, background: "var(--c-border)" }} />
              </div>

              <button type="button" onClick={signInWithGoogle} className="btn-press"
                style={{
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

          <div style={{ marginTop: 20, fontSize: 14, color: C.sub, textAlign: "center" }}>
            {mode === "signin" && (
              <>
                <button type="button" onClick={() => { setMode("signup"); setError(""); setNotice(""); }} style={linkBtn}>
                  Create an account
                </button>
                {" · "}
                <button type="button" onClick={() => { setMode("reset"); setError(""); setNotice(""); }} style={linkBtn}>
                  Forgot password?
                </button>
              </>
            )}
            {mode !== "signin" && (
              <button type="button" onClick={() => { setMode("signin"); setError(""); setNotice(""); }} style={linkBtn}>
                ← Back to sign in
              </button>
            )}
          </div>
        </div>

        <p style={{ textAlign: "center", fontSize: 13, color: OF.soft, marginTop: 18 }}>
          Free while it's in testing.
        </p>
      </div>
    </div>
  );
}

const linkBtn = {
  background: "none", border: "none", padding: 0, cursor: "pointer",
  fontFamily: "inherit", fontSize: 14, fontWeight: 600, color: "var(--c-accent)",
};
