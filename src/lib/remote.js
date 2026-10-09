import { supabase } from "./supabase";
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

function enqueue(op) {
  writeQueue(append(readQueue(), op));
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
export async function flushQueue() {
  const start = readQueue();
  if (start.length === 0) return { flushed: 0, remaining: 0 };

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

/** One round-trip per table, on sign-in. Shapes match what App.jsx already holds. */
export async function loadAll(userId) {
  const [practice, sr, bookmarks, activity, streak, profile, generated, edits] =
    await Promise.all([
      supabase.from("practice_stats").select("question_id, correct, total").eq("user_id", userId),
      supabase.from("sr_cards").select("*").eq("user_id", userId),
      supabase.from("bookmarks").select("question_id").eq("user_id", userId),
      supabase.from("activity").select("day, count").eq("user_id", userId),
      supabase.from("streaks").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("generated_questions").select("id, payload, deck_id, created_at").eq("user_id", userId),
      supabase.from("question_edits").select("question_id, payload").eq("user_id", userId),
    ]);
  const decks = await loadUserDecks();

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
    // gen marks these as one person's own questions. Their ids come from this
    // table's serial and so overlap the bank's, which matters for anything
    // keyed on question_id — flags are cohort-wide, these are not.
    generated: (generated.data ?? []).map(r => ({ ...r.payload, id: GEN_ID_BASE + Number(r.id), gen: true, deckId: r.deck_id, createdAt: r.created_at })),
    questionEdits,
    decks,
  };
}

/** Your decks, as rows. The tree is built in the app. */
export async function loadUserDecks() {
  const { data, error } = await supabase.from("decks")
    .select("id, name, parent_id, position, share_code, created_at");
  if (error) return [];
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
  updateDeck: (deckId, patch) => send({ kind: "deck-update", deckId, patch }),
  deleteDeck: (deckId)        => send({ kind: "deck-delete", deckId }),
  /** Move a question to another deck (payload unchanged). */
  moveGenerated: (userId, q, deckId) => {
    const { id, gen, deckId: _d, createdAt, path, leaf, rootId, block, deck, cat, year, ...payload } = q;
    return send({ kind: "generated-update", userId, id: id - GEN_ID_BASE, payload, deckId });
  },
  /** Opening a share link copies the deck to you. Returns your new root id, or null. */
  copyDeckByCode: async (code) => {
    const { data, error } = await supabase.rpc("copy_deck_by_code", { code });
    if (error) throw error;
    return data;
  },

};
