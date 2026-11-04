import { useCallback, useMemo, useState } from "react";
import { sectionH } from "./theme";
import { todayKey } from "../lib/storage";

/**
 * Your activity as a calendar (2026-11-04).
 *
 * It was twelve weeks as columns, GitHub-style, and read as a strange grid:
 * months started mid-column, so the labels sat at uneven gaps. Now it is a
 * month, laid out as a calendar is — Monday first (UK), the date in each
 * square, each square shaded by how many questions you answered that day —
 * with arrows to go back a month at a time.
 */

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/**
 * Four steps rather than a continuous ramp. A gradient over an unknown maximum
 * makes two users' maps incomparable and a single big day flattens everything
 * else; fixed thresholds mean a colour always means the same thing.
 */
function level(count) {
  if (!count) return 0;
  if (count < 5) return 1;
  if (count < 15) return 2;
  if (count < 30) return 3;
  return 4;
}

/** The first of the month `offset` months from this one. */
function monthStart(offset) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offset, 1);
}

/** The month's days, in weeks of seven, with nulls before the 1st and after the last. */
function monthWeeks(first) {
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const cells = [
    ...Array(lead).fill(null),
    ...Array.from({ length: days }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1)),
  ];
  while (cells.length % 7) cells.push(null);
  return cells;
}

export default function ActivityHeatmap({ activity = {} }) {
  const [offset, setOffset] = useState(0);
  const [tip, setTip] = useState(null);

  /* As far back as the first day anything was answered, and no further. */
  const earliest = useMemo(() => {
    const keys = Object.keys(activity).filter(k => activity[k] > 0).sort();
    if (!keys.length) return 0;
    const [y, m] = keys[0].split("-").map(Number);
    const now = new Date();
    return (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth());
  }, [activity]);

  const first = useMemo(() => monthStart(offset), [offset]);
  const cells = useMemo(() => monthWeeks(first), [first]);
  const today = todayKey();
  /* Days after today have nothing in them yet; drawn faint, not shaded. */
  const [now] = useState(() => Date.now());

  const days = cells.filter(Boolean);
  const total = days.reduce((s, d) => s + (activity[todayKey(d)] || 0), 0);
  const activeDays = days.filter(d => activity[todayKey(d)] > 0).length;

  const onHover = useCallback((e, date, count, isTap = false) => {
    if (e === null) return setTip(null);
    const el = e.currentTarget;
    const grid = el.parentElement;
    const ratio = (el.offsetLeft + el.offsetWidth / 2 - grid.offsetLeft) / grid.offsetWidth;
    const align = ratio > 0.75 ? "right" : ratio < 0.25 ? "left" : "center";
    const key = el.offsetLeft + "," + el.offsetTop;
    setTip(prev => (isTap && prev?.key === key ? null
      : { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop, date, count, align, key }));
  }, []);

  /* Which way the page turned, for the slide. */
  const [dir, setDir] = useState(0);
  const go = step => { setTip(null); setDir(step); setOffset(o => Math.min(0, Math.max(earliest, o + step))); };

  return (
    <section className="cal" style={{ position: "relative" }}>
      <h2 style={sectionH}>Your activity</h2>

      <div className="cal__panel">
      {/* A desk calendar's top: the binding, then the month on the strip. */}
      <div className="cal__head">
        <span className="cal__rings" aria-hidden="true"><i /><i /></span>
        <span className="cal__month" key={`m${offset}`}>
          <span className="cal__month-name">{first.toLocaleDateString("en-GB", { month: "long" })}</span>
          <span className="cal__year">{first.getFullYear()}</span>
        </span>
        <span className="cal__nav">
          <button type="button" className="cal__arrow" aria-label="Previous month" disabled={offset <= earliest} onClick={() => go(-1)}>
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5L5.5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button type="button" className="cal__arrow" aria-label="Next month" disabled={offset >= 0} onClick={() => go(1)}>
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5L10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </span>
      </div>

      {/* Keyed by month, so a turn plays the page in again: the days ripple
          in from the top-left, then the busy ones fill with colour. */}
      <div className={`cal__grid${dir < 0 ? " from-left" : dir > 0 ? " from-right" : ""}`} key={offset} onMouseLeave={() => setTip(null)}>
        {WEEKDAYS.map((w, i) => <span key={`w${i}`} className="cal__wd" aria-hidden="true">{w}</span>)}
        {cells.map((date, i) => {
          const ripple = { "--d": Math.floor(i / 7) + (i % 7) };
          if (!date) return <span key={i} className="cal__day is-blank" aria-hidden="true" />;
          const key = todayKey(date);
          const count = activity[key] || 0;
          const future = date.getTime() > now;
          const l = future ? 0 : level(count);
          return (
            <button key={i} type="button" tabIndex={-1}
              className={`cal__day l${l}${key === today ? " is-today" : ""}${future ? " is-future" : ""}`} style={ripple}
              aria-label={`${date.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}: ${count} question${count === 1 ? "" : "s"}`}
              onMouseEnter={future ? undefined : e => onHover(e, date, count)}
              onClick={future ? undefined : e => onHover(e, date, count, true)}>
              {date.getDate()}
            </button>
          );
        })}
      </div>

      <div className="cal__foot">
      <span className="cal__sum">
        {total === 0
          ? (offset === 0 ? "Answer a question and today fills in" : "Nothing this month")
          : <><b>{total.toLocaleString()}</b> question{total === 1 ? "" : "s"} over <b>{activeDays}</b> day{activeDays === 1 ? "" : "s"}</>}
      </span>
      <div className="cal__key" aria-hidden="true">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map(l => <i key={l} className={`l${l}`} />)}
        <span>More</span>
      </div>
      </div>
      </div>

      {tip && (
        <div className={`cal__tip is-${tip.align}`} style={{ left: tip.x, top: tip.y - 8 }}>
          <b>{tip.count > 0 ? `${tip.count} question${tip.count === 1 ? "" : "s"}` : "Nothing"}</b>
          <span>{tip.date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</span>
        </div>
      )}
    </section>
  );
}
