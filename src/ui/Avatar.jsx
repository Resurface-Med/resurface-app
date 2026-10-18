import { useState } from "react";

/**
 * A round photo, or initials where there is none — or where the photo will
 * not load (a Google address that has gone stale, a blocked network): the
 * initials are never worse than a broken image.
 */
export function initialsOf(name, fallback = "?") {
  const n = String(name || "").trim();
  if (!n) return String(fallback || "?").slice(0, 1).toUpperCase();
  const parts = n.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || "", b = parts[1]?.[0] || "";
  return (a + b || n.slice(0, 2)).toUpperCase();
}

export default function Avatar({ src, name, fallback, className = "", size }) {
  const [failed, setFailed] = useState(null);
  const show = src && failed !== src;
  return (
    <span className={`avatar ${className}${show ? " has-photo" : ""}`} aria-hidden="true"
      style={size ? { width: size, height: size } : undefined}>
      {show
        ? <img src={src} alt="" referrerPolicy="no-referrer" loading="lazy" decoding="async" onError={() => setFailed(src)} />
        : initialsOf(name, fallback)}
    </span>
  );
}
