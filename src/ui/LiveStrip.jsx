import { useRef, useState } from "react";
import { X } from "lucide-react";
import Avatar from "./Avatar";
import Popover from "./Popover";
import { useLivePeers, getLiveMe } from "../lib/live";
import { logStep } from "../lib/remote";

const SHOWN = 4;

/*
 * People doing questions right now, from any year, at the top right of a
 * session (2026-11-14): their photos, each with how many they have answered
 * this session. The list tags each name with their year. Nothing shows when no one else is on. Tapping it lists them;
 * the cross turns it off for good (Settings › Study turns it back on).
 */
export default function LiveStrip({ onDismiss }) {
  const peers = useLivePeers();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  if (!peers.length) return null;
  const shown = peers.slice(0, SHOWN);
  const more = peers.length - shown.length;
  const label = `${peers.length} ${peers.length === 1 ? "person" : "people"} doing questions now`;

  return (
    <div className="live">
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
      {onDismiss && (
        <button type="button" className="live-close btn-press" onClick={() => { logStep(getLiveMe()?.id, "live_close"); onDismiss(); }}
          aria-label="Hide this" title="Hide this. You can turn it back on in Settings.">
          <X size={14} strokeWidth={2.4} aria-hidden="true" />
        </button>
      )}
      <Popover anchorRef={ref} open={open} onClose={() => setOpen(false)} className="live-pop">
        <p className="live-pop__head">Doing questions now</p>
        {peers.map(p => (
          <div key={p.id} className="live-pop__row">
            <Avatar src={p.avatar} name={p.name} className="live-pop__avatar" />
            <span className="live-pop__name">
              {p.name}
              {p.year > 0 && <span className="live-pop__year">Y{p.year}</span>}
            </span>
            <span className="live-pop__n">{p.answered} answered</span>
          </div>
        ))}
      </Popover>
    </div>
  );
}
