import { useEffect, useMemo, useState } from "react";
import { sectionH } from "./theme";
import { fetchLeaderboardWeek } from "../lib/remote";
import { yearStanding, avgBar } from "../lib/progressPage";

/**
 * Your year (2026-11-22). Where you are on this week's board for your year,
 * moved from Progress to Home at Rafil's request. The whole block opens the
 * leaderboard.
 *
 * Built around the year's average (Rafil, 2026-11-23): the bar measures
 * questions this week, the average is its middle and twice the average its
 * end, and your fill stops at what you answered. A percentile bar with the
 * average marked on it came first, and read as nonsense: ahead of 64% yet
 * left of the average, because a few students on hundreds pull the
 * average up past most of the year.
 *
 * Nothing at all without a year, or while the board has not answered; a
 * plain line when you have not answered anything this week yet.
 */
const n = v => v.toLocaleString("en-GB");

function AvgBar({ mine, avg }) {
  const bar = avgBar(mine, avg);
  return (
    <span className="yr-bar" style={{ "--p": `${bar.p}%` }} aria-hidden="true">
      <span className={`yr-bar__you is-${bar.you}`}>You</span>
      <span className="yr-bar__track"><span className="yr-bar__fill" /><span className="yr-bar__avg" /></span>
      <span className="yr-bar__ends"><span>0</span><span className="is-avg">Average {n(avg)}</span><span>{n(bar.end)}</span></span>
    </span>
  );
}



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
            {year.people < 2 ? (
              <p className="pv-line">You’re the only one in Year {studyYear} to answer this week, with <b>{n(year.mine)}</b>.</p>
            ) : (
              <>
                <p className="pv-line">You’ve answered <b>{n(year.mine)}</b> this week, in the <b>{year.share.side} {year.share.pct}%</b> of Year {studyYear}.</p>
                <AvgBar mine={year.mine} avg={year.avg} />
              </>
            )}
          </>
        ) : (
          <p className="pv-line">Answer a question this week to join Year {studyYear}’s board{year.people ? <>, with {year.people} {year.people === 1 ? "other" : "others"}</> : null}.</p>
        )}
      </button>
    </section>
  );
}
