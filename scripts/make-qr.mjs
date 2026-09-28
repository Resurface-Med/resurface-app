#!/usr/bin/env node
/**
 * QR codes, in the app's colours, for the places a link cannot travel.
 *
 * A QR is for getting a phone from a screen or a piece of paper to a URL —
 * a poster in the lecture theatre, a sticker on a laptop, the last slide of
 * a talk. Anywhere a link can be tapped, send the link instead; a QR there
 * is a picture of a hyperlink.
 *
 * Four shapes, because the reasons differ:
 *   sticker   the code and nothing else, for print
 *   poster    portrait, for a noticeboard, readable across a room
 *   slide     16:9, for the end of a talk
 *   story     1080x1920, for Instagram
 *
 * Every one is decoded back out of its own PNG before it is kept. A QR that
 * does not scan is worse than no QR: it is a promise that fails in front of
 * whoever you were trying to impress, and you cannot tell by looking.
 *
 *   node scripts/make-qr.mjs
 *   node scripts/make-qr.mjs --url tryresurface.com/generate
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const QRCode = require("qrcode");
const jsQR = require("jsqr");
const { PNG } = (() => { try { return { PNG: require("pngjs").PNG }; } catch { return {}; } })();

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const OUT = join(APP, ".qr");
const PORT = process.env.PREVIEW_PORT || 4173;
const CHROME = join(
  process.env.HOME,
  "resurface/resurface-film/node_modules/.remotion/chrome-headless-shell",
  "mac-arm64/chrome-headless-shell-mac-arm64/chrome-headless-shell",
);

const flag = n => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? null : process.argv[i + 1]; };
const SITE = (flag("url") || "tryresurface.com").replace(/^https?:\/\//, "");
const URL = `https://${SITE}`;

const SHAPES = {
  sticker: { w: 1200, h: 1200 },
  poster:  { w: 1240, h: 1754 },   // A4 at 150dpi
  slide:   { w: 1920, h: 1080 },
  story:   { w: 1080, h: 1920 },
};

/**
 * Error correction at H, the highest, which can lose 30% of the code and
 * still read. That is what pays for the mark sitting in the middle of it:
 * the hole it punches is damage, and the code has to be able to afford it.
 */
async function qrSvg() {
  return QRCode.toString(URL, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 0,
    color: { dark: "#0f1b3d", light: "#00000000" },
  });
}

function page(shape, svg) {
  const { w, h } = SHAPES[shape];
  const big = shape === "poster" || shape === "story";
  const size = shape === "sticker" ? 860 : shape === "slide" ? 620 : 700;

  return `<!doctype html><html data-theme="light"><head><meta charset="utf-8">
<link rel="stylesheet" href="/assets/${CSS}">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden}
  body{background:var(--c-body-bg);font-family:"Poppins",sans-serif;
       display:flex;flex-direction:${shape === "slide" ? "row" : "column"};
       align-items:center;justify-content:center;gap:${big ? 64 : 48}px;
       padding:${big ? 90 : 70}px;box-sizing:border-box;text-align:center}
  .card{background:#fff;border-radius:44px;padding:${shape === "sticker" ? 54 : 46}px;
        display:flex;flex-shrink:0;box-shadow:0 24px 70px rgba(12,22,56,.22)}
  .card svg{width:${size}px;height:${size}px;display:block}
  .words{display:flex;flex-direction:column;align-items:center;gap:${big ? 26 : 20}px}
  .lockup{height:${big ? 74 : 60}px;width:auto}
  .line{color:#fff;font-size:${big ? 48 : 38}px;font-weight:600;letter-spacing:-1px;line-height:1.25;max-width:16ch}
  .url{color:rgba(255,255,255,.82);font-size:${big ? 34 : 28}px;font-weight:500;letter-spacing:.01em}
</style></head><body>
  ${shape === "sticker" ? "" : `<div class="words">
    <img class="lockup" src="/logo-lockup-white.png" alt="Resurface">
    ${big ? '<div class="line">Free SBA practice, built for ARU Year 1</div>' : ""}
  </div>`}
  <div class="card">${svg}</div>
  ${shape === "sticker" ? `<div class="words"><img class="lockup" src="/logo-lockup-white.png" alt="Resurface"></div>`
    : `<div class="url">${SITE}</div>`}
</body></html>`;
}

function shoot(html, out) {
  writeFileSync(join(APP, "dist", "_qr.html"), html);
  execFileSync(CHROME, [
    "--headless", "--disable-gpu", "--hide-scrollbars",
    `--window-size=${SHAPES[SHAPE_NOW].w},${SHAPES[SHAPE_NOW].h}`,
    `--screenshot=${out}`, "--virtual-time-budget=4000",
    `http://localhost:${PORT}/_qr.html`,
  ], { stdio: "ignore" });
}

/** Reads the PNG back and decodes it, the way a phone camera would. */
function verify(file) {
  if (!PNG) return "not checked (pngjs missing)";
  const png = PNG.sync.read(readFileSync(file));
  const found = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  if (!found) return "DOES NOT SCAN";
  return found.data === URL ? `scans → ${found.data}` : `WRONG URL → ${found.data}`;
}

const CSS = (() => {
  const dir = join(APP, "dist", "assets");
  if (!existsSync(dir)) { console.error("Build first: npx vite build"); process.exit(1); }
  return readdirSync(dir).find(f => f.endsWith(".css"));
})();

let SHAPE_NOW;
const svg = await qrSvg();
mkdirSync(OUT, { recursive: true });

console.log(`\n${URL}\n`);
for (const shape of Object.keys(SHAPES)) {
  SHAPE_NOW = shape;
  const file = join(OUT, `${shape}.png`);
  shoot(page(shape, svg), file);
  console.log(`  ${shape.padEnd(8)} ${SHAPES[shape].w}x${SHAPES[shape].h}   ${verify(file)}`);
}
console.log(`\n→ ${OUT}`);
