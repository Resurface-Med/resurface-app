import { supabase } from "./supabase";

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
  const q = readQueue();
  // Cap it: an offline session shouldn't grow unbounded, and the newest
  // writes are the ones worth keeping.
  writeQueue([...q, op].slice(-500));
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
    case "timed-best":
      return supabase.from("timed_bests").upsert({ user_id: op.userId, scope: op.scope, score: op.score });
    case "question-edit":
      return supabase.from("question_edits").upsert({
        user_id: op.userId, question_id: op.questionId,
        payload: op.payload, updated_at: new Date().toISOString(),
      });
    case "generated-add":
      return supabase.from("generated_questions").insert(op.rows);
    case "generated-clear":
      return supabase.from("generated_questions").delete().eq("user_id", op.userId);
    case "practice-clear":
      return supabase.from("practice_stats").delete().eq("user_id", op.userId);
    case "sr-clear":
      return supabase.from("sr_cards").delete().eq("user_id", op.userId);
    default:
      return Promise.resolve({ error: new Error(`unknown op ${op.kind}`) });
  }
}

/** Drains anything parked by a failed write. Safe to call repeatedly. */
export async function flushQueue() {
  const q = readQueue();
  if (q.length === 0) return { flushed: 0, remaining: 0 };

  writeQueue([]);
  const failed = [];
  for (const op of q) {
    try {
      const { error } = await apply(op);
      if (error) failed.push(op);
    } catch {
      failed.push(op);
    }
  }
  writeQueue(failed);
  return { flushed: q.length - failed.length, remaining: failed.length };
}

export function queuedCount() {
  return readQueue().length;
}

/** One round-trip per table, on sign-in. Shapes match what App.jsx already holds. */
export async function loadAll(userId) {
  const [practice, sr, bookmarks, activity, streak, profile, timed, generated, edits] =
    await Promise.all([
      supabase.from("practice_stats").select("question_id, correct, total").eq("user_id", userId),
      supabase.from("sr_cards").select("*").eq("user_id", userId),
      supabase.from("bookmarks").select("question_id").eq("user_id", userId),
      supabase.from("activity").select("day, count").eq("user_id", userId),
      supabase.from("streaks").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("timed_bests").select("scope, score").eq("user_id", userId),
      supabase.from("generated_questions").select("id, payload").eq("user_id", userId),
      supabase.from("question_edits").select("question_id, payload").eq("user_id", userId),
    ]);

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

  const timedBests = {};
  for (const r of timed.data ?? []) timedBests[r.scope] = r.score;

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
    timedBests,
    generated: (generated.data ?? []).map(r => ({ ...r.payload, id: Number(r.id) })),
    questionEdits,
  };
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
  timedBest:(userId, scope, score)=> send({ kind: "timed-best", userId, scope, score }),
  questionEdit: (userId, questionId, payload) => send({ kind: "question-edit", userId, questionId, payload }),
  addGenerated: (userId, questions) =>
    send({ kind: "generated-add", rows: questions.map(q => ({ user_id: userId, payload: q })) }),
  clearGenerated: (userId) => send({ kind: "generated-clear", userId }),
  clearPractice:  (userId) => send({ kind: "practice-clear", userId }),
  clearSR:        (userId) => send({ kind: "sr-clear", userId }),
};
