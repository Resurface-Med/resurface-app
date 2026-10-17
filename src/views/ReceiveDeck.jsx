import { useEffect, useState } from "react";
import { C, card, primaryBtn, btnGhost } from "../ui/theme";
import { remote } from "../lib/remote";
import { QUESTIONS } from "../data";
import { shape, isRepeat } from "../lib/dedupe";

/*
 * What of a shared deck you already have (2026-10-17). A question counts as
 * yours if it repeats one you hold — the same stem, or a reworded one with
 * the same answer, by the rules generation uses (lib/dedupe). Those are left
 * out of a new copy and out of an update to an old one, and the screen says
 * how many.
 */
function alreadyHave(shared) {
  const mine = QUESTIONS
    .filter(q => typeof q.q === "string")
    .map(q => shape(q.q, Array.isArray(q.opts) ? q.opts[q.ans] : ""));
  return shared.filter(sq => {
    const s = shape(sq.q, sq.a);
    return mine.some(m => isRepeat(s, m));
  }).map(sq => sq.id);
}

/**
 * What a share link opens.
 *
 * It used to open nothing: /d/<code> called copy_deck_by_code on sight, so a
 * URL pasted into a group chat put somebody else's deck into your account
 * before you had seen its name. The link is the only thing a person has to go
 * on — no title, no count, no sender — and clicking it was irreversible in
 * the sense that mattered: a deck you did not ask for, mixed in with yours.
 *
 * So the code is looked up first and nothing happens until the button. Three
 * facts: who sent it, what it is called, how many questions. Everything else
 * that was here — the sub-deck count, a sentence explaining that the copy is
 * yours and will not track theirs — was true and was not what anybody is
 * deciding on, which is only whether they want the thing.
 *
 * Built from the same pieces as the rest of the app — the card, the two
 * buttons and the colours out of theme.js — rather than its own small
 * dialect. The first version invented all of it and read as a different
 * product bolted to the front of this one.
 */

const dialogBtn = { flex: 1, padding: "12px 18px", fontSize: 14.5, whiteSpace: "nowrap" };

function Shell({ children }) {
  return (
    <div style={{
      minHeight: "var(--app-vh)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24,
    }}>
      <div className="anim-scale-in" style={{
        ...card, maxWidth: 420, width: "100%", textAlign: "center", padding: "40px 32px",
      }}>
        {children}
      </div>
    </div>
  );
}

function Title({ children }) {
  return (
    <div style={{ fontSize: 18, color: C.text, fontWeight: 600, letterSpacing: -0.3 }}>
      {children}
    </div>
  );
}

function Body({ children, space = 28 }) {
  return (
    <div style={{ fontSize: 14, color: C.sub, lineHeight: 1.55, marginTop: 8, marginBottom: space }}>
      {children}
    </div>
  );
}

