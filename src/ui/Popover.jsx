import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * A small menu that never gets clipped.
 *
 * Rendered into the document rather than inside whatever scrolls, and
 * placed off the anchor's rectangle: below and right-aligned by default,
 * flipping above when the bottom of the window is near, sliding left when
 * the right edge is. Closes on outside pointer, Escape, scroll or resize.
 */
export default function Popover({ anchorRef, open, onClose, align = "right", children, className = "" }) {
  const popRef = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const a = anchorRef.current?.getBoundingClientRect();
    const p = popRef.current;
    if (!a || !p) return;
    const w = p.offsetWidth, h = p.offsetHeight;
    const gap = 8, pad = 8;
    const below = a.bottom + gap + h <= window.innerHeight - pad;
    const top = below ? a.bottom + gap : Math.max(pad, a.top - gap - h);
    let left = align === "right" ? a.right - w : a.left;
    left = Math.min(Math.max(pad, left), window.innerWidth - w - pad);
    setPos({ top, left });
  }, [open, anchorRef, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = e => {
      if (popRef.current?.contains(e.target) || anchorRef.current?.contains(e.target)) return;
      onClose();
    };
    const onKey = e => { if (e.key === "Escape") onClose(); };
    const onMove = () => onClose();
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onMove);
    document.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onMove);
      document.removeEventListener("scroll", onMove, true);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;
  return createPortal(
    <div
      ref={popRef}
      className={`pop ${className}`}
      role="menu"
      style={{ position: "fixed", top: pos?.top ?? -9999, left: pos?.left ?? -9999, zIndex: 400, visibility: pos ? "visible" : "hidden" }}
    >
      {children}
    </div>,
    document.body,
  );
}

/** A list of actions for a Popover. */
export function MenuItems({ items, onPick }) {
  return items.map(it => (
    <button
      key={it.label}
      type="button"
      role="menuitem"
      className={`pop-item${it.danger ? " is-danger" : ""}`}
      disabled={it.disabled}
      onClick={e => { e.stopPropagation(); onPick(it); }}
    >
      {it.label}
    </button>
  ));
}
