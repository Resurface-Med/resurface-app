/**
 * Colour themes. `light` and `dark` keep those ids because pq_theme already
 * stores them; renaming either would put existing Day and Night choices back
 * on the default.
 *
 * `field` is the page colour, and also the browser chrome colour. The same
 * list is copied into the boot script in index.html, which runs before this
 * module loads. tests/themes.test.js fails if the two drift.
 */
export const THEMES = [
  { id: "light", name: "Day", field: "#3562f5" },
  { id: "indigo", name: "Indigo", field: "#5b5aec" },
  { id: "sea", name: "Sea", field: "#0374b0" },
  { id: "green", name: "Green", field: "#067d52" },
  { id: "orange", name: "Orange", field: "#c4420c" },
  { id: "red", name: "Red", field: "#d52424" },
  { id: "rose", name: "Rose", field: "#d71a45" },
  { id: "pink", name: "Pink", field: "#d0216d" },
  { id: "purple", name: "Purple", field: "#7c3aed" },
  { id: "dark", name: "Night", field: "#0b1220" },
];

/* The first set of extra colours used these ids for an hour. A saved choice
   should land on the colour that replaced it, not snap back to Day. */
const ALIAS = { teal: "sea" };

export function knownTheme(id, color) {
  const next = ALIAS[id] || id;
  if (next === "custom") return /^#[0-9a-fA-F]{6}$/.test(String(color ?? "").trim()) ? "custom" : "light";
  return THEMES.some(t => t.id === next) ? next : "light";
}

export function themeField(id) {
  return (THEMES.find(t => t.id === id) ?? THEMES[0]).field;
}
