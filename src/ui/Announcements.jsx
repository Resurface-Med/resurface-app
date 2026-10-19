import { useState } from "react";
import { confirm } from "./Confirm";
import { downscale } from "../lib/questionImage";
import { supabase, SUPABASE_URL } from "../lib/supabase";

/**
 * What's new (2026-10-19, migrations 0022–0023).
 *
 * News from Resurface, on a page of its own reached from the sidebar. Each
 * post has a title, text, and optionally a label and a cover image; the
 * newest is shown large at the top. Text takes a little formatting —
 * **bold**, lines starting "- " as a list, blank lines between paragraphs,
 * and web addresses as links — so a post can be laid out without an editor.
 * Admins write them here, with a preview of exactly how the post will look.
 */
export const TAGS = {
  feature: "New feature",
  update: "Update",
  fix: "Fix",
  news: "News",
};

const when = iso => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/* **bold**, web addresses and email addresses inside one line. */
function Inline({ text }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|https?:\/\/[^\s)]+|[\w.+-]+@[\w-]+\.[\w.]*\w)/g);
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (/^[\w.+-]+@[\w-]+\.[\w.]*\w$/.test(p)) return <a key={i} href={`mailto:${p}`}>{p}</a>;
    if (/^https?:\/\//.test(p)) return <a key={i} href={p} target="_blank" rel="noopener noreferrer">{p.replace(/^https?:\/\//, "")}</a>;
    return <span key={i}>{p}</span>;
  });
}

/* Paragraphs from blank lines; consecutive "- " lines as a list. */
export function Rich({ text }) {
  const blocks = String(text || "").replace(/\r\n?/g, "\n").split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
  return (
    <div className="ann-rich">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every(l => /^\s*[-•]\s+/.test(l))) {
          return <ul key={i}>{lines.map((l, j) => <li key={j}><Inline text={l.replace(/^\s*[-•]\s+/, "")} /></li>)}</ul>;
        }
        return <p key={i}>{lines.map((l, j) => <span key={j}>{j > 0 && <br />}<Inline text={l} /></span>)}</p>;
      })}
    </div>
  );
}

function Post({ a, isNew, lead = false, onDelete, onPublish }) {
  const draft = !a.published_at && a.id !== "draft";
  return (
    <article className={`ann-post${lead ? " is-lead" : ""}${isNew ? " is-new" : ""}${draft ? " is-draft" : ""}`}>
      {draft && (
        <div className="ann-draftbar">
          <span>Draft · only admins can see this</span>
          {onPublish && <button type="button" className="ann-draftbar__go btn-press" onClick={() => onPublish(a)}>Publish to everyone</button>}
        </div>
      )}
      {a.image_url && <img className="ann-post__img" src={a.image_url} alt="" loading="lazy" />}
      <div className="ann-post__text">
        {/* Plain text, not pills (Rafil, 2026-10-19): "New · News · 19 October". */}
        <p className="ann-post__meta">
          {isNew && <span className="ann-new">New</span>}
          {a.tag && <span className="ann-tag">{TAGS[a.tag]}</span>}
          <span>{when(a.published_at || a.created_at)}</span>
          {onPublish && a.published_at && <button type="button" className="ann-post__unpub" onClick={() => onPublish(a, false)}>Unpublish</button>}
          {onDelete && <button type="button" className={`ann-post__del${onPublish && a.published_at ? " is-after" : ""}`} onClick={() => onDelete(a)}>Delete</button>}
        </p>
        <h2 className="ann-post__title">{a.title}</h2>
        {a.body && <Rich text={a.body} />}
      </div>
    </article>
  );
}

async function uploadCover(file) {
  const blob = await downscale(file);
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("announcements").upload(path, blob, { contentType: blob.type, cacheControl: "31536000" });
  if (error) throw new Error("Couldn’t upload that image.");
  return `${SUPABASE_URL}/storage/v1/object/public/announcements/${path}`;
}

