import { C } from "./theme";
export default function BmBtn({ active, onClick }) {
  return (
    <button onClick={onClick} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", borderRadius: 4, lineHeight: 1, fontSize: 20, color: active ? C.warning : C.mutedDim }}>
      {active ? "★" : "☆"}
    </button>
  );
}
