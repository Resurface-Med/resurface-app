import { C } from "./theme";
export default function CatTag({ label }) {
  return (
    <span style={{
      display: "inline-block",
      fontSize: 12, fontWeight: 600,
      letterSpacing: -0.1,
      color: C.accent,
      background: "var(--c-accent-dim)",
      border: "1px solid var(--c-accent-brd)",
      padding: "4px 12px", borderRadius: "var(--r-pill)",
    }}>
      {label}
    </span>
  );
}
