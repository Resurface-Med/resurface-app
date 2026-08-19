import { useEffect, useState } from "react";
import { h1, OF, C, sectionH } from "../ui/theme";
import Wave from "../ui/Wave";
import { fetchLeaderboardWeek } from "../lib/remote";

/**
 * Cohort leaderboard — questions answered in the last 7 days.
 *
 * Default-on for anyone with a display name. Accuracy is deliberately not
 * the metric: it rewards skipping hard topics. Volume this week is honest
 * work, with streak as a quiet secondary.
 */

const band = {
  maxWidth: 1180,
  margin: "0 auto",
  padding: "0 clamp(20px, 3vw, 40px)",
  width: "100%",
};

export default function LeaderboardView({ userId }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchLeaderboardWeek();
        if (!cancelled) setRows(data);
      } catch (err) {
        if (!cancelled) setError(err.message || "Couldn’t load the board.");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const me = rows?.find(r => r.user_id === userId);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "var(--app-vh)" }}>
      <div className="tab-rise" style={{ ...band, paddingTop: "clamp(22px, 3.6vh, 36px)", paddingBottom: "clamp(18px, 2.8vh, 28px)", "--d": 0 }}>
        <h1 style={{ ...h1, margin: 0 }}>Leaderboard</h1>
        <p style={{ marginTop: 8, fontSize: 15, color: OF.soft, fontWeight: 500, letterSpacing: -0.2, maxWidth: "36em" }}>
          Questions answered this week. You’re on it by default — change that in Profile if you want.
        </p>
        {me && (
          <p className="lb-you">
            You’re <strong>#{me.rank}</strong>
            {me.week_count > 0 ? <> · {me.week_count} this week</> : <> · nothing logged yet this week</>}
          </p>
        )}
      </div>

      <Wave from="transparent" to="var(--c-card-solid)" />

      <div style={{ background: "var(--c-card-solid)", flex: 1 }}>
        <div style={{ ...band, maxWidth: 720, paddingTop: "clamp(20px, 3vh, 28px)", paddingBottom: "clamp(36px, 5vh, 56px)" }}>
          <div className="prog-section-head tab-rise tab-rise--sheet" style={{ marginBottom: 14, "--d": 140 }}>
            <h2 style={{ ...sectionH, margin: 0 }}>This week</h2>
            <span className="prog-section-note">Last 7 days</span>
          </div>

          {error && (
            <p className="tab-rise" style={{ color: C.danger, fontSize: 14, "--d": 200 }}>{error}</p>
          )}

          {rows === null && !error && (
            <p className="tab-rise" style={{ color: C.muted, fontSize: 14.5, "--d": 200 }}>Loading the board…</p>
          )}

          {rows && rows.length === 0 && (
            <p className="tab-rise" style={{ color: C.muted, fontSize: 14.5, lineHeight: 1.5, "--d": 200 }}>
              Nobody on the board yet. Add a display name and answer a few questions.
            </p>
          )}

          {rows && rows.length > 0 && (
            <ol className="lb-list tab-cascade" style={{ "--d": 160 }}>
              {rows.map(r => {
                const mine = r.user_id === userId;
                return (
                  <li key={r.user_id} className={`lb-row${mine ? " is-me" : ""}`}>
                    <span className="lb-rank">#{r.rank}</span>
                    <span className="lb-name">
                      {r.display_name}
                      {mine ? <span className="lb-me-tag">you</span> : null}
                    </span>
                    <span className="lb-stats">
                      <span className="lb-count">{r.week_count}</span>
                      <span className="lb-streak">{r.streak}d</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
