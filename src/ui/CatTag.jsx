import { C } from "./theme";
export default function CatTag({ label }) {
  return (
    <span style={{
      display: "inline-block",
      fontSize: 10, fontWeight: 500,
      letterSpacing: 0.5,
      color: C.muted,
      background: "transparent",
      border: "1px solid var(--c-border)",
      padding: "3px 10px", borderRadius: 6,
      textTransform: "uppercase",
    }}>
      {label}
    </span>
  );
}
