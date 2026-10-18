import { useState } from "react";
import { confirm } from "../ui/Confirm";
import { h1, primaryBtn, chipBtn, chipBtnActive, btnGhost, sectionH, meta, body } from "../ui/theme";
import Wave from "../ui/Wave";
import { remote } from "../lib/remote";
import Reminders from "../ui/Reminders";
import { isInappropriate, NAME_NOT_ALLOWED } from "../lib/nameFilter";
import { useAuth } from "../lib/auth";
import Avatar from "../ui/Avatar";
import { avatarSrc, ownAvatar, uploadAvatar, removeAvatar } from "../lib/avatar";

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

function authProviders(user) {
  const fromIdentities = (user?.identities || []).map(i => i.provider).filter(Boolean);
  if (fromIdentities.length) return [...new Set(fromIdentities)];
  const list = user?.app_metadata?.providers;
  if (Array.isArray(list) && list.length) return list;
  const one = user?.app_metadata?.provider;
  return one ? [one] : [];
}

export default function ProfileView({
  userId, email, displayName, showOnLeaderboard, marketingOptIn, dailyGoal,
  onProfileChange, onSignOut, theme, onThemeChange, onResetProgress,
  avatarV = null, onAvatarChange,
}) {
  const { user, updatePassword, signOut } = useAuth();
  /* Profile photo (lib/avatar). Chosen here; shrunk on the device first. */
  const photo = avatarSrc(userId, ownAvatar(avatarV));
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState("");
  async function photoAction(fn) {
    setPhotoErr(""); setPhotoBusy(true);
    try { onAvatarChange?.(await fn()); }
    catch (e) { setPhotoErr(e.message); }
    finally { setPhotoBusy(false); }
  }
  const providers = authProviders(user);
  const canChangePassword = providers.includes("email");
  const [name, setName] = useState(displayName || "");
  const [onBoard, setOnBoard] = useState(showOnLeaderboard !== false);
  const [emails, setEmails] = useState(marketingOptIn === true);
  const [goal, setGoal] = useState(dailyGoal || 20);
  const [nameSaved, setNameSaved] = useState(false);
  const [prefSaved, setPrefSaved] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");

  const [resetBusy, setResetBusy] = useState(false);

  const [nameErr, setNameErr] = useState("");

  function flashPrefs() {
    setPrefSaved(true);
    setTimeout(() => setPrefSaved(false), 1400);
  }

  function saveName(e) {
    e.preventDefault();
    const trimmed = name.trim().slice(0, 32);
    if (!trimmed) return;
    /* The database refuses these too (migration 0012); this says so first. */
    if (isInappropriate(trimmed)) { setNameErr(NAME_NOT_ALLOWED); return; }
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

  /**
   * Deleting the account, which is the one thing here with nothing behind it.
   *
   * Everything else in this section is recoverable by doing the work again;
   * this is not, and there is no export, so what goes is gone. Hence a typed
   * confirmation rather than a second button to press by accident, and the
   * body says what leaves rather than "this cannot be undone", which every
   * dialog says and nobody reads.
   */
  async function deleteAccount() {
    const ok = await confirm({
      title: "Delete your account?",
      body: "Your decks, questions, progress and streaks are deleted straight away. There is no way to get them back.",
      action: "Delete",
      danger: true,
      typeToConfirm: "delete",
    });
    if (!ok) return;
    setDeleteBusy(true);
    try {
      await remote.deleteOwnAccount();
      /* Signing out locally too: the session's token is still valid-looking
         to the client until it is cleared, and an app sitting on a signed-in
         screen for an account that no longer exists fails at every request
         rather than at one obvious place. */
      await signOut();
      window.location.replace("/");
    } catch (e) {
      setDeleteBusy(false);
      await confirm({
        title: "Couldn’t delete the account",
        body: e?.message || "Something went wrong. Nothing has been deleted — try again.",
        action: "OK",
        cancel: null,
      });
    }
  }

  async function resetProgress() {
    if (!(await confirm({ title: "Reset all progress?", body: "Practice stats and review schedules, gone. This can’t be undone.", action: "Reset", danger: true }))) {
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
      <div className="page-band" style={{ ...band, paddingTop: "clamp(22px, 3.6vh, 36px)", paddingBottom: "clamp(18px, 2.8vh, 28px)" }}>
        <div className="profile-identity" data-in="left" style={{ "--i": 0 }}>
          <Avatar className="profile-avatar" src={photo} name={displayName} fallback={email} />
          <div className="profile-identity__text">
            <h1 style={{ ...h1, margin: 0 }}>
              {displayName?.trim() || "Profile"}
            </h1>
          </div>
        </div>
      </div>

      <Wave from="transparent" to="var(--c-card-solid)" />

      <div style={{ background: "var(--c-card-solid)", flex: 1 }}>
        <div className="profile-sheet" style={{ ...band, maxWidth: 560, paddingTop: "clamp(20px, 3vh, 28px)", paddingBottom: "clamp(36px, 5vh, 56px)" }}>

          <section className="profile-section" data-in="rise" style={{ "--i": 1 }}>
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
              </div>
            </div>
          </section>

          <section className="profile-section" data-in="rise" style={{ "--i": 2 }}>
            <h2 style={sectionH}>Account</h2>
            <p style={{ ...meta, marginTop: 4 }}>How you appear on Resurface.</p>

            <div className="profile-stack">
              <div className="profile-field">
                <span className="profile-label">Photo</span>
                <div className="profile-photo-row">
                  <Avatar className="profile-photo" src={photo} name={displayName} fallback={email} />
                  <label className={`btn-press profile-photo-btn${photoBusy ? " is-busy" : ""}`}>
                    {photoBusy ? "Uploading…" : photo ? "Change photo" : "Add a photo"}
                    <input type="file" accept="image/*" hidden disabled={photoBusy}
                      onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) photoAction(() => uploadAvatar(userId, f)); }} />
                  </label>
                  {photo && (
                    <button type="button" className="gen-link profile-photo-remove" disabled={photoBusy}
                      onClick={() => photoAction(async () => { await removeAvatar(userId); return 0; })}>
                      Remove
                    </button>
                  )}
                </div>
                {photoErr && <p className="name-err" role="alert">{photoErr}</p>}
              </div>

              <form onSubmit={saveName} className="profile-field">
                <span className="profile-label">Display name</span>
                <div className="profile-name-row">
                  <input
                    className="profile-input"
                    value={name}
                    onChange={e => { setName(e.target.value); setNameErr(""); }}
                    maxLength={32}
                    placeholder="What shows on the leaderboard"
                    required
                  />
                  <button type="submit" className="btn-press profile-inline-save" style={primaryBtn}>
                    {nameSaved ? "Saved" : "Save"}
                  </button>
                </div>
                {nameErr && <p className="name-err" role="alert">{nameErr}</p>}
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

          <section className="profile-section" data-in="rise" style={{ "--i": 3 }}>
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

          <Reminders />


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

            <div className="profile-delete">
              <button
                type="button"
                className="profile-delete-btn"
                onClick={deleteAccount}
                disabled={deleteBusy}
              >
                {deleteBusy ? "Deleting…" : "Delete my account"}
              </button>
              <p style={{ ...meta, marginTop: 6 }}>
                Everything goes: decks, questions, progress. It cannot be undone.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
