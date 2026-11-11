import { useEffect, useState } from "react";
import StreakFlame from "../ui/StreakFlame";
import { h1, OF, C } from "../ui/theme";
import Wave from "../ui/Wave";
import { fetchLeaderboardWeek, fetchLeaderboardFriends, fetchMyFriendCode, fetchMyFriends, removeFriend } from "../lib/remote";
import { friendUrl } from "../lib/friendLink";
import { confirm } from "../ui/Confirm";
import { createPortal } from "react-dom";
import Avatar from "../ui/Avatar";
import { avatarSrc } from "../lib/avatar";
import { useOnline } from "../lib/online";
import { todayKey } from "../lib/storage";

/**
 * Cohort leaderboard — questions answered in the last 7 days.
 *
 * Default-on for anyone with a display name. Accuracy is deliberately not
 * the metric: it rewards skipping hard topics. Volume this week is honest
 * work, with streak as a quiet secondary.
 *
 * All / Year 1–5 (2026-10-24): ranked within a year, so Year 1s are
 * not measured against Year 2s who have had ready-made decks for longer.
 * The choice is remembered on this device.
 *
 * Today / This week (2026-10-25): the same board, one day or seven. This
 * week is what opens. A day is the phone's calendar day.
 *
 * Friends (2026-11-11, migration 0080): you and the people you are friends
 * with, on the same count. Mutual, made only by opening someone's link, so
 * the board offers the link and nothing to search. Anyone hidden from the
 * leaderboard is hidden here too.
 */
const YEARS = [["all", "All"], ["friends", "Friends"], [1, "Year 1"], [2, "Year 2"], [3, "Year 3"], [4, "Year 4"], [5, "Year 5"]];
const YEAR_KEY = "lb-year";
function savedYear() {
  try {
    const raw = localStorage.getItem(YEAR_KEY);
    if (raw === "friends") return "friends";
    const v = Number(raw);
    return v >= 1 && v <= 5 ? v : "all";
  } catch { return "all"; }
}

const band = {
  maxWidth: 1180,
  margin: "0 auto",
  padding: "0 clamp(20px, 3vw, 40px)",
  width: "100%",
};

/* Rafil's account. The founder's diamond is pinned to the account id, not
   the display name — anyone can call themselves Rafil, nobody can be this
   account. */
const FOUNDER_ID = "0b920395-b28e-442e-a68b-28e0b7d0a06b";

export function FounderGem() {
  /* A plain crown in the brand blue: three points and a band. Flat on
     purpose — it sits beside a name and should read at a glance, not
     invite a closer look. */
  return (
    <span className="lb-founder" title="Founder" aria-label="Founder" role="img">
      {/* Cropped to the crown itself (it spans y 5–21), so its middle is
          the box's middle and the flex centring lines it up. */}
      <svg width="17" height="16" viewBox="2 4 20 18" aria-hidden="true">
        <path d="M3 8.2l4.6 4.1L12 5l4.4 7.3L21 8.2 19.2 17H4.8z" fill="var(--c-accent)" stroke="var(--c-accent)" strokeWidth="1.6" strokeLinejoin="round" />
        <rect x="4.8" y="18.6" width="14.4" height="2.4" rx="1.2" fill="var(--c-accent)" />
      </svg>
    </span>
  );
}

