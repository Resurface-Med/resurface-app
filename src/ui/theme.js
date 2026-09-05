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

/**
 * Four destinations.
 *
 * Practice, Review, Wrong Answers, Bookmarks and Timed were five nav items for
 * one activity — a question queue with a filter on it. They are now modes of
 * STUDY, chosen on its setup screen. Subjects and Stats merge into PROGRESS,
 * which also rescues Subjects: nothing linked to it, so it was unreachable.
 */
export const V = { DASH:"dash", STUDY:"study", PROGRESS:"progress", LEADERBOARD:"leaderboard", GENERATE:"generate", PROFILE:"profile" };


/** What STUDY draws from. Set before opening it. */
export const SCOPE = { ALL:"all", DUE:"due", WRONG:"wrong", SAVED:"saved" };

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
  padding: "clamp(20px, 2.6vw, 28px)",
  border: "1px solid var(--c-border)",
  boxShadow: "var(--c-card-shadow)",
};

/** True-white focus surface (question card, active panels). */
export const cardSolid = {
  ...card,
  background: "var(--c-card-solid)",
};

/**
 * The landing's .qcard, verbatim. The question is the thing the whole product
 * exists to show, so it gets its own surface rather than a generic panel: a
 * two-layer shadow that lifts it off the page, and padding that scales.
 */
export const qcard = {
  background: "var(--c-card-solid)",
  borderRadius: 24,
  padding: "clamp(18px, 2.2vw, 24px)",
  border: "none",
  boxShadow: "var(--c-card-shadow-lift)",
};

/** The landing's .qstem. */
export const qstem = {
  fontSize: "clamp(18px, 2vw, 23px)",
  fontWeight: 600,
  letterSpacing: "-0.6px",
  lineHeight: 1.28,
  color: C.text,
  maxWidth: "46ch",
};

export const pageWrap = {
  // The landing breathes at 1180 and scales its vertical rhythm with the
  // viewport. 760 with fixed padding was the single biggest reason the app
  // felt cramped next to it.
  maxWidth: 1080,
  margin: "0 auto",
  padding: "clamp(28px, 5vh, 52px) clamp(20px, 3vw, 40px) 64px",
  display: "flex",
  flexDirection: "column",
  gap: "clamp(18px, 2.6vh, 28px)",
  width: "100%",
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

/**
 * Type scale lifted from the landing page.
 *
 * Everything is weight 600 with tight negative tracking that grows with size —
 * that pairing is most of what makes the landing read as designed rather than
 * defaulted. Sizes are fluid for the same reason the landing's are: a heading
 * that doesn't move with the viewport looks wrong at both ends.
 */
export const h1 = {
  fontSize: "clamp(30px, 3.6vw, 42px)",
  fontWeight: 600,
  color: OF.text,
  letterSpacing: "-1.1px",
  lineHeight: 1.14,
};

/** Section title on a panel — the landing's .section-h. */
export const sectionH = {
  fontSize: "clamp(19px, 1.7vw, 23px)",
  fontWeight: 600,
  color: C.text,
  letterSpacing: "-0.6px",
  lineHeight: 1.2,
};

/** Small blue label above a section — the landing's .pill eyebrow. */
export const eyebrow = {
  display: "inline-block",
  fontSize: 13,
  fontWeight: 600,
  color: C.accent,
  background: "var(--c-wash)",
  padding: "7px 16px",
  borderRadius: "var(--r-pill)",
  letterSpacing: "-0.1px",
};

/** The same pill sitting on the blue field. */
export const eyebrowField = {
  ...eyebrow,
  color: "#fff",
  background: "rgba(255,255,255,0.16)",
};

/** Body copy inside a panel. */
export const body = {
  fontSize: 15,
  fontWeight: 400,
  color: C.sub,
  lineHeight: 1.55,
  letterSpacing: "-0.1px",
};

/** Meta and captions. */
export const meta = {
  fontSize: 13.5,
  fontWeight: 500,
  color: C.muted,
  letterSpacing: "-0.1px",
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

export const h2 = {
  fontSize: 15,
  fontWeight: 600,
  color: C.sub,
  letterSpacing: -0.2,
  marginTop: 8,
};

/**
 * Three buttons, matching the landing's .btn-white, .btn-ghost and .nav-cta.
 *
 * The app had ten recipes at three different sizes and weights — individually
 * fine, collectively no system, which is most of what reads as unfinished.
 * These share one shape: pill radius, weight 600, the same transition. Only
 * the fill changes, and `lg` restores the landing's hero proportions for the
 * few places that want them.
 *
 * The landing's own buttons are 16px/32px — right for a hero, too heavy for a
 * toolbar — so the app default is a notch tighter and `lg` is the landing size.
 */
const btnBase = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 9,
  padding: "13px 28px",
  borderRadius: "var(--r-pill)",
  fontSize: 15,
  fontWeight: 600,
  letterSpacing: -0.15,
  cursor: "pointer",
  fontFamily: "inherit",
  border: "none",
  transition: "transform 0.18s ease, background 0.18s ease, box-shadow 0.18s ease",
};

export const lg = { padding: "16px 32px", fontSize: 16 };

/** Blue fill, white text. The primary action on a panel. */
export const btnBlue = {
  ...btnBase,
  background: "var(--c-accent)",
  color: "#fff",
  boxShadow: "var(--c-cta-shadow)",
};

/** Field-object fill, ink text. The primary action on the blue field. */
export const btnWhite = {
  ...btnBase,
  background: "var(--c-field-object)",
  color: "var(--c-field-object-ink)",
  boxShadow: "var(--c-cta-shadow)",
};

/** Outlined. Secondary anywhere; pass onField for the white-on-blue variant. */
export const btnGhost = {
  ...btnBase,
  background: "transparent",
  color: C.sub,
  border: "1.5px solid var(--c-border)",
  boxShadow: "none",
};

export const btnGhostField = {
  ...btnGhost,
  color: "#fff",
  border: "1.5px solid var(--c-field-ghost-border)",
};

// Existing call sites keep working: the old names are these three now, so the
// whole app picks up one set of metrics without touching every file.
export const primaryBtn = btnBlue;
export const fieldBtn = btnWhite;
export const fieldGhostBtn = btnGhostField;

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
  boxShadow: "var(--c-card-shadow)",
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

/** Chip inside a card: panel pill, accent fill when chosen. */
export const chipBtn = {
  padding: "10px 18px",
  background: "var(--c-surface3)",
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
  background: "var(--c-field-object)",
  border: "1.5px solid var(--c-field-object)",
  color: "var(--c-field-object-ink)",
  boxShadow: "0 8px 20px rgba(15, 27, 61, 0.18)",
  fontWeight: 600,
};

// No icons. The landing's nav is text and a CTA, and the glyphs this used to
// carry (⊞ ▷ ↻ ✗ ★ ✦ ◉) were typographic symbols rather than an icon set —
// rendering differently on every platform and reading as leftovers beside the
// landing's illustrations. Four labelled items need no legend.
export const NAV = [
  { k: V.DASH,        label: "Home" },
  { k: V.STUDY,       label: "Study" },
  { k: V.PROGRESS,    label: "Progress" },
  { k: V.LEADERBOARD, label: "Leaderboard" },
  { k: V.GENERATE,    label: "Generate" },
];
