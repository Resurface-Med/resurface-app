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
  { id: "indigo", name: "Indigo", field: "#6851ff" },
  { id: "sea", name: "Sea", field: "#007b89" },
  { id: "green", name: "Green", field: "#00822f" },
  { id: "red", name: "Red", field: "#e00700" },
  { id: "pink", name: "Pink", field: "#d2009a" },
  { id: "purple", name: "Purple", field: "#9c2bff" },
  { id: "dark", name: "Night", field: "#0b1220" },
];

/* Retired ids. A saved choice lands on the colour that replaced it. */
const ALIAS = { teal: "sea", rose: "pink", orange: "red" };

export function knownTheme(id, color) {
  const next = ALIAS[id] || id;
  if (next === "custom") return /^#[0-9a-fA-F]{6}$/.test(String(color ?? "").trim()) ? "custom" : "light";
  return THEMES.some(t => t.id === next) ? next : "light";
}

export function themeField(id) {
  return (THEMES.find(t => t.id === id) ?? THEMES[0]).field;
}

/** White type on this field would fall short of Day, so the words go dark. */
export function themeLight(id) {
  const hex = themeField(id);
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * ch(n >> 16) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
  return 1.05 / (L + 0.05) < 4.6;
}
