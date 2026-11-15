import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

/*
 * Who else is doing questions right now (2026-11-14, suggested by a student).
 *
 * Supabase Realtime presence, one channel per study year: nothing is written
 * to the database. Each person in a session joins their year's channel with
 * their name, photo, the deck they are on, how far through the session they
 * are and how many they have right in a row. Leaving the session (or closing
 * the tab) takes them off. Someone hidden from the leaderboard still sees
 * others but is never sent.
 *
 * App sets `me` once the profile has loaded; the session reads it.
 */
let me = null;
export function setLiveMe(next) { me = next; }
export function getLiveMe() { return me; }

/* The preview's demo: `?livedemo` on the dev build fills the strip with made-
   up coursemates who answer at their own pace, close enough to you that you
   pass each other. Never on main. */
export const LIVE_DEMO = typeof __PREVIEW_TOOLS__ !== "undefined" && __PREVIEW_TOOLS__
  && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("livedemo");

const DEMO_PEOPLE = [
  { id: "demo-1", name: "Priya Shah", answered: 9, total: 40, deck: "Renal", run: 4, pace: 0.5 },
  { id: "demo-2", name: "Hannah Cole", answered: 6, total: 30, deck: "Cardiology", run: 1, pace: 0.4 },
  { id: "demo-3", name: "Alfie Elliot", answered: 4, total: 20, deck: "Renal", run: 0, pace: 0.33 },
  { id: "demo-4", name: "Omar Haddad", answered: 2, total: 50, deck: "Respiratory", run: 2, pace: 0.28 },
  { id: "demo-5", name: "Jacob Mensah", answered: 1, total: 25, deck: "Gastrointestinal", run: 0, pace: 0.22 },
];

function useDemoPeers() {
  const [peers, setPeers] = useState(() => DEMO_PEOPLE.map(p => ({ ...p, avatar: null })));
  useEffect(() => {
    if (!LIVE_DEMO) return;
    const t = setInterval(() => {
      setPeers(list => list.map(p => {
        if (p.answered >= p.total || Math.random() > p.pace * 0.35) return p;
        const right = Math.random() < 0.72;
        return { ...p, answered: p.answered + 1, run: right ? p.run + 1 : 0 };
      }));
    }, 1000);
    return () => clearInterval(t);
  }, []);
  return LIVE_DEMO ? peers : null;
}

/**
 * Everyone else in your year's live session channel, most answered first.
 * `mine` is what you send: { answered, total, deck, run }.
 */
export function useLivePeers(mine) {
  const demo = useDemoPeers();
  const [peers, setPeers] = useState([]);
  const chRef = useRef(null);
  const ready = useRef(false);
  const self = me;
  const mineRef = useRef(mine);
  mineRef.current = mine;
  const payload = () => ({ name: self.name, avatar: self.avatar, ...mineRef.current });

  useEffect(() => {
    if (LIVE_DEMO || !supabase || !self?.id) return;
    const ch = supabase.channel(`practice:y${self.year || 0}`, { config: { presence: { key: self.id } } });
    chRef.current = ch;
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState();
      const list = [];
      for (const [id, metas] of Object.entries(state)) {
        if (id === self.id || !metas?.length) continue;
        /* The same person in two tabs: their busiest one. */
        const m = metas.reduce((a, b) => ((b.answered ?? 0) > (a.answered ?? 0) ? b : a));
        list.push({
          id, name: m.name || "Someone", avatar: m.avatar || null,
          answered: m.answered ?? 0, total: m.total ?? 0, deck: m.deck || "", run: m.run ?? 0,
        });
      }
      setPeers(list);
    });
    ch.subscribe(status => {
      if (status !== "SUBSCRIBED") return;
      ready.current = true;
      if (self.show) ch.track(payload());
    });
    return () => { ready.current = false; chRef.current = null; supabase.removeChannel(ch); };
  }, [self?.id, self?.year, self?.show]);

  useEffect(() => {
    const ch = chRef.current;
    if (!ch || !ready.current || !self?.show) return;
    ch.track(payload());
  }, [mine.answered, mine.total, mine.deck, mine.run]);

  const list = demo ?? peers;
  return [...list].sort((a, b) => b.answered - a.answered || a.name.localeCompare(b.name));
}
