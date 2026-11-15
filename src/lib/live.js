import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

/*
 * Who else is doing questions right now (2026-11-14, suggested by a student).
 *
 * Supabase Realtime presence, one channel per study year: nothing is written
 * to the database. Each person in a session joins their year's channel with
 * their name, photo and how many questions they have answered this session.
 * Leaving the session (or closing the tab) takes them off. Someone hidden from
 * the leaderboard still sees others but is never sent.
 *
 * App sets `me` once the profile has loaded; the session reads it.
 *
 * On main from 2026-11-15. Closing the strip turns profiles.show_live off
 * (0085); Settings › Study turns it back on.
 */
let me = null;
export function setLiveMe(next) { me = next; }

/* The preview's demo: `?livedemo` on the dev build fills the strip with made-
   up coursemates who answer a question every few seconds. Never on main. */
const DEMO = (() => {
  if (typeof __PREVIEW_TOOLS__ === "undefined" || !__PREVIEW_TOOLS__ || typeof window === "undefined") return false;
  /* Remembered on the device, because signing in (Google) comes back to the
     plain address and would drop the flag. ?livedemo=0 turns it off. */
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.has("livedemo")) localStorage.setItem("rs_livedemo", q.get("livedemo") === "0" ? "0" : "1");
    return localStorage.getItem("rs_livedemo") === "1";
  } catch { return new URLSearchParams(window.location.search).has("livedemo"); }
})();

const DEMO_PEOPLE = [
  { id: "demo-1", name: "Alfie Elliot", answered: 14 },
  { id: "demo-2", name: "Priya Shah", answered: 31 },
  { id: "demo-3", name: "Jacob Mensah", answered: 6 },
  { id: "demo-4", name: "Hannah Cole", answered: 22 },
  { id: "demo-5", name: "Omar Haddad", answered: 9 },
];

function useDemoPeers() {
  const [peers, setPeers] = useState(() => DEMO_PEOPLE.map(p => ({ ...p, avatar: null })));
  useEffect(() => {
    if (!DEMO) return;
    const t = setInterval(() => {
      setPeers(list => list.map(p => (Math.random() < 0.35 ? { ...p, answered: p.answered + 1 } : p)));
    }, 2500);
    return () => clearInterval(t);
  }, []);
  return DEMO ? peers : null;
}

/** Everyone else in your year's live session channel, most answered first. */
export function useLivePeers(answered) {
  const demo = useDemoPeers();
  const [peers, setPeers] = useState([]);
  const chRef = useRef(null);
  const ready = useRef(false);
  const self = me;
  const answeredRef = useRef(answered);
  answeredRef.current = answered;

  useEffect(() => {
    if (DEMO || !supabase || !self?.id) return;
    const ch = supabase.channel(`practice:y${self.year || 0}`, { config: { presence: { key: self.id } } });
    chRef.current = ch;
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState();
      const list = [];
      for (const [id, metas] of Object.entries(state)) {
        if (id === self.id || !metas?.length) continue;
        /* The same person in two tabs: their busiest one. */
        const m = metas.reduce((a, b) => ((b.answered ?? 0) > (a.answered ?? 0) ? b : a));
        list.push({ id, name: m.name || "Someone", avatar: m.avatar || null, answered: m.answered ?? 0 });
      }
      setPeers(list);
    });
    ch.subscribe(status => {
      if (status !== "SUBSCRIBED") return;
      ready.current = true;
      if (self.show) ch.track({ name: self.name, avatar: self.avatar, answered: answeredRef.current });
    });
    return () => { ready.current = false; chRef.current = null; supabase.removeChannel(ch); };
  }, [self?.id, self?.year, self?.show]);

  useEffect(() => {
    const ch = chRef.current;
    if (!ch || !ready.current || !self?.show) return;
    ch.track({ name: self.name, avatar: self.avatar, answered });
  }, [answered]);

  const list = demo ?? peers;
  return [...list].sort((a, b) => b.answered - a.answered);
}

export function getLiveMe() { return me; }
