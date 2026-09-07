/**
 * A colour per structure, rather than a colour per system.
 *
 * The atlas ships fifteen system colours and the view was using them directly,
 * so all ninety-seven digestive meshes painted the same brown — a stomach, a
 * gallbladder, the biliary tree and the mesentery rendered as one continuous
 * mass with no edge between them. The system colour is right as a family; it
 * is wrong as the whole answer.
 *
 * Two things happen here. Organs that anatomical illustration has always given
 * a particular colour keep it — bile is green, spleen is purple — because a
 * reader already knows those and inventing new ones would be worse than
 * useless. Everything else is nudged around its system's hue by a fixed amount
 * derived from its position in the list, so neighbouring structures separate
 * without leaving the family.
 */

/* Conventional where convention exists. Matched against the concept name, not
   the mesh name, so every segment of one organ agrees — the three parts of the
   ileum are one bowel, and a bowel striped in three tones is a worse lie than
   a bowel in one. Order matters: the first match wins, so narrow patterns
   come before the broad ones they would otherwise be swallowed by. */
export const ORGAN_TINTS = [
  [/gall ?bladder|cystic duct|biliary|hepatic duct|bile/, "#7d9e55"],
  [/spleen|splenic/, "#7c5573"],
  [/liver|hepatic (lobe|segment)|caudate lobe/, "#8f5c4e"],
  [/pancrea/, "#c9a86a"],
  [/kidney|renal|ureter|urinary bladder|urethra/, "#b06a4f"],
  [/suprarenal|adrenal|thyroid|pituitary|pineal|thymus/, "#c58f96"],
  /* Before the bowel rules, not after. "Mesentery of small intestine" and
     "mesoappendix" both name the fat that carries a gut tube, not the tube,
     and against the old order they matched "small intestine" and "appendix"
     first — so the mesentery painted as gut and the gut lost its edge against
     it, which was a good part of what made this region read as one mass. */
  [/mesentery|mesocolon|mesoappendix|omentum|peritoneum/, "#dcc08c"],
  [/oesophagus|esophagus/, "#bf8d80"],
  /* \b on gastric, or "digastric" — a muscle of the floor of the mouth —
     matches it and paints as stomach. */
  [/stomach|\bgastric\b/, "#c98a6b"],
  [/duodenum|jejunum|ileum|small intestine/, "#cf9a76"],
  [/colon|caecum|cecum|taenia|appendix/, "#b3854f"],
  [/rectum|anal/, "#a2734c"],
  [/salivary|sublingual|submandibular|parotid/, "#d3b49a"],
  [/trachea|bronch|lung|pleura|alveol/, "#c08a90"],
  [/valve|cusp|leaflet|chordae/, "#d8c7b4"],
];

const hex2rgb = h => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgb2hex = ([r, g, b]) =>
  "#" + [r, g, b].map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");

export function rgb2hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

export function hsl2rgb([h, s, l]) {
  h = ((h % 1) + 1) % 1;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = t => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

/* Two low-discrepancy sequences rather than a hash. A hash scatters, which
   means two structures can land on the same colour by chance and often do at
   these list lengths; the golden ratio spreads every new index into the
   largest remaining gap, so forty-six concepts come out evenly separated
   instead of clumped. A second, different irrational keeps lightness from
   moving in lockstep with hue. */
const PHI = 0.6180339887498949;
const PSI = 0.7548776662466927;
const frac = x => x - Math.floor(x);

/**
 * The colour for one structure.
 *
 * `index` is its concept's position among the concepts of its own system, so
 * the spread is per family — the fourteen digestive concepts without a
 * conventional colour divide the digestive hue range between them rather than
 * competing with the arteries for it.
 */
/* Systems whose own colour is a stronger convention than any organ's.
   An artery is red and a vein is blue wherever they run, so the splenic artery
   is a red vessel and not a purple one, and the renal artery is not kidney
   coloured. Without this, seventy-eight vessels, bones and muscles across the
   two bundles were taking an organ's tint from a word in their own name. */
const CONDUITS = new Set(["arterial", "venous", "skeletal", "muscular", "nervous", "connective"]);

export function structureColour({ base, concept = "", index = 0, system = "" }) {
  const name = concept.toLowerCase();
  if (!CONDUITS.has(system)) {
    for (const [pattern, tint] of ORGAN_TINTS) if (pattern.test(name)) return tint;
  }

  const [h, s, l] = rgb2hsl(hex2rgb(base));
  /* Bounded on purpose. Wide enough that two organs side by side never read as
     one surface, narrow enough that the system still reads as a family — the
     point of the system colour is that you can tell bone from bowel at a
     glance without consulting the legend. */
  const dh = (frac(index * PHI) - 0.5) * 0.075;
  const dl = (frac(index * PSI) - 0.5) * 0.20;
  return rgb2hex(hsl2rgb([h + dh, s, Math.min(0.82, Math.max(0.18, l + dl))]));
}
