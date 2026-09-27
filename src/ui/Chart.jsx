import { useEffect, useMemo, useRef, useState } from "react";

/**
 * One series, drawn twice: small enough to sit in a table row, and large
 * enough to read.
 *
 * The small one is deliberately unlabelled — at 128×30 an axis is noise, and
 * the only question it answers is what the shape is. Everything that needs a
 * number is in the expanded one, which is the same series with the room to
 * say when and how much.
 *
 * A run of zeros draws flat along the bottom rather than being scaled to
 * fill the box. Nothing happening should look like nothing happening.
 */

const dmy = d => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

function path(points, w, h, pad) {
  const peak = Math.max(...points);
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const y = v => (peak === 0 ? h - pad : h - pad - (v / peak) * (h - pad * 2));
  const line = points.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return { line, area: `${line} L${w},${h} L0,${h} Z`, peak, step, y };
}

/** The in-row version. Opens the full one when there is anything to show. */
export function Spark({ points, label, days, unit, tone = "accent" }) {
  const [open, setOpen] = useState(false);
  const has = points && points.length > 1;
  if (!has) return <span className="chart-spark" />;

  const { line, area } = path(points, 128, 30, 3);
  return (
    <>
      <button
        type="button"
        className="chart-spark-btn"
        onClick={() => setOpen(true)}
        aria-label={`Open the ${label} chart`}
        title="Open"
      >
        <svg className={`chart-spark is-${tone}`} viewBox="0 0 128 30" preserveAspectRatio="none" aria-hidden="true">
          <path d={area} className="chart-fill" />
          <path d={line} className="chart-line" />
        </svg>
      </button>
      {open && (
        <ChartPanel points={points} label={label} days={days} unit={unit} tone={tone} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

/**
 * The expanded one.
 *
 * Reads left to right over the same window the sparkline covered, with the
 * busiest day marked because that is the one worth knowing, and a readout
 * that follows the pointer. No axis furniture beyond the peak and the two
 * ends: a chart of thirty small numbers does not need gridlines to be read.
 */
export function ChartPanel({ points, label, days, unit, tone = "accent", onClose }) {
  const [at, setAt] = useState(null);
  const ref = useRef(null);
  const W = 960, H = 260, PAD = 16;

  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const { line, area, peak, step, y } = useMemo(() => path(points, W, H, PAD), [points]);
  const total = points.reduce((a, b) => a + b, 0);
  const peakAt = points.indexOf(peak);
  const shown = at == null ? null : at;

  function move(e) {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const x = ((e.clientX - box.left) / box.width) * W;
    setAt(Math.max(0, Math.min(points.length - 1, Math.round(x / step))));
  }

  const dayOf = i => (days ? days[i] : null);

  return (
    <div className="chart-scrim" onClick={onClose} role="presentation">
      <div className="chart-panel" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${label} over time`}>
        <div className="chart-panel__head">
          <div>
            <h2 className="chart-panel__title">{label}</h2>
            <p className="chart-panel__sub">
              {total.toLocaleString("en-GB")} {unit || ""} over {points.length} days
              {peak > 0 && <> · busiest {peak.toLocaleString("en-GB")}{dayOf(peakAt) ? ` on ${dmy(dayOf(peakAt))}` : ""}</>}
            </p>
          </div>
          <button type="button" className="chart-panel__close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <svg
          ref={ref}
          className={`chart-big is-${tone}`}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          onMouseMove={move}
          onMouseLeave={() => setAt(null)}
        >
          <path d={area} className="chart-fill" />
          <path d={line} className="chart-line" />
          {peak > 0 && <circle cx={peakAt * step} cy={y(peak)} r="4" className="chart-peak" />}
          {shown != null && (
            <>
              <line x1={shown * step} x2={shown * step} y1={PAD} y2={H} className="chart-guide" />
              <circle cx={shown * step} cy={y(points[shown])} r="4" className="chart-dot" />
            </>
          )}
        </svg>

        <div className="chart-panel__foot">
          <span>{dayOf(0) ? dmy(dayOf(0)) : "earliest"}</span>
          <span className="chart-readout">
            {shown == null
              ? `peak ${peak.toLocaleString("en-GB")}`
              : `${dayOf(shown) ? dmy(dayOf(shown)) + " · " : ""}${points[shown].toLocaleString("en-GB")} ${unit || ""}`}
          </span>
          <span>{dayOf(points.length - 1) ? dmy(dayOf(points.length - 1)) : "today"}</span>
        </div>
      </div>
    </div>
  );
}
