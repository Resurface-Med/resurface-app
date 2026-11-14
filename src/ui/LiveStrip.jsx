import { useRef, useState } from "react";
import Avatar from "./Avatar";
import Popover from "./Popover";
import { useLivePeers } from "../lib/live";

const SHOWN = 4;

/*
 * People from your year doing questions right now, at the top right of a
 * session (2026-11-14): their photos, each with how many they have answered
 * this session. Nothing shows when no one else is on. Tapping it lists them.
 */
export default function LiveStrip({ answered }) {
  const peers = useLivePeers(answered);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  if (!peers.length) return null;
  const shown = peers.slice(0, SHOWN);
  const more = peers.length - shown.length;
  const label = `${peers.length} ${peers.length === 1 ? "person" : "people"} from your year doing questions now`;

  return (
    <>
      <button ref={ref} type="button" className={`live-strip btn-press${open ? " is-on" : ""}`}
        onClick={() => setOpen(o => !o)} aria-label={label} title={label} aria-expanded={open}>
        {shown.map(p => (
          <span key={p.id} className="live-strip__who">
            <Avatar src={p.avatar} name={p.name} className="live-strip__avatar" />
            <span key={p.answered} className="live-strip__n">{p.answered}</span>
          </span>
        ))}
        {more > 0 && <span className="live-strip__more">+{more}</span>}
      </button>
      <Popover anchorRef={ref} open={open} onClose={() => setOpen(false)} className="live-pop">
        <p className="live-pop__head">Doing questions now</p>
        {peers.map(p => (
          <div key={p.id} className="live-pop__row">
            <Avatar src={p.avatar} name={p.name} className="live-pop__avatar" />
            <span className="live-pop__name">{p.name}</span>
            <span className="live-pop__n">{p.answered} answered</span>
          </div>
        ))}
      </Popover>
    </>
  );
}
