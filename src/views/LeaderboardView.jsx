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
  return (
    <span className="lb-founder" title="Founder" aria-label="Founder" role="img">
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <defs>
          <linearGradient id="lb-gem" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7fa2ff" />
            <stop offset="0.55" stopColor="#3562f5" />
            <stop offset="1" stopColor="#1f3fc4" />
          </linearGradient>
        </defs>
        <path d="M4.2 1.8h7.6L15 6 8 14.6 1 6z" fill="url(#lb-gem)" />
        <path d="M1 6h14M4.2 1.8 6 6l2 8.6L10 6l1.8-4.2M6 6l2-4.2L10 6" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="0.8" strokeLinejoin="round" />
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

  const me = rows?.find(r => r.user_id === userId);

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
        <p className="lb-you">
          {me ? (
            <>
              You’re <strong>#{me.rank}</strong>
              {me.week_count > 0 ? <> · {me.week_count} this week</> : <> · nothing logged yet this week</>}
            </>
          ) : "\u00a0"}
        </p>
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
                      {r.display_name}
                      {r.user_id === FOUNDER_ID ? <FounderGem /> : null}
                      {mine ? <span className="lb-me-tag">you</span> : null}
                    </span>
                    <span className="lb-stats">
                      <span className="lb-count">{r.week_count}</span>
                      <span className="lb-streak">{r.streak > 0 ? `${r.streak}d` : ""}</span>
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