export default function LeaderboardView({ userId }) {
  const [year, setYear] = useState(savedYear);
  const [span, setSpan] = useState("week");
  const [boards, setBoards] = useState({});   // year + window -> rows, fetched once each
  const [error, setError] = useState("");
  const day = span === "day" ? todayKey() : null;
  const boardKey = `${span}:${year}:${day ?? ""}`;
  const rows = boards[boardKey] ?? null;
  function pickYear(y) {
    setYear(y);
    try { localStorage.setItem(YEAR_KEY, String(y)); } catch { /* private mode */ }
  }

  /* Everyone's numbers live on the server, so offline there is no board;
     it loads by itself when the connection is back. */
  const online = useOnline();
  useEffect(() => {
    if (!online || rows) return;
    let cancelled = false;
    setError("");
    (async () => {
      try {
        const data = year === "friends"
          ? await fetchLeaderboardFriends(day)
          : await fetchLeaderboardWeek(year === "all" ? null : year, day);
        if (!cancelled) setBoards(b => ({ ...b, [boardKey]: data }));
      } catch (err) {
        if (!cancelled) setError(err.message || "Couldn’t load the board.");
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, boardKey]);


  /* A quiet day stays short: only people who answered something today.
     The week still lists the rest, including a zero. */
  const listed = span === "day" && rows ? rows.filter(r => r.week_count > 0) : rows;
  const podium = (listed ?? []).filter(r => r.week_count > 0 && r.rank <= 3).slice(0, 3);
  const rest = (listed ?? []).slice(podium.length);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "var(--app-vh)" }}>
      <div className="page-band" style={{ ...band, paddingTop: "clamp(22px, 3.6vh, 36px)", paddingBottom: "clamp(18px, 2.8vh, 28px)" }}>
        <h1 data-in="left" style={{ ...h1, margin: 0, "--i": 0 }}>Leaderboard</h1>
        <p style={{ marginTop: 8, fontSize: 15, color: OF.soft, fontWeight: 500, letterSpacing: -0.2, maxWidth: "36em" }}>
          {span === "day" ? "Questions answered today." : "Questions answered in the last seven days."}
        </p>
        {/* Always rendered, blank until the board arrives. The wave sits
            directly under the band, so anything that grows the band after
            first paint moves the wave — and the switch animation has
            already put it where it belongs by then, which reads as the
            page shifting at the last moment. Holding the line keeps the
            band the same height before and after the fetch. */}
      </div>

      <Wave from="transparent" to="var(--c-card-solid)" />

      <div style={{ background: "var(--c-card-solid)", flex: 1 }}>
        <div style={{ ...band, maxWidth: 720, paddingTop: "clamp(20px, 3vh, 28px)", paddingBottom: "clamp(36px, 5vh, 56px)" }}>
          {/* A dropdown (Rafil, 2026-10-24): five years plus All was too wide
              for a pill switch. The sign-up pop-up's year select, compact. */}
          <div className="lb-tools">
            <div className="lb-span" role="group" aria-label="When">
              <span className={`lb-span__thumb${span === "day" ? " is-day" : ""}`} aria-hidden="true" />
              {[["week", "This week"], ["day", "Today"]].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className="lb-span__b"
                  aria-pressed={span === id}
                  onClick={() => setSpan(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <select className="year-select lb-years" aria-label="Year" value={year}
              onChange={e => pickYear(e.target.value === "all" || e.target.value === "friends" ? e.target.value : Number(e.target.value))}>
              {YEARS.map(([k, label]) => <option key={k} value={k}>{k === "all" ? "All years" : label}</option>)}
            </select>
            {year === "friends" && online && (
              <FriendTools onChanged={() => setBoards(b => Object.fromEntries(Object.entries(b).filter(([k]) => !k.includes(":friends:"))))} />
            )}
          </div>
          {year === "friends" && listed && listed.filter(r => r.user_id !== userId).length === 0 && (
            <p className="lb-friends-empty">
              {span === "day" && rows?.some(r => r.user_id !== userId)
                ? "None of your friends has answered anything today."
                : "Add friends to see how you’re doing against them. Send them your link, and when they open it you’re friends."}
            </p>
          )}
          {!rows && !online && (
            <p style={{ color: C.muted, fontSize: 14.5, lineHeight: 1.5 }}>
              You’re offline. The board shows when you’re back online.
            </p>
          )}

          {error && online && (
            <p style={{ color: C.danger, fontSize: 14 }}>{error}</p>
          )}

          {rows === null && !error && online && (
            <p style={{ color: C.muted, fontSize: 14.5 }}>Loading the board…</p>
          )}

          {listed && listed.length === 0 && year !== "friends" && (
            <p style={{ color: C.muted, fontSize: 14.5, lineHeight: 1.5 }}>
              {span === "day"
                ? "Nobody has answered anything today."
                : year === "all"
                  ? "Nobody on the board yet. Add a display name and answer a few questions."
                  : `Nobody from Year ${year} on the board yet.`}
            </p>
          )}

          {/* The top three on a podium: second, first, third, left to right,
              first the tallest; gold, silver and bronze. Only people who
              answered something this week stand on it. */}
          {listed && podium.length > 0 && (
            <div className="lb-podium" data-in="rise" style={{ "--i": 1 }}>
              {[podium[1], podium[0], podium[2]].map((r, slot) => r && (
                <div key={r.user_id} className={`lb-step is-${["silver", "gold", "bronze"][slot]}${r.user_id === userId ? " is-me" : ""}`}>
                  <Avatar className="lb-step__avatar" src={avatarSrc(r.user_id, r.avatar)} name={r.display_name} />
                  <span className="lb-step__name">
                    {r.display_name}
                    {r.user_id === FOUNDER_ID ? <FounderGem /> : null}
                  </span>
                  <span className="lb-step__stats">
                    <span className="lb-step__count">{r.week_count}</span>
                    {r.streak > 0 ? <StreakFlame days={r.streak} size={15} small /> : null}
                  </span>
                  <span className="lb-step__block"><span className="lb-step__place">{[2, 1, 3][slot]}</span></span>
                </div>
              ))}
            </div>
          )}

          {listed && rest.length > 0 && (
            <ol className="lb-list">
              {rest.map((r, i) => {
                const mine = r.user_id === userId;
                return (
                  <li key={r.user_id} className={`lb-row${mine ? " is-me" : ""}`} data-in="rise" style={{ "--i": 2 + Math.min(i, 12) }}>
                    <span className="lb-rank">#{r.rank}</span>
                    <span className="lb-who">
                      <Avatar className="lb-avatar" src={avatarSrc(r.user_id, r.avatar)} name={r.display_name} />
                    </span>
                    <span className="lb-name">
                      <span className="lb-name-text">{r.display_name}</span>
                      {r.user_id === FOUNDER_ID ? <FounderGem /> : null}
                      {mine ? <span className="lb-me-tag">you</span> : null}
                    </span>
                    <span className="lb-stats">
                      <span className="lb-count">{r.week_count}</span>
                      <span className="lb-streak">{r.streak > 0 ? <StreakFlame days={r.streak} size={15} small /> : null}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

/* Add friends (share or copy your link) and Edit friends, above the
   Friends board. The link is fetched once, the first time it is wanted. */
function FriendTools({ onChanged }) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState("");
  async function share() {
    setErr("");
    let url;
    try { url = friendUrl(await fetchMyFriendCode()); } catch { setErr("Couldn’t get your link. Try again."); return; }
    const text = "Add me on Resurface so we can see each other on the leaderboard.";
    if (navigator.share) {
      try { await navigator.share({ title: "Resurface", text, url }); return; } catch (e) { if (e?.name === "AbortError") return; }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch { setErr(url); }
  }
  return (
    <>
      <button type="button" className="lb-friend-add btn-press" onClick={share}>
        {copied ? "Link copied" : "Add friends"}
      </button>
      <button type="button" className="lb-friend-edit" onClick={() => setEditing(true)}>Edit friends</button>
      {err && <span className="lb-friend-err">{err}</span>}
      {editing && <FriendsWindow onClose={() => setEditing(false)} onChanged={onChanged} />}
    </>
  );
}

function FriendsWindow({ onClose, onChanged }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    fetchMyFriends().then(r => { if (!cancelled) setList(r); }, e => { if (!cancelled) setError(e.message || "Couldn’t load your friends."); });
    const onKey = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { cancelled = true; document.removeEventListener("keydown", onKey); };
  }, [onClose]);
  async function remove(f) {
    const first = String(f.display_name || "").split(/\s+/)[0] || "this friend";
    const yes = await confirm({ title: `Remove ${first}?`, body: "You’ll stop seeing each other on the Friends board. They aren’t told.", action: "Remove", danger: true });
    if (!yes) return;
    try {
      await removeFriend(f.user_id);
      setList(l => l.filter(x => x.user_id !== f.user_id));
      onChanged();
    } catch (e) { setError(e.message || "Couldn’t remove them."); }
  }
  return createPortal(
    <div className="np-scrim" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="np" role="dialog" aria-modal="true" aria-labelledby="friends-title">
        <h2 className="np__title" id="friends-title">Friends</h2>
        {error ? <p className="np__sub">{error}</p>
          : !list ? <p className="np__sub">Loading…</p>
          : list.length === 0 ? <p className="np__sub">No friends yet. Send your link to add some.</p>
          : (
            <ul className="fr-list">
              {list.map(f => (
                <li key={f.user_id}>
                  <Avatar className="lb-avatar" src={avatarSrc(f.user_id, f.avatar)} name={f.display_name} />
                  <span className="fr-name">{f.display_name}</span>
                  <button type="button" className="fr-remove" onClick={() => remove(f)}>Remove</button>
                </li>
              ))}
            </ul>
          )}
        <div className="np__row">
          <button type="button" className="np__save btn-press" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
