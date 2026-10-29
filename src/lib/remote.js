import { supabase } from "./supabase";
import { timed } from "./loadTiming";
import { GEN_ID_BASE } from "../data";
import { append, dropOnce } from "./queue";
import { readBundle, saveBundle } from "./offlineStore";
import { mark } from "./loadTiming";

// Server-first data access.
//
// Postgres holds the truth; the app loads a snapshot on sign-in and writes
// through on every change. The only local state is a queue of writes that
// failed, so a connection that drops mid-session doesn't lose the answers you
// gave before it came back.

const QUEUE_KEY = "pq_write_queue";

function readQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY)) ?? []; }
  catch { return []; }
}

function writeQueue(q) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {}
}

/*
 * Whose writes these are.
 *
 * The queue lives in the browser, and a browser can be shared — a library
 * PC, a friend's laptop. A write parked by one account and retried under the
 * next is refused by RLS every time and sits there for good, or, for a write
 * keyed only on a row id, lands as nobody's. So each op is stamped with the
 * account that made it and only that account's are flushed.
 */
let owner = null;
export function setQueueOwner(userId) { owner = userId ?? null; }

/* A duplicate of a once-only row means it is already there: done. */
function alreadyThere(res) {
  return res?.error?.code === "23505" ? { ...res, error: null } : res;
}

/*
 * A refusal that will never change: bad data (22…), a constraint (23…),
 * not permitted (42501), no such column (42703, PGRST204). Retrying those
 * forever is what sent the database 46,794 refused picks in a day
 * (2026-10-27). A dropped connection or an expired sign-in has no such
 * code and is still retried.
 */
export function isPermanent(error) {
  const c = String(error?.code ?? "");
  return /^2[23]/.test(c) || c === "42501" || c === "42703" || c === "PGRST204";
}

function enqueue(op) {
  writeQueue(append(readQueue(), owner && !op.owner ? { ...op, owner } : op));
}

/**
 * Runs a write, and parks it for retry if it fails. Callers don't await this —
 * the UI has already updated optimistically, and a study session should never
 * block on a round-trip.
 */
/*
 * Every write this page has made, newest last (2026-10-19, offline). A load
 * from the server that was in flight when a write went out may not include
 * it; App lays these back over what came back (lib/overlay). In memory only —
 * across a reload the queue and the device's copy cover it.
 */
const recent = [];
const RECENT_MAX = 2000;
/* Told of every write, so the device's copy can be saved after it. */
const writeSubs = new Set();
export function onWrite(fn) { writeSubs.add(fn); return () => writeSubs.delete(fn); }

function remember(op) {
  writeSubs.forEach(fn => { try { fn(op); } catch { /* a listener's problem */ } });
  recent.push(op);
  if (recent.length > RECENT_MAX) recent.splice(0, recent.length - RECENT_MAX);
}

/**
 * Writes the server may not have: everything still queued for this account,
 * and everything sent since `since` (ms). Oldest first.
 */
export function pendingOps(since = Infinity) {
  const queued = readQueue().filter(op => !op.owner || op.owner === owner);
  const sent = recent.filter(op => (op.at ?? 0) >= since);
  return [...queued, ...sent].sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
}

async function send(op) {
  op = { ...op, at: Date.now() };
  remember(op);
  try {
    const { error } = await apply(op);
    if (error) throw error;
    return true;
  } catch (e) {
    if (!isPermanent(e)) enqueue(op);
    return false;
  }
}

/*
 * Deck writes, one at a time and in the order they were made.
 *
 * Reordering sends several writes to the same rows in quick succession —
 * holding Alt+↓ is a write per step — and fired in parallel the last one sent
 * is not guaranteed to be the last one applied, which would leave the
 * database disagreeing with the screen until the next reload.
 */
let deckChain = Promise.resolve();
function inOrder(run) {
  const next = deckChain.then(run, run);
  deckChain = next.catch(() => {});
  return next;
}

