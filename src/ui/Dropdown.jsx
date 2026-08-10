import { useRef, useEffect } from "react";
import { C } from "./theme";

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
      background: "var(--c-card-bg)",
      border: "1px solid var(--c-border)",
      borderRadius: "var(--r-card)", zIndex: 200,
      maxHeight: 300, overflowY: "auto",
      overscrollBehavior: "contain",
      boxShadow: "var(--c-card-shadow)",
    }}>
      {items.map(c => {
        const isSel = multiple ? active.includes(c) : c === active;
        return (
          <button key={c} type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSelect(c); }} style={{
            display: "flex", alignItems: "center", width: "100%", gap: 10,
            padding: "12px 16px",
            background: isSel ? "var(--c-accent-dim)" : "transparent",
            border: "none",
            borderBottom: "1px solid var(--c-border)",
            color: isSel ? C.accentLt : C.sub,
            fontSize: 14, fontWeight: isSel ? 600 : 400,
            letterSpacing: isSel ? -0.15 : 0,
            textAlign: "left", cursor: "pointer",
            fontFamily: "inherit",
            transition: "background 0.12s",
          }}>
            {multiple && (
              <div style={{
                width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                border: `1px solid ${isSel ? C.accent : "var(--c-border)"}`,
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
