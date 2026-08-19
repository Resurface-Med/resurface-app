import { useState } from "react";
import { C, h1, OF, primaryBtn, chipBtn, chipBtnActive } from "../ui/theme";
import Wave from "../ui/Wave";
import { remote } from "../lib/remote";

/**
 * Account surface — name for the board, opt-out of ranking, sign out.
 * Reached from the sidebar avatar, not as a primary nav destination.
 */

const band = {
  maxWidth: 1180,
  margin: "0 auto",
  padding: "0 clamp(20px, 3vw, 40px)",
  width: "100%",
};

const field = {
  width: "100%",
  boxSizing: "border-box",
  padding: "12px 15px",
  fontSize: 15,
  fontFamily: "inherit",
  color: "var(--c-text)",
  background: "var(--c-surface3)",
  border: "1.5px solid transparent",
  borderRadius: "var(--r-ctrl)",
  outline: "none",
};

export default function ProfileView({
  userId, email, displayName, showOnLeaderboard, dailyGoal,
  onProfileChange, onSignOut, theme, onThemeChange,
}) {
  const [name, setName] = useState(displayName || "");
  const [onBoard, setOnBoard] = useState(showOnLeaderboard !== false);
  const [goal, setGoal] = useState(dailyGoal || 20);
  const [saved, setSaved] = useState(false);

  function save(e) {
    e.preventDefault();
    const trimmed = name.trim().slice(0, 32);
    if (!trimmed) return;
    const g = Math.min(500, Math.max(1, parseInt(goal, 10) || 20));
    remote.profile(userId, { displayName: trimmed, showOnLeaderboard: onBoard });
    remote.goal(userId, g);
    onProfileChange?.({ displayName: trimmed, showOnLeaderboard: onBoard, dailyGoal: g });
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "var(--app-vh)" }}>
      <div className="tab-rise" style={{ ...band, paddingTop: "clamp(22px, 3.6vh, 36px)", paddingBottom: "clamp(18px, 2.8vh, 28px)", "--d": 0 }}>
        <h1 style={{ ...h1, margin: 0 }}>Profile</h1>
        <p style={{ marginTop: 8, fontSize: 15, color: OF.soft, fontWeight: 500 }}>
          {email}
        </p>
      </div>

      <Wave from="transparent" to="var(--c-card-solid)" />

      <div style={{ background: "var(--c-card-solid)", flex: 1 }}>
        <div className="tab-rise" style={{ ...band, maxWidth: 480, paddingTop: "clamp(20px, 3vh, 28px)", paddingBottom: "clamp(36px, 5vh, 56px)", "--d": 100 }}>
          <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: C.muted }}>
                Display name
              </span>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={32}
                placeholder="What shows on the leaderboard"
                style={field}
                required
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: C.muted }}>
                Daily goal
              </span>
              <input
                type="number"
                min={1}
                max={500}
                value={goal}
                onChange={e => setGoal(e.target.value)}
                style={field}
              />
            </label>

            <div>
              <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: C.muted }}>
                Leaderboard
              </span>
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn-press"
                  onClick={() => setOnBoard(true)}
                  style={onBoard ? { ...chipBtnActive, boxShadow: "none" } : chipBtn}
                >
                  Show me
                </button>
                <button
                  type="button"
                  className="btn-press"
                  onClick={() => setOnBoard(false)}
                  style={!onBoard ? { ...chipBtnActive, boxShadow: "none" } : chipBtn}
                >
                  Hide me
                </button>
              </div>
              <p style={{ margin: "8px 0 0", fontSize: 13, color: C.muted, lineHeight: 1.4 }}>
                On by default. Hiding removes you from the weekly board.
              </p>
            </div>

            <button type="submit" className="btn-press" style={{ ...primaryBtn, width: "100%" }}>
              {saved ? "Saved" : "Save changes"}
            </button>
          </form>

          {/* Phones only — the floating switch is hidden there, and two
              controls for one setting is worse than either alone. */}
          <div className="profile-appearance">
            <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: C.muted }}>
              Appearance
            </span>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }} role="radiogroup" aria-label="Appearance">
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
            <p style={{ margin: "8px 0 0", fontSize: 13, color: C.muted, lineHeight: 1.4 }}>
              Applies straight away, and is remembered on this device.
            </p>
          </div>

          <button
            type="button"
            className="btn-press"
            onClick={onSignOut}
            style={{
              marginTop: 28,
              background: "none",
              border: "none",
              padding: 0,
              fontFamily: "inherit",
              fontSize: 14,
              fontWeight: 600,
              color: C.danger,
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
