import { useState } from "react";
import { h1, OF, primaryBtn, chipBtn, chipBtnActive, btnGhost, sectionH, meta, body } from "../ui/theme";
import Wave from "../ui/Wave";
import { remote } from "../lib/remote";
import { useAuth } from "../lib/auth";

/**
 * Account surface — identity, study prefs, sign-in, danger zone.
 * Same blue → wave → white sheet as Home / Generate.
 */

const band = {
  maxWidth: 1180,
  margin: "0 auto",
  padding: "0 clamp(20px, 3vw, 40px)",
  width: "100%",
};

function initials(displayName, email) {
  const n = String(displayName || "").trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0] || "";
    const b = parts[1]?.[0] || "";
    return (a + b || n.slice(0, 2)).toUpperCase();
  }
  return String(email || "?").slice(0, 1).toUpperCase();
}

function authProviders(user) {
  const fromIdentities = (user?.identities || []).map(i => i.provider).filter(Boolean);
  if (fromIdentities.length) return [...new Set(fromIdentities)];
  const list = user?.app_metadata?.providers;
  if (Array.isArray(list) && list.length) return list;
  const one = user?.app_metadata?.provider;
  return one ? [one] : [];
}

function providerLabel(p) {
  if (p === "google") return "Google";
  if (p === "email") return "Email";
  return p;
}

