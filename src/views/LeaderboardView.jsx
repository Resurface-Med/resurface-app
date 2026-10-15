import { useEffect, useState } from "react";
import StreakFlame from "../ui/StreakFlame";
import { h1, OF, C } from "../ui/theme";
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

/* Rafil's account. The founder's diamond is pinned to the account id, not
   the display name — anyone can call themselves Rafil, nobody can be this
   account. */
const FOUNDER_ID = "0b920395-b28e-442e-a68b-28e0b7d0a06b";

export function FounderGem() {
  /* A plain crown in the brand blue: three points and a band. Flat on
     purpose — it sits beside a name and should read at a glance, not
     invite a closer look. */
  return (
    <span className="lb-founder" title="Founder" aria-label="Founder" role="img">
      {/* Cropped to the crown itself (it spans y 5–21), so its middle is
          the box's middle and the flex centring lines it up. */}
      <svg width="17" height="16" viewBox="2 4 20 18" aria-hidden="true">
        <path d="M3 8.2l4.6 4.1L12 5l4.4 7.3L21 8.2 19.2 17H4.8z" fill="var(--c-accent)" stroke="var(--c-accent)" strokeWidth="1.6" strokeLinejoin="round" />
        <rect x="4.8" y="18.6" width="14.4" height="2.4" rx="1.2" fill="var(--c-accent)" />
      </svg>
    </span>
  );
}

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


  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "var(--app-vh)" }}>
      <div className="page-band" style={{ ...band, paddingTop: "clamp(22px, 3.6vh, 36px)", paddingBottom: "clamp(18px, 2.8vh, 28px)" }}>
        <h1 data-in="left" style={{ ...h1, margin: 0, "--i": 0 }}>Leaderboard</h1>
        <p style={{ marginTop: 8, fontSize: 15, color: OF.soft, fontWeight: 500, letterSpacing: -0.2, maxWidth: "36em" }}>
          Questions answered in the last seven days.
        </p>
        {/* Always rendered, blank until the board arrives. The wave sits
            directly under the band, so anything that grows the band after
            first paint moves the wave — and the switch animation has
            already put it where it belongs by then, which reads as the
            page shifting at the last moment. Holding the line keeps the
            band the same height before and after the fetch. */}
      </div>

      <Wave from="transparent" to="var(--c-card-solid)" />

      <div style={{ background: "var(--c-card-solid)", flex: 1 }}>
        <div style={{ ...band, maxWidth: 720, paddingTop: "clamp(20px, 3vh, 28px)", paddingBottom: "clamp(36px, 5vh, 56px)" }}>
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
            <ol className="lb-list">
              {rows.map((r, i) => {
                const mine = r.user_id === userId;
                return (
                  <li key={r.user_id} className={`lb-row${mine ? " is-me" : ""}`} data-in="rise" style={{ "--i": 2 + Math.min(i, 12) }}>
                    <span className="lb-rank">#{r.rank}</span>
                    <span className="lb-name">
                      <span className="lb-name-text">{r.display_name}</span>
                      {r.user_id === FOUNDER_ID ? <FounderGem /> : null}
                      {mine ? <span className="lb-me-tag">you</span> : null}
                    </span>
                    <span className="lb-stats">
                      <span className="lb-count">{r.week_count}</span>
                      <span className="lb-streak">{r.streak > 0 ? <StreakFlame days={r.streak} size={15} small /> : null}</span>
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
