/**
 * Undoing ACES, so a tone-mapped canvas can sit flush in an untone-mapped page.
 *
 * The anatomy view tone maps, which is what stops lit curved surfaces clipping
 * to flat white. But tone mapping applies to everything the renderer draws,
 * the background included — and ACES maps pure white to roughly 0.8, so a
 * canvas told to clear to the sheet's white paints a visibly grey rectangle in
 * the middle of a white sheet.
 *
 * The fix is to hand the renderer the colour that *comes out* as the sheet
 * colour. ACES is monotonic per channel after the matrices, so rather than
 * inverting it analytically this solves each channel by bisection against a
 * faithful port of three's own shader. Slow in the sense that it does sixty
 * iterations; instant in the sense that it runs three times, once per view.
 */

/* three's matrices, transposed there and transposed back here: GLSL mat3
   literals are column-major, so a row of the source below is a column there.
   src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js */
const IN = [
  [0.59719, 0.35458, 0.04823],
  [0.07600, 0.90834, 0.01566],
  [0.02840, 0.13383, 0.83777],
];
const OUT = [
  [1.60475, -0.53108, -0.07367],
  [-0.10208, 1.10813, -0.00605],
  [-0.00327, -0.07276, 1.07602],
];

const mul = (m, v) => m.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);

function rrtAndOdtFit(v) {
  return v.map(x => {
    const a = x * (x + 0.0245786) - 0.000090537;
    const b = x * (0.983729 * x + 0.432951) + 0.238081;
    return a / b;
  });
}

/** three's ACESFilmicToneMapping, linear in to linear out. */
export function acesFilmic(rgbLinear, exposure = 1) {
  /* The 1/0.6 is three's own, not a mistake — see the comment on the shader:
     "modified to accommodate a brighter viewing environment". */
  const scaled = rgbLinear.map(c => (c * exposure) / 0.6);
  return mul(OUT, rrtAndOdtFit(mul(IN, scaled))).map(clamp01);
}

export const srgbToLinear = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export const linearToSrgb = c => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/**
 * The linear colour to clear to so that the tone-mapped result displays as
 * `hex`. Returns linear components, which is what THREE.Color holds.
 *
 * Solved rather than inverted: the curve is a rational function between two
 * matrix multiplies, so every output channel depends on all three inputs.
 * A first attempt bisected each channel on its own and the round-trip test
 * rejected it — the cross terms are worth several 8-bit steps, not the
 * fraction of one that assumption needed. This iterates on the whole colour
 * instead, scaling each channel by how far short of the target it landed,
 * which converges in a handful of passes because the matrices are strongly
 * diagonal and the fit is monotonic over the range a page background uses.
 */
export function preToneMap(hex, exposure = 1) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const target = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => srgbToLinear(v / 255));

  let x = target.slice();
  for (let k = 0; k < 80; k++) {
    const y = acesFilmic(x, exposure);
    let worst = 0;
    for (let i = 0; i < 3; i++) {
      const err = target[i] - y[i];
      if (Math.abs(err) > worst) worst = Math.abs(err);
      /* A ratio step where there is signal, an additive nudge where the
         channel has gone to zero and a ratio would be stuck there. */
      x[i] = y[i] > 1e-6 ? Math.max(0, x[i] * (target[i] / y[i])) : Math.max(0, x[i] + err);
    }
    if (worst < 1e-7) break;
  }
  return x;
}
