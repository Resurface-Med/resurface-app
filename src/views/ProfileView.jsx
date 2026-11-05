import { useEffect, useState } from "react";
import { UserRound, Palette, BookOpen, Bell, KeyRound, ChevronRight, ChevronLeft } from "lucide-react";
import { confirm } from "../ui/Confirm";
import { h1, primaryBtn, chipBtn, chipBtnActive, btnGhost, sectionH, meta, body } from "../ui/theme";
import { THEMES } from "../lib/themes";
import { usePref, setPref } from "../lib/prefs";
import Wave from "../ui/Wave";
import { remote } from "../lib/remote";
import Reminders from "../ui/Reminders";
import { isInappropriate, NAME_NOT_ALLOWED } from "../lib/nameFilter";
import { useAuth } from "../lib/auth";
import Avatar from "../ui/Avatar";
import { avatarSrc, ownAvatar, uploadAvatar, removeAvatar } from "../lib/avatar";
import YearSelect from "../ui/YearSelect";
import { isOnline } from "../lib/online";

/* Photos, passwords and deleting the account go straight to the server;
   offline they say so instead of failing. Everything else here is queued. */
const offline = () => !isOnline() || navigator.onLine === false;

/**
 * Account surface — identity, study prefs, sign-in, danger zone.
 * Same blue → wave → white sheet as Home / Generate.
 */

function ThemeGlyph({ id }) {
  if (id === "light") {
    return (
      <svg className="theme-dot__glyph" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4" fill="currentColor" />
        <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 2.2v2.3M12 19.5v2.3M2.2 12h2.3M19.5 12h2.3" />
          <path d="M5.1 5.1l1.6 1.6M17.3 17.3l1.6 1.6M18.9 5.1l-1.6 1.6M6.7 17.3l-1.6 1.6" />
        </g>
      </svg>
    );
  }
  if (id === "dark") {
    return (
      <svg className="theme-dot__glyph" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M9.53 1.72a.75.75 0 0 1 .16.82A8.97 8.97 0 0 0 9 6a9 9 0 0 0 9 9 8.97 8.97 0 0 0 3.46-.69.75.75 0 0 1 .98.98 10.5 10.5 0 0 1-9.69 6.46c-5.8 0-10.5-4.7-10.5-10.5 0-4.37 2.67-8.11 6.46-9.69a.75.75 0 0 1 .82.16z" />
      </svg>
    );
  }
  return null;
}

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

/* Settings by category (2026-11-05), as apps lay them out: a list on the
   left on a laptop, the chosen category beside it; on a phone the list
   first, a category on its own page with a way back. */
const CATS = [
  { k: "account", label: "Account", Icon: UserRound },
  { k: "appearance", label: "Appearance", Icon: Palette },
  { k: "study", label: "Study", Icon: BookOpen },
  { k: "notifications", label: "Notifications", Icon: Bell },
  { k: "signin", label: "Sign-in", Icon: KeyRound },
];
const narrow = () => typeof window !== "undefined" && window.matchMedia?.("(max-width: 760px)").matches;

