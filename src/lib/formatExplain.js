/**
 * Turn model-ese into something a person can read.
 *
 * Gemini likes $ΔG$ and **bold**. Neither belongs on a question card as
 * source. This unwraps the common chemistry/maths LaTeX and light markdown
 * into Unicode plus a few inline marks the UI can render.
 */

const GREEK = [
  ["alpha", "α"], ["beta", "β"], ["gamma", "γ"], ["Gamma", "Γ"],
  ["delta", "δ"], ["Delta", "Δ"], ["epsilon", "ε"], ["theta", "θ"],
  ["lambda", "λ"], ["mu", "μ"], ["pi", "π"], ["sigma", "σ"],
  ["omega", "ω"], ["Omega", "Ω"],
];

const SUPER = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾",
  n: "ⁿ", i: "ⁱ",
};

const SUB = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄",
  "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎",
  a: "ₐ", e: "ₑ", o: "ₒ", x: "ₓ", n: "ₙ", i: "ᵢ",
};

function mapChars(s, table) {
  return [...s].map(ch => table[ch] ?? ch).join("");
}

function convertLatex(inner) {
  let s = inner.trim();
  s = s.replace(/\\mathrm\{([^}]*)\}/g, "$1");
  s = s.replace(/\\text\{([^}]*)\}/g, "$1");
  s = s.replace(/\\operatorname\{([^}]*)\}/g, "$1");
  for (const [name, glyph] of GREEK) {
    s = s.replace(new RegExp(`\\\\${name}(?![A-Za-z])\\s?`, "g"), glyph);
  }
  s = s.replace(/\\rightarrow\s?/g, "→");
  s = s.replace(/\\leftrightarrow\s?/g, "↔");
  s = s.replace(/\\Rightarrow\s?/g, "⇒");
  s = s.replace(/\\leq\s?/g, "≤");
  s = s.replace(/\\geq\s?/g, "≥");
  s = s.replace(/\\times\s?/g, "×");
  s = s.replace(/\\cdot\s?/g, "·");
  s = s.replace(/\\pm\s?/g, "±");
  s = s.replace(/\\circ\s?/g, "°");
  s = s.replace(/\\prime\s?/g, "′");
  s = s.replace(/\\%/g, "%");
  s = s.replace(/\\,/g, " ");
  s = s.replace(/\\\s/g, " ");
  s = s.replace(/\^\{([^}]*)\}/g, (_, x) => mapChars(x, SUPER));
  s = s.replace(/\^([A-Za-z0-9+\-])/g, (_, x) => mapChars(x, SUPER));
  s = s.replace(/_\{([^}]*)\}/g, (_, x) => mapChars(x, SUB));
  s = s.replace(/_([A-Za-z0-9+\-])/g, (_, x) => mapChars(x, SUB));
  s = s.replace(/[{}]/g, "");
  s = s.replace(/\\/g, "");
  return s;
}

/** Latex and leftover $…$ → Unicode. Markdown marks are left in place. */
export function unwrapLatex(input) {
  let s = String(input ?? "");
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, inner) => convertLatex(inner));
  s = s.replace(/\$([^$\n]+)\$/g, (_, inner) => convertLatex(inner));
  s = s.replace(/\\Delta/g, "Δ");
  s = s.replace(/\\delta/g, "δ");
  return s;
}

/**
 * Split **bold** and *italic* after latex is gone.
 * Order matters: bold first, so * inside ** is not eaten.
 */
export function splitMarks(input) {
  const s = unwrapLatex(input);
  const parts = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let m;
  while ((m = re.exec(s))) {
    if (m.index > last) parts.push({ kind: "text", text: s.slice(last, m.index) });
    parts.push({ kind: m[1] != null ? "strong" : "em", text: m[1] ?? m[2] });
    last = m.index + m[0].length;
  }
  if (last < s.length) parts.push({ kind: "text", text: s.slice(last) });
  return parts.length ? parts : [{ kind: "text", text: s }];
}
