import { useId } from "react";

/**
 * The streak: a flame and a number.
 *
 * The colour steps with the length (2026-11-25, after 14 read as a muddy
 * brick red): orange at 1, a hotter red-orange at 3, true red at 7,
 * violet at 14, cyan at 30, pink at 50, emerald at 100, and a prism at a
 * year. Each a clean light-to-deep ramp of one hue, so none goes brown.
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
  { at: 1, label: "1", h: 52, core: 0, shade: "#c2410c", outer: ["#ffe066", "#ff8a00"], inner: ["#fffbe0", "#ffcf1a"] },
  { at: 3, label: "3", h: 54, core: 0.3, shade: "#b42318", outer: ["#ffb648", "#ff3d00"], inner: ["#fff3c4", "#ffb020"] },
  { at: 7, label: "7", h: 57, core: 0.45, shade: "#991b1b", outer: ["#ff8a7a", "#e0201f"], inner: ["#fff4ef", "#ff9a6b"] },
  { at: 14, label: "14", h: 62, core: 0.6, shade: "#6b21a8", outer: ["#e4b5ff", "#8b2cf5"], inner: ["#ffffff", "#d9b3ff"] },
  { at: 30, label: "30", h: 68, core: 0.78, shade: "#0e7490", outer: ["#c9f8ff", "#0bb5d8"], inner: ["#ffffff", "#b8f3ff"] },
  { at: 50, label: "50", h: 74, core: 0.85, shade: "#9d174d", outer: ["#ffc4e3", "#ec3d8f"], inner: ["#ffffff", "#ffb3d6"] },
  { at: 100, label: "100", h: 80, core: 0.9, shade: "#065f46", outer: ["#b4f5d6", "#0fb57a"], inner: ["#ffffff", "#8ff0c4"] },
  { at: 365, label: "365", h: 84, core: 1, shade: "#5b21b6", outer: ["#7fdcff", "#a78bfa", "#f472b6"], inner: ["#ffffff", "#e9e2ff"] },
];

/* A flame not yet earned: grey, so its colour is a surprise. */
const LOCKED = { core: 0, shade: "#7b8494", outer: ["#dfe3ea", "#a9b1bf"], inner: ["#f3f5f8", "#c6ccd6"] };

export function flameLevel(days) {
  const n = Number(days) || 0;
  let level = FLAME_LEVELS[0];
  for (const L of FLAME_LEVELS) if (n >= L.at) level = L;
  return level;
}

export default function StreakFlame({ days, best = 0, size = 30, small = false, bare = false, dim = false, locked = false, className = "" }) {
  const uid = useId().replace(/:/g, "");
  const L = locked ? { ...flameLevel(days), ...LOCKED } : flameLevel(days);
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
            {L.outer.map((c, i) => <stop key={i} offset={i / (L.outer.length - 1)} stopColor={c} />)}
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
