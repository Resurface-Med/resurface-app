import { useEffect, useMemo, useRef, useState } from "react";

/**
 * The welcome note, revealed (2026-10-20).
 *
 * Once, straight after a new account's first pop-up: the screen turns the
 * app's blue, the note's title rises in word by word, the body writes
 * itself out a word at a time, and the signature is drawn on in the
 * handwritten face. Then the way in — Start practising — and the reveal
 * fades away onto Home, where the same note sits as it always has.
 *
 * A click, a tap or a key while it plays finishes it at once; another
 * closes it. Reduced motion shows it finished.
 *
 * The note is Rafil's welcome post (What's new, "Show on Home"), parsed the
 * way Home parses it: blank lines between paragraphs, "- " lists, "1. "
 * steps, **bold**, and a short last line with no full stop as the signature.
 */

const TOKEN = /(\*\*[^*]+\*\*|https?:\/\/[^\s)]+|[\w.+-]+@[\w-]+\.[\w.]*\w)/g;

/* A note into blocks of words, each word numbered in reading order so its
   delay can be set from the number. */
function parse(title, body) {
  const blocks = String(body || "").replace(/\r\n?/g, "\n").trim().split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
  const last = blocks[blocks.length - 1] ?? "";
  const sig = blocks.length > 1 && last.length <= 24 && !/[.!?:]$/.test(last) ? last : null;
  if (sig) blocks.pop();

  let n = 0;
  const words = (text, bold = false) => String(text).split(/(\s+)/).filter(Boolean).map(w =>
    /^\s+$/.test(w) ? { space: true } : { w, i: n++, bold });
  const inline = line => String(line).split(TOKEN).filter(Boolean).flatMap(p =>
    /^\*\*[^*]+\*\*$/.test(p) ? words(p.slice(2, -2), true) : words(p));

  const titleWords = words(title || "");
  const out = blocks.map(b => {
    const lines = b.split("\n");
    if (lines.every(l => /^\s*[-•]\s+/.test(l))) return { kind: "ul", items: lines.map(l => inline(l.replace(/^\s*[-•]\s+/, ""))) };
    const num = lines[0].match(/^\s*(\d+)[.)]\s+/);
    if (num && lines.length === 1) return { kind: "ol", start: Number(num[1]), items: [inline(lines[0].replace(/^\s*\d+[.)]\s+/, ""))] };
    return { kind: "p", lines: lines.map(inline) };
  });
  return { titleWords, blocks: out, sig, count: n };
}

function Words({ list, step, from }) {
  return list.map((t, k) => t.space ? " " : (
    <span key={k} className={`wr-w${t.bold ? " is-bold" : ""}`} style={{ "--d": `${from + t.i * step}ms` }}>{t.w}</span>
  ));
}

/* What it does, in one line, before anything else (2026-10-20: about half
   of new accounts never started, and the note led with backstory). */
const LEAD = "Exam-style questions from your own lectures.";

