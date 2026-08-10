import { useEffect, useState } from "react";
import { C, primaryBtn } from "../ui/theme";

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
      animation: "toast-slide-in 0.26s cubic-bezier(0.22,1,0.36,1) both",
    }}>
      <div style={{
        background: "var(--c-card-bg)",
        border: "1px solid var(--c-border)",
        borderRadius: "var(--r-panel)",
        padding: "16px 18px",
        boxShadow: "var(--c-card-shadow)",
        width: 320,
        display: "flex", flexDirection: "column", gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text, lineHeight: 1.3, letterSpacing: -0.2 }}>
              {toast.title}
            </div>
            <div style={{ fontSize: 13, color: C.sub, marginTop: 2 }}>
              {toast.sub}
            </div>
          </div>
          <button onClick={onDismiss} style={{
            background: "none", border: "none", cursor: "pointer",
            color: C.muted, fontSize: 18, lineHeight: 1, padding: "2px 4px",
            flexShrink: 0,
          }}>×</button>
        </div>

        <div style={{ height: 4, background: "var(--c-surface3)", borderRadius: 99, overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 99,
            background: "linear-gradient(90deg, #6e8ff7, var(--c-accent))",
            width: `${(remaining / AUTO_DISMISS_S) * 100}%`,
            transition: "width 1s linear",
          }} />
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onStart} className="btn-press" style={{
            ...primaryBtn,
            flex: 1,
            padding: "10px 14px",
            fontSize: 13,
          }}>▷ {toast.actionLabel}</button>
          <button onClick={onDismiss} className="btn-press" style={{
            padding: "10px 14px", borderRadius: "var(--r-pill)",
            border: "1px solid var(--c-border)", background: "var(--c-surface2)",
            color: C.sub, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}>Later</button>
        </div>
      </div>
    </div>
  );
}