export default function ProfileView({
  userId, email, displayName, showOnLeaderboard, marketingOptIn, dailyGoal, studyYear = null,
  onProfileChange, onSignOut, theme, customColor, onThemeChange, onCustomColor, onResetColor, onResetProgress,
  avatarV = null, onAvatarChange,
}) {
  const { user, updatePassword, signOut } = useAuth();
  /* Profile photo (lib/avatar). Chosen here; shrunk on the device first. */
  const photo = avatarSrc(userId, ownAvatar(avatarV));
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState("");
  async function photoAction(fn) {
    if (offline()) { setPhotoErr("You’re offline. Changing your photo needs a connection."); return; }
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
  const hideOptions = usePref("hideOptions");
  /* Which category is open; on a phone none until one is chosen. */
  const [cat, setCat] = useState(() => (narrow() ? null : "account"));
  const [isNarrow, setIsNarrow] = useState(narrow);
  useEffect(() => {
    const mq = window.matchMedia?.("(max-width: 760px)");
    if (!mq) return;
    const on = () => { setIsNarrow(mq.matches); if (!mq.matches) setCat(c => c ?? "account"); };
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

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
    if (offline()) return setPwErr("You’re offline. Changing your password needs a connection.");
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
    if (offline()) {
      await confirm({ title: "You’re offline", body: "Deleting your account needs a connection. Nothing has been deleted.", action: "OK", cancel: null });
      return;
    }
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
        <div className="profile-sheet" style={{ ...band, maxWidth: 920, paddingTop: "clamp(20px, 3vh, 28px)", paddingBottom: "clamp(36px, 5vh, 56px)" }}>

          <div className={`settings${cat ? " has-cat" : ""}`}>
            <nav className="settings-nav" aria-label="Settings">
              {CATS.map(({ k, label, Icon }) => (
                <button key={k} type="button" className={`settings-nav__item${cat === k ? " is-on" : ""}`}
                  aria-current={cat === k ? "page" : undefined} onClick={() => setCat(k)}>
                  <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
                  <span>{label}</span>
                  <ChevronRight className="settings-nav__chev" size={16} strokeWidth={2} aria-hidden="true" />
                </button>
              ))}
            </nav>
            <div className="settings-page">
              {isNarrow && cat && (
                <button type="button" className="settings-back" onClick={() => setCat(null)}>
                  <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" /> Settings
                </button>
              )}
          {cat === "account" && (
          <>
          <section className="profile-section" data-in="rise" style={{ "--i": 1 }}>
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
                  On by default. Hiding removes you from the board.
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
          {/* Out of the way (2026-11-05): a category headed in red made
              deleting your account the most eye-catching thing in Settings.
              Typing "delete" to confirm is still required. */}
          <div className="profile-quiet">
            <button type="button" className="btn-press profile-signout" onClick={onSignOut}>Sign out</button>
            <button type="button" className="profile-quiet__delete" onClick={deleteAccount} disabled={deleteBusy}>
              {deleteBusy ? "Deleting…" : "Delete my account"}
            </button>
          </div>
          </>
          )}
          {cat === "appearance" && (
          <>
          <section className="profile-section" data-in="rise" style={{ "--i": 2 }}>
            <h2 style={sectionH}>Appearance</h2>
            <p style={{ ...meta, marginTop: 4 }}>How Resurface looks on this device.</p>

            <div className="profile-stack">
              <div>
                <span className="profile-label">Appearance</span>
                <div className="theme-picker" role="radiogroup" aria-label="Appearance">
                  <div className="theme-picker__row">
                    {THEMES.filter(t => t.id === "light" || t.id === "dark").map(t => {
                      const on = theme === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          className={`theme-dot btn-press${on ? " is-on" : ""} theme-dot--glyph`}
                          style={{ "--swatch": t.field }}
                          onClick={() => onThemeChange?.(t.id)}
                        >
                          <ThemeGlyph id={t.id} />
                          {t.name}
                        </button>
                      );
                    })}
                  </div>
                  <div className="theme-picker__row">
                    {THEMES.filter(t => t.id !== "light" && t.id !== "dark").map(t => {
                      const on = theme === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          className={`theme-dot btn-press${on ? " is-on" : ""}`}
                          style={{ "--swatch": t.field }}
                          onClick={() => onThemeChange?.(t.id)}
                        >
                          {t.name}
                        </button>
                      );
                    })}
                  <label className={`theme-dot theme-dot--custom${theme === "custom" ? " is-on" : ""}`}>
                    <span
                      className="theme-dot__chip"
                      style={customColor ? { background: customColor } : undefined}
                      aria-hidden="true"
                    />
                    {!customColor && <span className="theme-dot__plus" aria-hidden="true" />}
                    <input
                      type="color"
                      className="theme-dot__input"
                      value={customColor || "#3562f5"}
                      aria-label="Choose a colour"
                      onChange={e => onCustomColor?.(e.target.value)}
                    />
                    Custom
                  </label>
                  </div>
                </div>
                {theme === "custom" && (
                  <button type="button" className="gen-link theme-reset" onClick={() => onResetColor?.()}>
                    Reset
                  </button>
                )}
              </div>
            </div>
          </section>
          </>
          )}
          {cat === "study" && (
          <>
          <section className="profile-section" data-in="rise" style={{ "--i": 3 }}>
            <h2 style={sectionH}>Study</h2>
            <p style={{ ...meta, marginTop: 4 }}>Your year, your daily target, and how questions are shown.</p>

            {/* Saves on choosing (migration 0031). */}
            <label className="profile-field" style={{ marginTop: 14 }}>
              <span className="profile-label">Year</span>
              <YearSelect value={studyYear} onChange={y => {
                if (y === null) return;
                remote.profile(userId, { studyYear: y });
                onProfileChange?.({ studyYear: y });
              }} />
            </label>

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

            {/* Saves on ticking, with the other study preferences (0068). */}
            <label className="auth-consent profile-hide-opts">
              <input type="checkbox" checked={hideOptions} onChange={e => setPref("hideOptions", e.target.checked)} />
              <span>
                Hide answer options until I&apos;m ready
                <span className="profile-hint">Think of your answer first, then tap to see the options. The eye in a session switches it for that session.</span>
              </span>
            </label>
          </section>
          <div className="profile-quiet">
            <button type="button" className="profile-quiet__delete" onClick={resetProgress} disabled={resetBusy || !onResetProgress}>
              {resetBusy ? "Resetting…" : "Reset study progress"}
            </button>
            <p style={{ ...meta, margin: 0 }}>Wipes practice stats and review schedules. Your decks stay.</p>
          </div>
          </>
          )}
          {cat === "notifications" && (
          <>
          <Reminders />
          </>
          )}
          {cat === "signin" && (
          <>
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
          </>
          )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
