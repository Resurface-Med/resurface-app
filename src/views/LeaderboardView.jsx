import { useEffect, useState } from "react";
import { h1, OF, C } from "../ui/theme";
import Wave from "../ui/Wave";
import { fetchLeaderboardWeek } from "../lib/remote";

/**
 * Cohort leaderboard — questions answered in the last 7 days.
 *
 * Default-on for anyone with a display name. Accuracy is deliberately not
 * the metric: it rewards skipping hard topics. Volume this week is honest
 * work, with streak as a quiet secondary.
 *
 * The top three are set with their rank oversized — the podium is scale,
 * not medals or a box — and everyone after them in a compact list under a
 * rule. Your row is in accent, not on a tint.
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
      <div className="page-band" style={{ ...band, paddingTop: "clamp(22px, 3.6vh, 36px)", paddingBottom: "clamp(18px, 2.8vh, 28px)" }}>
        <h1 data-in="left" style={{ ...h1, margin: 0, "--i": 0 }}>Leaderboard</h1>
        <p style={{ marginTop: 8, fontSize: 15, color: OF.soft, fontWeight: 500, letterSpacing: -0.2, maxWidth: "36em" }}>
          Questions answered in the last seven days.
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
        <div style={{ ...band, maxWidth: 640, paddingTop: "clamp(14px, 2.2vh, 22px)", paddingBottom: "clamp(36px, 5vh, 56px)" }}>
          {error && (
            <p style={{ color: C.danger, fontSize: 14 }}>{error}</p>
          )}

          {rows === null && !error && (
            <p style={{ color: C.muted, fontSize: 14.5 }}>Loading the board…</p>
          )}

          {rows && rows.length === 0 && (
            <p style={{ color: C.muted, fontSize: 14.5, lineHeight: 1.5 }}>
              Nobody on the board yet. Add a display name and answer a few questions.
            </p>
          )}

          {rows && rows.length > 0 && (
            <>
              <ol className="lb-top">
                {rows.slice(0, 3).map((r, i) => {
                  const mine = r.user_id === userId;
                  return (
                    <li key={r.user_id} className={`lb-top-row${mine ? " is-me" : ""}`} data-in="rise" style={{ "--i": 1 + i }}>
                      <span className="lb-top-rank">{r.rank}</span>
                      <span className="lb-top-name">
                        {r.display_name}
                        {mine ? <span className="lb-me-tag">you</span> : null}
                      </span>
                      <span className="lb-top-count">{r.week_count}</span>
                      <span className="lb-streak">{r.streak > 0 ? `${r.streak}d` : ""}</span>
                    </li>
                  );
                })}
              </ol>

              {rows.length > 3 && (
                <ol className="lb-list">
                  {rows.slice(3).map((r, i) => {
                    const mine = r.user_id === userId;
                    return (
                      <li key={r.user_id} className={`lb-row${mine ? " is-me" : ""}`} data-in="rise" style={{ "--i": 4 + Math.min(i, 12) }}>
                        <span className="lb-rank">{r.rank}</span>
                        <span className="lb-name">
                          {r.display_name}
                          {mine ? <span className="lb-me-tag">you</span> : null}
                        </span>
                        <span className="lb-count">{r.week_count}</span>
                        <span className="lb-streak">{r.streak > 0 ? `${r.streak}d` : ""}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
