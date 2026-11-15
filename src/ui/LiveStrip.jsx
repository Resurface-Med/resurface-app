import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import Avatar from "./Avatar";
import Popover from "./Popover";
import { useLivePeers, getLiveMe } from "../lib/live";
import { logStep } from "../lib/remote";

/*
 * People from your year doing questions right now, as bubbles scattered in
 * the space at the top right of a session (2026-11-15; a straight row of
 * photos before that). The more someone has answered this session, the
 * bigger their bubble; they sit still, packed close (Rafil, 2026-11-15: the
 * drifting, spread-out version was distracting). Nothing shows when no one
 * else is on. Tapping one lists everyone; the cross turns
 * it off for good (Settings › Study turns it back on).
 *
 * Places are fixed, not random, so a bubble never jumps when the list
 * changes: the busiest person takes the first (largest) place, and so on.
 * Each is { x, y } in from the cluster's top right corner, and a size.
 */
const WIDE = [
  { x: 0, y: 6, s: 40 },
  { x: 50, y: 0, s: 36 },
  { x: 96, y: 10, s: 34 },
  { x: 140, y: 2, s: 32 },
  { x: 182, y: 12, s: 30 },
  { x: 222, y: 4, s: 30 },
];
const NARROW = [
  { x: 0, y: 6, s: 36 },
  { x: 46, y: 0, s: 34 },
  { x: 90, y: 10, s: 32 },
  { x: 132, y: 2, s: 30 },
];

function useNarrow() {
  const q = "(max-width: 900px)";
  const [n, setN] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setN(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return n;
}

export default function LiveStrip({ answered, onDismiss }) {
  const peers = useLivePeers(answered);
  const narrow = useNarrow();
  const [open, setOpen] = useState(null);
  const els = useRef(new Map());
  const anchor = useRef(null);
  anchor.current = open ? els.current.get(open) ?? null : null;
  if (!peers.length) return null;
  const places = narrow ? NARROW : WIDE;
  const shown = peers.slice(0, places.length);
  const used = places.slice(0, shown.length);
  const more = peers.length - shown.length;
  const label = `${peers.length} ${peers.length === 1 ? "person" : "people"} from your year doing questions now`;
  const width = Math.max(...used.map(p => p.x + p.s));
  const height = Math.max(...used.map(p => p.y + p.s)) + 10;
  const keep = id => el => { if (el) els.current.set(id, el); else els.current.delete(id); };
  const toggle = id => setOpen(o => (o === id ? null : id));

  return (
    <div className={`live-bubbles${narrow ? " is-narrow" : ""}`} style={{ width, height }} role="group" aria-label={label}>
      {shown.map((p, i) => {
        const at = places[i];
        return (
          <button key={p.id} ref={keep(p.id)} type="button"
            className={`live-bubble btn-press${open === p.id ? " is-on" : ""}`}
            style={{
              right: at.x, top: at.y, width: at.s, height: at.s,
              fontSize: Math.round(at.s * 0.28),
              "--in": `${i * 60}ms`,
            }}
            onClick={() => toggle(p.id)}
            aria-label={`${p.name}, ${p.answered} answered`} title={`${p.name} · ${p.answered} answered`}>
            <span className="live-bubble__float">
              <Avatar src={p.avatar} name={p.name} className="live-bubble__face" />
              <span key={p.answered} className="live-bubble__n">{p.answered}</span>
            </span>
          </button>
        );
      })}
      {more > 0 && (
        <button type="button" ref={keep("more")} className="live-bubble__more btn-press"
          style={{ right: width + 4, top: 14 }} onClick={() => toggle("more")} aria-label={label}>
          +{more}
        </button>
      )}
      {onDismiss && (
        <button type="button" className="live-close btn-press"
          onClick={() => { logStep(getLiveMe()?.id, "live_close"); onDismiss(); }}
          aria-label="Hide this" title="Hide this. You can turn it back on in Settings.">
          <X size={13} strokeWidth={2.4} aria-hidden="true" />
        </button>
      )}
      <Popover anchorRef={anchor} open={Boolean(open && anchor.current)} onClose={() => setOpen(null)} className="live-pop">
        <p className="live-pop__head">Doing questions now</p>
        {peers.map(p => (
          <div key={p.id} className="live-pop__row">
            <Avatar src={p.avatar} name={p.name} className="live-pop__avatar" />
            <span className="live-pop__name">{p.name}</span>
            <span className="live-pop__n">{p.answered} answered</span>
          </div>
        ))}
      </Popover>
    </div>
  );
}
