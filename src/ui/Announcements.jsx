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
        /* "1. …" — a numbered point, kept as a list so it can be styled as one. */
        const num = lines[0].match(/^\s*(\d+)[.)]\s+/);
        if (num && lines.length === 1) {
          return <ol key={i} start={Number(num[1])}><li><Inline text={lines[0].replace(/^\s*\d+[.)]\s+/, "")} /></li></ol>;
        }
        return <p key={i}>{lines.map((l, j) => <span key={j}>{j > 0 && <br />}<Inline text={l} /></span>)}</p>;
      })}
    </div>
  );
}

function Post({ a, isNew, lead = false, onDelete, onPublish, onEdit, onWelcome }) {
  const draft = !a.published_at && a.id !== "draft";
  return (
    <article className={`ann-post${lead ? " is-lead" : ""}${isNew ? " is-new" : ""}${draft ? " is-draft" : ""}`}>
      {draft && (
        <div className="ann-draftbar">
          <span>Draft</span>
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
          {(onEdit || onDelete) && (
            <span className="ann-post__acts">
              {onWelcome && a.published_at && (
                <button type="button" className="ann-post__act" onClick={() => onWelcome(a)}>
                  {a.welcome ? "Shown on Home · remove" : "Show on Home for new people"}
                </button>
              )}
              {onEdit && <button type="button" className="ann-post__act" onClick={() => onEdit(a)}>Edit</button>}
              {onPublish && a.published_at && <button type="button" className="ann-post__act" onClick={() => onPublish(a, false)}>Unpublish</button>}
              {onDelete && <button type="button" className="ann-post__act is-danger" onClick={() => onDelete(a)}>Delete</button>}
            </span>
          )}
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

/* Writing a post, or editing one (`initial`), with a live preview beside it. */
function Composer({ initial = null, onSave, onCancel }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [tag, setTag] = useState(initial?.tag ?? "feature");
  const [image, setImage] = useState(initial?.image_url ?? null);
  const [imgBusy, setImgBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function pick(file) {
    if (!file) return;
    setErr(""); setImgBusy(true);
    try { setImage(await uploadCover(file)); } catch (e) { setErr(e.message); } finally { setImgBusy(false); }
  }
  async function save() {
    if (!title.trim()) return;
    setBusy(true); setErr("");
    try { await onSave({ title: title.trim(), body: body.trim(), tag, image }); }
    catch { setErr("Couldn’t save that. Check your connection and try again."); setBusy(false); }
  }

  const preview = { id: "draft", created_at: initial?.created_at ?? new Date().toISOString(), published_at: initial?.published_at,
    title: title || "Your title", body, tag, image_url: image };
  return (
    <section className="ann-compose">
      <div className="ann-compose__form">
        <p className="ann-compose__label">{initial ? "Edit announcement" : "New announcement"}</p>
        <div className="ann-compose__tags" role="radiogroup" aria-label="Label">
          {Object.entries(TAGS).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={tag === k}
              className={`ann-tag-pick${tag === k ? " is-on" : ""}`} onClick={() => setTag(k)}>{l}</button>
          ))}
        </div>
        <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} placeholder="Title" aria-label="Title" />
        <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={4000} rows={9} aria-label="Text"
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
          <button type="button" className="ann-compose__cancel" onClick={onCancel}>Cancel</button>
          <button type="button" className="ann-compose__go btn-press" disabled={busy || imgBusy || !title.trim()} onClick={save}>
            {busy ? "Saving…" : initial ? "Save changes" : "Save as draft"}
          </button>
        </div>
      </div>
      <div className="ann-compose__preview" aria-label="Preview">
        <p className="ann-compose__label">Preview</p>
        <Post a={preview} lead />
      </div>
    </section>
  );
}

/* `fill` turns a post into what it reads as (the welcome note's {decks}
   filled in); an edit still opens the post as written.
   `composing` (and onComposeDone) come from the page, whose band holds the
   New announcement button. An edit opens in the post's own place. */
export function AnnouncementFeed({ items = [], newSince = null, isAdmin = false, onPost, onUpdate, onDelete, onPublish, onSetWelcome,
  composing = false, onComposeDone, fill = null }) {
  const [editing, setEditing] = useState(null);
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
  async function welcome(a) {
    if (!a.welcome && !await confirm({ title: "Show this on Home for new people?", body: "New accounts see it as a note on Home until they answer their first question. It replaces any other post shown there.", action: "Show on Home" })) return;
    try { await onSetWelcome(a.welcome ? null : a.id); } catch { /* unchanged */ }
  }
  const admin = isAdmin ? { onDelete: remove, onPublish: onPublish ? publish : null, onEdit: onUpdate ? a => setEditing(a.id) : null, onWelcome: onSetWelcome ? welcome : null } : {};
  const render = (a, lead) => (editing === a.id
    ? <Composer key={a.id} initial={a} onCancel={() => setEditing(null)}
        onSave={async post => { await onUpdate(a.id, post); setEditing(null); }} />
    : <Post key={a.id} a={fill ? fill(a) : a} lead={lead} isNew={isNew(a)} {...admin} />);
  const [lead, ...rest] = items;
  return (
    <div className="ann-feed">
      {isAdmin && composing && (
        <Composer onCancel={onComposeDone} onSave={async post => { await onPost(post); onComposeDone?.(); }} />
      )}
      {!lead ? (
        !composing && <p className="ann-empty">Nothing yet. Updates and news about Resurface will appear here.</p>
      ) : (
        <>
          {render(lead, true)}
          {rest.length > 0 && (
            <>
              <h3 className="ann-earlier">Earlier</h3>
              <div className="ann-rest">{rest.map(a => render(a, false))}</div>
            </>
          )}
        </>
      )}
    </div>
  );
}
