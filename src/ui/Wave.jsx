/**
 * The landing page's section boundary, ported verbatim.
 *
 * Self-contained on purpose: the element paints `from` (the band above) and the
 * path paints `to` (the band below), so a call site never has to reason about
 * which neighbour owns the edge.
 *
 * The path closes past the 90 baseline to 96. The viewBox clips the excess,
 * which guarantees the fill reaches the bottom edge instead of leaving a
 * hairline when the scaled height lands on a subpixel.
 */
export default function Wave({ from, to, flip = false, height }) {
  return (
    <div style={{ lineHeight: 0, background: from }} aria-hidden="true">
      <svg
        viewBox="0 0 1440 90"
        preserveAspectRatio="none"
        style={{
          display: "block",
          width: "100%",
          /* Section breaks want the full 36-64; a boundary inside a view wants
             far less. Same curve either way. */
          height: height ?? "clamp(36px, 4vw, 64px)",
          transform: flip ? "scaleX(-1)" : undefined,
        }}
      >
        <path
          fill={to}
          d="M0,44 C240,6 480,82 720,44 C960,6 1200,82 1440,44 L1440,96 L0,96 Z"
        />
      </svg>
    </div>
  );
}