export default function ProfileView({
  userId, email, displayName, showOnLeaderboard, marketingOptIn, dailyGoal,
  onProfileChange, onSignOut, theme, onThemeChange, onResetProgress,
}) {
  const { user, updatePassword } = useAuth();
  const providers = authProviders(user);
  const canChangePassword = providers.includes("email");
  const signedWith = providers.map(providerLabel).join(" · ") || "Email";

  const [name, setName] = useState(displayName || "");
  const [onBoard, setOnBoard] = useState(showOnLeaderboard !== false);
  const [emails, setEmails] = useState(marketingOptIn === true);
  const [goal, setGoal] = useState(dailyGoal || 20);
  const [nameSaved, setNameSaved] = useState(false);
  const [prefSaved, setPrefSaved] = useState(false);

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");

  const [resetBusy, setResetBusy] = useState(false);

  function flashPrefs() {
    setPrefSaved(true);
    setTimeout(() => setPrefSaved(false), 1400);
  }

  function saveName(e) {
    e.preventDefault();
    const trimmed = name.trim().slice(0, 32);
    if (!trimmed) return;
    remote.profile(userId, { displayName: trimmed });
    onProfileChange?.({ displayName: trimmed });
    setName(trimmed);
    setNameSaved(true);
    setTimeout(() => setNameSaved(false), 1400);
  }

  function setLeaderboard(next) {
    if (next === onBoard) return;
    setOnBoard(next);
    remote.profile(userId, { showOnLeaderboard: next });
    onProfileChange?.({ showOnLeaderboard: next });
    flashPrefs();
  }

  function setEmailOptIn(next) {
    setEmails(next);
    remote.profile(userId, { marketingOptIn: next });
    onProfileChange?.({ marketingOptIn: next });
    flashPrefs();
  }

  function saveGoal(e) {
    e.preventDefault();
    const g = Math.min(500, Math.max(1, parseInt(goal, 10) || 20));
    setGoal(g);
    remote.goal(userId, g);
    onProfileChange?.({ dailyGoal: g });
    flashPrefs();
  }

  async function changePassword(e) {
    e.preventDefault();
    setPwErr("");
    setPwMsg("");
    if (pw.length < 6) return setPwErr("Password must be at least 6 characters.");
    if (pw !== pw2) return setPwErr("Those don't match.");
    setPwBusy(true);
    try {
      const { error } = await updatePassword(pw);
      if (error) throw error;
      setPw("");
      setPw2("");
      setPwMsg("Password updated.");
    } catch (err) {
      setPwErr(err.message || "Couldn't change your password.");
    } finally {
      setPwBusy(false);
    }
  }

  function resetProgress() {
    if (!window.confirm("Reset all practice stats and review schedules? This cannot be undone.")) {
      return;
    }
    setResetBusy(true);
    try {
      onResetProgress?.();
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "var(--app-vh)" }}>
      <div style={{ ...band, paddingTop: "clamp(22px, 3.6vh, 36px)", paddingBottom: "clamp(18px, 2.8vh, 28px)" }}>
        <div className="profile-identity" data-in="left" style={{ "--i": 0 }}>
          <span className="profile-avatar" aria-hidden="true">
            {initials(displayName, email)}
          </span>
          <div className="profile-identity__text">
            <h1 style={{ ...h1, margin: 0 }}>
              {displayName?.trim() || "Profile"}
            </h1>
            <p style={{ marginTop: 6, fontSize: 15, color: OF.soft, fontWeight: 500 }}>
              {email}
            </p>
            <p style={{ marginTop: 4, fontSize: 13, color: OF.faint, fontWeight: 500 }}>
              Signed in with {signedWith}
            </p>
          </div>
        </div>
      </div>

      <Wave from="transparent" to="var(--c-card-solid)" />

      <div style={{ background: "var(--c-card-solid)", flex: 1 }}>
        <div className="profile-sheet" style={{ ...band, maxWidth: 560, paddingTop: "clamp(20px, 3vh, 28px)", paddingBottom: "clamp(36px, 5vh, 56px)" }}>

          <section className="profile-section" data-in="rise" style={{ "--i": 1 }}>
            <h2 style={sectionH}>Account</h2>
            <p style={{ ...meta, marginTop: 4 }}>How you appear on Resurface.</p>

            <div className="profile-stack">
              <form onSubmit={saveName} className="profile-field">
                <span className="profile-label">Display name</span>
                <div className="profile-name-row">
                  <input
                    className="profile-input"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    maxLength={32}
                    placeholder="What shows on the leaderboard"
                    required
                  />
                  <button type="submit" className="btn-press profile-inline-save" style={primaryBtn}>
                    {nameSaved ? "Saved" : "Save"}
                  </button>
                </div>
              </form>

              <div>
                <span className="profile-label">Leaderboard</span>
                <div className="profile-chips" role="group" aria-label="Leaderboard">
                  <button
                    type="button"
                    className="btn-press"
                    onClick={() => setLeaderboard(true)}
                    style={onBoard ? { ...chipBtnActive, boxShadow: "none" } : chipBtn}
                  >
                    Show me
                  </button>
                  <button
                    type="button"
                    className="btn-press"
                    onClick={() => setLeaderboard(false)}
                    style={!onBoard ? { ...chipBtnActive, boxShadow: "none" } : chipBtn}
                  >
                    Hide me
                  </button>
                </div>
                <p style={{ ...meta, marginTop: 8 }}>
                  On by default. Hiding removes you from the weekly board.
                  {prefSaved ? " · Saved" : ""}
                </p>
              </div>

              <label className="auth-consent">
                <input
                  type="checkbox"
                  checked={emails}
                  onChange={e => setEmailOptIn(e.target.checked)}
                />
                <span>Send me news, tips, and study emails</span>
              </label>
            </div>
          </section>

          <section className="profile-section" data-in="rise" style={{ "--i": 2 }}>
            <h2 style={sectionH}>Study</h2>
            <p style={{ ...meta, marginTop: 4 }}>Your daily target.</p>

            <form onSubmit={saveGoal} className="profile-stack">
              <label className="profile-field">
                <span className="profile-label">Daily goal</span>
                <input
                  className="profile-input"
                  type="number"
                  min={1}
                  max={500}
                  value={goal}
                  onChange={e => setGoal(e.target.value)}
                />
              </label>
              <button type="submit" className="btn-press" style={{ ...btnGhost, alignSelf: "flex-start" }}>
                Save goal
              </button>
            </form>
          </section>

          <section className="profile-section" data-in="rise" style={{ "--i": 3 }}>
            <h2 style={sectionH}>Preferences</h2>
            <p style={{ ...meta, marginTop: 4 }}>How Resurface looks on this device.</p>

            <div className="profile-stack">
              <div>
                <span className="profile-label">Appearance</span>
                <div className="profile-chips" role="radiogroup" aria-label="Appearance">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={theme !== "dark"}
                    className="btn-press"
                    onClick={() => onThemeChange?.("light")}
                    style={theme !== "dark" ? { ...chipBtnActive, boxShadow: "none" } : chipBtn}
                  >
                    Day
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={theme === "dark"}
                    className="btn-press"
                    onClick={() => onThemeChange?.("dark")}
                    style={theme === "dark" ? { ...chipBtnActive, boxShadow: "none" } : chipBtn}
                  >
                    Night
                  </button>
                </div>
                <p style={{ ...meta, marginTop: 8 }}>
                  Applies straight away, and is remembered on this device.
                </p>
              </div>
            </div>
          </section>

          <section className="profile-section" data-in="rise" style={{ "--i": 4 }}>
            <h2 style={sectionH}>Sign-in</h2>
            <p style={{ ...meta, marginTop: 4 }}>
              {canChangePassword
                ? "Change the password for this email account."
                : "This account signs in with Google — no password to change here."}
            </p>

            {canChangePassword ? (
              <form onSubmit={changePassword} className="profile-stack">
                <label className="profile-field">
                  <span className="profile-label">New password</span>
                  <input
                    className="profile-input"
                    type="password"
                    autoComplete="new-password"
                    minLength={6}
                    value={pw}
                    onChange={e => setPw(e.target.value)}
                    required
                  />
                </label>
                <label className="profile-field">
                  <span className="profile-label">Confirm password</span>
                  <input
                    className="profile-input"
                    type="password"
                    autoComplete="new-password"
                    minLength={6}
                    value={pw2}
                    onChange={e => setPw2(e.target.value)}
                    required
                  />
                </label>
                {pwErr && <p className="profile-err" role="alert">{pwErr}</p>}
                {pwMsg && <p className="profile-ok">{pwMsg}</p>}
                <button
                  type="submit"
                  className="btn-press"
                  style={{ ...primaryBtn, alignSelf: "flex-start", opacity: pwBusy ? 0.7 : 1 }}
                  disabled={pwBusy}
                >
                  {pwBusy ? "Updating…" : "Update password"}
                </button>
              </form>
            ) : (
              <p style={{ ...body, marginTop: 14 }}>
                Signed in with Google. Use Google to manage that sign-in.
              </p>
            )}
          </section>

          <section className="profile-section is-danger" data-in="rise" style={{ "--i": 5 }}>
            <h2 style={sectionH}>Danger zone</h2>
            <p style={{ ...meta, marginTop: 4 }}>
              Reset wipes practice stats and review schedules. Sign out leaves your data alone.
            </p>

            <div className="profile-danger-actions">
              <button
                type="button"
                className="btn-press profile-danger-btn"
                onClick={resetProgress}
                disabled={resetBusy || !onResetProgress}
              >
                {resetBusy ? "Resetting…" : "Reset study progress"}
              </button>
              <button
                type="button"
                className="btn-press profile-signout"
                onClick={onSignOut}
              >
                Sign out
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
