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
  borderRadius: "var(--r-panel)",
  padding: 28,
  border: "1px solid var(--c-border)",
  boxShadow: "var(--c-card-shadow)",
};

/** True-white focus surface (question card, active panels). */
export const cardSolid = {
  ...card,
  background: "var(--c-card-solid)",
};

export const pageWrap = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "36px 28px 48px",
  display: "flex",
  flexDirection: "column",
  gap: 20,
};

/**
 * Text sitting directly on the blue field.
 *
 * C.text / C.sub / C.muted are ink colours — they assume a white or panel
 * surface underneath. Used on the field they render dark-on-blue and become
 * unreadable in light theme. Anything outside a card must use these instead.
 */
export const OF = {
  text:  "var(--c-on-field)",
  soft:  "var(--c-on-field-soft)",
  faint: "var(--c-on-field-faint)",
  pos:   "var(--c-of-pos)",
  warn:  "var(--c-of-warn)",
  neg:   "var(--c-of-neg)",
};

export const h1 = {
  fontSize: 36,
  fontWeight: 600,
  color: OF.text,
  letterSpacing: -1.2,
  lineHeight: 1.15,
};

/** The line under a page title. Always on the field, so never ink. */
export const pageSub = {
  color: OF.soft,
  fontSize: 15,
  marginTop: 4,
  fontWeight: 500,
  letterSpacing: -0.2,
};

/** Frosted object floating on the field — the landing's glass card. */
export const glassCard = {
  background: "rgba(255,255,255,0.14)",
  border: "1.5px solid rgba(255,255,255,0.32)",
  borderRadius: "var(--r-panel)",
  padding: 24,
  boxShadow: "0 16px 36px rgba(15,27,61,0.18)",
  backdropFilter: "blur(14px) saturate(160%)",
  WebkitBackdropFilter: "blur(14px) saturate(160%)",
  color: OF.text,
};

/** Secondary action on the field: outlined white pill, not muted ink. */
export const fieldGhostBtn = {
  padding: "11px 20px",
  borderRadius: "var(--r-pill)",
  border: "1.5px solid rgba(255,255,255,0.4)",
  background: "transparent",
  color: OF.text,
  fontSize: 15,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "inherit",
};

export const h2 = {
  fontSize: 15,
  fontWeight: 600,
  color: C.sub,
  letterSpacing: -0.2,
  marginTop: 8,
};

/** White CTA for actions sitting on the blue field (landing .btn-white). */
export const fieldBtn = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "12px 26px",
  background: "#fff",
  color: "var(--blue, #3562f5)",
  border: "none",
  borderRadius: "var(--r-pill)",
  fontWeight: 600,
  fontSize: 15,
  cursor: "pointer",
  fontFamily: "inherit",
  boxShadow: "0 12px 30px rgba(20, 44, 130, 0.22)",
  letterSpacing: -0.15,
  transition: "transform 0.16s ease, box-shadow 0.16s ease",
};

export const primaryBtn = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "12px 26px",
  background: "var(--c-accent)",
  color: "#fff",
  border: "none",
  borderRadius: "var(--r-pill)",
  fontWeight: 600,
  fontSize: 15,
  cursor: "pointer",
  fontFamily: "inherit",
  boxShadow: "0 12px 30px rgba(20, 44, 130, 0.22)",
  letterSpacing: -0.15,
  transition: "background 0.16s ease, transform 0.16s ease, box-shadow 0.16s ease",
};

export const selectBtn = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "13px 18px",
  background: "var(--c-card-solid)",
  border: "1.5px solid var(--c-border)",
  borderRadius: "var(--r-card)",
  color: C.text,
  fontSize: 15,
  cursor: "pointer",
  fontFamily: "inherit",
  boxShadow: "0 8px 20px rgba(15, 27, 61, 0.12)",
};

/**
 * Controls come in two surface flavours. The panel versions are the default
 * because most of them live inside a card; the field versions are for the few
 * that sit on the blue. Getting this backwards makes white-on-white controls
 * that are invisible until you click them.
 */

/** Field label inside a card. */
export const label = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: C.sub,
  marginBottom: 10,
  letterSpacing: -0.15,
};

/** Field label sitting on the blue. */
export const labelField = {
  ...label,
  color: OF.soft,
};

/** Chip inside a card: white pill on the panel, accent fill when chosen. */
export const chipBtn = {
  padding: "10px 18px",
  background: "var(--c-card-solid)",
  border: "1.5px solid var(--c-border)",
  borderRadius: "var(--r-pill)",
  color: C.sub,
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "inherit",
  transition: "all 0.15s ease",
  letterSpacing: -0.1,
};

export const chipBtnActive = {
  ...chipBtn,
  background: "var(--c-accent)",
  border: "1.5px solid var(--c-accent)",
  color: "#fff",
  boxShadow: "0 8px 20px rgba(20, 44, 130, 0.22)",
  fontWeight: 600,
};

/** Chip on the blue field: frosted, white fill when chosen. */
export const chipField = {
  ...chipBtn,
  background: "rgba(255,255,255,0.14)",
  border: "1.5px solid rgba(255,255,255,0.35)",
  color: "#fff",
};

export const chipFieldActive = {
  ...chipField,
  background: "#fff",
  border: "1.5px solid #fff",
  color: "var(--blue, #3562f5)",
  boxShadow: "0 8px 20px rgba(15, 27, 61, 0.18)",
  fontWeight: 600,
};

export const NAV = [
  { k: V.DASH,      label: "Dashboard",     icon: "⊞" },
  { k: V.PRACTICE,  label: "Practice",      icon: "▷" },
  { k: V.SR,        label: "Flashcards",    icon: "↻" },
  { k: V.WRONG,     label: "Wrong Answers", icon: "✗" },
  { k: V.BOOKMARKS, label: "Bookmarks",     icon: "★" },
  null,
  { k: V.GENERATE,  label: "AI Generate",   icon: "✦" },
  { k: V.POMODORO,  label: "Pomodoro",      icon: "◉" },
];
