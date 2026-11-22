import { useEffect, useMemo, useState } from "react";
import { sectionH } from "./theme";
import { fetchLeaderboardWeek } from "../lib/remote";
import { yearStanding, ordinal } from "../lib/progressPage";

/**
 * Your year (2026-11-22). Where you are on this week's board for your year:
 * the rank in a sentence, a track from last to first with you on it, and
 * your questions against the year's average. Moved from Progress to Home at
 * Rafil's request. The whole block opens the leaderboard.
 *
 * Nothing at all without a year, or while the board has not answered; a
 * plain line when you have not answered anything this week yet.
 */
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
        {year.onBoard ? (
          <>
            {/* One sentence and the track (Rafil, 2026-11-22: "too crowded");
                the two figures that had a row of their own are in the line. */}
            <p className="pv-line">You’re <b>{ordinal(year.rank)} of {year.people}</b> in Year {studyYear}. You’ve answered <b>{year.mine.toLocaleString("en-GB")}</b> this week; the average is {year.avg.toLocaleString("en-GB")}.</p>
            <span className="pv-rank" style={{ "--p": `${Math.round(year.position * 100)}%` }}>
              <span className="pv-rank__track" /><span className="pv-rank__fill" /><span className="pv-rank__you" aria-hidden="true" />
            </span>
            <span className="pv-rank__ends"><span>{ordinal(year.people)}</span><span>1st</span></span>
          </>
        ) : (
          <p className="pv-line">Answer a question this week to join Year {studyYear}’s board{year.people ? <>, with {year.people} {year.people === 1 ? "other" : "others"}</> : null}.</p>
        )}
      </button>
    </section>
  );
}
