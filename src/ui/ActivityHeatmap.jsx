import { memo, useCallback, useMemo, useState } from "react";
import { C, sectionH, meta } from "./theme";
import { todayKey } from "../lib/storage";

/**
 * Twelve weeks of study activity.
 *
 * Everything — day labels, month labels and cells — lives in one CSS grid.
 * The previous version placed them in three separate flex columns whose row
 * heights were declared independently (14px labels against square cells), so
 * they drifted apart and the day labels ended up beside the wrong rows. One
 * geometry means that cannot happen.
 *
 * Monday-first, because this is for UK students and getDay()'s Sunday-first
 * ordering is a US convention.
 */

const WEEKS = 12;
const DAYS = 7;

// Cells are `1fr` and square themselves via aspect-ratio, so the map is exactly
// as wide as whatever column it is handed and can never overflow it. Sizing off
// `vw` measured the viewport rather than the container, which is why it spilled
// the moment it stopped having the page to itself. MAX_W keeps it from becoming
// a wall of giant squares on a wide monitor.
const GAP   = "clamp(4px, 0.55vw, 7px)";
const MAX_W = 620;

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Monday of the week containing `d`. */
function mondayOf(d) {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  // getDay(): 0=Sun..6=Sat. Shift so Monday is 0 and Sunday is 6.
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7));
  return out;
}

/** WEEKS columns of 7 days, ending with the week containing today. */
function buildGrid() {
  const start = mondayOf(new Date());
  start.setDate(start.getDate() - (WEEKS - 1) * 7);

  return Array.from({ length: WEEKS }, (_, w) =>
    Array.from({ length: DAYS }, (_, d) => {
      const date = new Date(start);
      date.setDate(start.getDate() + w * 7 + d);
      return date;
    }),
  );
}

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

const LEVEL_BG = [
  "var(--c-surface3)",          // none — a tint of the page, not of the accent
  "rgba(53, 98, 245, 0.30)",
  "rgba(53, 98, 245, 0.52)",
  "rgba(53, 98, 245, 0.76)",
  "var(--c-accent)",
];

const Cell = memo(function Cell({ date, count, isToday, isFuture, onHover }) {
  const l = level(count);
  return (
    <div
      onMouseEnter={isFuture ? undefined : (e) => onHover(e, date, count)}
      onMouseLeave={isFuture ? undefined : () => onHover(null)}
      style={{
        width: "100%",
        aspectRatio: "1 / 1",
        borderRadius: "clamp(4px, 0.6vw, 7px)",
        background: isFuture ? "transparent" : LEVEL_BG[l],
        // Future days are outlined rather than blank, so the grid still reads
        // as a full rectangle instead of looking truncated.
        border: isFuture
          ? "1px dashed var(--c-border)"
          : isToday
            ? `1.5px solid ${C.accent}`
            : "1px solid transparent",
        cursor: isFuture ? "default" : "pointer",
      }}
    />
  );
});

