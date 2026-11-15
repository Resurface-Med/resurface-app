import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Avatar from "./Avatar";
import Popover from "./Popover";
import { useLivePeers, getLiveMe } from "../lib/live";

const SHOWN = 4;
const TOAST_MS = 2800;

/* Initials get a colour of their own, from the name, so a row of people
   reads as people rather than as a row of grey discs. */
function hueOf(name) {
  let h = 0;
  for (const ch of String(name || "")) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

function Face({ p, className }) {
  return <Avatar src={p.avatar} name={p.name} className={`live-face ${className}`} />;
}

/* A photo in a ring that fills with how far through their session they are. */
function Ringed({ p, hue }) {
  const R = 19, L = 2 * Math.PI * R;
  const frac = p.total ? Math.min(1, p.answered / p.total) : 0;
  return (
    <span className="live-ring" style={{ "--h": hue }}>
      <svg className="live-ring__svg" viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r={R} className="live-ring__track" />
        <circle cx="22" cy="22" r={R} className="live-ring__fill"
          style={{ strokeDasharray: L, strokeDashoffset: L * (1 - frac) }} />
      </svg>
      <Face p={p} className="live-strip__avatar" />
    </span>
  );
}

/* Smooth reordering when someone overtakes: each face slides from where it
   was to where it now is, rather than jumping places. */
function useFlip(ref, order) {
  const last = useRef(new Map());
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const next = new Map();
    for (const el of box.querySelectorAll("[data-flip]")) {
      const x = el.offsetLeft, y = el.offsetTop;
      next.set(el.dataset.flip, { x, y });
      const was = last.current.get(el.dataset.flip);
      if (was && (was.x !== x || was.y !== y)) {
        el.animate([{ transform: `translate(${was.x - x}px, ${was.y - y}px)` }, { transform: "none" }],
          { duration: 420, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
      }
    }
    last.current = next;
  }, [order]);
}

/* "You passed Priya" / "Hannah passed you", once in a while: never more than
   one every few seconds, and not twice about the same person in a minute. */
function useOvertakes(peers, mine) {
  const [toast, setToast] = useState(null);
  const prev = useRef({ mine, peers: new Map() });
  const lastShown = useRef(0);
  const perPerson = useRef(new Map());
  useEffect(() => {
    const now = Date.now();
    const was = prev.current;
    let ev = null;
    for (const p of peers) {
      const before = was.peers.get(p.id);
      if (before == null) continue;
      if (now - (perPerson.current.get(p.id) ?? 0) < 60_000) continue;
      if (was.mine <= before && mine > p.answered && mine >= 3) { ev = { kind: "you", p }; break; }
      if (before <= was.mine && p.answered > mine && mine >= 3) ev = ev ?? { kind: "them", p };
    }
    prev.current = { mine, peers: new Map(peers.map(p => [p.id, p.answered])) };
    if (!ev || now - lastShown.current < 6000) return;
    lastShown.current = now;
    perPerson.current.set(ev.p.id, now);
    setToast({ ...ev, at: now });
  }, [peers, mine]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);
  return toast;
}

/* The count, with a +1 that rises off it each time it goes up. */
function Count({ n }) {
  const [bumps, setBumps] = useState([]);
  const was = useRef(n);
  useEffect(() => {
    if (n > was.current) {
      const id = Date.now() + Math.random();
      setBumps(b => [...b, id]);
      setTimeout(() => setBumps(b => b.filter(x => x !== id)), 900);
    }
    was.current = n;
  }, [n]);
  return (
    <span className="live-strip__n">
      <span key={n} className="live-strip__num">{n}</span>
      {bumps.map(id => <span key={id} className="live-strip__plus" aria-hidden="true">+1</span>)}
    </span>
  );
}

/*
 * People from your year doing questions right now, at the top right of a
 * session (2026-11-14). Nothing shows when no one else is on.
 */
export default function LiveStrip({ answered, total, deck, run }) {
  const mine = { answered, total, deck, run };
  const peers = useLivePeers(mine);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const rowRef = useRef(null);
  const shown = peers.slice(0, SHOWN);
  useFlip(rowRef, shown.map(p => p.id).join());
  const toast = useOvertakes(peers, answered);
  if (!peers.length) return null;
  const more = peers.length - shown.length;
  const label = `${peers.length} ${peers.length === 1 ? "person" : "people"} from your year doing questions now`;

  /* You, in the list, in your place. */
  const self = getLiveMe();
  const youRow = { id: "you", name: "You", avatar: self?.avatar ?? null, answered, total, deck, run, you: true, initialsOf: self?.name };
  const board = [...peers, youRow].sort((a, b) => b.answered - a.answered || (a.you ? -1 : b.you ? 1 : 0));

  return (
    <div className="live">
      <button ref={ref} type="button" className={`live-strip btn-press${open ? " is-on" : ""}`}
        onClick={() => setOpen(o => !o)} aria-label={label} title={label} aria-expanded={open}>
        <span className="live-strip__live"><span className="live-dot" aria-hidden="true" />Live</span>
        <span ref={rowRef} className="live-strip__row">
          {shown.map(p => (
            <span key={p.id} data-flip={p.id} className="live-strip__who">
              <Ringed p={p} hue={hueOf(p.name)} />
              <Count n={p.answered} />
            </span>
          ))}
        </span>
        {more > 0 && <span className="live-strip__more">+{more}</span>}
      </button>

      {toast && !open && (
        <div key={toast.at} className={`live-toast${toast.kind === "you" ? " is-you" : ""}`} role="status">
          <span className="live-toast__face" style={{ "--h": hueOf(toast.p.name) }}>
            <Avatar src={toast.p.avatar} name={toast.p.name} className="live-face live-toast__avatar" />
          </span>
          <span className="live-toast__words">
            {toast.kind === "you"
              ? <>You passed <strong>{first(toast.p.name)}</strong></>
              : <><strong>{first(toast.p.name)}</strong> just passed you</>}
          </span>
        </div>
      )}

      <Popover anchorRef={ref} open={open} onClose={() => setOpen(false)} className="live-pop">
        <div className="live-pop__head">
          <span className="live-dot" aria-hidden="true" />
          <span className="live-pop__title">Live now</span>
          <span className="live-pop__sub">{peers.length} from your year</span>
        </div>
        <ol className="live-pop__list">
          {board.map((p, i) => (
            <li key={p.id} className={`live-pop__row${p.you ? " is-you" : ""}`}>
              <span className="live-pop__rank">{i + 1}</span>
              <span className="live-pop__face" style={{ "--h": hueOf(p.initialsOf ?? p.name) }}>
                <Avatar src={p.avatar} name={p.initialsOf ?? p.name} className="live-face live-pop__avatar" />
              </span>
              <span className="live-pop__who">
                <span className="live-pop__name">{p.name}</span>
                <span className="live-pop__meta">
                  {p.deck}
                  {p.run >= 3 && <span className="live-pop__run">{p.run} in a row</span>}
                </span>
              </span>
              <span className="live-pop__n">{p.answered}<span className="live-pop__of">/{p.total || "–"}</span></span>
              <span className="live-pop__bar" aria-hidden="true">
                <span style={{ transform: `scaleX(${p.total ? Math.min(1, p.answered / p.total) : 0})` }} />
              </span>
            </li>
          ))}
        </ol>
      </Popover>
    </div>
  );
}

const first = name => String(name || "").trim().split(/\s+/)[0] || "Someone";