/** The single place that knows how an op becomes a query. */
function apply(op) {
  switch (op.kind) {
    case "practice":
      return supabase.from("practice_stats").upsert({
        user_id: op.userId, question_id: op.questionId,
        correct: op.correct, total: op.total, updated_at: new Date().toISOString(),
      });
    case "pick":
      /* First answer only. A retry after the explanation is not another
         vote. The text, not the index: options are shuffled per person. A
         write queued before 0054 carries only an index and lands as one. */
      /* A plain insert, a duplicate counting as done. An upsert that
         ignores duplicates is ON CONFLICT DO NOTHING, which needs a SELECT
         policy this table doesn't have: every pick was refused (2026-10-27). */
      return supabase.from("option_picks")
        .insert({ user_id: op.userId, question_id: op.questionId, option_text: op.optionText ?? null, option_index: op.optionIndex ?? null })
        .then(alreadyThere);
    case "answer":
      /* Every answer, as its own row (migration 0056). `at` is when it was
         given, so one answered offline isn't dated when the queue drains.
         Its own field: send() stamps `at` with Date.now() (a number, for
         ordering), which overwrote this and was refused as a date — not one
         answer was logged until 2026-10-27. Ops queued before then only
         have that number, which is still the right moment. */
      return supabase.from("answer_log").insert({
        user_id: op.userId, question_id: op.questionId, correct: op.correct, ms: op.ms,
        at: op.answeredAt ?? new Date(op.at).toISOString(),
      });
    case "sr":
      return supabase.from("sr_cards").upsert({
        user_id: op.userId, question_id: op.questionId,
        interval: op.card.interval ?? 0,
        repetitions: op.card.repetitions ?? 0,
        ease_factor: op.card.easeFactor ?? 2.5,
        lapses: op.card.lapses ?? 0,
        due_date: op.card.dueDate ? new Date(op.card.dueDate).toISOString() : null,
        interval_minutes: op.card.intervalMinutes ?? null,
        updated_at: new Date().toISOString(),
      });
    case "bookmark-add":
      return supabase.from("bookmarks").upsert({ user_id: op.userId, question_id: op.questionId });
    case "bookmark-remove":
      return supabase.from("bookmarks").delete().eq("user_id", op.userId).eq("question_id", op.questionId);
    case "activity":
      return supabase.from("activity").upsert({ user_id: op.userId, day: op.day, count: op.count });
    case "streak":
      return supabase.from("streaks").upsert({
        user_id: op.userId, current: op.current, longest: op.longest,
        last_date: op.lastDate, updated_at: new Date().toISOString(),
      });
    case "goal":
      return supabase.from("profiles").update({ daily_goal: op.goal, updated_at: new Date().toISOString() }).eq("id", op.userId);
    case "study-time":
      return supabase.rpc("set_study_seconds", { secs: op.seconds });
    case "profile":
      return supabase.from("profiles").update({
        ...(op.displayName !== undefined ? { display_name: op.displayName } : {}),
        ...(op.nameChosen !== undefined ? { name_chosen: op.nameChosen } : {}),
        ...(op.showOnLeaderboard !== undefined ? { show_on_leaderboard: op.showOnLeaderboard } : {}),
        ...(op.marketingOptIn !== undefined ? { marketing_opt_in: op.marketingOptIn } : {}),
        ...(op.showAllOptions !== undefined ? { show_all_options: op.showAllOptions } : {}),
        ...(op.introSeen !== undefined ? { intro_seen: op.introSeen } : {}),
        ...(op.studyYear !== undefined ? { study_year: op.studyYear } : {}),
        updated_at: new Date().toISOString(),
      }).eq("id", op.userId);
    case "flag":
      // One row per person per question, so flagging again is a correction
      // rather than a second vote.
      return supabase.from("question_flags").upsert({
        user_id: op.userId, question_id: op.questionId,
        reason: op.reason, note: op.note ?? null,
        created_at: new Date().toISOString(),
      });
    case "flag-remove":
      return supabase.from("question_flags").delete()
        .eq("user_id", op.userId).eq("question_id", op.questionId);
    case "question-edit":
      return supabase.from("question_edits").upsert({
        user_id: op.userId, question_id: op.questionId,
        payload: op.payload, updated_at: new Date().toISOString(),
      });
    case "generated-add":
      return supabase.from("generated_questions").insert(op.rows);
    case "generated-remove":
      return supabase.from("generated_questions").delete()
        .eq("user_id", op.userId).eq("id", op.id);
    case "generated-clear":
      return supabase.from("generated_questions").delete().eq("user_id", op.userId);
    case "practice-clear":
      return supabase.from("practice_stats").delete().eq("user_id", op.userId);
    case "sr-clear":
      return supabase.from("sr_cards").delete().eq("user_id", op.userId);
    case "deck-update":
      return supabase.from("decks").update({ ...op.patch, updated_at: new Date().toISOString() }).eq("id", op.deckId);
    case "deck-delete":
      return supabase.from("decks").delete().eq("id", op.deckId);
    /*
     * One branch, not two.
     *
     * There were two `generated-update` cases, and a switch takes the first:
     * the one that wrote only the payload. Everything that moves a question
     * to another deck went through the second, which was unreachable, so the
     * deck id was silently dropped and the move did not survive a reload.
     *
     * Not currently reachable from the UI — the Move control was taken out —
     * but it would have come back broken with it, looking like a caching bug
     * rather than a dropped column.
     *
     * deck_id is only written when it was actually passed, so renaming a deck
     * (which rewrites the topic on each of its questions) does not null it.
     */
    case "generated-update":
      return supabase.from("generated_questions").update({
        payload: op.payload,
        ...(op.deckId !== undefined ? { deck_id: op.deckId } : {}),
      }).eq("user_id", op.userId).eq("id", op.id);
    case "session-save":
      return supabase.from("practice_sessions").upsert({ ...op.rec, user_id: op.userId });
    case "ann-seen":
      return supabase.from("profiles").update({ announcements_seen_at: op.seenAt }).eq("id", op.userId);
    case "featured-hide":
      return op.hide
        ? supabase.from("featured_hidden").upsert({ deck_id: op.deckId })
        : supabase.from("featured_hidden").delete().eq("deck_id", op.deckId);
    default:
      return Promise.resolve({ error: new Error(`unknown op ${op.kind}`) });
  }
}

/** Drains anything parked by a failed write. Safe to call repeatedly. */
/**
 * Retries everything parked, dropping each write only once it is actually in.
 *
 * It used to empty the queue first and write the failures back at the end,
 * which left every unsent write living only in a local variable for the
 * length of the flush. Close the tab, lose the network, let the browser kill
 * a backgrounded page — and a flush of fifty interrupted at ten took the
 * other forty with it. Anything the app queued while the flush was running
 * was destroyed by that final write, too.
 *
 * So storage is only ever changed after a success, and it is re-read each
 * time rather than overwritten from a snapshot, which is what keeps writes
 * made during the flush. The cost is a localStorage write per op, on a path
 * that runs when a network comes back, over a queue of at most a few hundred.
 */
