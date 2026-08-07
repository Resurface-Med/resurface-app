import { useRef, useEffect } from "react";
import { C } from "../../constants";

export default function Dropdown({ items, active, onSelect, multiple }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stop = (e) => e.stopPropagation();
    el.addEventListener("wheel",     stop, { passive: false });
    el.addEventListener("touchmove", stop, { passive: false });
    return () => {
      el.removeEventListener("wheel",     stop);
      el.removeEventListener("touchmove", stop);
    };
  }, []);

  return (
    <div ref={ref} style={{
      position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
      background: "#0c1830",
      border: "1px solid rgba(255,255,255,0.09)",
      borderRadius: 12, zIndex: 200,
      maxHeight: 300, overflowY: "auto",
      overscrollBehavior: "contain",
      boxShadow: "0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(77,142,245,0.08)",
    }}>
      {items.map(c => {
        const isSel = multiple ? active.includes(c) : c === active;
        return (
          <button key={c} type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSelect(c); }} style={{
            display: "flex", alignItems: "center", width: "100%", gap: 10,
            padding: "12px 16px",
            background: isSel ? "rgba(77,142,245,0.1)" : "transparent",
            border: "none",
            borderBottom: "1px solid rgba(255,255,255,0.04)",
            color: isSel ? C.accentLt : C.sub,
            fontSize: 14, fontWeight: isSel ? 600 : 400,
            textAlign: "left", cursor: "pointer",
            fontFamily: "inherit",
            transition: "background 0.12s",
          }}>
            {multiple && (
              <div style={{
                width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                border: `1px solid ${isSel ? C.accent : "rgba(255,255,255,0.2)"}`,
                background: isSel ? C.accent : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center"
              }}>
                {isSel && <span style={{ color: "#fff", fontSize: 12, lineHeight: 1 }}>✓</span>}
              </div>
            )}
            <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c}</span>
          </button>
        );
      })}
    </div>
  );
}
