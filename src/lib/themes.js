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
  { id: "teal", name: "Teal", field: "#107888" },
  { id: "green", name: "Green", field: "#1a7d4e" },
  { id: "purple", name: "Purple", field: "#7348dc" },
  { id: "red", name: "Red", field: "#c23b45" },
  { id: "dark", name: "Night", field: "#0b1220" },
];

export function knownTheme(id) {
  return THEMES.some(t => t.id === id) ? id : "light";
}

export function themeField(id) {
  return (THEMES.find(t => t.id === id) ?? THEMES[0]).field;
}
