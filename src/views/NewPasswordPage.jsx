import { useState } from "react";
import { C, OF } from "../ui/theme";
import { useAuth } from "../lib/auth";

/**
 * Choosing a new password after a recovery code.
 *
 * A page of its own rather than a step inside LoginPage. Verifying a recovery
 * code creates a real session, which makes App load the user's data, which
 * unmounts whatever was on screen — so a step held in LoginPage's state was
 * destroyed before it could be used. Owning the route removes the dependency
 * on any other screen surviving.
 */
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

const labelStyle = {
  display: "block", fontSize: 13, fontWeight: 600,
  color: "var(--c-sub)", marginBottom: 7,
};

export default function NewPasswordPage() {
  const { updatePassword, endRecovery, signOut, user } = useAuth();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [leaving, setLeaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");

    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (password !== confirm) return setError("Those don't match.");

    setBusy(true);
    try {
      const { error: err } = await updatePassword(password);
      if (err) throw err;
      // updatePassword clears `recovering`, which drops the app in behind this.
      setLeaving(true);
    } catch (err) {
      setError(err.message || "Couldn't change your password.");
      setBusy(false);
    }
  }

  async function cancel() {
    // Leaving mid-recovery would otherwise strand a signed-in session whose
    // password was never changed.
    endRecovery();
    await signOut();
  }

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
            Nearly there.
          </h2>
          <p style={{ marginTop: 22, fontSize: 16, color: OF.soft, lineHeight: 1.6, maxWidth: "40ch" }}>
            Choose a new password and you're back in — your progress, streak and
            saved questions are exactly where you left them.
          </p>
        </div>

        <img src="/books.webp" alt="" aria-hidden="true" className="login-books" width="580" height="839" />
      </aside>

      <main className="login-form-panel">
        <div className="auth-stagger" style={{ width: "100%", maxWidth: 380 }}>
          <img src="/logo-lockup.png" alt="Resurface" width="560" height="131" className="login-form-logo" />

          <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.9, color: C.text }}>
            Choose a new password
          </h1>
          <p style={{ fontSize: 14.5, color: C.sub, marginTop: 7, lineHeight: 1.5 }}>
            {user?.email ? `For ${user.email}.` : "Almost done."} Make it something you'll remember.
          </p>

          <form onSubmit={submit} style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 13 }}>
            <div>
              <label htmlFor="new-password" style={labelStyle}>New password</label>
              <input id="new-password" type="password" required minLength={6} autoFocus
                autoComplete="new-password"
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="At least 6 characters" style={field} />
            </div>

            <div>
              <label htmlFor="confirm-password" style={labelStyle}>Confirm password</label>
              <input id="confirm-password" type="password" required minLength={6}
                autoComplete="new-password"
                value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="Type it again" style={field} />
            </div>

            {error && (
              <div role="alert" className="auth-alert" style={{
                fontSize: 14, color: C.danger, background: C.dangerDim,
                border: `1px solid ${C.dangerBrd}`, borderRadius: "var(--r-ctrl)", padding: "10px 14px",
              }}>{error}</div>
            )}

            <button type="submit" disabled={busy} className="btn-press" style={{
              width: "100%", marginTop: 3, padding: "13px 26px",
              background: busy ? "var(--c-accent-lt)" : "var(--c-accent)",
              color: "#fff", border: "none", borderRadius: "var(--r-pill)",
              fontWeight: 600, fontSize: 15, fontFamily: "inherit",
              cursor: busy ? "default" : "pointer",
              boxShadow: "var(--c-cta-shadow)",
            }}>
              {busy ? "Saving…" : "Save and continue"}
            </button>
          </form>

          <div style={{ marginTop: 22, fontSize: 14, textAlign: "center" }}>
            <button type="button" onClick={cancel} style={{
              background: "none", border: "none", padding: 0, cursor: "pointer",
              fontFamily: "inherit", fontSize: 14, fontWeight: 600, color: "var(--c-muted)",
            }}>
              Cancel and sign out
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
