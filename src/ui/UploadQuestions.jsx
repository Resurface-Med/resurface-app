import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import EditQuestionModal from "./EditQuestionModal";
import { parseQuestionFile, UPLOAD_EXAMPLE } from "../lib/questionUpload";
import { UPLOAD_GUIDE } from "../lib/uploadGuide";
import { keyOf, namedFiles, draftFiles, withPaths } from "../lib/uploadImages";
import { uploadQuestionImage } from "../lib/questionImage";
import { supabase } from "../lib/supabase";

const isJson = f => /\.json$/i.test(f.name) || f.type === "application/json";
const isImage = f => /^image\//.test(f.type) || /\.(png|jpe?g|webp|gif|heic)$/i.test(f.name);

/* A chosen picture, small, before anything is uploaded. */
function Thumb({ file, name }) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return url ? <img className="upq-thumb" src={url} alt={name} />
    : <span className="upq-thumb is-missing" title={`${name} not chosen`}>{name}</span>;
}

/**
 * Upload questions into a deck from a JSON file (2026-11-02), for the admin
 * team, from a deck's ⋯ menu.
 *
 * Choose a file, then every question is shown with its answer marked, to
 * edit (the usual Edit question form) or remove before anything is saved.
 * Rows that couldn't be read are listed with the reason. "Add" saves them
 * into the deck: a Resurface deck for everyone, your own deck for you.
 */

const LETTERS = "ABCDE";

