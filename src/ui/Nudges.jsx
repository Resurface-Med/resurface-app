import { useEffect, useRef, useState } from "react";
import StreakFlame from "./StreakFlame";
import Avatar from "./Avatar";
import { avatarSrc } from "../lib/avatar";
import { fetchLeaderboardWeek, logStep } from "../lib/remote";
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

export function NudgeCard({ kind, art, title, body, action, onAction, onClose, inline = false }) {
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
          <button type="button" className="nudge__later" onClick={onClose}>Not now</button>
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
  [100, "And you said you’d start revising next week."],
  [250, "Your Anki deck is getting nervous."],
  [500, "At this point you’re basically the question bank."],
  [1000, "Your consultant would be proud. Probably."],
  [2500, "We’re running out of things to say."],
  [5000, "Go outside. Then come back."],
];
/* An odometer: each digit a column of 0–9 that rolls up to its number,
   the columns landing one after another. */
function Odometer({ n }) {
  const digits = n.toLocaleString("en-GB").split("");
  let k = 0;
  return (
    <span className="odo" aria-label={n.toLocaleString("en-GB")}>
      {digits.map((ch, i) => {
        if (!/\d/.test(ch)) return <span key={i} className="odo__sep">{ch}</span>;
        const d = Number(ch), at = k++;
        return (
          <span key={i} className="odo__col" aria-hidden="true">
            <span className="odo__reel" style={{ "--to": d + 10, "--d": `${200 + at * 140}ms` }}>
              {[...Array(20)].map((_, j) => <span key={j}>{j % 10}</span>)}
            </span>
          </span>
        );
      })}
    </span>
  );
}

export function MilestoneNudge({ n, onAction, onClose, inline }) {
  const line = (MILESTONES.find(([m]) => m === n) ?? [n, "Keep going."])[1];
  const next = MILESTONES.find(([m]) => m > n)?.[0] ?? null;
  return (
    <NudgeCard kind="milestone" inline={inline}
      art={
        <span className="nudge-mile" aria-hidden="true">
          <Odometer n={n} />
          <span className="nudge-mile__label">questions answered</span>
          {next && (
            <span className="nudge-mile__next">
              <span className="nudge-mile__bar"><span style={{ "--w": `${(n / next) * 100}%` }} /></span>
              <span>Next: {next.toLocaleString("en-GB")}</span>
            </span>
          )}
        </span>
      }
      title={line}
      action="Keep going" onAction={onAction} onClose={onClose} />
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