/*
 * One flush at a time. It runs on sign-in, on coming back online and on the
 * tab becoming visible, and those overlap; two flushes reading the same queue
 * both replay every op in it, and a replayed "generated-add" inserts the
 * questions twice. A second caller waits for the first instead.
 */
let flushing = null;
export function flushQueue() {
  if (!flushing) flushing = runFlush().finally(() => { flushing = null; });
  return flushing;
}

async function runFlush() {
  /* Ops from before stamping have no owner and are tried as before. */
  const start = readQueue().filter(op => !op.owner || op.owner === owner);
  if (start.length === 0) return { flushed: 0, remaining: readQueue().length };

  let flushed = 0;
  for (const op of start) {
    try {
      const { error } = await apply(op);
      if (error) throw error;
      flushed += 1;
      writeQueue(dropOnce(readQueue(), op));
    } catch (e) {
      /* Left where it is, to be tried again next time — unless the server
         will never take it. */
      if (isPermanent(e)) writeQueue(dropOnce(readQueue(), op));
    }
  }
  return { flushed, remaining: readQueue().length };
}

export function queuedCount() {
  return readQueue().length;
}

/*
 * Every row, not the first thousand.
 *
 * The API returns at most 1,000 rows per select however many match, without
 * an error. At up to fifty questions a generation a student passes that in a
 * few weeks, and from then on a reload silently loses their newest questions
 * and the progress on them. So each table is read a page at a time, in a
 * fixed order so the pages neither overlap nor skip, until a short page.
 */
export const PAGE = 1000;
export async function selectAll(query, orderBy) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query().order(orderBy).range(from, from + PAGE - 1);
    if (error) return { data: null, error };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return { data: rows, error: null };
  }
}

/** One read per table, on sign-in. Shapes match what App.jsx already holds. */
/* How long the rest of the load waits for the featured decks before going on
   without them. They are the biggest thing fetched; a first sign-in should
   not sit on "Loading your progress…" for them. */
const FEATURED_WAIT_MS = 700;

export async function loadAll(userId) {
  const featuredP = loadFeatured().then(f => { mark("t_featured"); return f; });
  const featuredSoon = Promise.race([featuredP, new Promise(r => setTimeout(() => r(undefined), FEATURED_WAIT_MS))]);
  /* Decks alongside the rest: they were fetched after all of it, a whole
     extra round trip on every sign-in. */
  const [practice, sr, bookmarks, activity, streak, profile, generated, edits, deckRes, featured, announcements, sessions] =
    await Promise.all([
      timed("t_practice", selectAll(() => supabase.from("practice_stats").select("question_id, correct, total").eq("user_id", userId), "question_id")),
      timed("t_sr", selectAll(() => supabase.from("sr_cards").select("*").eq("user_id", userId), "question_id")),
      timed("t_bookmarks", selectAll(() => supabase.from("bookmarks").select("question_id").eq("user_id", userId), "question_id")),
      timed("t_activity", selectAll(() => supabase.from("activity").select("day, count").eq("user_id", userId), "day")),
      timed("t_streak", supabase.from("streaks").select("*").eq("user_id", userId).maybeSingle()),
      timed("t_profile", supabase.from("profiles").select("*").eq("id", userId).maybeSingle()),
      timed("t_generated", selectAll(() => supabase.from("generated_questions").select("id, payload, deck_id, created_at").eq("user_id", userId), "id")),
      timed("t_edits", selectAll(() => supabase.from("question_edits").select("question_id, payload").eq("user_id", userId), "question_id")),
      timed("t_decks", loadUserDecks().then(data => ({ data, error: null }), error => ({ data: null, error }))),
      featuredSoon,
      fetchAnnouncements().catch(() => []),
      loadSessions(),
    ]);
  if (deckRes.error) throw deckRes.error;
  const decks = deckRes.data;

  /*
   * A failed query is not an empty table.
   *
   * Every one of these returns { data, error } and nothing here used to read
   * the error, so one failure — a blip, a project waking from sleep, an
   * expired token — came back as `generated: []` and the app drew a signed-in
   * student with three hundred questions an entirely empty screen. No error,
   * nothing to retry, and the reasonable thing for them to do next is
   * generate it all again or conclude the app lost it.
   *
   * So it refuses instead. The caller shows a retry; wrong data shown
   * confidently is worse than a page that admits it could not load.
   */
  const failed = Object.entries({ practice, sr, bookmarks, activity, streak, profile, generated, edits })
    .filter(([, r]) => r?.error)
    .map(([name]) => name);
  if (failed.length) {
    const err = new Error(`Could not load: ${failed.join(", ")}`);
    err.failedTables = failed;
    throw err;
  }

  const pStats = {};
  for (const r of practice.data ?? []) pStats[r.question_id] = { correct: r.correct, total: r.total };

  const srCards = {};
  for (const r of sr.data ?? []) {
    srCards[r.question_id] = {
      interval: r.interval,
      repetitions: r.repetitions,
      easeFactor: Number(r.ease_factor),
      lapses: r.lapses,
      dueDate: r.due_date ? new Date(r.due_date).getTime() : undefined,
      ...(r.interval_minutes != null ? { intervalMinutes: r.interval_minutes } : {}),
    };
  }

  const activityMap = {};
  for (const r of activity.data ?? []) activityMap[r.day] = r.count;


  const questionEdits = {};
  for (const r of edits.data ?? []) questionEdits[r.question_id] = r.payload;

  return {
    pStats,
    srCards,
    bookmarks: (bookmarks.data ?? []).map(r => r.question_id),
    activity: activityMap,
    streak: streak.data
      ? { streak: streak.data.current, longest: streak.data.longest, lastDate: streak.data.last_date }
      : { streak: 0, longest: 0, lastDate: null },
    dailyGoal: profile.data?.daily_goal ?? 20,
    /* Seconds a question has been on screen (migration 0056). Absent on a
       copy saved before the column existed, which must not read as zero. */
    studySeconds: profile.data?.study_seconds == null ? undefined : Number(profile.data.study_seconds),
    displayName: profile.data?.display_name ?? "",
    /* Profile photo version (lib/avatar): null, 0, or an upload's number. */
    avatarV: profile.data?.avatar_v ?? null,
    /* Announcements (migration 0022): the list, and when you last looked. */
    announcements,
    announcementsSeenAt: profile.data?.announcements_seen_at ?? null,
    /* False only while the name is still the one made up from their email —
       the single question the welcome prompt exists to ask. */
    nameChosen: profile.data?.name_chosen !== false,
    showOnLeaderboard: profile.data?.show_on_leaderboard !== false,
    marketingOptIn: profile.data?.marketing_opt_in ?? null,
    showAllOptions: profile.data?.show_all_options === true,
    introSeen: profile.data?.intro_seen === true,
    /* Year of study (migration 0031): 1–5, 0 something else, null not asked. */
    studyYear: profile.data?.study_year ?? null,
    // gen marks these as one person's own questions. Their ids come from this
    // table's serial and so overlap the bank's, which matters for anything
    // keyed on question_id — flags are cohort-wide, these are not.
    generated: (generated.data ?? []).map(r => ({ ...r.payload, id: GEN_ID_BASE + Number(r.id), gen: true, deckId: r.deck_id, createdAt: r.created_at })),
    questionEdits,
    decks,
    /* undefined when it is still on its way: the caller applies
       `featuredLater` when it lands, and keeps what it had meanwhile. */
    featured,
    featuredLater: featured === undefined ? featuredP : null,
    sessions,
  };
}

