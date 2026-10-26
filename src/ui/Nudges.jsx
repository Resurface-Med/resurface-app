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

/* Like the invite: the picture along the top, then one line that says it
   all. You and your place, a dashed line drawing an arrow to the person
   ahead and theirs. You lunge at them twice and they flinch; the gap
   counts up in the line. First on the board, they're chasing you. */
export function LeaderNudge({ me, rival, rank, onAction, onClose, inline }) {
  const top = rank === 1;
  const gap = rival ? Math.abs(rival.week_count - me.week_count) : 0;
  const need = top ? gap : gap + 1;
  const shown = useCountUp(need);
  const name = rival ? first(rival.display_name) : "";
  const theirRank = rival ? Number(rival.rank) || (top ? 2 : rank - 1) : null;
  const title = !rival ? `You’re ${ordinal(rank)} on the leaderboard!`
    : top ? <>You’re 1st on the leaderboard, <span className="nudge-num">{shown}</span> ahead of {name}!</>
    : <>You’re {ordinal(rank)} on the leaderboard, <span className="nudge-num">{shown}</span> more to pass {name}!</>;
  return (
    <NudgeCard kind="leader" inline={inline}
      art={rival && (
        <span className={`nudge-chase${top ? " is-top" : ""}`} aria-hidden="true">
          <span className="nudge-chase__who is-me">
            <Avatar className="nudge-chase__av" src={avatarSrc(me.user_id, me.avatar) || me.src} name={me.display_name} />
            <span className="nudge-chase__rank">{ordinal(rank)}</span>
          </span>
          <svg className="nudge-chase__path" viewBox="0 0 120 20" preserveAspectRatio="none">
            <path d="M4 10 H108" />
            <path className="nudge-chase__head" d="M102 4 L110 10 L102 16" />
          </svg>
          <span className="nudge-chase__who is-them">
            <Avatar className="nudge-chase__av" src={avatarSrc(rival.user_id, rival.avatar) || rival.src} name={rival.display_name} />
            <span className="nudge-chase__rank">{ordinal(theirRank)}</span>
          </span>
        </span>
      )}
      title={title}
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

export default function NudgeCenter({ userId, me = null, ready, sessionActive, streak, activity, studyYear, onStudy }) {
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
      if (inviteDue) { show({ kind: "invite" }); return; }
      if (store.get(userId, "leader").day === today) return;
      try {
        const rows = (await fetchLeaderboardWeek(studyYear || null)).filter(r => r.week_count > 0);
        const i = rows.findIndex(r => r.user_id === userId);
        if (cancelled || i < 0 || rows.length < 3) return;
        const me = rows[i], rank = Number(me.rank) || i + 1;
        const rival = rank === 1 ? rows[i + 1] : rows.slice(0, i).reverse().find(r => r.week_count > me.week_count) ?? rows[i - 1];
        if (show({ kind: "leader", me, rival, rank, year: studyYear })) store.set(userId, "leader", { day: today });
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
