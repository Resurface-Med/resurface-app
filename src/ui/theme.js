export const C = {
  bg:         "var(--c-bg)",
  surface:    "var(--c-surface)",
  surface2:   "var(--c-surface2)",
  surface3:   "var(--c-surface3)",
  border:     "var(--c-border)",
  borderBlu:  "var(--c-border-blu)",
  text:       "var(--c-text)",
  sub:        "var(--c-sub)",
  muted:      "var(--c-muted)",
  mutedDim:   "var(--c-muted-dim)",

  accent:     "var(--c-accent)",
  accentLt:   "var(--c-accent-lt)",
  accentDim:  "var(--c-accent-dim)",
  accentBrd:  "var(--c-accent-brd)",
  accentGlow: "var(--c-accent-glow)",

  success:    "var(--c-success)",
  successDim: "var(--c-success-dim)",
  successBrd: "var(--c-success-brd)",

  danger:     "var(--c-danger)",
  dangerDim:  "var(--c-danger-dim)",
  dangerBrd:  "var(--c-danger-brd)",

  warning:    "var(--c-warning)",
  warningDim: "var(--c-warning-dim)",
  warningBrd: "var(--c-warning-brd)",

  orange:     "var(--c-orange)",
  orangeDim:  "var(--c-orange-dim)",
  orangeBrd:  "var(--c-orange-brd)",
};

export const V = { DASH:"dash", SUBJECTS:"subjects", PRACTICE:"practice", SR:"sr", TIMED:"timed", STATS:"stats", BOOKMARKS:"bookmarks", WRONG:"wrong", GENERATE:"generate", POMODORO:"pomodoro" };

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Randomise the order of a question's options, updating ans and optExp to match
export function shuffleOptions(q) {
  const n = q.opts.length;
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    ...q,
    opts: order.map(i => q.opts[i]),
    ans: order.indexOf(q.ans),
    optExp: q.optExp ? order.map(i => q.optExp[i]) : undefined,
  };
}

export const card = {
  background: "var(--c-card-bg)",
  borderRadius: 18,
  padding: 28,
  border: "1px solid var(--c-border)",
  boxShadow: "var(--c-card-shadow)",
};

export const pageWrap = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "40px 28px",
  display: "flex",
  flexDirection: "column",
  gap: 20,
};

export const h1 = {
  fontSize: 38,
  fontWeight: 300,
  color: C.text,
  letterSpacing: -0.5,
  lineHeight: 1.15,
};

export const h2 = {
  fontSize: 13,
  fontWeight: 600,
  color: C.muted,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  marginTop: 8,
};

export const primaryBtn = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "11px 24px",
  background: "linear-gradient(135deg, #4d8ef5 0%, #2563eb 100%)",
  color: "#fff",
  border: "none",
  borderRadius: 12,
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
  fontFamily: "inherit",
  boxShadow: "0 0 24px rgba(77,142,245,0.3), 0 4px 16px rgba(0,0,0,0.3)",
  letterSpacing: 0.1,
  transition: "opacity 0.15s, transform 0.1s",
};

export const selectBtn = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "13px 16px",
  background: C.surface2,
  border: "1px solid var(--c-border)",
  borderRadius: 12,
  color: C.text,
  fontSize: 15,
  cursor: "pointer",
  fontFamily: "inherit",
};

export const label = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: C.muted,
  marginBottom: 10,
  letterSpacing: 1,
  textTransform: "uppercase",
};

export const chipBtn = {
  padding: "10px 20px",
  background: C.surface2,
  border: "1px solid var(--c-border)",
  borderRadius: 12,
  color: C.sub,
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "inherit",
  transition: "all 0.15s",
};

export const chipBtnActive = {
  ...chipBtn,
  background: C.accentDim,
  border: "1px solid var(--c-accent-brd)",
  color: C.accentLt,
  boxShadow: "0 0 14px var(--c-accent-glow)",
};

export const NAV = [
  { k: V.DASH,     label: "Dashboard",    icon: "⊞" },
  { k: V.PRACTICE, label: "Practice",     icon: "▷" },
  { k: V.SR,       label: "Flashcards",   icon: "↻" },
  { k: V.WRONG,    label: "Wrong Answers",icon: "✗" },
  null,
  { k: V.GENERATE, label: "AI Generate",  icon: "✦" },
  { k: V.POMODORO, label: "Pomodoro",     icon: "◉" },
];
