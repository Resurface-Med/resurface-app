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
  /* A brilliant cut, lit from the top left: five crown facets light to
     mid, three pavilion facets deep. Each facet is its own shade, which is
     what makes it read as a stone rather than a flat badge at 18px. */
  const crown = [
    ["6,3 1.5,9 7,9", "#9fb7ff"],
    ["6,3 7,9 12,3", "#d3defe"],
    ["12,3 7,9 17,9", "#7d9cff"],
    ["12,3 17,9 18,3", "#b2c6ff"],
    ["18,3 17,9 22.5,9", "#5f84f8"],
  ];
  const pavilion = [
    ["1.5,9 7,9 12,21.5", "#4a6ff0"],
    ["7,9 17,9 12,21.5", "#2f58e3"],
    ["17,9 22.5,9 12,21.5", "#1e3cb6"],
  ];
  return (
    <span className="lb-founder" title="Founder" aria-label="Founder" role="img">
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        {[...crown, ...pavilion].map(([pts, fill]) => (
          <polygon key={pts} points={pts} fill={fill} stroke="#ffffff" strokeOpacity="0.35" strokeWidth="0.45" strokeLinejoin="round" />
        ))}
        <polygon points="6,3 18,3 22.5,9 12,21.5 1.5,9" fill="none" stroke="#1b37a8" strokeOpacity="0.55" strokeWidth="0.7" strokeLinejoin="round" />
        {/* The glint: a four-point sparkle off the top-right corner. */}
        <path className="lb-founder__glint" d="M20 0.6 L20.7 2.3 L22.4 3 L20.7 3.7 L20 5.4 L19.3 3.7 L17.6 3 L19.3 2.3 Z" fill="#ffffff" />
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
