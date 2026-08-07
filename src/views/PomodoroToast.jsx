import { useEffect, useState } from "react";
import { C } from "../ui/theme";

const AUTO_DISMISS_S = 20;

export default function PomodoroToast({ toast, onDismiss, onStart }) {
  const [remaining, setRemaining] = useState(AUTO_DISMISS_S);

  useEffect(() => {
    if (!toast) return;
    setRemaining(AUTO_DISMISS_S);
    const id = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) { onDismiss(); return 0; }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [toast]); // eslint-disable-line

  if (!toast) return null;

  return (
    <div style={{
      position: "fixed",
      top: 20,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 2000,
      animation: "toast-slide-in 0.4s cubic-bezier(0.34,1.56,0.64,1) both",
    }}>
      <div style={{
        background: "var(--c-card-bg)",
        border: "1px solid var(--c-border)",
        borderLeft: "3px solid var(--c-accent)",
        borderRadius: 14,
        padding: "14px 16px",
        boxShadow: "0 16px 48px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.3)",
        width: 300,
        display: "flex", flexDirection: "column", gap: 10,
      }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>
              {toast.title}
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
              {toast.sub}
            </div>
          </div>
          <button onClick={onDismiss} style={{
            background: "none", border: "none", cursor: "pointer",
            color: C.mutedDim, fontSize: 16, lineHeight: 1, padding: "2px 4px",
            flexShrink: 0, transition: "color 0.15s",
          }}
            onMouseEnter={e => e.currentTarget.style.color = C.muted}
            onMouseLeave={e => e.currentTarget.style.color = C.mutedDim}
          >×</button>
        </div>

        {/* Auto-dismiss bar */}
        <div style={{ height: 1.5, background: "var(--c-border)", borderRadius: 99, overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 99,
            background: "var(--c-accent)",
            width: `${(remaining / AUTO_DISMISS_S) * 100}%`,
            transition: "width 1s linear",
            opacity: 0.5,
          }} />
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={onStart} className="btn-press" style={{
            flex: 1, padding: "8px 12px", borderRadius: 8,
            background: "linear-gradient(135deg, #4d8ef5 0%, #2563eb 100%)",
            border: "none", color: "#fff",
            fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            boxShadow: "0 0 16px rgba(77,142,245,0.3)",
          }}>▷ {toast.actionLabel}</button>
          <button onClick={onDismiss} className="btn-press" style={{
            padding: "8px 12px", borderRadius: 8,
            border: "1px solid var(--c-border)", background: "transparent",
            color: C.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
          }}>Later</button>
        </div>
      </div>
    </div>
  );
}
