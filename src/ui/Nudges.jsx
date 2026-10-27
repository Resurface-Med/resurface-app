import { useEffect, useRef, useState } from "react";
import StreakFlame from "./StreakFlame";
import Avatar from "./Avatar";
import { avatarSrc } from "../lib/avatar";
import { fetchLeaderboardWeek, fetchMyRecentAnswers, logStep } from "../lib/remote";
import { improvement } from "../lib/firstRun";
import { QUESTIONS } from "../data";
import { todayKey, yesterdayKey } from "../lib/storage";

/**
 * The nudges (2026-10-26): a streak to keep, a place on the leaderboard to
 * take, and Resurface to pass on. Each a card in the corner, bigger than
 * the update bar and drawn its own way, with one button and a way out.
 *
 * At most one a visit: whichever is due first takes the slot, and the
 * others wait. Never on top of the update bar or during a session.
 *
 *   Streak       on opening the app, a streak of 2+ that today hasn't kept
 *                yet; once a day.
 *   Leaderboard  after a session, someone with a year on the board; once a
 *                day.
 *   Milestone    after a session that passes 100, 250, 500, 1,000, 2,500 or
 *                5,000 questions answered; each once. Goes before the others.
 *   Improving    after a session, a deck 10+ points better now than their
 *                first 15 answers on it; every 5 days at most, and a deck
 *                again only after another 10 points.
 *   Home Screen  after a session, on a phone browser, from the 2nd study
 *                day; back after 5 days, gone after 3 or once added.
 *   Invite       after a session, someone who has studied on 2+ days; back
 *                5 days after a ✕, gone after 3; 21 days after a share.
 */
const DAY = 864e5;
const INVITE_LINK = "https://app.tryresurface.com/?ref=invite";
const ordinal = n => `${n}${["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) ? 0 : (n % 10 < 4 ? n % 10 : 0)] || "th"}`;
const first = name => String(name || "").trim().split(/\s+/)[0] || "someone";

/* Remembered per account on this device. */
const store = {
  get(uid, k) { try { return JSON.parse(localStorage.getItem(`nudge:${k}:${uid}`)) ?? {}; } catch { return {}; } },
  set(uid, k, v) { try { localStorage.setItem(`nudge:${k}:${uid}`, JSON.stringify(v)); } catch { /* fine */ } },
};

/* ── The card ─────────────────────────────────────────────────────── */

export function NudgeCard({ kind, art, title, body, action, onAction, onClose, inline = false, later = true }) {
  return (
    <div className={`nudge is-${kind}${inline ? " is-inline" : ""}`} role="dialog" aria-live="polite" aria-label={title}>
      <button type="button" className="nudge__x" onClick={onClose} aria-label="Close">
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
      </button>
      <div className="nudge__art">{art}</div>
      <div className="nudge__text">
        <p className="nudge__title">{title}</p>
        {body && <p className="nudge__body">{body}</p>}
        <div className="nudge__acts">
          <button type="button" className="nudge__go btn-press" onClick={onAction}>{action}</button>
          {later && <button type="button" className="nudge__later" onClick={onClose}>Not now</button>}
        </div>
      </div>
    </div>
  );
}

export function StreakNudge({ days, onAction, onClose, inline }) {
  return (
    <NudgeCard kind="streak" inline={inline}
      art={<span className="nudge-streak"><StreakFlame days={days} size={58} /></span>}
      title={`You’re on a ${days}-day streak, don’t lose it!`}
      action="Start studying" onAction={onAction} onClose={onClose} />
  );
}