export default function WelcomeReveal({ welcome, onGenerate, onTry, tryLabel, onClose }) {
  /* The lead takes the title's place; the post's title ("Welcome to
     Resurface") is the small line above it. */
  const note = useMemo(() => parse(LEAD, welcome?.body), [welcome]);
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [done, setDone] = useState(reduced);
  const [leaving, setLeaving] = useState(false);

  /* The lead first, slower; then the two ways in, at once, so nobody has
     to wait for the note to act; then the note, at a pace that keeps it to
     a few seconds however long it is. */
  const titleCount = note.titleWords.filter(t => !t.space).length;
  const titleStep = 120;
  const leadFrom = 500;
  const actsAt = leadFrom + titleCount * titleStep + 200;
  const bodyFrom = actsAt + 700;
  const bodyCount = note.count - titleCount;
  const step = Math.max(14, Math.min(45, 3400 / Math.max(1, bodyCount)));
  const sigAt = bodyFrom + bodyCount * step + 250;
  const endAt = sigAt + (note.sig ? 1500 : 200);

  useEffect(() => {
    if (done) return;
    const t = setTimeout(() => setDone(true), endAt);
    return () => clearTimeout(t);
  }, [done, endAt]);

  /* Where the note is taller than the screen (a phone), the view follows
     the writing down: the word being written is kept about two-thirds of
     the way down, and nothing moves until it gets there. */
  const box = useRef(null);
  useEffect(() => {
    const el = box.current;
    if (!el || done) return;
    const words = [...el.querySelectorAll("[data-d]")].map(w => ({ w, d: Number(w.dataset.d) }));
    const t0 = performance.now();
    let raf;
    const tick = now => {
      const at = now - t0;
      let cur = null;
      for (const x of words) { if (x.d <= at) cur = x.w; else break; }
      if (cur) {
        const target = Math.max(0, cur.offsetTop - el.clientHeight * 0.66);
        if (target > el.scrollTop) el.scrollTop += (target - el.scrollTop) * 0.12;
      }
      if (at < endAt + 400) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [done, endAt]);

  function leave(then) {
    setLeaving(true);
    setTimeout(() => then?.(), 420);
  }
  useEffect(() => {
    const onKey = e => {
      if (e.key === "Escape") { leave(onClose); return; }
      if (!done) setDone(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Words are numbered from the title, so the body's numbering starts after it.
  const bodyStep = (i) => bodyFrom + (i - titleCount) * step;

  return (
    <div ref={box} className={`wr${done ? " is-done" : ""}${leaving ? " is-leaving" : ""}`} role="dialog" aria-modal="true" aria-label={welcome?.title || "Welcome"}
      onClick={() => { if (!done) setDone(true); }}>
      <div className="wr__glow" aria-hidden="true" />
      <article className="wr__note">
        <p className="wr__eyebrow">{welcome?.title || "Welcome to Resurface"}</p>
        <h1 className="wr__title"><Words list={note.titleWords} step={titleStep} from={leadFrom} /></h1>
        <div className="wr__ways" data-d={actsAt} style={{ "--d": `${actsAt}ms` }}>
          <button type="button" className="wr__go btn-press" onClick={e => { e.stopPropagation(); leave(onGenerate); }}>
            Make questions from my lectures <span aria-hidden="true">→</span>
          </button>
          {onTry && (
            <button type="button" className="wr__go btn-press" onClick={e => { e.stopPropagation(); leave(onTry); }}>
              {tryLabel} <span aria-hidden="true">→</span>
            </button>
          )}
        </div>
        <div className="wr__body">
          {note.blocks.map((b, k) => {
            const w = list => list.map((t, j) => t.space ? " " : (
              <span key={j} className={`wr-w${t.bold ? " is-bold" : ""}`} data-d={bodyStep(t.i)} style={{ "--d": `${bodyStep(t.i)}ms` }}>{t.w}</span>
            ));
            /* The number or bullet is a word of its own, written with the
               first word after it — a list marker drawn by the browser was
               there before the writing reached it. */
            const mark = (m, list) => {
              const first = list.find(x => !x.space);
              const d = first ? bodyStep(first.i) : 0;
              return <span className="wr-w wr-mark" aria-hidden="true" style={{ "--d": `${d}ms` }}>{m}</span>;
            };
            if (b.kind === "ul") return <ul key={k}>{b.items.map((it, j) => <li key={j}>{mark("•", it)}{w(it)}</li>)}</ul>;
            if (b.kind === "ol") return <ol key={k} start={b.start}><li>{mark(`${b.start}.`, b.items[0])}{w(b.items[0])}</li></ol>;
            return <p key={k}>{b.lines.map((l, j) => <span key={j}>{j > 0 && <br />}{w(l)}</span>)}</p>;
          })}
        </div>
        {note.sig && (
          <p className="wr__sig" data-d={sigAt} style={{ "--d": `${sigAt}ms` }}>
            <span className="wr__sig-ink">{note.sig}</span>
          </p>
        )}
        <div className="wr__acts" data-d={endAt} style={{ "--d": `${endAt}ms` }}>
          <button type="button" className="wr__later" onClick={e => { e.stopPropagation(); leave(onClose); }}>
            Look around first
          </button>
        </div>
      </article>
      {!done && <button type="button" className="wr__skip" onClick={e => { e.stopPropagation(); setDone(true); }}>Skip</button>}
    </div>
  );
}
