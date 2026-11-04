import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { IMAGE_LINE } from "../lib/formatExplain";
import { questionImageUrl } from "../lib/questionImage";

/**
 * The topic note's text, with its pictures as cards (2026-11-04). A picture
 * is stored as a line of its own, ![caption](path), which read as a jumble
 * of letters in the editor. Here each one is a card — thumbnail, its
 * caption to type over, arrows to move it a paragraph up or down, × to take
 * it out — and the text between them is ordinary text boxes.
 *
 * The note is held as a list of pieces, text and pictures; adjacent text
 * merges into one box. `value` is read once when the editor opens (and
 * when a picture is added from outside); after that the pieces are the
 * truth and `onChange` gets the note back as text.
 */

const split = s => s.split(/\n[ \t]*\n/);

/* The note as pieces: pictures on their own, everything else as text. */
function toPieces(body) {
  const out = [];
  const pushText = t => {
    const last = out[out.length - 1];
    if (last?.type === "text") last.value = last.value ? `${last.value}\n\n${t}` : t;
    else out.push({ type: "text", value: t });
  };
  for (const chunk of split(String(body ?? ""))) {
    let text = [];
    for (const line of chunk.split("\n")) {
      const m = line.trim().match(IMAGE_LINE);
      if (m) {
        if (text.length) { pushText(text.join("\n")); text = []; }
        out.push({ type: "img", alt: m[1], src: m[2] });
      } else text.push(line);
    }
    if (text.length) pushText(text.join("\n"));
  }
  return tidy(out);
}

/* Adjacent text merged, empty text dropped, and always a text box at the
   end to carry on writing in. */
function tidy(pieces) {
  const out = [];
  for (const p of pieces) {
    const last = out[out.length - 1];
    if (p.type === "text") {
      if (!p.value.trim()) continue;
      if (last?.type === "text") last.value = `${last.value.replace(/\s+$/, "")}\n\n${p.value.replace(/^\s+/, "")}`;
      else out.push({ ...p });
    } else out.push({ ...p });
  }
  if (out[out.length - 1]?.type !== "text") out.push({ type: "text", value: "" });
  return out;
}

const toBody = pieces => pieces
  .map(p => (p.type === "img" ? `![${p.alt}](${p.src})` : p.value.trim()))
  .filter(Boolean).join("\n\n");

/* Moves picture i one paragraph up (-1) or down (+1). */
function move(pieces, i, dir) {
  const next = pieces.map(p => ({ ...p }));
  const j = i + dir;
  if (j < 0 || j >= next.length) return pieces;
  const other = next[j];
  if (other.type === "img") { [next[i], next[j]] = [next[j], next[i]]; return tidy(next); }
  const paras = split(other.value).filter(s => s.trim());
  if (!paras.length) return pieces;
  if (dir < 0) {
    const moved = paras.pop();
    next.splice(j, 2, { type: "text", value: paras.join("\n\n") }, next[i], { type: "text", value: moved });
  } else {
    const moved = paras.shift();
    next.splice(i, 2, { type: "text", value: moved }, next[i], { type: "text", value: paras.join("\n\n") });
  }
  return tidy(next);
}

function Thumb({ src }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let live = true;
    questionImageUrl(src).then(u => { if (live) setUrl(u); });
    return () => { live = false; };
  }, [src]);
  return url ? <img className="nbe-thumb" src={url} alt="" /> : <span className="nbe-thumb" aria-hidden="true" />;
}

function Box({ value, onChange, onFocusAt, autoFocus }) {
  const ref = useRef(null);
  /* Grows with its text. Measured again when the width changes or the web
     font arrives, either of which rewraps the lines; +4 is the border,
     which scrollHeight leaves out. */
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight + 4, 64)}px`;
  };
  useLayoutEffect(fit, [value]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(el);
    document.fonts?.ready.then(fit);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);
  const report = () => onFocusAt(ref.current?.selectionStart ?? value.length);
  return (
    <textarea ref={ref} className="qe-input nbe-text" value={value} rows={2} aria-label="Topic note text"
      onChange={e => { onChange(e.target.value); report(); }} onFocus={report} onClick={report} onKeyUp={report}
      placeholder="Write here…" />
  );
}

export default function NoteBodyEditor({ value, onChange, addedPath = null, onAddedUsed }) {
  const [pieces, setPieces] = useState(() => toPieces(value));
  /* Where a new picture goes: the text box last typed in, and where in it. */
  const caret = useRef({ i: pieces.length - 1, at: null });

  const commit = next => { setPieces(next); onChange(toBody(next)); };

  /* A picture just uploaded: in at the caret, split at the paragraph. */
  useEffect(() => {
    if (!addedPath) return;
    const { i, at } = caret.current;
    const target = pieces[i]?.type === "text" ? i : pieces.length - 1;
    const text = pieces[target].value;
    const cut = at == null ? text.length : at;
    const next = [...pieces.slice(0, target),
      { type: "text", value: text.slice(0, cut) },
      { type: "img", alt: "", src: addedPath },
      { type: "text", value: text.slice(cut) },
      ...pieces.slice(target + 1)];
    commit(tidy(next));
    onAddedUsed?.();
  }, [addedPath]); // eslint-disable-line react-hooks/exhaustive-deps

  const imgs = pieces.filter(p => p.type === "img").length;
  return (
    <div className="nbe">
      {pieces.map((p, i) => (p.type === "text" ? (
        <Box key={`t${i}`} value={p.value}
          onChange={v => commit(pieces.map((x, j) => (j === i ? { ...x, value: v } : x)))}
          onFocusAt={at => { caret.current = { i, at }; }} />
      ) : (
        <div key={`i${i}-${p.src}`} className="nbe-card">
          <Thumb src={p.src} />
          <div className="nbe-card__main">
            <div className="nbe-card__top">
              <span className="nbe-card__label">Picture {pieces.slice(0, i + 1).filter(x => x.type === "img").length} of {imgs}</span>
              <div className="nbe-card__acts">
                <button type="button" className="nbe-btn" aria-label="Move up" disabled={i === 0} onClick={() => commit(move(pieces, i, -1))}>
                  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 10l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <button type="button" className="nbe-btn" aria-label="Move down" disabled={i >= pieces.length - 2 && !pieces[i + 1]?.value?.trim()} onClick={() => commit(move(pieces, i, 1))}>
                  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <button type="button" className="nbe-btn is-x" aria-label="Remove picture" onClick={() => commit(tidy(pieces.filter((_, j) => j !== i)))}>
                  <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>
                </button>
              </div>
            </div>
            <input type="text" className="nbe-cap" value={p.alt} placeholder="Add a caption" aria-label="Caption"
              onChange={e => commit(pieces.map((x, j) => (j === i ? { ...x, alt: e.target.value.replace(/[[\]]/g, "") } : x)))} />
          </div>
        </div>
      )))}
    </div>
  );
}