/* Past sessions (migration 0027), newest first. Not one of the tables the
   snapshot must have: if this fails the app opens without them. */
export async function loadSessions() {
  const { data, error } = await supabase.from("practice_sessions")
    .select("id, label, items, idx, total, answered, correct, finished, created_at, updated_at")
    .order("updated_at", { ascending: false }).limit(50);
  if (error) return null;
  return data ?? [];
}

/**
 * Featured decks: someone else's deck, read live by everyone (migration
 * 0014). Not one of the tables the snapshot must have — if this fails, the
 * app opens without them rather than refusing to open.
 *
 * Shapes:
 *  roots: [{ id, top, name, byline, shareCode, hidden, copyId }] — copyId
 *         is your own copy of it from before, if you have one.
 *  decks: rows like loadUserDecks's, with `featured` and their root.
 *  questions: rows like `generated`'s, minus `gen` — they are not yours to
 *         edit, so the card offers Report instead.
 */
export async function loadFeatured() {
  const { data: mine, error } = await supabase.rpc("featured_mine");
  if (error || !mine || mine.version == null) return loadFeaturedLegacy();
  let bundle;
  try { bundle = await featuredBundle(mine.version); } catch { return loadFeaturedLegacy(); }
  return assembleFeatured(bundle, mine);
}

/* Before migration 0062, and if the new path fails: everything in one go. */
async function loadFeaturedLegacy() {
  const { data, error } = await supabase.rpc("featured_content");
  if (error || !data) return { roots: [], decks: [], questions: [] };
  return shapeFeatured(data);
}

/*
 * The featured decks, fast (2026-10-29).
 *
 * The bundle (featured_bundle, migration 0062) is the same for everyone and
 * changes only when a featured deck does, so it is fetched by version: from
 * memory, then the device (IndexedDB), then Vercel's edge (/api/featured,
 * cached for good per version), then the database itself if that fails.
 * featured_mine carries the version and the per-person part.
 */
let bundleMem = null;
const withTimeoutSignal = ms => (typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined);

export async function featuredBundle(version) {
  if (bundleMem && bundleMem.version === version) return bundleMem;
  const kept = await readBundle();
  if (kept && kept.version === version) return (bundleMem = kept);
  let b = null;
  try {
    const res = await fetch(`/api/featured?v=${encodeURIComponent(version)}`, { signal: withTimeoutSignal(20000) });
    if (res.ok && (res.headers.get("content-type") || "").includes("json")) b = await res.json();
  } catch { /* edge unreachable: the database below */ }
  if (!b || b.version == null) {
    const { data, error } = await supabase.rpc("featured_bundle");
    if (error || !data) {
      if (kept) return (bundleMem = kept); /* an older copy beats none */
      throw error || new Error("featured bundle");
    }
    b = data;
  }
  bundleMem = b;
  saveBundle(b);
  return b;
}

