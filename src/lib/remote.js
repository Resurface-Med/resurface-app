import { supabase } from "./supabase";
import { timed } from "./loadTiming";
import { GEN_ID_BASE } from "../data";
import { append, dropOnce } from "./queue";

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

function enqueue(op) {
  writeQueue(append(readQueue(), owner && !op.owner ? { ...op, owner } : op));
}

/**
 * Runs a write, and parks it for retry if it fails. Callers don't await this —
 * the UI has already updated optimistically, and a study session should never
 * block on a round-trip.
 */
async function send(op) {
  try {
    const { error } = await apply(op);
    if (error) throw error;
    return true;
  } catch {
    enqueue(op);
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
    case "profile":
      return supabase.from("profiles").update({
        ...(op.displayName !== undefined ? { display_name: op.displayName } : {}),
        ...(op.nameChosen !== undefined ? { name_chosen: op.nameChosen } : {}),
        ...(op.showOnLeaderboard !== undefined ? { show_on_leaderboard: op.showOnLeaderboard } : {}),
        ...(op.marketingOptIn !== undefined ? { marketing_opt_in: op.marketingOptIn } : {}),
        ...(op.showAllOptions !== undefined ? { show_all_options: op.showAllOptions } : {}),
        ...(op.introSeen !== undefined ? { intro_seen: op.introSeen } : {}),
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
    } catch {
      /* Left where it is, to be tried again next time. */
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
export async function loadAll(userId) {
  /* Decks alongside the rest: they were fetched after all of it, a whole
     extra round trip on every sign-in. */
  const [practice, sr, bookmarks, activity, streak, profile, generated, edits, deckRes, featured] =
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
      timed("t_featured", loadFeatured()),
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
    displayName: profile.data?.display_name ?? "",
    /* False only while the name is still the one made up from their email —
       the single question the welcome prompt exists to ask. */
    nameChosen: profile.data?.name_chosen !== false,
    showOnLeaderboard: profile.data?.show_on_leaderboard !== false,
    marketingOptIn: profile.data?.marketing_opt_in ?? null,
    showAllOptions: profile.data?.show_all_options === true,
    introSeen: profile.data?.intro_seen === true,
    // gen marks these as one person's own questions. Their ids come from this
    // table's serial and so overlap the bank's, which matters for anything
    // keyed on question_id — flags are cohort-wide, these are not.
    generated: (generated.data ?? []).map(r => ({ ...r.payload, id: GEN_ID_BASE + Number(r.id), gen: true, deckId: r.deck_id, createdAt: r.created_at })),
    questionEdits,
    decks,
    featured,
  };
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
  const { data, error } = await supabase.rpc("featured_content");
  if (error || !data) return { roots: [], decks: [], questions: [] };
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
    })),
    questions: (data.questions ?? []).map(r => ({ ...r.payload, id: GEN_ID_BASE + Number(r.id), featured: true, deckId: r.deckId })),
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
    .select("id, name, parent_id, position, share_code, created_at"), "id");
  if (error) throw error;
  return (data ?? []).map(r => ({
    id: r.id, name: r.name, parentId: r.parent_id, position: r.position,
    shareCode: r.share_code, createdAt: r.created_at,
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

export async function fetchTokenTotals() {
  const { data, error } = await supabase.rpc("admin_tokens_totals");
  if (error) throw new Error(error.message);
  return data ?? [];
}

/* Who sent whose deck to whom, newest first (migration 0020). */
export async function fetchShareLog(lim = 300) {
  const { data, error } = await supabase.rpc("admin_share_log", { lim });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/* Requests to the AI per UK day, by feature (migration 0019). */
export async function fetchAiCallsDaily(days = 30) {
  const { data, error } = await supabase.rpc("admin_ai_calls_daily", { days });
  if (error) throw new Error(error.message);
  return data ?? [];
}
/* Today's use of the free tier's 500-a-day allowance, since it last reset. */
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

export async function fetchFlags() {
  const { data, error } = await supabase.rpc("admin_flags");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function clearFlags(questionId) {
  const { error } = await supabase.rpc("admin_clear_flags", { qid: questionId });
  if (error) throw new Error(error.message);
}

export async function fetchLeaderboardWeek() {
  const { data, error } = await supabase.rpc("leaderboard_week");
  if (error) throw error;
  return data ?? [];
}

// ── Writes ────────────────────────────────────────────────────────────────
// Each returns a promise the caller is free to ignore.

export const remote = {
  practice: (userId, questionId, correct, total) => send({ kind: "practice", userId, questionId, correct, total }),
  sr:       (userId, questionId, card)           => send({ kind: "sr", userId, questionId, card }),
  addBookmark:    (userId, questionId) => send({ kind: "bookmark-add", userId, questionId }),
  removeBookmark: (userId, questionId) => send({ kind: "bookmark-remove", userId, questionId }),
  activity: (userId, day, count)  => send({ kind: "activity", userId, day, count }),
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
      enqueue({ kind: "generated-add", rows });
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
  hideFeatured: async (deckId, hide) => {
    const { error } = hide
      ? await supabase.from("featured_hidden").upsert({ deck_id: deckId })
      : await supabase.from("featured_hidden").delete().eq("deck_id", deckId);
    if (error) throw error;
  },
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
