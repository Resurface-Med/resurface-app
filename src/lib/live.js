import { useEffect, useState, useSyncExternalStore } from "react";
import { supabase } from "./supabase";

/*
 * Who else is doing questions right now (2026-11-14, suggested by a student).
 *
 * Supabase Realtime presence, one channel for everyone (per study year until
 * 2026-11-15, which left it nearly always empty): nothing is written to the
 * database. Each person shows with their name, photo, year and how many
 * questions they have answered in this sitting.
 *
 * Live means answering, not being on the question screen (2026-11-15):
 * people do ten questions, look at their results, start another set, and
 * counting only the question screen made everyone flicker off between sets.
 * So your first answer puts you on, and you stay on until ten minutes after
 * your last, as long as the app is open. A gap of more than ten minutes
 * starts a new sitting and the count from zero. Someone hidden from the
 * leaderboard still sees others but is never sent.
 *
 * App sets `me` once the profile has loaded (and connects); remote.answer
 * calls noteAnswer. Closing the strip turns profiles.show_live off (0085);
 * Settings › Study turns it back on — that only hides the strip, it does not
 * stop you being shown to others.
 */
const IDLE_MS = 10 * 60_000;
const CHANNEL = "practice:all";

let me = null;
let ch = null;
let chFor = null;
let joined = false;
let legacy = [];
let peers = [];
let sitting = { count: 0, last: 0 };
let leaveTimer = null;
const subs = new Set();
const emit = () => subs.forEach(fn => fn());

export function getLiveMe() { return me; }

const active = () => sitting.count > 0 && Date.now() - sitting.last < IDLE_MS;

function track() {
  if (!ch || !joined || !me?.show || !active()) return;
  ch.track({ name: me.name, avatar: me.avatar, year: me.year || null, answered: sitting.count, at: sitting.last });
}

function untrack() {
  if (ch && joined) ch.untrack();
}

/* Everyone on the channel bar you, plus anyone still on the version before
   2026-11-15's, who sit on the old per-year channels (listened to, never
   joined). Anyone whose last answer is over ten minutes old is left out, in
   case their app never said they had gone. */
function collect() {
  const now = Date.now();
  const byId = new Map();
  const add = (state, year) => {
    for (const [id, metas] of Object.entries(state || {})) {
      if (id === me?.id || !metas?.length) continue;
      /* The same person in two tabs: their busiest one. */
      const m = metas.reduce((a, b) => ((b.answered ?? 0) > (a.answered ?? 0) ? b : a));
      if (m.at && now - m.at > IDLE_MS + 60_000) continue;
      const p = { id, name: m.name || "Someone", avatar: m.avatar || null, answered: m.answered ?? 0, year: m.year ?? year };
      const had = byId.get(id);
      if (!had || p.answered > had.answered) byId.set(id, p);
    }
  };
  if (ch) add(ch.presenceState(), null);
  for (const l of legacy) add(l.ch.presenceState(), l.y || null);
  peers = [...byId.values()];
  emit();
}

function disconnect() {
  if (ch) supabase.removeChannel(ch);
  for (const l of legacy) supabase.removeChannel(l.ch);
  ch = null; legacy = []; joined = false; peers = []; chFor = null;
  emit();
}

function connect(id) {
  disconnect();
  if (!supabase || !id) return;
  chFor = id;
  ch = supabase.channel(CHANNEL, { config: { presence: { key: id } } });
  ch.on("presence", { event: "sync" }, collect);
  legacy = [0, 1, 2, 3, 4, 5].map(y => ({ y, ch: supabase.channel(`practice:y${y}`) }));
  for (const l of legacy) { l.ch.on("presence", { event: "sync" }, collect); l.ch.subscribe(); }
  /* Fires again after a dropped connection comes back (a phone waking),
     which is when you need putting back on. */
  ch.subscribe(status => {
    joined = status === "SUBSCRIBED";
    if (joined) track();
  });
}

/** Who you are; set by App on every render, so only a change of account reconnects. */
export function setLiveMe(next) {
  me = next;
  if (DEMO) return;
  const id = next?.id ?? null;
  if (id !== chFor) connect(id);
}

/** Called for every answer you give (lib/remote). */
export function noteAnswer() {
  if (!me) return;
  const now = Date.now();
  if (now - sitting.last > IDLE_MS) sitting = { count: 0, last: 0 };
  sitting = { count: sitting.count + 1, last: now };
  track();
  clearTimeout(leaveTimer);
  leaveTimer = setTimeout(untrack, IDLE_MS);
}

/* Drop anyone gone quiet even if no presence event comes. */
if (typeof window !== "undefined") setInterval(() => { if (ch) collect(); }, 60_000);

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

/** Everyone else live right now, any year, most answered first. */
export function useLivePeers() {
  const demo = useDemoPeers();
  const live = useSyncExternalStore(fn => { subs.add(fn); return () => subs.delete(fn); }, () => peers);
  const list = demo ?? live;
  return [...list].sort((a, b) => b.answered - a.answered);
}
