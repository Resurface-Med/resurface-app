export default function ProgressBar({ value, colour = "var(--c-accent)" }) {
  return (
    <div style={{ height: 6, background: "var(--c-surface3)", borderRadius: 99, overflow: "hidden", flex: 1 }}>
      <div style={{
        height: "100%",
        width: Math.min(100, Math.max(0, value)) + "%",
        background: colour === "var(--c-accent)"
          ? "linear-gradient(90deg, #6e8ff7, var(--c-accent))"
          : colour,
        borderRadius: 99,
        transition: "width 0.45s ease",
      }} />
    </div>
  );
}
