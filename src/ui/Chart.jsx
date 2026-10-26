import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

/**
 * Charts for Admin (redone 2026-10-26).
 *
 * Smooth lines, not straight segments between days: a monotone cubic
 * (Fritsch–Carlson), which curves without ever overshooting a point, so a
 * day with nothing never dips below zero and a peak is never drawn higher
 * than it was.
 *
 * The big chart is drawn at its real pixel width (measured), not stretched
 * from a fixed viewBox, so the line stays one even weight at any size. It
 * scrubs: move a mouse over it, or put a finger on it and slide sideways
 * (vertical movement still scrolls the page), and the day under the pointer
 * is read out. A tap or click picks that day for whatever sits under the
 * chart; arrow keys move it.
 */

const dmy = d => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const long = d => new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

/** A smooth path through [x, y] points that never overshoots them. */
export function smoothPath(pts) {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M${pts[0][0]},${pts[0][1]}`;
  const dx = [], m = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1][0] - pts[i][0];
    m[i] = (pts[i + 1][1] - pts[i][1]) / (dx[i] || 1);
  }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  t[n - 1] = m[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${(pts[i][0] + h).toFixed(1)},${(pts[i][1] + t[i] * h).toFixed(1)} ${(pts[i + 1][0] - h).toFixed(1)},${(pts[i + 1][1] - t[i + 1] * h).toFixed(1)} ${pts[i + 1][0].toFixed(1)},${pts[i + 1][1].toFixed(1)}`;
  }
  return d;
}

/** A round top for the axis: 1, 2 or 5 times a power of ten, at or above `v`. */
export function niceMax(v) {
  if (v <= 0) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const k of [1, 2, 2.5, 5, 10]) if (k * p >= v) return k * p;
  return 10 * p;
}

