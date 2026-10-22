/**
 * A colour chosen in the picker, turned into the same tokens a preset theme
 * sets. The page field is the colour itself. Controls on a white card use it
 * too, unless it is too light to hold white type, in which case they use a
 * deeper shade of that same colour and the type on the field goes dark.
 */

export function normalizeHex(value) {
  const m = String(value ?? "").trim().match(/^#?([0-9a-fA-F]{6})$/);
  return m ? `#${m[1].toLowerCase()}` : "";
}

function parse(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hexOf(rgb) {
  return `#${rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
}

function mix(a, b, t) {
  return a.map((v, i) => v + (b[i] - v) * t);
}

function lin(c) {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

function rel(rgb) {
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}

/** Contrast of `rgb` against white. */
function contrast(rgb) {
  const L = rel(rgb);
  return 1.05 / (L + 0.05);
}

function rgba(rgb, a) {
  return `rgba(${rgb.map(v => Math.round(v)).join(", ")}, ${a})`;
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return [f(0), f(8), f(4)].map(v => v * 255);
}

/** A desaturated ink of this hue, at the contrast Day uses for that role. */
function ink(h, s, target) {
  let best = null;
  for (let l = 0.08; l <= 0.84; l += 0.012) {
    const c = hslToRgb(h, s, l);
    const d = Math.abs(contrast(c) - target);
    if (!best || d < best.d) best = { c, d };
  }
  return best.c;
}

/**
 * Deepen until white type on it clears the same bar as Day.
 * Lightness drops on the same hue. Mixing a pastel toward black passes
 * through grey, and the button would no longer be the colour that was picked.
 */
function deepen(rgb) {
  if (contrast(rgb) >= 4.6) return rgb.slice();
  const [h, s] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  const sat = s < 0.08 ? s : Math.max(s, 0.55);
  let best = rgb.slice();
  for (let l = 0.48; l >= 0.16; l -= 0.012) {
    best = hslToRgb(h, sat, l);
    if (contrast(best) >= 5.05) break;
  }
  return best;
}

const KEYS = [
  "--c-bg", "--c-body-bg", "--c-accent", "--c-accent-lt", "--c-accent-rgb",
  "--c-ink-rgb", "--c-shade", "--c-text", "--c-sub", "--c-muted", "--c-muted-dim",
  "--c-surface2", "--c-surface3", "--c-card-bg", "--c-wash",
  "--c-nav-text", "--c-nav-sub", "--c-nav-muted", "--c-nav-muted-dim",
  "--c-field-object", "--c-field-object-ink", "--c-field-ghost-border",
  "--c-field-ghost", "--c-field-ghost-line",
  "--c-on-field", "--c-on-field-soft", "--c-on-field-faint",
  "--c-scrollbar", "--c-scrollbar-hover",
  "--c-of-pos", "--c-of-warn", "--c-of-neg",
  "--c-body-overlay-bg",
];

/**
 * `field` is light when white type on it would fall short of Day. The page
 * still wears the picked colour; the words and the buttons adjust.
 */
export function themeTokens(value) {
  const hex = normalizeHex(value);
  if (!hex) return null;
  const field = parse(hex);
  const [h, sat] = rgbToHsl(field[0], field[1], field[2]);
  const inkS = Math.min(0.42, sat * 0.55 + 0.04);
  const text = ink(h, inkS, 15);
  const sub = ink(h, inkS * 0.55, 5.84);
  const muted = ink(h, inkS * 0.35, 3.06);
  const dim = ink(h, inkS * 0.22, 2);
  const light = contrast(field) < 4.6;
  const accent = deepen(field);
  const accentLt = mix(accent, [0, 0, 0], 0.2);
  const s2 = mix(field, [255, 255, 255], 0.94);
  const s3 = mix(field, [255, 255, 255], 0.88);
  const shade = mix(accent, [0, 0, 0], 0.62);
  const blob = mix(field, [255, 255, 255], 0.55);
  const vars = {
    "--c-bg": hex,
    "--c-body-bg": hex,
    "--c-accent": hexOf(accent),
    "--c-accent-lt": hexOf(accentLt),
    "--c-accent-rgb": accent.map(v => Math.round(v)).join(", "),
    "--c-ink-rgb": text.map(v => Math.round(v)).join(", "),
    "--c-shade": shade.map(v => Math.round(v)).join(", "),
    "--c-text": hexOf(text),
    "--c-sub": hexOf(sub),
    "--c-muted": hexOf(muted),
    "--c-muted-dim": hexOf(dim),
    "--c-surface2": hexOf(s2),
    "--c-surface3": hexOf(s3),
    "--c-card-bg": hexOf(s2),
    "--c-wash": hexOf(s3),
    "--c-nav-text": hexOf(text),
    "--c-nav-sub": hexOf(sub),
    "--c-nav-muted": hexOf(muted),
    "--c-nav-muted-dim": hexOf(dim),
    "--c-field-object": light ? hexOf(accent) : "#ffffff",
    "--c-field-object-ink": light ? "#ffffff" : hex,
    "--c-field-ghost": light ? rgba(text, 0.08) : "rgba(255, 255, 255, 0.14)",
    "--c-field-ghost-line": light ? rgba(text, 0.28) : "rgba(255, 255, 255, 0.32)",
    "--c-field-ghost-border": light ? rgba(text, 0.4) : "rgba(255, 255, 255, 0.5)",
    "--c-on-field": light ? hexOf(text) : "#ffffff",
    "--c-on-field-soft": light ? rgba(text, 0.82) : "rgba(255, 255, 255, 0.94)",
    "--c-on-field-faint": light ? rgba(text, 0.64) : "rgba(255, 255, 255, 0.82)",
    "--c-scrollbar": light ? rgba(text, 0.28) : "rgba(255, 255, 255, 0.35)",
    "--c-scrollbar-hover": light ? rgba(text, 0.45) : "rgba(255, 255, 255, 0.55)",
    "--c-body-overlay-bg":
      `radial-gradient(ellipse 48% 42% at 12% 18%, rgba(255, 255, 255, 0.16) 0%, transparent 70%), radial-gradient(ellipse 40% 38% at 88% 12%, rgba(${blob.map(v => Math.round(v)).join(", ")}, 0.42) 0%, transparent 68%), radial-gradient(ellipse 55% 45% at 70% 88%, rgba(255, 255, 255, 0.1) 0%, transparent 72%)`,
  };
  if (light) {
    vars["--c-of-pos"] = "#157a45";
    vars["--c-of-warn"] = "#8a5a00";
    vars["--c-of-neg"] = "#b42318";
  }
  return { fieldTone: light ? "light" : "dark", vars };
}

export function applyThemeColor(value) {
  const tokens = themeTokens(value);
  if (!tokens || typeof document === "undefined") return;
  const root = document.documentElement;
  clearThemeColor();
  root.setAttribute("data-field", tokens.fieldTone);
  for (const [key, val] of Object.entries(tokens.vars)) root.style.setProperty(key, val);
}

export function clearThemeColor() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.removeAttribute("data-field");
  for (const key of KEYS) root.style.removeProperty(key);
}
