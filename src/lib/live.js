import { useEffect, useState, useSyncExternalStore } from "react";
import { supabase } from "./supabase";
import { avatarSrc } from "./avatar";

/*
 * Who else is doing questions right now (2026-11-14, suggested by a student).
 *
 * Read from the answers themselves (live_now, migration 0087), not from
 * Realtime presence (2026-11-17). Presence only showed someone whose own app
 * reported them: an app left open from before an update, or one whose
 * connection dropped and never rejoined, answered all evening and never
 * appeared. Every version of the app saves its answers, and the server times
 * them, so a wrong phone clock can't hide anyone either.
 *
 * Live means an answer in the last ten minutes; the count is the answers
 * since the last gap of more than ten. Anyone hidden from the leaderboard is
 * never listed (but still sees others). The list is asked for every 15
 * seconds while the strip is on screen and the tab is visible, and at once
 * when the tab comes back or the connection returns.
 */
const EVERY_MS = 15_000;
const STALE_MS = 2 * 60_000;     // no answer from the server this long: show no one
const TIMEOUT_MS = 10_000;

let me = null;
let peers = [];
let lastOk = 0;
let timer = null;
let inFlight = false;
const subs = new Set();
const emit = () => subs.forEach(fn => fn());

export function getLiveMe() { return me; }

function setPeers(next) {
  const same = next.length === peers.length && next.every((p, i) =>
    p.id === peers[i].id && p.answered === peers[i].answered && p.avatar === peers[i].avatar && p.name === peers[i].name);
  if (same) return;
  peers = next;
  emit();
}

async function poll() {
  if (inFlight || !supabase || !me?.id || !subs.size) return;
  if (typeof document !== "undefined" && document.hidden) return;
  inFlight = true;
  const asked = me.id;
  try {
    let q = supabase.rpc("live_now");
    if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) q = q.abortSignal(AbortSignal.timeout(TIMEOUT_MS));
    const { data, error } = await q;
    if (error) throw error;
    if (me?.id !== asked) return;     // signed out or switched account meanwhile
    lastOk = Date.now();
    setPeers((data ?? []).map(r => ({
      id: r.user_id,
      name: r.display_name || "Someone",
      avatar: avatarSrc(r.user_id, r.avatar),
      answered: r.answered ?? 0,
      year: r.study_year ?? 0,
    })));
  } catch {
    if (Date.now() - lastOk > STALE_MS) setPeers([]);
  } finally {
    inFlight = false;
  }
}

function start() {
  if (timer) return;
  timer = setInterval(poll, EVERY_MS);
  poll();
}

function stop() {
  clearInterval(timer);
  timer = null;
}

if (typeof window !== "undefined") {
  document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });
  window.addEventListener("online", poll);
}

/** Who you are; set by App on every render, so only a change of account matters. */
export function setLiveMe(next) {
  const changed = (next?.id ?? null) !== (me?.id ?? null);
  me = next;
  if (!changed) return;
  lastOk = 0;
  setPeers([]);
  poll();
}

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

function subscribe(fn) {
  subs.add(fn);
  start();
  return () => {
    subs.delete(fn);
    if (!subs.size) stop();
  };
}

/** Everyone else live right now, any year, most answered first. */
export function useLivePeers() {
  const demo = useDemoPeers();
  const live = useSyncExternalStore(subscribe, () => peers);
  return demo ? [...demo].sort((a, b) => b.answered - a.answered) : live;
}
