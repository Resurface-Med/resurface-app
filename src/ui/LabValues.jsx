import { useEffect, useRef, useState } from "react";
import { LAB_TABS } from "../data/labValues";

/**
 * Lab values, slid in from the right during a session (2026-10-18).
 *
 * Opened by the beaker in the session header. Over the question rather than
 * beside it: the question stays where it is, still answerable on a desktop,
 * and the panel goes the moment it is not wanted (×, Escape, or the beaker
 * again). On a phone it is the whole screen.
 *
 * Three tabs as in the papers' own reference sheets — Haem, Chem, Misc — and
 * a search across all of them, because "what is normal for ALP" is a name
 * you know and a tab you do not. The last tab used is kept for the session.
 */
export const BeakerIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M6 1.75h4M6.5 1.75v4.1L2.6 12.6A1.1 1.1 0 0 0 3.55 14.25h8.9a1.1 1.1 0 0 0 .95-1.65L9.5 5.85v-4.1"
      stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4.3 9.75h7.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const TAB_KEY = "labs-tab";
const savedTab = () => { try { return sessionStorage.getItem(TAB_KEY) || "haem"; } catch { return "haem"; } };

export default function LabValues({ open, onClose }) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [tab, setTab] = useState(savedTab);
  const [query, setQuery] = useState("");
  const bodyRef = useRef(null);

  /* Mounted, then shown a frame later so it slides rather than appears;
     hidden, then unmounted once the slide has finished. */
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
    const onKey = e => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  function pick(id) {
    setTab(id);
    try { sessionStorage.setItem(TAB_KEY, id); } catch { /* this tab only */ }
    bodyRef.current?.scrollTo({ top: 0 });
  }

  if (!mounted) return null;

  const q = query.trim().toLowerCase();
  const hit = (name, value) => !q || name.toLowerCase().includes(q)
    || [].concat(value).some(v => v.toLowerCase().includes(q));
  /* Searching looks through every tab; otherwise, the chosen one. */
  const sections = (q ? LAB_TABS : LAB_TABS.filter(t => t.id === tab))
    .flatMap(t => t.sections)
    .map(s => ({ ...s, rows: s.rows.filter(([n, v]) => hit(n, v)) }))
    .filter(s => s.rows.length);

  return (
    <aside className={`labs${shown ? " is-open" : ""}`} aria-label="Lab values" aria-hidden={!open}>
      <header className="labs-head">
        <h2 className="labs-title"><BeakerIcon size={20} /> Lab values</h2>
        <button type="button" className="labs-x btn-press" onClick={onClose} aria-label="Close lab values">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
      </header>

      <label className="labs-search">
        <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search all values" aria-label="Search lab values" />
      </label>

      {!q && (
        <div className="labs-tabs" role="tablist">
          {LAB_TABS.map(t => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
              className={`labs-tab${tab === t.id ? " is-on" : ""}`} onClick={() => pick(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="labs-body" ref={bodyRef}>
        {sections.length === 0 && <p className="labs-empty">Nothing matches “{query.trim()}”.</p>}
        {sections.map(s => (
          <section key={s.title} className="labs-section">
            <h3 className="labs-section-h">{s.title}</h3>
            <dl className="labs-rows">
              {s.rows.map(([name, value]) => (
                <div key={name} className="labs-row">
                  <dt>{name}</dt>
                  <dd>{[].concat(value).map(v => <span key={v}>{v}</span>)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <p className="labs-note">Reference ranges vary between labs. Use the ones a question gives you if it gives any.</p>
      </div>
    </aside>
  );
}
