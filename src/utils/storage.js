const KEYS = {
  practice: "pq_practice",
  sr: "pq_sr",
  bookmarks: "pq_bookmarks",
  streak: "pq_streak",
  timedBest: "pq_timed_best",
  activity: "pq_activity",
  generated: "pq_generated",
  passcode: "pq_passcode",
  questionEdits: "pq_question_edits",
};

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

export const practiceStore = {
  load: () => load(KEYS.practice, {}),
  save: (v) => save(KEYS.practice, v),
  clear: () => save(KEYS.practice, {}),
};

export const srStore = {
  load: () => load(KEYS.sr, {}),
  save: (v) => save(KEYS.sr, v),
  clear: () => save(KEYS.sr, {}),
};

export const bookmarkStore = {
  load: () => load(KEYS.bookmarks, []),
  save: (v) => save(KEYS.bookmarks, v),
};

export const timedBestStore = {
  load: () => load(KEYS.timedBest, {}),
  save: (v) => save(KEYS.timedBest, v),
};

export const generatedStore = {
  load: () => load(KEYS.generated, []),
  save: (v) => save(KEYS.generated, v),
  add: (questions) => {
    const existing = load(KEYS.generated, []);
    const maxId = existing.reduce((m, q) => Math.max(m, q.id), 9999);
    const withIds = questions.map((q, i) => ({ ...q, id: maxId + 1 + i }));
    save(KEYS.generated, [...existing, ...withIds]);
    return existing.length + withIds.length;
  },
  clear: () => save(KEYS.generated, []),
};

export const goalStore = {
  get: () => { try { return parseInt(localStorage.getItem("pq_daily_goal") || "20"); } catch { return 20; } },
  set: (n) => { try { localStorage.setItem("pq_daily_goal", String(n)); } catch {} },
};

export const questionEditsStore = {
  load: () => load(KEYS.questionEdits, {}),
  set: (id, q) => {
    const all = load(KEYS.questionEdits, {});
    all[id] = q;
    save(KEYS.questionEdits, all);
  },
  clear: (id) => {
    const all = load(KEYS.questionEdits, {});
    delete all[id];
    save(KEYS.questionEdits, all);
  },
};

// Shared access code for /api/generate. Not a security boundary — it just
// stops a forwarded link from running up the API bill.
export const passcodeStore = {
  get: () => { try { return localStorage.getItem(KEYS.passcode) || ""; } catch { return ""; } },
  set: (k) => { try { localStorage.setItem(KEYS.passcode, k); } catch {} },
  clear: () => { try { localStorage.removeItem(KEYS.passcode); } catch {} },
};

export const themeStore = {
  get: () => { try { return localStorage.getItem('pq_theme') || 'dark'; } catch { return 'dark'; } },
  set: (t) => { try { localStorage.setItem('pq_theme', t); } catch {} },
};

export const activityStore = {
  load: () => load(KEYS.activity, {}),
  record: (n = 1) => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const data = load(KEYS.activity, {});
    data[today] = (data[today] || 0) + n;
    save(KEYS.activity, data);
    return data;
  },
};

export function updateStreak() {
  const today = new Date().toDateString();
  const s = load(KEYS.streak, { streak: 0, lastDate: null, longest: 0 });
  if (s.lastDate === today) return s;
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  const streak = s.lastDate === yesterday ? s.streak + 1 : 1;
  const longest = Math.max(streak, s.longest || 0);
  const next = { streak, lastDate: today, longest };
  save(KEYS.streak, next);
  return next;
}

export function loadStreak() {
  return load(KEYS.streak, { streak: 0, lastDate: null, longest: 0 });
}
