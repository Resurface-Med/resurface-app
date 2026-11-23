import { useEffect, useMemo, useState } from "react";
import { sectionH } from "./theme";
import { fetchLeaderboardWeek } from "../lib/remote";
import { yearStanding, pctLabels } from "../lib/progressPage";

/**
 * Your year (2026-11-22). Where you are on this week's board for your year,
 * moved from Progress to Home at Rafil's request. The whole block opens the
 * leaderboard.
 *
 * A percentile bar since 2026-11-23 (Rafil picked it from mockups): the
 * share of your year you answered more than, filled from Fewest to Most,
 * with a mark where the average falls. A rank and a raw average misled: one
 * student on 638 pulled Year 2's average to 118, so 108 read as behind when
 * it was ahead of 64% of the year.
 *
 * Nothing at all without a year, or while the board has not answered; a
 * plain line when you have not answered anything this week yet.
 */
function PctBar({ pct, avgPct }) {
  const side = pctLabels(pct, avgPct);
  return (
    <span className="yr-pct" style={{ "--p": `${pct}%`, "--a": `${avgPct}%` }} aria-hidden="true">
      <span className={`yr-pct__lab is-you is-${side.you}`}>You</span>
      {side.avg && <span className={`yr-pct__lab is-avg is-${side.avg}`}>Average</span>}
      <span className="yr-pct__track"><span className="yr-pct__fill" /><span className="yr-pct__avg" /></span>
      <span className="yr-pct__ends"><span>Fewest</span><span>Middle</span><span>Most</span></span>
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
            {year.pct == null ? (
              <p className="pv-line">You’re the only one in Year {studyYear} to answer this week, with <b>{year.mine.toLocaleString("en-GB")}</b>.</p>
            ) : (
              <>
                <p className="pv-line">You’re ahead of <b>{year.pct}%</b> of Year {studyYear} this week, with <b>{year.mine.toLocaleString("en-GB")}</b> answered.</p>
                <PctBar pct={year.pct} avgPct={year.avgPct} />
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