function Composer({ onPost }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tag, setTag] = useState("feature");
  const [image, setImage] = useState(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function pick(file) {
    if (!file) return;
    setErr(""); setImgBusy(true);
    try { setImage(await uploadCover(file)); } catch (e) { setErr(e.message); } finally { setImgBusy(false); }
  }
  async function post() {
    if (!title.trim()) return;
    setBusy(true); setErr("");
    try {
      await onPost({ title: title.trim(), body: body.trim(), tag, image });
      setTitle(""); setBody(""); setImage(null); setOpen(false);   // saved as a draft; publish it from the post
    } catch { setErr("Couldn’t post that. Check your connection and try again."); }
    finally { setBusy(false); }
  }

  if (!open) {
    return <button type="button" className="ann-start btn-press" onClick={() => setOpen(true)}>Write an announcement</button>;
  }
  const draft = { id: "draft", created_at: new Date().toISOString(), title: title || "Your title", body, tag, image_url: image };
  return (
    <section className="ann-compose">
      <div className="ann-compose__form">
        <p className="ann-compose__label">Label</p>
        <div className="ann-compose__tags" role="radiogroup" aria-label="Label">
          {Object.entries(TAGS).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={tag === k}
              className={`ann-tag-pick${tag === k ? " is-on" : ""}`} onClick={() => setTag(k)}>{l}</button>
          ))}
        </div>
        <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} placeholder="Title" aria-label="Title" />
        <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={4000} rows={7} aria-label="Text"
          placeholder={"What’s new. A blank line starts a new paragraph.\n- Lines starting with a dash become a list\n**Two stars** around words make them bold."} />
        <div className="ann-compose__img">
          <label className="ann-compose__imgbtn btn-press">
            {imgBusy ? "Adding…" : image ? "Change cover image" : "Add a cover image"}
            <input type="file" accept="image/*" hidden disabled={imgBusy} onChange={e => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {image && <button type="button" className="ann-compose__imgdel" onClick={() => setImage(null)}>Remove image</button>}
        </div>
        {err && <p className="ann-compose__err">{err}</p>}
        <div className="ann-compose__acts">
          <button type="button" className="ann-compose__cancel" onClick={() => setOpen(false)}>Cancel</button>
          <button type="button" className="ann-compose__go btn-press" disabled={busy || imgBusy || !title.trim()} onClick={post}>
            {busy ? "Saving…" : "Save as draft"}
          </button>
        </div>
      </div>
      <div className="ann-compose__preview" aria-label="Preview">
        <p className="ann-compose__label">Preview</p>
        <Post a={draft} isNew lead />
      </div>
    </section>
  );
}

export function AnnouncementFeed({ items = [], newSince = null, isAdmin = false, onPost, onDelete, onPublish }) {
  async function remove(a) {
    if (!await confirm({ title: "Delete this announcement?", body: `“${a.title}” disappears for everyone.`, action: "Delete", danger: true })) return;
    try { await onDelete(a.id); } catch { /* stays; try again */ }
  }
  async function publish(a, on = true) {
    if (on && !await confirm({ title: "Publish this to everyone?", body: `“${a.title}” appears for every student, with a badge on What’s new.`, action: "Publish" })) return;
    if (!on && !await confirm({ title: "Unpublish this?", body: "It goes back to being a draft only admins can see.", action: "Unpublish" })) return;
    try { await onPublish(a.id, on); } catch { /* stays as it was */ }
  }
  const isNew = a => newSince != null && !!a.published_at && a.published_at > newSince;
  const [lead, ...rest] = items;
  return (
    <div className="ann-feed">
      {isAdmin && <Composer onPost={onPost} />}
      {!lead ? (
        <p className="ann-empty">Nothing yet. Updates and news about Resurface will appear here.</p>
      ) : (
        <>
          <Post a={lead} lead isNew={isNew(lead)} onDelete={isAdmin ? remove : null} onPublish={isAdmin && onPublish ? publish : null} />
          {rest.length > 0 && (
            <>
              <h3 className="ann-earlier">Earlier</h3>
              <div className="ann-rest">
                {rest.map(a => <Post key={a.id} a={a} isNew={isNew(a)} onDelete={isAdmin ? remove : null} onPublish={isAdmin && onPublish ? publish : null} />)}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
