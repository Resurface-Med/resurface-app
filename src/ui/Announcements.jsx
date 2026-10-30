import { useRef, useState } from "react";
import Popover, { MenuItems } from "./Popover";
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

const dayMonth = iso => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
const year = iso => new Date(iso).getFullYear();

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

/* One post: on a laptop the date sits in a gutter on the left and the post
   reads down the right, like a changelog; on a phone the date goes above.
   No card around it (2026-10-30): posts are divided by a single rule, so an
   old post with a long body never leaves a short one stranded in a box
   beside it. */
function Post({ a, isNew, lead = false, onDelete, onPublish, onEdit, onWelcome }) {
  const draft = !a.published_at && a.id !== "draft";
  const stamp = a.published_at || a.created_at;
  /* Admin actions behind a ⋯, the same menu as a deck's (2026-10-30):
     only admins get it, and nothing else on the post changes for them. */
  const items = [
    onEdit && { label: "Edit", onSelect: () => onEdit(a) },
    onPublish && (a.published_at
      ? { label: "Unpublish", onSelect: () => onPublish(a, false) }
      : { label: "Publish to everyone", onSelect: () => onPublish(a) }),
    onWelcome && a.published_at && { label: a.welcome ? "Remove from Home" : "Show on Home for new people", onSelect: () => onWelcome(a) },
    onDelete && { label: "Delete", danger: true, onSelect: () => onDelete(a) },
  ].filter(Boolean);
  return (
    <article className={`ann-post${lead ? " is-lead" : ""}${isNew ? " is-new" : ""}${draft ? " is-draft" : ""}`}>
      {/* Plain text, not pills (Rafil, 2026-10-19). */}
      {/* The newest post says so in words as well as with the filled dot on
          the timeline; older ones only say New until you've seen them. */}
      <p className="ann-post__meta">
        {lead ? <span className="ann-new">Latest</span> : isNew && <span className="ann-new">New</span>}
        <time dateTime={stamp}><span className="ann-date">{dayMonth(stamp)}</span> <span className="ann-year">{year(stamp)}</span></time>
        {a.tag && <span className="ann-tag">{TAGS[a.tag]}</span>}
      </p>
      <div className="ann-post__main">
        {draft && <p className="ann-draftbar">Draft · only admins can see this</p>}
        <div className="ann-post__head">
          <h2 className="ann-post__title">{a.title}</h2>
          {items.length > 0 && <PostMenu title={a.title} items={items} />}
        </div>
        {a.image_url && <img className="ann-post__img" src={a.image_url} alt="" loading="lazy" />}
        {a.body && <Rich text={a.body} />}
      </div>
    </article>
  );
}

function PostMenu({ title, items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  return (
    <span className="deck-menu ann-post__menu">
      <button ref={ref} type="button" className="deck-menu-btn" aria-label={`Options for ${title}`} aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen(o => !o)}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="3.25" cy="8" r="1.2" fill="currentColor" />
          <circle cx="8" cy="8" r="1.2" fill="currentColor" />
          <circle cx="12.75" cy="8" r="1.2" fill="currentColor" />
        </svg>
      </button>
      <Popover anchorRef={ref} open={open} onClose={() => setOpen(false)}>
        <MenuItems items={items} onPick={it => { setOpen(false); it.onSelect(); }} />
      </Popover>
    </span>
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
          {rest.map(a => render(a, false))}
        </>
      )}
    </div>
  );
}
