import { useEffect, useState } from "react";
import { confirm } from "./Confirm";

/**
 * Announcements (2026-10-19, migration 0022).
 *
 * News from Resurface, slid in from the right — the same sheet as Lab
 * values. Opened from the bell (AnnouncementsBell), whose badge counts the
 * ones newer than when you last looked; opening marks them seen, but the
 * ones that were new keep their "New" for as long as the panel is open.
 * Admins write and remove them here too.
 */
export const BellIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export function AnnouncementsBell({ unread = 0, onOpen, className = "" }) {
  return (
    <button type="button" className={`ann-bell btn-press ${className}`} onClick={onOpen}
      aria-label={unread ? `Announcements, ${unread} new` : "Announcements"} title="Announcements">
      <BellIcon />
      {unread > 0 && <span className="ann-bell__badge" aria-hidden="true">{unread > 9 ? "9+" : unread}</span>}
    </button>
  );
}

const when = iso => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/* Plain text, with line breaks kept and web addresses made into links. */
function Body({ text }) {
  const parts = String(text || "").split(/(https?:\/\/[^\s)]+)/g);
  return (
    <p className="ann-item__body">
      {parts.map((p, i) => (/^https?:\/\//.test(p)
        ? <a key={i} href={p} target="_blank" rel="noopener noreferrer">{p.replace(/^https?:\/\//, "")}</a>
        : <span key={i}>{p}</span>))}
    </p>
  );
}

export default function Announcements({ open, onClose, items = [], newSince = null, isAdmin = false, onPost, onDelete }) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (open) {
      setMounted(true);
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(r);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 320);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function post(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true); setErr("");
    try { await onPost(title.trim(), body.trim()); setTitle(""); setBody(""); }
    catch { setErr("Couldn’t post that. Check your connection and try again."); }
    finally { setBusy(false); }
  }
  async function remove(a) {
    if (!await confirm({ title: "Delete this announcement?", body: `“${a.title}” disappears for everyone.`, action: "Delete", danger: true })) return;
    try { await onDelete(a.id); } catch { /* stays; try again */ }
  }

  if (!mounted) return null;
  return (
    <>
      <div className={`ann-scrim${shown ? " is-open" : ""}`} onClick={onClose} aria-hidden="true" />
      <aside className={`labs ann${shown ? " is-open" : ""}`} aria-label="Announcements" aria-hidden={!open}>
        <header className="labs-head">
          <h2 className="labs-title"><BellIcon size={20} /> Announcements</h2>
          <button type="button" className="labs-x btn-press" onClick={onClose} aria-label="Close announcements">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </header>

        <div className="labs-body ann-body">
          {isAdmin && (
            <form className="ann-compose" onSubmit={post}>
              <p className="ann-compose__label">Post an announcement</p>
              <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} placeholder="Title" aria-label="Title" />
              <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={4000} rows={4} placeholder="What’s new" aria-label="Announcement" />
              {err && <p className="ann-compose__err">{err}</p>}
              <div className="ann-compose__acts">
                <span className="ann-compose__hint">Everyone sees this, with a badge on the bell.</span>
                <button type="submit" className="ann-compose__go btn-press" disabled={busy || !title.trim()}>{busy ? "Posting…" : "Post"}</button>
              </div>
            </form>
          )}

          {items.length === 0 ? (
            <p className="ann-empty">No announcements yet. News about Resurface will appear here.</p>
          ) : (
            <ol className="ann-list">
              {items.map(a => {
                const isNew = newSince != null && a.created_at > newSince;
                return (
                  <li key={a.id} className={`ann-item${isNew ? " is-new" : ""}`}>
                    <p className="ann-item__meta">
                      {isNew && <span className="ann-item__new">New</span>}
                      <span>{when(a.created_at)}</span>
                      {isAdmin && <button type="button" className="ann-item__del" onClick={() => remove(a)}>Delete</button>}
                    </p>
                    <h3 className="ann-item__title">{a.title}</h3>
                    {a.body && <Body text={a.body} />}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </aside>
    </>
  );
}
