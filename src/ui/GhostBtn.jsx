import { C } from "./theme";
export default function GhostBtn({ children, onClick }) {
  return (
    <button onClick={onClick} className="btn-press" style={{
      padding: "11px 20px",
      background: "rgba(255,255,255,0.14)",
      color: "#fff",
      border: "1.5px solid rgba(255,255,255,0.45)",
      borderRadius: "var(--r-pill)",
      fontSize: 14,
      fontWeight: 600,
      cursor: "pointer",
      fontFamily: "inherit",
      transition: "all 0.15s",
      letterSpacing: -0.1,
    }}>
      {children}
    </button>
  );
}
