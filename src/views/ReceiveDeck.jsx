import { useEffect, useState } from "react";
import { remote } from "../lib/remote";

/**
 * What a share link opens.
 *
 * It used to open nothing: /d/<code> called copy_deck_by_code on sight, so a
 * URL pasted into a group chat put somebody else's deck into your account
 * before you had seen its name. The link is the only thing a person has to go
 * on — no title, no count, no sender — and clicking it was irreversible in
 * the sense that mattered: a deck you did not ask for, mixed in with yours.
 *
 * So the code is looked up first and nothing happens until the button. It
 * names the deck, says how big it is and who made it, and is explicit that
 * what arrives is a copy — your own, to edit or delete, that will not change
 * when theirs does. That is the one thing people get wrong about this model,
 * and the moment they are deciding is the moment to say it.
 */
export default function ReceiveDeck({ code, onAdded, onSkip }) {
  const [state, setState] = useState("loading");   // loading | ready | missing | failed
  const [deck, setDeck] = useState(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const row = await remote.deckPreview(code);
        if (cancelled) return;
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
      const id = await remote.copyDeckByCode(code);
      if (!id) throw new Error("That deck could not be copied.");
      await onAdded(id);
    } catch (e) {
      setError(e?.message || "Could not add it. Try again.");
      setAdding(false);
    }
  }

  return (
    <div className="recv">
      <div className="recv-card anim-scale-in">
        {state === "loading" && <p className="recv-quiet">Looking…</p>}

        {state === "missing" && (
          <>
            <h1 className="recv-title">That link doesn’t work</h1>
            <p className="recv-body">
              It may have been typed wrong, or the deck may have been deleted. Ask whoever sent it for a new link.
            </p>
            <button type="button" className="recv-ghost" onClick={onSkip}>Go to my decks</button>
          </>
        )}

        {state === "failed" && (
          <>
            <h1 className="recv-title">Couldn’t check that link</h1>
            <p className="recv-body">Something went wrong reaching the server. Your connection may be down.</p>
            <button type="button" className="recv-ghost" onClick={onSkip}>Go to my decks</button>
          </>
        )}

        {state === "ready" && deck && (
          <>
            <p className="recv-from">
              {deck.mine ? "This is your own deck" : `${deck.owner_name} shared a deck with you`}
            </p>
            <h1 className="recv-title">{deck.name}</h1>
            <p className="recv-meta">
              {deck.questions} question{deck.questions === 1 ? "" : "s"}
              {deck.decks > 0 && ` · ${deck.decks} sub-deck${deck.decks === 1 ? "" : "s"}`}
            </p>

            {deck.mine ? (
              <>
                <p className="recv-body">You made this one, so there is nothing to add.</p>
                <button type="button" className="recv-primary" onClick={onSkip}>Open my decks</button>
              </>
            ) : (
              <>
                <p className="recv-body">
                  You’ll get your own copy to edit, study and delete as you like. It won’t change when theirs does.
                </p>
                {error && <p className="recv-error" role="alert">{error}</p>}
                <button type="button" className="recv-primary" onClick={add} disabled={adding}>
                  {adding ? "Adding…" : "Add to my decks"}
                </button>
                <button type="button" className="recv-ghost" onClick={onSkip} disabled={adding}>
                  No thanks
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
