import { C } from "./theme";

/**
 * Quiet secondary action. `onField` is the frosted version for the blue field;
 * the default is for panels, where white-on-white would vanish.
 */
export default function GhostBtn({ children, onClick, onField = false }) {
  const surface = onField
    ? {
        background: "rgba(255,255,255,0.14)",
        color: "#fff",
        border: "1.5px solid rgba(255,255,255,0.45)",
      }
    : {
        background: "transparent",
        color: C.sub,
        border: "1.5px solid var(--c-border)",
      };

  return (
    <button onClick={onClick} className="btn-press" style={{
      padding: "11px 20px",
      borderRadius: "var(--r-pill)",
      fontSize: 14,
      fontWeight: 600,
      cursor: "pointer",
      fontFamily: "inherit",
      transition: "all 0.15s",
      letterSpacing: -0.1,
      ...surface,
    }}>
      {children}
    </button>
  );
}
