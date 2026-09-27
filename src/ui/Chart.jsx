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

/**
 * The in-row version. Opens the full one when there is anything to show.
 *
 * `plain` drops the button and draws the line alone, for somewhere that is
 * already a control — a card you click to choose what the big chart draws.
 * A button inside a button is not markup a parser will keep: it hoists the
 * inner one out and the card comes apart around it.
 */
export function Spark({ points, label, days, unit, tone = "accent", plain = false }) {
  const [open, setOpen] = useState(false);
  const has = points && points.length > 1;
  if (!has) return <span className="chart-spark" />;

  const { line, area } = path(points, 128, 30, 3);

  if (plain) {
    return (
      <svg className={`chart-spark is-${tone}`} viewBox="0 0 128 30" preserveAspectRatio="none" aria-hidden="true">
        <path d={area} className="chart-fill" />
        <path d={line} className="chart-line" />
      </svg>
    );
  }

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
 * The full-size drawing.
 *
 * Reads left to right over the window the sparkline covered, with the
 * busiest day marked because that is the one worth knowing, and a readout
 * that follows the pointer. No axis furniture beyond the peak and the two
 * ends: a chart of thirty small numbers does not need gridlines to be read.
 *
 * Used both in a panel on the page and inside the modal below, so a chart
 * looks the same wherever it is opened.
 */
export function BigChart({ points, days, unit, tone = "accent", height }) {
  const [at, setAt] = useState(null);
  const ref = useRef(null);
  const W = 960, H = 260, PAD = 16;

  const { line, area, peak, step, y } = useMemo(() => path(points, W, H, PAD), [points]);
  const peakAt = points.indexOf(peak);
  const dayOf = i => (days ? days[i] : null);

  function move(e) {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const x = ((e.clientX - box.left) / box.width) * W;
    setAt(Math.max(0, Math.min(points.length - 1, Math.round(x / step))));
  }

  return (
    <>
      <svg
        ref={ref}
        className={`chart-big is-${tone}`}
        style={height ? { height } : undefined}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onMouseMove={move}
        onMouseLeave={() => setAt(null)}
      >
        <path d={area} className="chart-fill" />
        <path d={line} className="chart-line" />
        {peak > 0 && <circle cx={peakAt * step} cy={y(peak)} r="4" className="chart-peak" />}
        {at != null && (
          <>
            <line x1={at * step} x2={at * step} y1={PAD} y2={H} className="chart-guide" />
            <circle cx={at * step} cy={y(points[at])} r="4" className="chart-dot" />
          </>
        )}
      </svg>
      <div className="chart-foot">
        <span>{dayOf(0) ? dmy(dayOf(0)) : "earliest"}</span>
        <span className="chart-readout">
          {at == null
            ? `peak ${peak.toLocaleString("en-GB")}${dayOf(peakAt) ? ` on ${dmy(dayOf(peakAt))}` : ""}`
            : `${dayOf(at) ? dmy(dayOf(at)) + " · " : ""}${points[at].toLocaleString("en-GB")} ${unit || ""}`}
        </span>
        <span>{dayOf(points.length - 1) ? dmy(dayOf(points.length - 1)) : "today"}</span>
      </div>
    </>
  );
}

/** The same drawing, over the page, for a chart that lives in a table row. */
export function ChartPanel({ points, label, days, unit, tone = "accent", onClose }) {
  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const total = points.reduce((a, b) => a + b, 0);

  return (
    <div className="chart-scrim" onClick={onClose} role="presentation">
      <div className="chart-panel" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${label} over time`}>
        <div className="chart-panel__head">
          <div>
            <h2 className="chart-panel__title">{label}</h2>
            <p className="chart-panel__sub">
              {total.toLocaleString("en-GB")} {unit || ""} over {points.length} days
            </p>
          </div>
          <button type="button" className="chart-panel__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <BigChart points={points} days={days} unit={unit} tone={tone} />
      </div>
    </div>
  );
}
