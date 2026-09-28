#!/usr/bin/env node
/**
 * Bank questions as Instagram posts.
 *
 * A good SBA is already a good post — a thing you cannot scroll past
 * without trying to answer — so the product's own atom is the content, and
 * none of it has to be invented.
 *
 * Rendered from the app's own stylesheet rather than styled to match it:
 * the slides pull in index.css and use the real field colour, the real
 * Poppins and the real wave, so they cannot drift from the product and
 * follow it if the theme ever changes.
 *
 * Two slides per question. The first is the stem and the options, which is
 * the post; the second is the answer and why, which is the reason to swipe.
 *
 *   node scripts/make-posts.mjs --id 92
 *   node scripts/make-posts.mjs --deck Physiology --count 20
 *
 * Needs the preview server running (npm run preview) so the page can reach
 * the built stylesheet and the fonts.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const DECKS = join(APP, "public", "decks");
const OUT = join(APP, ".posts");
const PORT = process.env.PREVIEW_PORT || 4173;

/* 4:5 is the tallest Instagram allows in the feed, so it is the most of
   somebody's screen a post can occupy. */
const W = 1080, H = 1350;

const CHROME = join(
  process.env.HOME,
  "resurface/resurface-film/node_modules/.remotion/chrome-headless-shell",
  "mac-arm64/chrome-headless-shell-mac-arm64/chrome-headless-shell",
);

const LETTERS = ["A", "B", "C", "D", "E"];
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function bank() {
  const index = JSON.parse(readFileSync(join(DECKS, "index.json"), "utf8"));
  return index.flatMap(({ file }) => JSON.parse(readFileSync(join(DECKS, file), "utf8")).questions);
}

/**
 * How big the type can be and still be read at thumb distance.
 *
 * A stem of 35 words and five options is a lot for a phone, so the size
 * comes down as the content grows rather than the content being clipped.
 * Past a point no size saves it, and the question is better skipped than
 * posted unreadable — `--count` runs skip those and say so.
 */
function fit(q) {
  const load = q.q.length + q.opts.reduce((n, o) => n + o.length, 0);
  if (load > 560) return null;
  if (load > 420) return { stem: 38, opt: 28, exp: 25 };
  if (load > 300) return { stem: 44, opt: 31, exp: 27 };
  return { stem: 50, opt: 34, exp: 29 };
}

const WAVE = `<svg class="wave" viewBox="0 0 1440 90" preserveAspectRatio="none">
  <path fill="var(--c-card-solid)" d="M0,44 C240,6 480,82 720,44 C960,6 1200,82 1440,44 L1440,96 L0,96 Z"/></svg>`;

function page(q, size, answer, css) {
  const topic = q.cat.includes(":") ? q.cat.split(":")[1].trim() : q.cat;
  const opts = q.opts.map((o, i) => {
    const right = answer && i === q.ans;
    return `<li class="${right ? "is-right" : ""}">
      <span class="k">${LETTERS[i]}</span><span class="t">${esc(o)}</span>
      ${right ? '<span class="tick">✓</span>' : ""}
    </li>`;
  }).join("");

  return `<!doctype html><html data-theme="light"><head><meta charset="utf-8">
<link rel="stylesheet" href="/assets/${css}">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden}
  body{background:var(--c-body-bg);font-family:"Poppins",sans-serif;display:flex;flex-direction:column}
  .top{padding:62px 72px 0;color:#fff;flex-shrink:0}
  .brand{display:flex;align-items:center;gap:14px;margin-bottom:38px}
  .brand img{height:40px;width:auto}
  .topic{font-size:26px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;opacity:.72}
  .stem{font-size:${size.stem}px;font-weight:600;line-height:1.3;letter-spacing:-.8px;margin-top:20px}
  .wave{display:block;width:100%;height:70px;margin-top:auto;flex-shrink:0}
  .sheet{background:var(--c-card-solid);flex:1;padding:14px 72px 62px;display:flex;flex-direction:column}
  ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:14px}
  li{display:flex;align-items:center;gap:20px;padding:22px 26px;border-radius:20px;
     background:var(--c-surface2);font-size:${size.opt}px;line-height:1.25;color:var(--c-text)}
  li.is-right{background:var(--c-accent);color:#fff;font-weight:600}
  .k{font-weight:700;opacity:.5;flex-shrink:0;width:1.1em}
  li.is-right .k{opacity:.85}
  .t{flex:1}
  .tick{font-size:.9em}
  .exp{margin-top:26px;font-size:${size.exp}px;line-height:1.45;color:var(--c-muted)}
  .cue{margin-top:auto;padding-top:24px;font-size:24px;font-weight:600;color:var(--c-accent)}
</style></head><body>
  <div class="top">
    <div class="brand"><img src="/logo-lockup-white.png" alt=""></div>
    <div class="topic">${esc(q.deck)} · ${esc(topic)}</div>
    <div class="stem">${esc(q.q)}</div>
  </div>
  ${WAVE}
  <div class="sheet">
    <ul>${opts}</ul>
    ${answer ? `<div class="exp">${esc(q.exp)}</div>` : ""}
    <div class="cue">${answer ? "resurface.study" : "Swipe for the answer →"}</div>
  </div>
</body></html>`;
}

function shoot(html, out, css) {
  const tmp = join(APP, "dist", "_post.html");
  writeFileSync(tmp, html);
  execFileSync(CHROME, [
    "--headless", "--disable-gpu", "--hide-scrollbars",
    `--window-size=${W},${H}`, `--screenshot=${out}`,
    "--virtual-time-budget=4000", `http://localhost:${PORT}/_post.html`,
  ], { stdio: "ignore" });
}

const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(`--${n}`); return i === -1 ? null : args[i + 1]; };

const css = readdirSync(join(APP, "dist", "assets")).find(f => f.endsWith(".css"));
if (!css) { console.error("Build first: npx vite build"); process.exit(1); }

const all = bank();
let chosen;
if (flag("id")) {
  chosen = all.filter(q => q.id === Number(flag("id")));
} else {
  const deck = flag("deck");
  const count = Number(flag("count") || 10);
  const posted = existsSync(join(OUT, "posted.json"))
    ? new Set(JSON.parse(readFileSync(join(OUT, "posted.json"), "utf8")))
    : new Set();
  chosen = all.filter(q => (!deck || q.deck === deck) && !posted.has(q.id) && fit(q)).slice(0, count);
}
if (!chosen.length) { console.error("Nothing to render."); process.exit(1); }

mkdirSync(OUT, { recursive: true });
let skipped = 0;
for (const q of chosen) {
  const size = fit(q);
  if (!size) { skipped += 1; console.log(`  skipped #${q.id} — too long to read on a phone`); continue; }
  const dir = join(OUT, String(q.id).padStart(4, "0"));
  mkdirSync(dir, { recursive: true });
  shoot(page(q, size, false, css), join(dir, "1.png"), css);
  shoot(page(q, size, true, css), join(dir, "2.png"), css);
  const topic = q.cat.includes(":") ? q.cat.split(":")[1].trim() : q.cat;
  writeFileSync(join(dir, "caption.txt"),
    `${topic} — can you get it?\n\nAnswer on slide 2.\n\n` +
    `Resurface is a free SBA bank built for ARU Year 1, matched to our own paper.\n\n` +
    `#medstudent #medschool #mbchb #aru #medicalstudent #studygram #sba #${q.deck.toLowerCase()}\n`);
  console.log(`  #${q.id}  ${q.deck} · ${topic}`);
}
console.log(`\n${chosen.length - skipped} posts → ${OUT}`);
