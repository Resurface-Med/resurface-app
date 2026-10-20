import { useState, useEffect, useRef } from "react";
import { primaryBtn } from "./theme";
import { remote } from "../lib/remote";
import { uploadQuestionImage, questionImageUrl } from "../lib/questionImage";
import { useAuth } from "../lib/auth";
import { applyQuestionEdit } from "../data";

const LETTERS = ["A", "B", "C", "D", "E"];


export default function EditQuestionModal({ q, onClose, onSave, persist = null }) {
  const { user } = useAuth();
  const [question, setQuestion]   = useState(q.q);
  const [opts, setOpts]           = useState([...q.opts]);
  const [ans, setAns]             = useState(q.ans);
  const [exp, setExp]             = useState(q.exp);
  const [optExp, setOptExp]       = useState(
    q.optExp ? [...q.optExp].map(e => e ?? "") : Array(q.opts.length).fill("")
  );

  const [img, setImg] = useState(q.img ?? null);
  const [imgUrl, setImgUrl] = useState(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgError, setImgError] = useState("");

  /* The question stores a path; the picture needs a signed URL, which expires.
     Resolved here rather than saved, so an old question never carries a dead
     link around with it. */
  useEffect(() => {
    let cancelled = false;
    if (!img) return;
    questionImageUrl(img).then(u => { if (!cancelled) setImgUrl(u); });
    return () => { cancelled = true; };
  }, [img]);

  async function handleImage(file) {
    if (!file || !user) return;
    setImgError("");
    setImgBusy(true);
    try {
      setImg(await uploadQuestionImage(user.id, file));
    } catch (e) {
      setImgError(e.message || "That image would not upload.");
    } finally {
      setImgBusy(false);
    }
  }

  function setOpt(i, val) { setOpts(o => o.map((v, j) => j === i ? val : v)); }
  function setOptExpItem(i, val) { setOptExp(o => o.map((v, j) => j === i ? val : v)); }

  /* A question with no id has never existed, so there is no edit to record
     against it — the caller stores it instead. Everything else about writing
     one is identical to correcting one, which is why this is the same form. */
  const isNew = q.id === undefined || q.id === null;

  const current = () => ({
    q: question.trim(),
    opts: opts.map(o => o.trim()),
    ans,
    exp: exp.trim(),
    optExp: optExp.map((e, i) => i === ans ? null : (e.trim() || null)),
    img: img ?? null,
    /* Not editable here yet; kept as it was. */
    ...(q.ask ? { ask: q.ask } : {}),
    ...(q.exhibit ? { exhibit: q.exhibit } : {}),
  });
  const canSave = question.trim() && opts.filter(o => o.trim()).length >= 2
    && opts[ans]?.trim();

  /* Both halves of recording a correction: the pool the app reads from, and
     the table it is reloaded from. It used to be only the table, so every
     correction was discarded on the next load. */
  /* `persist`, when given, saves somewhere else — an admin editing a
     Resurface deck saves into the deck itself (lib/adminFeatured). */
  function record(updated) {
    applyQuestionEdit(q.id, updated);
    if (persist) Promise.resolve(persist(updated)).catch(() => setStatus("failed"));
    else if (user) remote.questionEdit(user.id, q.id, updated);
  }

  /*
   * An existing question saves as you type, as Anki's editor does
   * (2026-10-18) — most of the people using this came from Anki, where
   * there is no Save button to forget. A pause of half a second, then the
   * write; closing writes whatever is still waiting. A state that would
   * break the question (no stem, a blank correct answer, fewer than two
   * options) is not saved, and the header says so until it is fixed.
   *
   * A new question is different: there is nothing to save into until it
   * exists, so it keeps its "Add question" button.
   */
  const [status, setStatus] = useState("idle");      // idle | saved | invalid | failed
  const savedOnce = useRef(false);
  const pending = useRef(null);
  const first = useRef(true);
  useEffect(() => {
    if (isNew) return;
    if (first.current) { first.current = false; return; }     // opening is not an edit
    if (!canSave) { clearTimeout(pending.current); pending.current = null; setStatus("invalid"); return; }
    clearTimeout(pending.current);
    pending.current = setTimeout(() => {
      pending.current = null;
      record(current());
      savedOnce.current = true;
      setStatus("saved");
    }, 500);
    return () => clearTimeout(pending.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question, opts, ans, exp, optExp, img]);

  /* Closing: anything still waiting is written now, and the caller is handed
     the question as it stands so the screen behind shows the change. */
  function close() {
    if (isNew) { onClose(); return; }
    if (pending.current && canSave) {
      clearTimeout(pending.current);
      pending.current = null;
      record(current());
      savedOnce.current = true;
    }
    if (savedOnce.current) onSave({ ...q, ...current() });
    else onClose();
  }
  function handleAdd() { onSave({ ...q, ...current() }); }

  /* Escape closes, as everywhere else. */
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; });
  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  /* Laid out like Manage questions (2026-10-17): the same panel, header and
     close; sentence-case labels; the correct answer chosen by tapping its
     letter and shown in green, as the manager shows it. No Save button on an
     existing question — it saves as you type (above). */
  return (
    <div className="qm-scrim qe-scrim" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="qm qe" role="dialog" aria-modal="true" aria-label={isNew ? "New question" : "Edit question"}>
        <header className="qm-head qe-head">
          <div className="qm-title-row">
            <div className="qm-titles">
              <h2 className="qm-title">{isNew ? "New question" : "Edit question"}</h2>
              {!isNew && (
                <p className={`qm-sub qe-status${status === "invalid" || status === "failed" ? " is-invalid" : ""}`} aria-live="polite">
                  {status === "failed"
                    ? "Not saved. Check your connection and try again."
                    : status === "invalid"
                    ? "Not saved: a question needs its wording, at least two options and a correct answer that isn’t blank."
                    : status === "saved" ? "Saved" : "Changes save as you type."}
                </p>
              )}
            </div>
            <button type="button" className="qm-x btn-press" onClick={close} aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </button>
          </div>
        </header>

        <div className="qe-body">
          <div className="qe-field">
            <label className="qe-label" htmlFor="qe-q">Question</label>
            <textarea id="qe-q" className="qe-input" value={question} onChange={e => setQuestion(e.target.value)} rows={3} />
          </div>

          {/* Image — optional, and the reason histology and anatomy questions can
              exist at all. Downscaled and re-encoded before it leaves the
              browser, so what is stored is about fifty kilobytes rather than the
              five megabytes a phone camera produces. */}
          <div className="qe-field">
            <span className="qe-label">Image <span className="qe-optional">optional</span></span>
            {img && imgUrl && <img src={imgUrl} alt="" className="qedit-img" />}
            <div className="qedit-img-row">
              <label className="qedit-img-btn">
                {imgBusy ? "Adding…" : img ? "Replace" : "Add an image"}
                <input type="file" accept="image/*" style={{ display: "none" }} disabled={imgBusy}
                  onChange={e => handleImage(e.target.files?.[0])} />
              </label>
              {img && !imgBusy && (
                <button type="button" className="qedit-img-del" onClick={() => setImg(null)}>Remove</button>
              )}
            </div>
            {imgError && <p className="qedit-img-error">{imgError}</p>}
          </div>

          <div className="qe-field">
            <span className="qe-label">Options</span>
            <p className="qe-hint">Tap a letter to mark the correct answer.</p>
            <ol className="qe-opts">
              {opts.map((opt, i) => (
                <li key={i} className={`qe-opt${ans === i ? " is-ans" : ""}`}>
                  <button type="button" className="qe-letter btn-press" onClick={() => setAns(i)}
                    aria-pressed={ans === i} aria-label={`Mark ${LETTERS[i]} as the correct answer`}>
                    {ans === i
                      ? <svg width="13" height="13" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2 5 8.6l4.5-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      : LETTERS[i]}
                  </button>
                  <input type="text" className="qe-opt-input" value={opt} onChange={e => setOpt(i, e.target.value)}
                    aria-label={`Option ${LETTERS[i]}`} />
                </li>
              ))}
            </ol>
          </div>

          <div className="qe-field">
            <label className="qe-label" htmlFor="qe-exp">Explanation</label>
            <textarea id="qe-exp" className="qe-input" value={exp} onChange={e => setExp(e.target.value)} rows={3} />
          </div>

          <div className="qe-field">
            <span className="qe-label">Why each wrong answer is wrong</span>
            <ol className="qe-opts">
              {opts.map((_, i) => (
                <li key={i} className="qe-why">
                  <span className={`qe-why-letter${ans === i ? " is-ans" : ""}`}>{LETTERS[i]}</span>
                  {ans === i ? (
                    <span className="qe-why-correct">The correct answer</span>
                  ) : (
                    <input type="text" className="qe-opt-input" value={optExp[i]}
                      onChange={e => setOptExpItem(i, e.target.value)} placeholder={`Why ${LETTERS[i]} is wrong`} />
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>

        {isNew && (
          <footer className="qe-foot">
            <button type="button" className="qe-cancel btn-press" onClick={onClose}>Cancel</button>
            <button type="button" className="btn-press" onClick={handleAdd} disabled={!canSave}
              style={{ ...primaryBtn, opacity: canSave ? 1 : 0.45 }}>
              Add question
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