/* From the sign-in screen, so a first sign-in finds the decks already here.
   Never throws. */
export async function prefetchFeatured() {
  try {
    const { data: v, error } = await supabase.rpc("featured_version");
    if (!error && v != null) await featuredBundle(v);
  } catch { /* the load after sign-in will try again */ }
}

/** The bundle and the per-person part, in featured_content's shape. Pure. */
export function assembleFeatured(bundle, mine) {
  const vis = new Map((mine?.roots ?? []).map(r => [r.id, r]));
  const extra = mine?.extra ?? {};
  const listed = (bundle?.roots ?? []).filter(r => vis.has(r.id)).map(r => ({ ...r, ...vis.get(r.id) }));
  const ids = new Set(listed.map(r => r.id));
  const decks = (bundle?.decks ?? []).filter(d => ids.has(d.root));
  const deckIds = new Set(decks.map(d => d.id));
  const topics = bundle?.topics ?? [];
  const questions = (bundle?.questions ?? []).filter(q => deckIds.has(q.deckId))
    .map(q => (q.t == null ? q : { id: q.id, deckId: q.deckId, payload: { ...q.payload, topic: topics[q.t] } }));
  const shaped = shapeFeatured({
    roots: [...listed, ...(extra.roots ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    decks: [...decks, ...(extra.decks ?? [])],
    questions: [...questions, ...(extra.questions ?? [])],
  });
  shaped.version = bundle?.version ?? null;
  shaped.mine = mine ?? null;
  return shaped;
}

/*
 * What the device's copy keeps of the featured decks: the version and the
 * per-person part, not 3,000 questions. Rewriting megabytes into IndexedDB
 * after every answer was the cost; the questions are in the bundle store.
 */
export function liteFeatured(f) {
  if (!f?.mine || f.version == null) return f;
  const hidden = new Map((f.roots ?? []).map(r => [r.id, r.hidden]));
  const keep = r => (hidden.has(r.id) ? { ...r, hidden: hidden.get(r.id) } : r);
  const extra = f.mine.extra ?? {};
  return {
    lite: true,
    version: f.version,
    mine: { ...f.mine, roots: (f.mine.roots ?? []).map(keep), extra: { ...extra, roots: (extra.roots ?? []).map(keep) } },
  };
}

/** The other way: a kept copy back to what the screen uses. */
export async function hydrateFeatured(f) {
  if (!f?.lite) return f;
  const b = bundleMem ?? await readBundle();
  if (!b) return undefined;
  bundleMem = b;
  return assembleFeatured(b, f.mine);
}

function shapeFeatured(data) {
  const names = new Map((data.decks ?? []).map(d => [d.id, d.name]));
  /* `top` is what heads the list — a folder the deck is shown in, or the deck
     itself — and carries the byline; `id` is the real deck. */
  const roots = (data.roots ?? []).map(r => ({ ...r, top: r.top ?? r.id, name: names.get(r.top ?? r.id) ?? "" }));
  const byTop = new Map(roots.map((r, i) => [r.top, { byline: r.byline, at: i }]));
  return {
    roots,
    decks: (data.decks ?? []).map(d => ({
      id: d.id, name: d.name, parentId: d.parentId,
      position: d.parentId ? d.position : -1e9 + (byTop.get(d.id)?.at ?? 0),
      featured: true, root: d.root, byline: d.parentId ? null : byTop.get(d.id)?.byline ?? null,
      /* A heading the decks are grouped under ("Year 2"), not a deck: there
         is no row behind it, so nothing can be put in it. */
      folder: roots.some(r => r.top === d.id && r.top !== r.id),
    })),
    questions: (data.questions ?? []).map(r => {
      /* `gen` on a saved payload would mark a premade question as yours, and
         the card would offer Edit instead of Report. */
      const { gen: _gen, ...payload } = r.payload ?? {};
      return { ...payload, id: GEN_ID_BASE + Number(r.id), featured: true, deckId: r.deckId };
    }),
  };
}

/**
 * Your decks, as rows. The tree is built in the app.
 *
 * Throws rather than returning [], for the same reason loadAll does: an empty
 * list and a failed fetch look identical on screen, and one of them is a lie.
 */
export async function loadUserDecks() {
  const { data, error } = await selectAll(() => supabase.from("decks")
    .select("id, name, parent_id, position, share_code, created_at, shelf"), "id");
  if (error) throw error;
  return (data ?? []).map(r => ({
    id: r.id, name: r.name, parentId: r.parent_id, position: r.position,
    shareCode: r.share_code, createdAt: r.created_at, shelf: r.shelf ?? null,
  }));
}

/** Weekly cohort board — security-definer RPC, default-on profiles with names. */
/**
 * Reviewing what students have flagged.
 *
 * All three are SECURITY DEFINER functions that check an `admins` table
 * themselves, so a non-admin calling them gets `false` and an empty list
 * rather than a refusal. The client hiding the section is presentation;
 * this is the part that actually holds.
 */
export async function fetchIsAdmin() {
  const { data, error } = await supabase.rpc("is_admin");
  if (error) return false;
  return Boolean(data);
}

export async function fetchOverview() {
  const { data, error } = await supabase.rpc("admin_overview");
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** The database's size in bytes (admins only; migration 0057). */
export async function fetchStorage() {
  const { data, error } = await supabase.rpc("admin_storage");
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}

export async function fetchOverviewDaily(days = 30) {
  const { data, error } = await supabase.rpc("admin_overview_daily", { days });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchPeople() {
  const { data, error } = await supabase.rpc("admin_people");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchPeopleDaily(days = 30) {
  const { data, error } = await supabase.rpc("admin_people_daily", { days });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchGenerationDaily(days = 14) {
  const { data, error } = await supabase.rpc("admin_generation_daily", { days });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/* Per person, unlike the chart above, which only has the day's total. */
export async function fetchGeneratedDaily(days = 180) {
  const { data, error } = await supabase.rpc("admin_generated_daily", { days });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchTokenTotals() {
  const { data, error } = await supabase.rpc("admin_tokens_totals");
  if (error) throw new Error(error.message);
  return data ?? [];
}

/* Announcements — migration 0022. The newest 50; anyone signed in reads
   them, admins post and remove them. */
export async function fetchAnnouncements() {
  const { data, error } = await supabase.from("announcements")
    .select("id, created_at, published_at, title, body, tag, image_url, welcome")
    .order("published_at", { ascending: false, nullsFirst: true }).order("created_at", { ascending: false }).limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
}
/* Queued like an answer, so reading What's new offline still clears the
   badge once the connection is back. */
export async function markAnnouncementsSeen(userId) {
  const at = new Date().toISOString();
  await send({ kind: "ann-seen", userId, seenAt: at });
  return at;
}
export async function adminPostAnnouncement({ title, body, tag = null, image = null }) {
  const { error } = await supabase.rpc("admin_post_announcement", { p_title: title, p_body: body, p_tag: tag, p_image: image, p_publish: false });
  if (error) throw new Error(error.message);
}
export async function adminUpdateAnnouncement(id, { title, body, tag = null, image = null }) {
  const { error } = await supabase.rpc("admin_update_announcement", { p_id: id, p_title: title, p_body: body, p_tag: tag, p_image: image });
  if (error) throw new Error(error.message);
}
/* The post new accounts see on Home (migration 0026); null clears it. */
export async function adminSetWelcome(id) {
  const { error } = await supabase.rpc("admin_set_welcome", { p_id: id });
  if (error) throw new Error(error.message);
}
/* Drafts (migration 0024): published_at null until an admin publishes. */
export async function adminSetAnnouncementPublished(id, publish) {
  const { error } = await supabase.rpc("admin_set_announcement_published", { p_id: id, p_publish: publish });
  if (error) throw new Error(error.message);
}
export async function adminDeleteAnnouncement(id) {
  const { error } = await supabase.rpc("admin_delete_announcement", { p_id: id });
  if (error) throw new Error(error.message);
}

/* Admin control of the Resurface (featured) decks — migration 0021. Ids
   from the pool carry GEN_ID_BASE; the table's do not. */
export async function adminEditFeatured(id, payload) {
  const { error } = await supabase.rpc("admin_edit_featured_question", { qid: Number(id) - GEN_ID_BASE, body: payload });
  if (error) throw new Error(error.message);
}
export async function adminDeleteFeatured(ids) {
  const { data, error } = await supabase.rpc("admin_delete_featured_questions", { ids: ids.map(id => Number(id) - GEN_ID_BASE) });
  if (error) throw new Error(error.message);
  return data ?? 0;
}
export async function fetchAdminFeatured() {
  const { data, error } = await supabase.rpc("admin_featured_decks");
  if (error) throw new Error(error.message);
  return data ?? [];
}
export async function fetchFeatureCandidates() {
  const { data, error } = await supabase.rpc("admin_feature_candidates");
  if (error) throw new Error(error.message);
  return data ?? [];
}
export async function adminSetFeatured(deck, byline, folder, renames = {}) {
  const { error } = await supabase.rpc("admin_set_featured", { deck, p_byline: byline ?? "", p_folder: folder ?? "", p_renames: renames });
  if (error) throw new Error(error.message);
}
export async function adminUnfeature(deck) {
  const { error } = await supabase.rpc("admin_unfeature", { deck });
  if (error) throw new Error(error.message);
}
/* An unlisted featured deck (migration 0040) becomes visible to every student. */
export async function adminPublishFeatured(deck) {
  const { error } = await supabase.rpc("admin_publish_featured", { deck });
  if (error) throw new Error(error.message);
}

/* Who sent whose deck to whom, newest first (migration 0020). */
export async function fetchShareLog(lim = 300) {
  const { data, error } = await supabase.rpc("admin_share_log", { lim });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/* Today's use of the free tier's 500-a-day allowances (one per API key:
   generating, and Resurface AI), since they last reset. Migration 0019. */
export async function fetchAiQuota() {
  const { data, error } = await supabase.rpc("admin_ai_quota");
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data[0] : data) ?? null;
}

export async function fetchTokensDaily(days = 14) {
  const { data, error } = await supabase.rpc("admin_tokens_daily", { days });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchMarketingList() {
  const { data, error } = await supabase.rpc("admin_marketing");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function setAdmin(userId, make) {
  const { error } = await supabase.rpc("admin_set_admin", { uid: userId, make });
  if (error) throw new Error(error.message);
}

/* Question review (2026-10-23, migration 0046): the admin team's status
   and comment thread per question, keyed on the database id. */
export async function fetchReviewState(dbIds) {
  const { data, error } = await supabase.rpc("admin_review_state", { qids: dbIds });
  if (error) throw new Error(error.message);
  return data ?? { reviews: [], comments: [] };
}
export async function setReviewStatus(dbId, status) {
  const { error } = await supabase.rpc("admin_review_set", { qid: dbId, new_status: status });
  if (error) throw new Error(error.message);
}
export async function addReviewComment(dbId, body) {
  const { data, error } = await supabase.rpc("admin_review_comment", { qid: dbId, body });
  if (error) throw new Error(error.message);
  return data;
}
export async function removeReviewComment(id) {
  const { error } = await supabase.rpc("admin_review_uncomment", { cid: id });
  if (error) throw new Error(error.message);
}

/**
 * Your folders inside a ready-made deck, suggested for everyone (migration
 * 0048). A suggestion is the whole folder; reviewers add or keep out each
 * question in it, and an added one moves into the deck, keeping its id.
 */
export async function suggestDeck(deckId, note) {
  const { error } = await supabase.rpc("suggest_deck", { deck: deckId, note: note ?? null });
  if (error) throw error;
}

export async function withdrawSuggestion(deckId) {
  const { error } = await supabase.rpc("withdraw_suggestion", { deck: deckId });
  if (error) throw error;
}

/** [{ deckId, at, note, added, waiting, kept: [{ qid, q, reason }] }] — qid is the app id. */
export async function fetchMySuggestions() {
  const { data, error } = await supabase.rpc("my_suggestions");
  if (error) throw error;
  return (data ?? []).map(s => ({ ...s, kept: (s.kept ?? []).map(k => ({ ...k, qid: GEN_ID_BASE + Number(k.qid) })) }));
}

/**
 * Admins: every suggestion, with its questions still in the author's folder.
 * [{ id, deckId, deckName, target, by, note, at, added, questions: [q] }],
 * each q a question like the app's own, plus dbId, status ("kept" or null
 * while waiting) and reason.
 */
export async function fetchSuggestions() {
  const { data, error } = await supabase.rpc("admin_suggestions");
  if (error) throw error;
  return (data ?? []).map(s => ({
    ...s,
    questions: (s.questions ?? []).map(x => {
      const { gen: _gen, ...payload } = x.payload ?? {};
      return { ...payload, id: GEN_ID_BASE + Number(x.id), dbId: Number(x.id), status: x.status ?? null, reason: x.reason ?? null };
    }),
  }));
}

export async function decideSuggestion(dbId, accept, why) {
  const { error } = await supabase.rpc("admin_suggestion_decide", { qid: dbId, accept, why: why ?? null });
  if (error) throw error;
}

export async function fetchFlags() {
  const { data, error } = await supabase.rpc("admin_flags");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function clearFlags(questionId) {
  const { error } = await supabase.rpc("admin_clear_flags", { qid: questionId });
  if (error) throw new Error(error.message);
}

/** A new account reaching an onboarding step (migration 0055). First time
    only; never queued or retried, since a lost one costs nothing. */
export function logStep(userId, step) {
  if (!userId) return;
  /* Plain insert; a second time is a duplicate and ignored (see "pick"). */
  supabase.from("onboarding_steps")
    .insert({ user_id: userId, step })
    .then(() => {}, () => {});
}

/** Your own answers over the last `days` (migration 0059), oldest first. */
export async function fetchMyRecentAnswers(days = 90) {
  const { data, error } = await supabase.rpc("my_recent_answers", { days });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** How many people picked each option, by its text. Empty below 10 people. */
export async function fetchOptionSplit(questionId) {
  const { data, error } = await supabase.rpc("option_split", { qid: questionId });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/* year: 1, 2 … to rank within one study year; null for everyone.
   day: the phone's calendar day, for the today board; null is the week. */
export async function fetchLeaderboardWeek(year = null, day = null) {
  const args = {};
  if (year) args.yr = year;
  if (day) args.on_day = day;
  const { data, error } = await supabase.rpc("leaderboard_week", args);
  if (error) throw error;
  return data ?? [];
}

// ── Writes ────────────────────────────────────────────────────────────────
// Each returns a promise the caller is free to ignore.

export const remote = {
  practice: (userId, questionId, correct, total) => send({ kind: "practice", userId, questionId, correct, total }),
  pick:     (userId, questionId, optionText)     => send({ kind: "pick", userId, questionId, optionText }),
  answer:   (userId, questionId, correct, ms)    => send({ kind: "answer", userId, questionId, correct, ms, answeredAt: new Date().toISOString() }),
  sr:       (userId, questionId, card)           => send({ kind: "sr", userId, questionId, card }),
  addBookmark:    (userId, questionId) => send({ kind: "bookmark-add", userId, questionId }),
  removeBookmark: (userId, questionId) => send({ kind: "bookmark-remove", userId, questionId }),
  activity: (userId, day, count)  => send({ kind: "activity", userId, day, count }),
  studyTime: (userId, seconds) => send({ kind: "study-time", userId, seconds }),
  streak:   (userId, s)           => send({ kind: "streak", userId, current: s.streak, longest: s.longest, lastDate: s.lastDate }),
  goal:     (userId, goal)        => send({ kind: "goal", userId, goal }),
  profile:  (userId, patch)       => send({
    kind: "profile",
    userId,
    displayName: patch.displayName,
    nameChosen: patch.nameChosen,
    showOnLeaderboard: patch.showOnLeaderboard,
    marketingOptIn: patch.marketingOptIn,
    showAllOptions: patch.showAllOptions,
    introSeen: patch.introSeen,
    studyYear: patch.studyYear,
  }),
  questionEdit: (userId, questionId, payload) => send({ kind: "question-edit", userId, questionId, payload }),
  flag:       (userId, questionId, reason, note) => send({ kind: "flag", userId, questionId, reason, note }),
  unflag:     (userId, questionId)               => send({ kind: "flag-remove", userId, questionId }),
  /**
   * Saves questions you wrote or generated, and hands back their ids.
   *
   * The ids are the point: progress, spaced repetition and bookmarks all key
   * on them, so a question added mid-session has to carry the same id it will
   * have after a reload. Returns null if the write failed — it is queued for
   * retry like any other, and the questions join the bank on the next load.
   */
  addGenerated: async (userId, questions, deckId) => {
    const rows = questions.map(q => ({ user_id: userId, payload: q, deck_id: deckId }));
    try {
      const { data, error } = await supabase
        .from("generated_questions").insert(rows).select("id");
      if (error) throw error;
      return (data ?? []).map(r => GEN_ID_BASE + Number(r.id));
    } catch {
      enqueue({ kind: "generated-add", rows, at: Date.now() });
      return null;
    }
  },
  removeGenerated: (userId, id) =>
    send({ kind: "generated-remove", userId, id: id - GEN_ID_BASE }),
  updateGenerated: (userId, q) => {
    const { id, gen, createdAt, ...payload } = q;
    return send({ kind: "generated-update", userId, id: id - GEN_ID_BASE, payload });
  },
  clearGenerated: (userId) => send({ kind: "generated-clear", userId }),
  clearPractice:  (userId) => send({ kind: "practice-clear", userId }),
  clearSR:        (userId) => send({ kind: "sr-clear", userId }),

  // Decks. Creating waits for the id; the rest is fire-and-forget.
  createDeck: async (userId, name, parentId = null, position = 0) => {
    const { data, error } = await supabase.from("decks")
      .insert({ owner_id: userId, name, parent_id: parentId, position })
      .select("id, share_code, created_at").single();
    if (error) throw error;
    return data;
  },
  updateDeck: (deckId, patch) => inOrder(() => send({ kind: "deck-update", deckId, patch })),
  deleteDeck: (deckId)        => inOrder(() => send({ kind: "deck-delete", deckId })),
  /** Move a question to another deck (payload unchanged). */
  moveGenerated: (userId, q, deckId) => {
    const { id, gen, deckId: _d, createdAt, path, leaf, rootId, block, deck, cat, year, ...payload } = q;
    return send({ kind: "generated-update", userId, id: id - GEN_ID_BASE, payload, deckId });
  },
  /** Opening a share link copies the deck to you. Returns your new root id, or null. */
  /**
   * What a share code points at, without taking it.
   *
   * The receive screen's whole reason for existing: copyDeckByCode used to be
   * the only thing that took a code, so opening a link copied the deck before
   * anyone had seen what it was.
   */
  deckPreview: async (code) => {
    const { data, error } = await supabase.rpc("deck_preview", { code });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return row ?? null;
  },
  /**
   * Deletes the signed-in account and everything cascading from it.
   *
   * The function takes no arguments on purpose: it deletes auth.uid() and
   * there is no way to name somebody else's row.
   */
  deleteOwnAccount: async () => {
    const { error } = await supabase.rpc("delete_own_account");
    if (error) throw error;
  },
  /* A featured deck, off or back on your Study list. */
  /* A past session (lib/pastSessions), saved as it goes: queued like an
     answer, and one at a time so the newest save is the last applied. */
  saveSession: (userId, rec) => inOrder(() => send({ kind: "session-save", userId, rec })),
  /* Queued like an answer, so hiding one offline sticks. */
  hideFeatured: (deckId, hide) => send({ kind: "featured-hide", deckId, hide }),
  /* Your old copy of a featured deck, swapped for the live one: progress on
     its questions moves across, what you added yourself stays. */
  switchToFeatured: async (copyId) => {
    const { data, error } = await supabase.rpc("switch_to_featured", { copy: copyId });
    if (error) throw error;
    return data ?? 0;
  },
  /* Admin's sharing log (migration 0020): an opened link. Once an hour per
     person and deck, decided in the database. */
  logShareOpen: async (code) => {
    const { error } = await supabase.rpc("log_share_open", { code });
    if (error) throw error;
  },
  /* `skip`: ids of the shared deck's questions to leave out — ones the
     recipient already has (see ReceiveDeck). */
  copyDeckByCode: async (code, skip = []) => {
    const { data, error } = await supabase.rpc("copy_deck_by_code", { code, skip });
    if (error) throw error;
    return data;
  },
  /* Bring an existing copy of a shared deck up to date: what is new in the
     original goes into it. Returns how many were added. */
  updateCopyByCode: async (code, skip = []) => {
    const { data, error } = await supabase.rpc("update_copy_by_code", { code, skip });
    if (error) throw error;
    return data ?? 0;
  },
  /* A shared deck's questions (id, stem, correct answer), to check against
     your own before adding it. */
  sharedQuestions: async (code) => {
    const { data, error } = await supabase.rpc("shared_questions", { code });
    if (error) throw error;
    return data ?? [];
  },

};
