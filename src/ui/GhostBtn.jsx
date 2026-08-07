import { C } from "./theme";
export default function GhostBtn({ children, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: "9px 18px",
      background: "transparent",
      color: C.sub,
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 12,
      fontSize: 14,
      fontWeight: 500,
      cursor: "pointer",
      fontFamily: "inherit",
      transition: "all 0.15s",
      letterSpacing: 0.1,
    }}>
      {children}
    </button>
  );
}
