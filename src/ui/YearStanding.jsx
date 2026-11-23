import { useEffect, useMemo, useState } from "react";
import { fetchLeaderboardWeek } from "../lib/remote";
import { yearStanding } from "../lib/progressPage";

/**
 * Where you are in your year this week, as a line under Home's greeting
 * (Rafil, 2026-11-23: "more like a title" than a section at the bottom).
 * It opens the leaderboard.
 *
 * It went through a rank track, a percentile bar and an average mark on
 * 2026-11-22/23 before Rafil settled on the sentence alone: what you
 * answered this week and whether that is the top or bottom share of your
 * year. Nothing without a year, or until the board has answered.
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
    <button type="button" className="home-year" onClick={onOpen} aria-label={`Your place in Year ${studyYear} this week. Opens the leaderboard.`}>
      {!year.onBoard ? (
        <>Answer a question to join Year {studyYear}’s board this week.</>
      ) : year.people < 2 ? (
        <>You’re the only one in Year {studyYear} answering this week, with <b>{n(year.mine)}</b>.</>
      ) : (
        <>You’re in the <b>{year.share.side} {year.share.pct}%</b> of Year {studyYear} this week, with <b>{n(year.mine)}</b> answered.</>
      )}
    </button>
  );
}
