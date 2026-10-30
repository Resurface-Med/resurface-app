/* The app's one previous/next arrow: drawn, not a ‹ › character, which sat
   off-centre and thin in a round button (Rafil, 2026-10-30). */
export default function NavChevron({ back = false, size = 17 }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true"
      style={{ display: "block", ...(back ? { transform: "scaleX(-1)" } : {}) }}
    >
      <path d="M6.5 3.5L12 9l-5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
