import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

/*
 * Who else is doing questions right now (2026-11-14, suggested by a student).
 *
 * Supabase Realtime presence, one channel for everyone (per study year until
 * 2026-11-15, which left it nearly always empty): nothing is written to the
 * database. Each person in a session joins with their name, photo, year and
 * how many questions they have answered this session.
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
const DEMO = typeof __PREVIEW_TOOLS__ !== "undefined" && __PREVIEW_TOOLS__
  && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("livedemo");

const DEMO_PEOPLE = [
  { id: "demo-1", name: "Alfie Elliot", answered: 14, year: 2 },
  { id: "demo-2", name: "Priya Shah", answered: 31, year: 1 },
  { id: "demo-3", name: "Jacob Mensah", answered: 6, year: 2 },
  { id: "demo-4", name: "Hannah Cole", answered: 22, year: 1 },
  { id: "demo-5", name: "Omar Haddad", answered: 9, year: 2 },
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

/** Everyone else in a session right now, any year, most answered first. */
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
    /* One channel for every year (2026-11-15): split by year it was nearly
       always empty. Each person's year travels with them for the list. */
    const ch = supabase.channel("practice:all", { config: { presence: { key: self.id } } });
    chRef.current = ch;
    /* Until everyone has reloaded, people on the version before 2026-11-15
       are still on the per-year channels. Listen to those too, without
       joining them, and take their year from the channel's name. */
    const legacy = [0, 1, 2, 3, 4, 5].map(y => ({ y, ch: supabase.channel(`practice:y${y}`) }));
    const sync = () => {
      const byId = new Map();
      const add = (state, year) => {
        for (const [id, metas] of Object.entries(state)) {
          if (id === self.id || !metas?.length) continue;
          /* The same person in two tabs: their busiest one. */
          const m = metas.reduce((a, b) => ((b.answered ?? 0) > (a.answered ?? 0) ? b : a));
          const p = { id, name: m.name || "Someone", avatar: m.avatar || null, answered: m.answered ?? 0, year: m.year ?? year };
          const had = byId.get(id);
          if (!had || p.answered > had.answered) byId.set(id, p);
        }
      };
      add(ch.presenceState(), null);
      for (const l of legacy) add(l.ch.presenceState(), l.y || null);
      setPeers([...byId.values()]);
    };
    ch.on("presence", { event: "sync" }, sync);
    for (const l of legacy) { l.ch.on("presence", { event: "sync" }, sync); l.ch.subscribe(); }
    ch.subscribe(status => {
      if (status !== "SUBSCRIBED") return;
      ready.current = true;
      if (self.show) ch.track({ name: self.name, avatar: self.avatar, year: self.year || null, answered: answeredRef.current });
    });
    return () => {
      ready.current = false; chRef.current = null;
      supabase.removeChannel(ch);
      for (const l of legacy) supabase.removeChannel(l.ch);
    };
  }, [self?.id, self?.show]);

  useEffect(() => {
    const ch = chRef.current;
    if (!ch || !ready.current || !self?.show) return;
    ch.track({ name: self.name, avatar: self.avatar, year: self.year || null, answered });
  }, [answered]);

  const list = demo ?? peers;
  return [...list].sort((a, b) => b.answered - a.answered);
}

export function getLiveMe() { return me; }