export default function ReceiveDeck({ code, onAdded, onSkip }) {
  const [state, setState] = useState("loading");   // loading | ready | missing | failed
  const [deck, setDeck] = useState(null);
  const [adding, setAdding] = useState(false);
  /* Ids of the shared questions you already have, and how many it holds. */
  const [skip, setSkip] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const row = await remote.deckPreview(code);
        if (cancelled) return;
        if (row && !row.mine) {
          const shared = await remote.sharedQuestions(code).catch(() => []);
          if (cancelled) return;
          setTotal(shared.length);
          setSkip(alreadyHave(shared));
        }
        /* No row means the code is wrong, or the deck has been deleted since
           the link was sent. Both are the same thing to whoever is holding
           it, so they get the same sentence. */
        if (!row) { setState("missing"); return; }
        setDeck(row);
        setState("ready");
      } catch {
        if (!cancelled) setState("failed");
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  async function add() {
    setAdding(true);
    setError(null);
    try {
      /* Already have a copy: add what is new to it. Otherwise a new copy,
         leaving out what you have. */
      if (deck.copy_id) {
        await remote.updateCopyByCode(code, skip);
        await onAdded(deck.copy_id);
        return;
      }
      const id = await remote.copyDeckByCode(code, skip);
      if (!id) throw new Error("That deck could not be copied.");
      await onAdded(id);
    } catch (e) {
      setError(e?.message || "Could not add it. Try again.");
      setAdding(false);
    }
  }

  if (state === "loading") {
    return (
      <div style={{ minHeight: "var(--app-vh)", display: "grid", placeItems: "center" }}>
        <div style={{ color: "var(--c-on-field)", fontSize: 15, fontWeight: 500, opacity: 0.9 }}>
          Looking…
        </div>
      </div>
    );
  }

  if (state === "missing" || state === "failed") {
    return (
      <Shell>
        <Title>{state === "missing" ? "That link doesn’t work" : "Couldn’t check that link"}</Title>
        <Body>
          {state === "missing"
            ? "It may have been typed wrong, or the deck may have been deleted. Ask whoever sent it for a new link."
            : "Something went wrong reaching the server. Your connection may be down."}
        </Body>
        <button type="button" className="btn-press" onClick={onSkip}
          style={{ ...primaryBtn, ...dialogBtn, width: "100%" }}>
          Go to my decks
        </button>
      </Shell>
    );
  }

  if (deck.mine) {
    return (
      <Shell>
        <Title>{deck.name}</Title>
        <Body>This is your own deck, so there is nothing to add.</Body>
        <button type="button" className="btn-press" onClick={onSkip}
          style={{ ...primaryBtn, ...dialogBtn, width: "100%" }}>
          Open my decks
        </button>
      </Shell>
    );
  }

  /* What is actually new to you: the deck's questions less the ones you
     already have. When the check could not run, the deck's own count. */
  const counted = total > 0;
  const fresh = counted ? total - skip.length : Number(deck.questions) || 0;
  const plural = n => (n === 1 ? "" : "s");
  const nothingNew = counted && fresh === 0;

  return (
    <Shell>
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--c-accent)", marginBottom: 14 }}>
        {deck.owner_name} shared a deck with you
      </div>
      <div style={{ fontSize: 25, color: C.text, fontWeight: 700, letterSpacing: -0.6, lineHeight: 1.2, overflowWrap: "anywhere" }}>
        {deck.name}
      </div>
      {/* Questions only. The sub-deck count was a second number next to the
          one that matters, and how it is filed is the recipient's problem
          once it is theirs. The sentence about it being a copy went for the
          same reason: true, but not what anyone is deciding on. */}
      <div style={{ fontSize: 15, color: C.sub, lineHeight: 1.5, marginTop: 10, fontVariantNumeric: "tabular-nums", textWrap: "pretty" }}>
        {/* One plain sentence on what will happen (Rafil, 2026-10-17). */}
        {deck.copy_id
          ? (nothingNew
            ? "You added this deck before and already have all of its questions."
            : `You added this deck before. ${fresh} question${plural(fresh)} ${fresh === 1 ? "has" : "have"} been added to it since then.`)
          : nothingNew
          ? `All ${deck.questions} of these questions are already in your decks.`
          : skip.length > 0
          ? `${deck.questions} questions. ${skip.length} of them ${skip.length === 1 ? "is" : "are"} already in your decks, so ${skip.length === 1 ? "it won’t" : "they won’t"} be added again.`
          : `${deck.questions} question${plural(Number(deck.questions))}.`}
      </div>
      {error && (
        <div role="alert" style={{
          fontSize: 13.5, lineHeight: 1.45, color: "var(--c-danger)",
          background: "var(--c-danger-bg, rgba(214, 69, 69, 0.1))",
          borderRadius: "var(--r-ctrl)", padding: "10px 14px", marginTop: 20,
        }}>
          {error}
        </div>
      )}
      <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
        {nothingNew ? (
          <button type="button" className="btn-press"
            onClick={() => (deck.copy_id ? onAdded(deck.copy_id) : onSkip())}
            style={{ ...primaryBtn, ...dialogBtn }}>
            {deck.copy_id ? "Open deck" : "Go to my decks"}
          </button>
        ) : (
          <button type="button" className="btn-press" onClick={add} disabled={adding}
            style={{ ...primaryBtn, ...dialogBtn, ...(adding ? { opacity: 0.55 } : {}) }}>
            {adding ? "Adding…" : deck.copy_id ? `Add the ${fresh} new question${plural(fresh)}` : "Add to my decks"}
          </button>
        )}
        {!nothingNew && (
          <button type="button" className="btn-press" onClick={onSkip} disabled={adding}
            style={{ ...btnGhost, ...dialogBtn }}>
            No thanks
          </button>
        )}
      </div>
    </Shell>
  );
}
