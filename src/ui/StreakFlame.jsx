/**
 * The streak, as everyone already reads one: a flame and a number.
 *
 * The flame is orange on purpose — the one colour in the app that is not
 * blue — because a streak flame is a symbol people recognise from Duolingo and
 * Snapchat, and a blue one would have to be explained. It flickers from its
 * base: the outer flame sways and stretches, the core answers out of step.
 * Still under reduced motion.
 */
export default function StreakFlame({ days, best = 0, size = 30, small = false }) {
  const label = `${days}-day streak${best > days ? ` · best ${best}` : ""}`;
  return (
    <span className={`streak${small ? " streak--small" : ""}`} title={label} aria-label={label} role="img">
      <svg className="streak__flame" width={size * 0.82} height={size} viewBox="0 0 20 24" aria-hidden="true">
        <defs>
          <linearGradient id="streak-outer" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffb547" />
            <stop offset="1" stopColor="#ff5a1f" />
          </linearGradient>
          <linearGradient id="streak-inner" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff3b0" />
            <stop offset="1" stopColor="#ffc93d" />
          </linearGradient>
        </defs>
        <path className="streak__outer" fill="url(#streak-outer)"
          d="M10 1c.6 3.4 2.7 5.2 4.6 7.2 1.9 2 3.2 4.2 3.2 7 0 4.4-3.5 7.6-7.8 7.6S2.2 19.6 2.2 15.2c0-2.8 1.4-4.9 3.1-6.5.3 1.7 1.2 2.9 2.4 3.5C7.4 8 8.6 4.2 10 1z" />
        <path className="streak__inner" fill="url(#streak-inner)"
          d="M10 11.2c.4 2 1.7 3.1 2.7 4.2.8.9 1.3 1.9 1.3 3.1 0 2.3-1.8 4-4 4s-4-1.7-4-4c0-1.4.6-2.4 1.4-3.1.2.8.6 1.4 1.3 1.7-.1-2.1.4-4.1 1.3-5.9z" />
      </svg>
      <span className="streak__n">{days}</span>
    </span>
  );
}