/* Count up to `n` once, quickly, easing out. */
function useCountUp(n, ms = 900, delay = 350) {
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [v, setV] = useState(reduce ? n : 0);
  useEffect(() => {
    if (reduce) return;
    let raf, t0;
    const step = t => {
      t0 ??= t;
      const k = Math.min(1, Math.max(0, (t - t0 - delay) / ms));
      setV(Math.round(n * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [n]); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

/* A mini leaderboard: the person ahead, you, the person behind, sliding in
   one after another with their counts ticking up, your row marked. The
   line under it says what it takes to move up. */
function BoardRow({ r, me, i, delay }) {
  const n = useCountUp(Number(r.week_count) || 0, 800, delay + 150);
  return (
    <li className={`nudge-board__row${me ? " is-me" : ""}`} style={{ "--d": `${delay}ms` }}>
      <span className="nudge-board__rank">{ordinal(Number(r.rank) || i)}</span>
      <Avatar className="nudge-board__av" src={avatarSrc(r.user_id, r.avatar) || r.src} name={r.display_name} />
      <span className="nudge-board__name">{me ? "You" : first(r.display_name)}</span>
      <span className="nudge-board__n">{n.toLocaleString("en-GB")}</span>
    </li>
  );
}

export function LeaderNudge({ me, rival, rank, around = null, onAction, onClose, inline }) {
  const top = rank === 1;
  const gap = rival ? Math.abs(rival.week_count - me.week_count) : 0;
  const name = rival ? first(rival.display_name) : "";
  const rows = (around && around.length ? around : (top ? [me, rival] : [rival, me]).filter(Boolean))
    .map(r => ({ ...r, rank: r.rank ?? (r === me ? rank : r === rival ? (top ? 2 : rank - 1) : null) }));
  const title = !rival ? `You’re ${ordinal(rank)} on the leaderboard!`
    : top ? `You’re 1st on the leaderboard, ${gap} ahead of ${name}!`
    : `You’re ${ordinal(rank)} on the leaderboard, ${gap + 1} more to pass ${name}!`;
  return (
    <NudgeCard kind="leader" inline={inline}
      art={
        <ol className="nudge-board" aria-hidden="true">
          {rows.map((r, i) => <BoardRow key={r.user_id} r={r} me={r.user_id === me.user_id} i={rank - rows.findIndex(x => x.user_id === me.user_id) + i} delay={120 + i * 110} />)}
        </ol>
      }
      title={title}
      action="Keep going" onAction={onAction} onClose={onClose} />
  );
}

/* Milestones (2026-10-26): the number, big, counting up, with a deadpan
   line under it. No share button, on purpose. */
export const MILESTONES = [
  [100, "100 down. Only the entire curriculum to go."],
  [250, "Your Anki deck is getting nervous."],
  [500, "At this point you’re basically the question bank."],
  [1000, "Your consultant would be proud. Probably."],
  [2500, "We’re running out of things to say."],
  [5000, "Go outside. Then come back."],
];
/* Confetti: pieces burst out from behind the number once the count lands,
   then fall and fade. Fixed shapes and angles, so it looks the same every
   time and never covers the line. */
const CONFETTI = [...Array(22)].map((_, i) => ({
  a: (i / 22) * 360 + (i % 3) * 7,
  r: 70 + (i % 4) * 18,
  c: ["#3562f5", "#ff8a2a", "#ffd23f", "#22c55e", "#a855f7", "#ef4444"][i % 6],
  w: i % 3 === 0 ? 10 : 6, h: i % 3 === 0 ? 4 : 8,
  spin: (i % 2 ? 1 : -1) * (180 + (i % 5) * 60),
}));

export function MilestoneNudge({ n, onAction, onClose, inline }) {
  const shown = useCountUp(n, 1000, 200);
  const line = (MILESTONES.find(([m]) => m === n) ?? [n, "Keep going."])[1];
  return (
    <NudgeCard kind="milestone" inline={inline}
      art={
        <span className="nudge-mile" aria-hidden="true">
          <span className="nudge-mile__burst">
            {CONFETTI.map((p, i) => (
              <span key={i} className="nudge-mile__bit" style={{
                "--x": `${Math.cos((p.a * Math.PI) / 180) * p.r}px`, "--y": `${Math.sin((p.a * Math.PI) / 180) * p.r * 0.6}px`,
                "--spin": `${p.spin}deg`, "--c": p.c, width: p.w, height: p.h,
              }} />
            ))}
          </span>
          <span className="nudge-mile__n">{shown.toLocaleString("en-GB")}</span>
          <span className="nudge-mile__label">questions answered</span>
        </span>
      }
      title={line}
      action="Keep going" onAction={onAction} onClose={onClose} />
  );
}

/* Getting better (2026-10-26): where they started on a deck and where they
   are now, the second number climbing from the first. */
export function ImproveNudge({ deck, before, after, onAction, onClose, inline }) {
  const now = useCountUp(after - before, 1000, 550);
  return (
    <NudgeCard kind="improve" inline={inline}
      art={
        <span className="nudge-up" aria-hidden="true">
          <span className="nudge-up__col is-was"><span className="nudge-up__n">{before}%</span><span className="nudge-up__cap">when you started</span></span>
          <svg className="nudge-up__arrow" viewBox="0 0 40 16"><path d="M2 8 H34 M27 2 L35 8 L27 14" /></svg>
          <span className="nudge-up__col is-now"><span className="nudge-up__n">{before + now}%</span><span className="nudge-up__cap">now</span></span>
        </span>
      }
      title={`You’re getting better at ${deck}.`}
      action="Keep going" onAction={onAction} onClose={onClose} />
  );
}

/* Add to Home Screen (2026-10-26). A phone's Home Screen with a gap, and
   the Resurface icon dropping into it. Android and Chrome can install in
   one tap; iPhone can't be asked to, so it shows the two steps. Inside an
   app's own browser (Instagram, WhatsApp…) neither works, so it says to
   open the link in the real browser first. */
let installEvent = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvent = e; });
}
const ua = () => (typeof navigator === "undefined" ? "" : navigator.userAgent);
const isIOSDevice = () => /iPad|iPhone|iPod/.test(ua()) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const inAppBrowser = () => /Instagram|FBAN|FBAV|Snapchat|Line\/|TikTok|LinkedInApp/i.test(ua());
export const isInstalled = () => window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
export const onPhone = () => /iPhone|iPod|Android.*Mobile|Mobile.*Android/i.test(ua()) || (isIOSDevice() && window.matchMedia?.("(pointer: coarse)").matches);

export function HomeScreenNudge({ onDone, onClose, inline, forceKind = null }) {
  const kind = forceKind ?? (inAppBrowser() ? "inapp" : installEvent ? "prompt" : isIOSDevice() ? "ios" : "android");
  const steps = {
    ios: <>Tap <ShareGlyph /> <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</>,
    android: <>Tap the <strong>⋮</strong> menu, then <strong>Add to Home screen</strong>.</>,
    inapp: <>Open this page in {isIOSDevice() ? "Safari" : "Chrome"} first: tap <strong>⋯</strong> and choose <strong>Open in browser</strong>.</>,
  };
  return (
    <NudgeCard kind="home" inline={inline}
      art={
        <span className="nudge-phone" aria-hidden="true">
          <span className="nudge-phone__grid">
            {[...Array(6)].map((_, i) => i === 3
              ? <img key={i} className="nudge-phone__app" src="/icon-192.png" alt="" />
              : <span key={i} className="nudge-phone__tile" />)}
          </span>
        </span>
      }
      title="Put Resurface on your Home Screen"
      body={kind === "prompt" ? "It opens like an app, full screen, one tap away." : steps[kind]}
      action={kind === "prompt" ? "Add to Home Screen" : "Got it"}
      onAction={async () => {
        if (kind === "prompt" && installEvent) {
          const ev = installEvent; installEvent = null;
          try { await ev.prompt(); const { outcome } = await ev.userChoice; onDone(outcome === "accepted" ? "added" : "later"); }
          catch { onDone("later"); }
          return;
        }
        onDone("shown");
      }}
      onClose={onClose} />
  );
}
function ShareGlyph() {
  return (
    <svg className="nudge-share-glyph" width="14" height="16" viewBox="0 0 14 16" aria-hidden="true">
      <path d="M7 1v9M3.5 4.5L7 1l3.5 3.5M2 7.5v6.5h10V7.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* You, then two empty places beside you that draw themselves in: the
   picture is the ask. Plays once; nothing loops. */
export function InviteNudge({ me = null, onAction, onClose, copied, inline }) {
  return (
    <NudgeCard kind="invite" inline={inline}
      art={
        <span className="nudge-invite" aria-hidden="true">
          <Avatar className="nudge-invite__me" src={me?.src} name={me?.name || "You"} />
          {[0, 1].map(i => (
            <svg key={i} className="nudge-invite__seat" style={{ "--d": `${260 + i * 160}ms` }} viewBox="0 0 44 44">
              <circle cx="22" cy="22" r="20" pathLength="100" />
              <path d="M22 15v14M15 22h14" />
            </svg>
          ))}
        </span>
      }
      title={copied ? "Link copied. Paste it to your friends." : "Resurface is better with your friends on it."}
      action={copied ? "Copied" : "Share Resurface"} onAction={onAction} onClose={onClose} />
  );
}

/* ── Drafts (2026-10-27): designed, not wired to anything yet ──────── */

/* Day 1: a grey flame catching light at the end of someone's first session. */
export function DayOneNudge({ onAction, onClose, inline }) {
  return (
    <NudgeCard kind="dayone" inline={inline}
      art={<span className="nudge-streak nudge-ignite"><StreakFlame days={1} size={58} /></span>}
      title="You started a streak, don’t lose it!"
      action="I’ll be back tomorrow" onAction={onAction} onClose={onClose} later={false} />
  );
}

/* Combo: the run of right answers, as a white pill in the top right of
   the question area, under the wave — out of the header, so the progress
   bar and the tools keep their row (Rafil, 2026-10-27). Shown from 3; a
   wrong answer clears it. The number pops each time it goes up. */
/* A green tick that draws itself, again each time the number goes up (it
   is keyed on the number): the circle pops, then the stroke draws in one
   go. Green already means right in this app, so it needs no explaining.
   A target was tried first and dropped (Rafil, 2026-10-27); the flame stays
   the daily streak's alone. */
const Tick = () => (
  <svg className="combo__tick" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
    <circle className="combo__disc" cx="11" cy="11" r="11" />
    <path className="combo__check" d="M6.4 11.4l3.1 3.1 6.1-6.4" pathLength="1" />
  </svg>
);
export function ComboMark({ n }) {
  if (n < 3) return null;
  return (
    <span className="combo" role="status" aria-label={`${n} right in a row`}>
      <Tick key={`t${n}`} />
      <span key={n} className="combo__n">{n}</span>
      <span className="combo__words">right in a row</span>
    </span>
  );
}

/* For Admin: the session header as it is, with buttons to answer. */
export function ComboPreview() {
  const [run, setRun] = useState(5);
  const answer = right => setRun(r => (right ? r + 1 : 0));
  return (
    <div className="combo-demo">
      <div className="combo-demo__stage">
        <ComboMark n={run} />
        <span className="combo-demo__card" />
      </div>
      <div className="combo-demo__btns">
        <button type="button" className="pp-show btn-press" onClick={() => answer(true)}>Get one right</button>
        <button type="button" className="pp-show btn-press" onClick={() => answer(false)}>Get one wrong</button>
      </div>
    </div>
  );
}

/* Passed someone: two rows, and yours sliding up over theirs. */
export function PassedNudge({ me, them, rank, onAction, onClose, inline }) {
  const name = first(them.display_name);
  return (
    <NudgeCard kind="passed" inline={inline}
      art={
        <ol className="nudge-pass" aria-hidden="true">
          <li className="nudge-pass__row is-me">
            <span className="nudge-board__rank">{ordinal(rank)}</span>
            <Avatar className="nudge-board__av" src={avatarSrc(me.user_id, me.avatar) || me.src} name={me.display_name} />
            <span className="nudge-board__name">You</span>
            <span className="nudge-board__n">{Number(me.week_count).toLocaleString("en-GB")}</span>
          </li>
          <li className="nudge-pass__row is-them">
            <span className="nudge-board__rank">{ordinal(rank + 1)}</span>
            <Avatar className="nudge-board__av" src={avatarSrc(them.user_id, them.avatar)} name={them.display_name} />
            <span className="nudge-board__name">{name}</span>
            <span className="nudge-board__n">{Number(them.week_count).toLocaleString("en-GB")}</span>
          </li>
        </ol>
      }
      title={`You just passed ${name}. You’re ${ordinal(rank)} now.`}
      action="Keep going" onAction={onAction} onClose={onClose} />
  );
}

/* Personal best: today's count climbing past the old best. */
export function BestNudge({ today, best, onAction, onClose, inline }) {
  const n = useCountUp(today, 1100, 250);
  const beat = n > best;
  return (
    <NudgeCard kind="best" inline={inline}
      art={
        <span className="nudge-best" aria-hidden="true">
          <span className={`nudge-best__n${beat ? " is-beat" : ""}`}>{n}</span>
          <span className="nudge-best__bars">
            <span className="nudge-best__bar is-old" style={{ "--w": `${(best / Math.max(today, best)) * 100}%` }}><em>Old best {best}</em></span>
            <span className="nudge-best__bar is-new" style={{ "--w": "100%" }}><em>Today</em></span>
          </span>
        </span>
      }
      title={`New personal best: ${today} questions in a day.`}
      action="Keep going" onAction={onAction} onClose={onClose} />
  );
}

/* ── Admin previews ───────────────────────────────────────────────
   "Show" in Admin > Popups puts a card up for real. It lives here, above
   every page, so it stays while you move between tabs, until you close it
   or press one of its buttons. */
let previewNow = null;
const previewers = new Set();
export function showPreview(p) { previewNow = p; previewers.forEach(f => f(p)); }
export function PreviewHost({ render }) {
  const [p, setP] = useState(previewNow);
  useEffect(() => { previewers.add(setP); return () => previewers.delete(setP); }, []);
  if (!p) return null;
  return render(p, () => showPreview(null));
}

/* ── When they show ───────────────────────────────────────────────── */

export default function NudgeCenter({ userId, me = null, ready, sessionActive, streak, activity, studyYear, answered = 0, onStudy }) {
  const [shown, setShown] = useState(null);          // { kind, ...data }
  const [copied, setCopied] = useState(false);
  const usedVisit = useRef(false);
  const was = useRef(sessionActive);
  const today = todayKey();

  const free = () => !usedVisit.current && !document.querySelector(".update-note") && !document.querySelector(".np-scrim, .wr");
  function show(n) {
    if (!free()) return false;
    usedVisit.current = true;
    setShown(n);
    logStep(userId, `nudge_${n.kind}`);
    return true;
  }

  /* On opening: a streak that today hasn't kept. */
  useEffect(() => {
    if (!ready || !userId || sessionActive) return;
    const days = Number(streak?.streak) || 0;
    const studiedToday = Number(activity?.[today]) > 0;
    if (days < 2 || studiedToday || streak?.lastDate !== yesterdayKey()) return;
    if (store.get(userId, "streak").day === today) return;
    const t = setTimeout(() => { if (show({ kind: "streak", days })) store.set(userId, "streak", { day: today }); }, 1500);
    return () => clearTimeout(t);
  }, [ready, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* After a session: the invite if it's due, otherwise the leaderboard. */
  useEffect(() => {
    const ended = was.current && !sessionActive;
    was.current = sessionActive;
    if (!ended || !userId) return;
    let cancelled = false;
    const studyDays = Object.values(activity ?? {}).filter(n => Number(n) > 0).length;
    const inv = store.get(userId, "invite");
    const inviteDue = studyDays >= 2 && (inv.dismissed ?? 0) < 3 && Date.now() >= (inv.nextAt ?? 0);
    const t = setTimeout(async () => {
      /* A milestone just passed goes first: it only happens a handful of times. */
      const seen = Number(store.get(userId, "milestone").n) || 0;
      const hit = [...MILESTONES].reverse().find(([m]) => answered >= m)?.[0] ?? 0;
      if (hit > seen) { if (show({ kind: "milestone", n: hit })) store.set(userId, "milestone", { n: hit }); return; }
      /* Better at a deck than when they started: at most every 5 days, and a
         deck only again after another 10 points. */
      const imp = store.get(userId, "improve");
      if (Date.now() >= (imp.nextAt ?? 0)) {
        try {
          const byId = new Map(QUESTIONS.map(q => [q.id, q]));
          const deckOf = id => (byId.get(id)?.path ?? []).map(p => p.name).find(n => !/^Year \d/.test(n)) ?? null;
          const got = improvement(await fetchMyRecentAnswers(90), deckOf, imp.decks ?? {});
          if (cancelled) return;
          if (got && show({ kind: "improve", ...got })) {
            store.set(userId, "improve", { nextAt: Date.now() + 5 * DAY, decks: { ...(imp.decks ?? {}), [got.deck]: got.after } });
            return;
          }
        } catch { /* offline: skip */ }
      }
      /* On a phone, not installed, from the 2nd study day: Home Screen. */
      const home = store.get(userId, "home");
      if (onPhone() && !isInstalled() && studyDays >= 2 && (home.dismissed ?? 0) < 3 && Date.now() >= (home.nextAt ?? 0)) {
        if (show({ kind: "home" })) return;
      }
      if (inviteDue) { show({ kind: "invite" }); return; }
      if (store.get(userId, "leader").day === today) return;
      try {
        const rows = (await fetchLeaderboardWeek(studyYear || null)).filter(r => r.week_count > 0);
        const i = rows.findIndex(r => r.user_id === userId);
        if (cancelled || i < 0 || rows.length < 3) return;
        const me = rows[i], rank = Number(me.rank) || i + 1;
        const rival = rank === 1 ? rows[i + 1] : rows.slice(0, i).reverse().find(r => r.week_count > me.week_count) ?? rows[i - 1];
        const around = rows.slice(Math.max(0, i - 1), i + 2);
        if (around.length < 3 && i === 0) around.push(...rows.slice(around.length, 3).filter(r => !around.includes(r)));
        if (show({ kind: "leader", me, rival, rank, around, year: studyYear })) store.set(userId, "leader", { day: today });
      } catch { /* offline: nothing */ }
    }, 1400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [sessionActive]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!shown) return null;
  const close = () => {
    if (shown.kind === "invite") {
      const st = store.get(userId, "invite");
      store.set(userId, "invite", { ...st, dismissed: (st.dismissed ?? 0) + 1, nextAt: Date.now() + 5 * DAY });
    }
    setShown(null); setCopied(false);
  };
  const study = () => { setShown(null); onStudy(); };

  if (shown.kind === "streak") return <StreakNudge days={shown.days} onAction={study} onClose={close} />;
  if (shown.kind === "leader") return <LeaderNudge {...shown} onAction={study} onClose={close} />;
  if (shown.kind === "milestone") return <MilestoneNudge n={shown.n} onAction={study} onClose={close} />;
  if (shown.kind === "improve") return <ImproveNudge {...shown} onAction={study} onClose={close} />;
  if (shown.kind === "home") {
    const after = days => { const st = store.get(userId, "home"); store.set(userId, "home", { dismissed: (st.dismissed ?? 0) + 1, nextAt: Date.now() + days * DAY }); setShown(null); };
    return <HomeScreenNudge onClose={() => after(5)} onDone={how => { logStep(userId, `home_${how}`); after(how === "added" ? 3650 : 5); }} />;
  }
  return (
    <InviteNudge me={me} copied={copied} onClose={close} onAction={async () => {
      logStep(userId, "invite_shared");
      const st = store.get(userId, "invite");
      const done = () => { store.set(userId, "invite", { ...st, nextAt: Date.now() + 21 * DAY }); setShown(null); setCopied(false); };
      if (navigator.share) { try { await navigator.share({ url: INVITE_LINK }); done(); } catch { /* backed out */ } return; }
      try { await navigator.clipboard.writeText(INVITE_LINK); } catch { window.prompt("Copy this link", INVITE_LINK); }
      setCopied(true); setTimeout(done, 1800);
    }} />
  );
}
