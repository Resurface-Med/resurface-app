export default function ProgressBar({ value, colour = "var(--c-accent)" }) {
  return (
    <div style={{ height: 5, background: "var(--c-overlay2)", borderRadius: 99, overflow: "hidden", flex: 1 }}>
      <div style={{
        height: "100%",
        width: Math.min(100, Math.max(0, value)) + "%",
        background: colour,
        borderRadius: 99,
        transition: "width 0.5s ease",
      }} />
    </div>
  );
}