export default function ActivityHeatmap({ activity = {} }) {
  const [tip, setTip] = useState(null);

  const grid = useMemo(() => buildGrid(), []);
  const today = todayKey();
  const now = Date.now();

  // offsetLeft/offsetTop, measured against the positioned <section>, rather
  // than getBoundingClientRect against the viewport. #root carries
  // `zoom: var(--app-scale)`: rects come back already multiplied by the zoom,
  // while a `position: fixed` child of the zoomed tree has its own left/top
  // multiplied again — so the tooltip landed ~12% right of and below the cell,
  // hovering over a different square, and on the right-hand columns it spilled
  // past the viewport and flickered a scrollbar in and out. Offsets are plain
  // layout pixels in the same space the tooltip is positioned in, so the two
  // cannot disagree no matter what --app-scale is set to.
  const onHover = useCallback((e, date, count) => {
    if (e === null) return setTip(null);
    const el = e.currentTarget;
    setTip({ x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop, date, count });
  }, []);

  // A month is labelled on the first column whose Monday falls in it.
  const monthAt = useMemo(() => {
    const out = {};
    let last = null;
    grid.forEach((week, wi) => {
      const m = week[0].getMonth();
      if (m !== last) { out[wi] = MONTHS[m]; last = m; }
    });
    return out;
  }, [grid]);

  const total = useMemo(
    () => grid.flat().reduce((sum, d) => sum + (activity[todayKey(d)] || 0), 0),
    [grid, activity],
  );

  const activeDays = useMemo(
    () => grid.flat().filter(d => activity[todayKey(d)] > 0).length,
    [grid, activity],
  );

  return (
    <section style={{ position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <h2 style={sectionH}>Your activity</h2>
          <p style={{ ...meta, marginTop: 4 }}>
            {total === 0
              ? "The last 12 weeks. Answer a question and it starts filling in."
              : `${total} question${total === 1 ? "" : "s"} over ${activeDays} day${activeDays === 1 ? "" : "s"}`}
          </p>
        </div>
      </div>

      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: "grid",
            // One shared geometry: a label column, then a column per week.
            gridTemplateColumns: `auto repeat(${WEEKS}, minmax(0, 1fr))`,
            gap: GAP,
            width: "100%",
            maxWidth: MAX_W,
          }}
        >
          {/* corner */}
          <div />

          {/* month labels — same columns as the cells beneath them */}
          {grid.map((_, wi) => (
            <div key={`m${wi}`} style={{ fontSize: "clamp(11px, 0.85vw, 13px)", fontWeight: 500, color: C.muted, lineHeight: 1.2, whiteSpace: "nowrap" }}>
              {monthAt[wi] ?? ""}
            </div>
          ))}

          {/* one row per weekday */}
          {DAY_LABELS.map((label, d) => (
            <Row key={d} d={d} label={label} grid={grid} activity={activity} today={today} now={now} onHover={onHover} />
          ))}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14, justifyContent: "flex-end", maxWidth: MAX_W }}>
        <span style={{ fontSize: 11.5, color: C.mutedDim }}>Less</span>
        {LEVEL_BG.map((bg, i) => (
          <div key={i} style={{ width: 14, height: 14, borderRadius: 4, background: bg }} />
        ))}
        <span style={{ fontSize: 11.5, color: C.mutedDim }}>More</span>
      </div>

      {tip && (
        <div style={{
          position: "absolute", left: tip.x, top: tip.y - 10,
          transform: "translate(-50%, -100%)",
          background: "var(--c-card-solid)",
          border: "1px solid var(--c-border)",
          borderRadius: "var(--r-card)", padding: "8px 12px",
          boxShadow: "var(--c-card-shadow)",
          pointerEvents: "none", zIndex: 999,
          fontSize: 13, whiteSpace: "nowrap",
        }}>
          <div style={{ fontWeight: 600, color: C.text, letterSpacing: -0.3 }}>
            {tip.count > 0 ? `${tip.count} question${tip.count === 1 ? "" : "s"}` : "Nothing yet"}
          </div>
          <div style={{ color: C.muted, marginTop: 2 }}>
            {tip.date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
          </div>
        </div>
      )}
    </section>
  );
}

/** One weekday: its label, then that day across every week. */
function Row({ d, label, grid, activity, today, now, onHover }) {
  return (
    <>
      <div style={{
        fontSize: "clamp(11px, 0.85vw, 13px)", fontWeight: 500, color: C.muted,
        display: "flex", alignItems: "center", justifyContent: "flex-end",
        paddingRight: 10, whiteSpace: "nowrap",
      }}>
        {/* Alternate days only — seven labels at this size is clutter. */}
        {d % 2 === 0 ? label : ""}
      </div>

      {grid.map((week, wi) => {
        const date = week[d];
        const key = todayKey(date);
        return (
          <Cell
            key={wi}
            date={date}
            count={activity[key] || 0}
            isToday={key === today}
            isFuture={date.getTime() > now}
            onHover={onHover}
          />
        );
      })}
    </>
  );
}
