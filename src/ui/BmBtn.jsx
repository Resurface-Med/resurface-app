import { C } from "./theme";

/** Bookmark control — same quiet tool weight as edit/copy on the question card. */
export default function BmBtn({ active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={active ? "Remove bookmark" : "Bookmark"}
      aria-label={active ? "Remove bookmark" : "Bookmark"}
      aria-pressed={active}
      className="q-tool"
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: 6,
        borderRadius: 8,
        lineHeight: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 16,
        color: active ? C.warning : C.mutedDim,
        transition: "color 0.15s, background 0.15s",
      }}
    >
      {active ? "★" : "☆"}
    </button>
  );
}