function useWidth(ref, fallback) {
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => setW(Math.max(120, Math.round(el.getBoundingClientRect().width)));
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/**
 * The full chart. `points` and `days` line up; `picked` is the index shown
 * below the chart, `onPick(i)` sets it.
 */
export function TrendChart({ points, days, unit = "", height = 260, picked = null, onPick = null }) {
  const box = useRef(null);
  const W = useWidth(box, 800);
  const gid = useId().replace(/:/g, "");
  const [hover, setHover] = useState(null);
  const L = 36, R = 8, T = 18, B = 28;
  const iw = W - L - R, ih = height - T - B;
  const top = niceMax(Math.max(0, ...points));
  const step = points.length > 1 ? iw / (points.length - 1) : iw;
  const x = i => L + i * step;
  const y = v => T + ih - (v / top) * ih;
  const pts = useMemo(() => points.map((v, i) => [x(i), y(v)]), [points, W, top]); // eslint-disable-line react-hooks/exhaustive-deps
  const line = smoothPath(pts);
  const area = pts.length ? `${line} L${x(points.length - 1).toFixed(1)},${T + ih} L${L},${T + ih} Z` : "";
  const at = hover ?? picked;
  const ticks = [0, top / 2, top];
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(iw / 90))));

  const indexAt = clientX => {
    const r = box.current.getBoundingClientRect();
    return Math.max(0, Math.min(points.length - 1, Math.round((clientX - r.left - L) / step)));
  };
  const drag = useRef(null);
  function down(e) {
    drag.current = { x: e.clientX, y: e.clientY, scrub: e.pointerType === "mouse" };
    if (e.pointerType === "mouse") setHover(indexAt(e.clientX));
  }
  function move(e) {
    const d = drag.current;
    if (e.pointerType === "mouse") { setHover(indexAt(e.clientX)); return; }
    if (!d) return;
    if (!d.scrub && Math.abs(e.clientX - d.x) > 6 && Math.abs(e.clientX - d.x) > Math.abs(e.clientY - d.y)) {
      d.scrub = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    if (d.scrub) setHover(indexAt(e.clientX));
  }
  function up(e) {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const moved = Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y);
    const i = indexAt(e.clientX);
    if (moved < 8 || d.scrub) onPick?.(i);
    if (e.pointerType !== "mouse") setHover(null);
  }
  function key(e) {
    const cur = at ?? points.length - 1;
    if (e.key === "ArrowLeft") { e.preventDefault(); onPick?.(Math.max(0, cur - 1)); }
    if (e.key === "ArrowRight") { e.preventDefault(); onPick?.(Math.min(points.length - 1, cur + 1)); }
  }

  const tipLeft = at == null ? 0 : Math.max(60, Math.min(W - 60, x(at)));

  return (
    <div className="tc" ref={box} style={{ height }}>
      <svg width={W} height={height} className="tc__svg" role="img"
        aria-label={`${unit} per day, ${dmy(days[0])} to ${dmy(days[days.length - 1])}`}
        tabIndex={0} onKeyDown={key}
        onPointerDown={down} onPointerMove={move} onPointerUp={up}
        onPointerLeave={e => { if (e.pointerType === "mouse") setHover(null); }}
        onPointerCancel={() => { drag.current = null; setHover(null); }}>
        <defs>
          <linearGradient id={`g${gid}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" className="tc__stop-a" />
            <stop offset="100%" className="tc__stop-b" />
          </linearGradient>
        </defs>
        {ticks.map(v => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={v === 0 ? "tc__base" : "tc__grid"} />
            <text x={L - 10} y={y(v) + 4} className="tc__ytick" textAnchor="end">{Number.isInteger(v) ? v.toLocaleString("en-GB") : v.toFixed(1)}</text>
          </g>
        ))}
        {days.map((d, i) => (i % labelEvery === 0 && i < days.length - Math.ceil(labelEvery / 2)) || i === days.length - 1 ? (
          <text key={d} x={x(i)} y={height - 8} className="tc__xtick"
            textAnchor={i === 0 ? "start" : i === days.length - 1 ? "end" : "middle"}>{dmy(d)}</text>
        ) : null)}
        <path d={area} fill={`url(#g${gid})`} />
        <path d={line} className="tc__line" />
        {at != null && (
          <>
            <line x1={x(at)} x2={x(at)} y1={T - 6} y2={T + ih} className="tc__cursor" />
            <circle cx={x(at)} cy={y(points[at])} r="5" className="tc__dot" />
          </>
        )}
      </svg>
      {hover != null && (
        <div className="tc__tip" style={{ left: tipLeft }}>
          <strong>{Number(points[at]).toLocaleString("en-GB")}</strong> {unit}
          <span>{long(days[at])}</span>
        </div>
      )}
    </div>
  );
}

/** A small smooth line for a table row. No axis: the shape is the point. */
export function Spark({ points, width = 120, height = 28, tone = "accent" }) {
  if (!points || points.length < 2) return <span className="chart-spark" style={{ width, height }} />;
  const top = Math.max(1, ...points);
  const step = (width - 4) / (points.length - 1);
  const pts = points.map((v, i) => [2 + i * step, height - 3 - (v / top) * (height - 6)]);
  const line = smoothPath(pts);
  const quiet = points.every(v => v === 0);
  return (
    <svg className={`chart-spark is-${tone}${quiet ? " is-quiet" : ""}`} width={width} height={height} aria-hidden="true">
      <path d={`${line} L${width - 2},${height} L2,${height} Z`} className="chart-fill" />
      <path d={line} className="chart-line" />
    </svg>
  );
}

/* Kept for any screen outside Admin that still opens a chart over the page. */
export function ChartPanel({ points, label, days, unit, onClose }) {
  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="chart-scrim" onClick={onClose} role="presentation">
      <div className="chart-panel" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={label}>
        <div className="chart-panel__head">
          <h2 className="chart-panel__title">{label}</h2>
          <button type="button" className="chart-panel__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <TrendChart points={points} days={days} unit={unit} />
      </div>
    </div>
  );
}