function download(name, body, type) {
  const blob = new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const downloadTemplate = () => download("resurface-questions-template.json", `${JSON.stringify(UPLOAD_EXAMPLE, null, 2)}\n`, "application/json");
const downloadGuide = () => download("resurface-question-instructions.md", UPLOAD_GUIDE, "text/markdown");

export default function UploadQuestions({ deckName, onAdd, onClose }) {
  const [drafts, setDrafts] = useState(null);         // null until a file is read
  const [problems, setProblems] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [copied, setCopied] = useState(false);
  const [fileName, setFileName] = useState("");
  const [editing, setEditing] = useState(null);       // index
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);             // { n, queued }
  const [over, setOver] = useState(false);
  /* Pictures chosen with the JSON, by file name (lower case, no folder). */
  const [images, setImages] = useState({});
  const [stage, setStage] = useState("");
  const input = useRef(null);
  const picInput = useRef(null);

  useEffect(() => {
    const onKey = e => { if (e.key === "Escape" && editing === null && !busy) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, editing, busy]);

  /* The JSON and its pictures can come together, in one choice or one drop,
     or the pictures afterwards. */
  async function read(list) {
    const files = [...(list ?? [])];
    if (!files.length) return;
    const pics = files.filter(isImage);
    if (pics.length) setImages(m => ({ ...m, ...Object.fromEntries(pics.map(f => [keyOf(f.name), f])) }));
    const json = files.find(isJson);
    if (!json) return;
    setError(""); setFileName(json.name);
    const { drafts: d, problems: p, warnings: w } = parseQuestionFile(await json.text());
    setDrafts(d); setProblems(p); setWarnings(w ?? []);
  }

  const named = drafts ? namedFiles(drafts) : [];
  const missing = named.filter(k => !images[k]);

  async function add() {
    if (!drafts?.length) return;
    setBusy(true); setError("");
    try {
      /* Each picture once, however many questions name it. */
      const paths = {};
      const todo = named.filter(k => images[k]);
      if (todo.length) {
        if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("Pictures need a connection. Nothing was saved.");
        const { data } = await supabase.auth.getUser();
        if (!data?.user) throw new Error("Sign in again, then try. Nothing was saved.");
        for (let i = 0; i < todo.length; i++) {
          setStage(`Uploading pictures ${i + 1} of ${todo.length}…`);
          paths[todo[i]] = await uploadQuestionImage(data.user.id, images[todo[i]]);
        }
      }
      setStage("");
      const ids = await onAdd(withPaths(drafts, paths));
      setDone({ n: drafts.length, queued: !ids });
    } catch (e) {
      setError(e?.message || "Couldn't add them. Nothing was saved; try again.");
    } finally {
      setBusy(false); setStage("");
    }
  }

  const body = done ? (
    <div className="upq-done">
      <h2 className="pss-title">{done.queued ? "Saved, not sent yet" : `Added ${done.n} question${done.n === 1 ? "" : "s"}`}</h2>
      <p className="pss-sub">{done.queued
        ? `They're on this device and will be added to ${deckName} when you're back online. Don't upload them again.`
        : `They're in ${deckName} now.`}</p>
      <button type="button" className="pss-btn is-primary btn-press upq-close" onClick={onClose}>Done</button>
    </div>
  ) : drafts === null ? (
    <div className="upq-pick">
      <h2 className="pss-title" id="upq-title">Upload questions</h2>
      <p className="pss-sub">Into {deckName}. You'll see every question before anything is added.</p>
      <label className={`upq-drop${over ? " is-over" : ""}`}
        onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); read(e.dataTransfer.files); }}>
        <input ref={input} type="file" accept=".json,application/json,image/*" multiple hidden onChange={e => { read(e.target.files); e.target.value = ""; }} />
        <span className="upq-drop__main">Choose a JSON file</span>
        <span className="upq-drop__sub">and its pictures, if it has any, or drop them here</span>
      </label>
      {problems.length > 0 && <p className="upq-error" role="alert">{fileName}: {problems[0].why}</p>}
      <div className="upq-format">
        <p className="upq-format__h">The format</p>
        <p className="upq-format__p">
          The same as Download deck: <code>{"{ \"questions\": [ … ] }"}</code>, each with <code>q</code>, <code>options</code>,{" "}
          <code>correct</code> (the right option's text, or its letter), <code>exp</code>, and optionally <code>why</code>, one line per option.
        </p>
        <p className="upq-format__p">Each question can also carry its topic note for the knowledge library, and the lines of it that question highlights.</p>
        <p className="upq-format__p">Pictures: a note can have a line of its own like <code>![Caption](diagram.png)</code>, and a question can have <code>"img": "xray.png"</code>. Choose those files with the JSON.</p>
        <div className="upq-format__acts">
          <button type="button" className="pss-btn btn-press" onClick={async () => {
            try { await navigator.clipboard.writeText(UPLOAD_GUIDE); setCopied(true); setTimeout(() => setCopied(false), 2000); }
            catch { downloadGuide(); }
          }}>{copied ? "Copied" : "Copy instructions for Claude"}</button>
          <button type="button" className="gen-link" onClick={downloadGuide}>Download them</button>
          <button type="button" className="gen-link" onClick={downloadTemplate}>Download a template</button>
        </div>
        <p className="upq-format__hint">Give Claude the instructions and your lecture, ask for the number of questions you want, and upload what it returns here.</p>
      </div>
    </div>
  ) : (
    <div className="upq-review">
      <div className="upq-review__head">
        <h2 className="pss-title" id="upq-title">{drafts.length} question{drafts.length === 1 ? "" : "s"} to add</h2>
        <p className="pss-sub">From {fileName}, into {deckName}. Edit or remove any before adding.</p>
        {problems.length > 0 && (
          <div className="upq-problems" role="alert">
            <p className="upq-problems__h">{problems.length} row{problems.length === 1 ? "" : "s"} couldn't be used and won't be added:</p>
            <ul>{problems.slice(0, 20).map(p => <li key={p.row}>Row {p.row}: {p.why}</li>)}</ul>
            {problems.length > 20 && <p className="upq-problems__more">and {problems.length - 20} more.</p>}
          </div>
        )}
        {missing.length > 0 && (
          <div className="upq-problems is-warn">
            <p className="upq-problems__h">{missing.length} picture{missing.length === 1 ? " is" : "s are"} named but not chosen, and will be left out:</p>
            <p className="upq-problems__files">{missing.join(", ")}</p>
            <button type="button" className="gen-link" onClick={() => picInput.current?.click()}>Choose pictures</button>
          </div>
        )}
        {named.length > 0 && missing.length === 0 && (
          <p className="upq-pics-ok">All {named.length} picture{named.length === 1 ? "" : "s"} chosen.</p>
        )}
        <input ref={picInput} type="file" accept="image/*" multiple hidden onChange={e => { read(e.target.files); e.target.value = ""; }} />
        {warnings.length > 0 && (
          <div className="upq-problems is-warn">
            <p className="upq-problems__h">{warnings.length} row{warnings.length === 1 ? "" : "s"} will be added with something left out:</p>
            <ul>{warnings.slice(0, 20).map(p => <li key={p.row}>Row {p.row}: {p.why}</li>)}</ul>
          </div>
        )}
      </div>
      <ol className="upq-list">
        {drafts.map((d, i) => (
          <li key={i} className="upq-q">
            <div className="upq-q__top">
              <span className="upq-q__n">{i + 1}</span>
              <p className="upq-q__stem">{d.q}</p>
              <span className="upq-q__acts">
                <button type="button" className="gen-link" onClick={() => setEditing(i)}>Edit</button>
                <button type="button" className="gen-link upq-remove" onClick={() => setDrafts(list => list.filter((_, j) => j !== i))}>Remove</button>
              </span>
            </div>
            <ul className="upq-opts">
              {d.opts.map((o, k) => (
                <li key={k} className={k === d.ans ? "is-ans" : ""}><b>{LETTERS[k] ?? k + 1}</b>{o}</li>
              ))}
            </ul>
            {d.exp && <p className="upq-q__exp">{d.exp}</p>}
            {draftFiles(d).length > 0 && (
              <div className="upq-thumbs">{[...new Set(draftFiles(d))].map(k => <Thumb key={k} name={k} file={images[k]} />)}</div>
            )}
            {d.topic && (
              <p className="upq-q__topic">
                <span>Topic note: {d.topic.title}</span>
                {d.hl?.length ? <span className="upq-q__hl">Highlights “{d.hl[0]}”{d.hl.length > 1 ? ` and ${d.hl.length - 1} more` : ""}</span> : null}
              </p>
            )}
          </li>
        ))}
        {drafts.length === 0 && <li className="pss-none">Nothing left to add.</li>}
      </ol>
      <div className="upq-foot">
        {error && <p className="upq-error" role="alert">{error}</p>}
        {stage && <p className="upq-stage">{stage}</p>}
        <button type="button" className="pss-btn is-primary btn-press" disabled={busy || !drafts.length} onClick={add}>
          {busy ? "Adding…" : `Add ${drafts.length} question${drafts.length === 1 ? "" : "s"}`}
        </button>
        <button type="button" className="gen-link" disabled={busy} onClick={() => { setDrafts(null); setProblems([]); setImages({}); input.current && (input.current.value = ""); }}>
          Choose another file
        </button>
      </div>
    </div>
  );

  return createPortal(
    <div className="np-scrim pss-scrim" role="presentation" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="pss upq" role="dialog" aria-modal="true" aria-labelledby="upq-title">
        <button type="button" className="pss-x" onClick={onClose} disabled={busy} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>
        </button>
        <div className="pss-body">{body}</div>
      </div>
      {editing !== null && drafts?.[editing] && (
        <EditQuestionModal draft q={{ ...drafts[editing], id: undefined }}
          onClose={() => setEditing(null)}
          onSave={updated => {
            const { id, ...rest } = updated; // eslint-disable-line no-unused-vars
            setDrafts(list => list.map((x, j) => (j === editing ? rest : x)));
            setEditing(null);
          }} />
      )}
    </div>,
    document.body,
  );
}
