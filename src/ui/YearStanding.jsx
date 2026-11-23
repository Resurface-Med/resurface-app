import { useEffect, useMemo, useState } from "react";
import { sectionH } from "./theme";
import { fetchLeaderboardWeek } from "../lib/remote";
import { yearStanding } from "../lib/progressPage";

/**
 * Your year (2026-11-22). Where you are on this week's board for your year,
 * moved from Progress to Home at Rafil's request. The whole block opens the
 * leaderboard.
 *
 * One line since 2026-11-23: what you answered this week and whether that
 * puts you in the top or bottom share of your year. A bar went through a
 * rank track, a percentile bar and an average mark the same day, and Rafil
 * took it out: the sentence says it.
 *
 * Nothing at all without a year, or while the board has not answered; a
 * plain line when you have not answered anything this week yet.
 */
const n = v => v.toLocaleString("en-GB");

export default function YearStanding({ studyYear, userId, onOpen }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!studyYear) return;
    let live = true;
    fetchLeaderboardWeek(studyYear).then(r => { if (live) setRows(r); }, () => {});
    return () => { live = false; };
  }, [studyYear]);
  const year = useMemo(() => (rows ? yearStanding(rows, userId) : null), [rows, userId]);
  if (!studyYear || !year) return null;

  return (
    <section className="yr" data-in="rise" style={{ "--i": 8 }}>
      <div className="yr__head">
        <h2 style={sectionH}>Your year</h2>
        <span className="yr__when">This week</span>
      </div>
      <button type="button" className="yr__body" onClick={onOpen} aria-label="Open the leaderboard">
        {!year.onBoard ? (
          <p className="pv-line">Answer a question this week to join Year {studyYear}’s board{year.people ? <>, with {year.people} {year.people === 1 ? "other" : "others"}</> : null}.</p>
        ) : year.people < 2 ? (
          <p className="pv-line">You’re the only one in Year {studyYear} to answer this week, with <b>{n(year.mine)}</b>.</p>
        ) : (
          <p className="pv-line">You’ve answered <b>{n(year.mine)}</b> this week, in the <b>{year.share.side} {year.share.pct}%</b> of Year {studyYear}.</p>
        )}
      </button>
    </section>
  );
}
