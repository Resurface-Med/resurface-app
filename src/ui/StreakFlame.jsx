import { useId } from "react";

/**
 * The streak: a flame and a number.
 *
 * The colour steps with the length. Everyday is gold, then orange, red,
 * blue, pink, green, and a white flame with an indigo base at a year.
 * A shadow in that same colour keeps the pale ones visible on white.
 * It flickers from its base. Still under reduced motion.
 *
 * Several can sit on one page (the badge card, the leaderboard), so each
 * gradient has its own id.
 */
const OUTER = "M10 1c.6 3.4 2.7 5.2 4.6 7.2 1.9 2 3.2 4.2 3.2 7 0 4.4-3.5 7.6-7.8 7.6S2.2 19.6 2.2 15.2c0-2.8 1.4-4.9 3.1-6.5.3 1.7 1.2 2.9 2.4 3.5C7.4 8 8.6 4.2 10 1z";
const INNER = "M10 11.2c.4 2 1.7 3.1 2.7 4.2.8.9 1.3 1.9 1.3 3.1 0 2.3-1.8 4-4 4s-4-1.7-4-4c0-1.4.6-2.4 1.4-3.1.2.8.6 1.4 1.3 1.7-.1-2.1.4-4.1 1.3-5.9z";

/* h is the laptop home height. It stops at the greeting. */
export const FLAME_LEVELS = [
  { at: 1, label: "1", h: 52, core: 0, shade: "#c2410c", outer: ["#ffe56a", "#ff8a00"], inner: ["#fffce4", "#ffd000"] },
  { at: 7, label: "7", h: 56, core: 0.4, shade: "#c2410c", outer: ["#ffb547", "#ff5a1f"], inner: ["#fff3b0", "#ffc93d"] },
  { at: 14, label: "14", h: 62, core: 0.6, shade: "#7f1d1d", outer: ["#ffb199", "#9f0d18"], inner: ["#fff6e8", "#ff5a1f"] },
  { at: 30, label: "30", h: 68, core: 0.78, shade: "#0e7490", outer: ["#ffffff", "#22d3ee"], inner: ["#ffffff", "#e0fbff"] },
  { at: 50, label: "50", h: 74, core: 0.88, shade: "#86198f", outer: ["#ffd6ff", "#c026d3"], inner: ["#ffffff", "#f0abfc"] },
  { at: 100, label: "100", h: 80, core: 0.9, shade: "#166534", outer: ["#d9f99d", "#16a34a"], inner: ["#ffffff", "#86efac"] },
  { at: 365, label: "365", h: 84, core: 1, shade: "#312e81", outer: ["#ffffff", "#4f46e5"], inner: ["#ffffff", "#c7d2fe"] },
];

export function flameLevel(days) {
  const n = Number(days) || 0;
  let level = FLAME_LEVELS[0];
  for (const L of FLAME_LEVELS) if (n >= L.at) level = L;
  return level;
}

export default function StreakFlame({ days, best = 0, size = 30, small = false, bare = false, dim = false, className = "" }) {
  const uid = useId().replace(/:/g, "");
  const L = flameLevel(days);
  const home = className.includes("streak--home");
  const label = `${days}-day streak${best > days ? ` · best ${best}` : ""}`;
  const dev = (small ? 1.4 : 2.2) / (size / 24);
  return (
    <span
      className={`streak${small ? " streak--small" : ""}${bare ? " streak--bare" : ""}${className ? ` ${className}` : ""}`}
      title={bare ? undefined : label}
      aria-label={bare ? undefined : label}
      role={bare ? undefined : "img"}
      style={{ "--flame-ink": L.shade, ...(home ? { "--fh": `${L.h}px` } : {}) }}
    >
      <svg className="streak__flame" width={size * 0.82} height={size} viewBox="0 0 20 24" aria-hidden="true">
        <defs>
          <linearGradient id={`${uid}-o`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={L.outer[0]} />
            <stop offset="1" stopColor={L.outer[1]} />
          </linearGradient>
          <linearGradient id={`${uid}-i`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={L.inner[0]} />
            <stop offset="1" stopColor={L.inner[1]} />
          </linearGradient>
          <filter id={`${uid}-g`} x="-80%" y="-45%" width="260%" height="200%">
            <feDropShadow dx="0" dy={small ? 0.35 : 0.45} stdDeviation={dev} floodColor={L.shade} floodOpacity={dim ? 0.35 : small ? 0.9 : 0.55} />
          </filter>
        </defs>
        <g filter={`url(#${uid}-g)`}>
          {small && <path fill={L.shade} opacity="0.95" d={OUTER} transform="translate(10 22.6) scale(1.18) translate(-10 -21.4)" />}
          <path className="streak__outer" fill={`url(#${uid}-o)`} d={OUTER} />
          <path className="streak__inner" fill={`url(#${uid}-i)`} d={INNER} />
          {!dim && L.core > 0 && <path className="streak__inner" fill="#fff" opacity={L.core} d={INNER} />}
        </g>
      </svg>
      {!bare && <span className="streak__n">{days}</span>}
    </span>
  );
}
