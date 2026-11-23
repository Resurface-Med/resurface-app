import { useEffect, useMemo, useState } from "react";
import { sectionH } from "./theme";
import { fetchLeaderboardWeek } from "../lib/remote";
import { yearStanding, barLabels } from "../lib/progressPage";

/**
 * Your year (2026-11-22). Where you are on this week's board for your year,
 * moved from Progress to Home at Rafil's request. The whole block opens the
 * leaderboard.
 *
 * The bar runs from the bottom of your year to the top (Rafil, 2026-11-23):
 * your fill stops at your place, which the line gives as the top or bottom
 * share, and the average is marked where it falls among the year. A few
 * students on hundreds pull the average up past most of the year, so it
 * usually sits right of the middle.
 *
 * Nothing at all without a year, or while the board has not answered; a
 * plain line when you have not answered anything this week yet.
 */
const n = v => v.toLocaleString("en-GB");

function YearBar({ at, avgAt, avg }) {
  const lab = barLabels(at, avgAt);
  return (
    <span className="yr-bar" style={{ "--p": `${at}%`, "--a": `${avgAt}%` }} aria-hidden="true">
      <span className={`yr-bar__you is-${lab.you}`}>You</span>
      <span className="yr-bar__track"><span className="yr-bar__fill" /><span className="yr-bar__avg" /></span>
      <span className="yr-bar__scale">
        {lab.bottom && <span className="is-bottom">Bottom</span>}
        <span className={`is-avg is-${lab.avg}`}>Average {n(avg)}</span>
        {lab.top && <span className="is-top">Top</span>}
      </span>
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
                <YearBar at={year.at} avgAt={year.avgAt} avg={year.avg} />
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
