import { useState } from "react";
import { support, turnOn } from "../lib/push";

/**
 * A reminder, offered once, at the end of someone's first session
 * (2026-10-26).
 *
 * Only 2 people had turned reminders on, from a section at the bottom of
 * Profile. The ask comes after something has gone right, not during sign-up,
 * and it is our own screen first: "Not now" here costs nothing, where a
 * refusal in the browser's own prompt can't be asked again.
 *
 * On an iPhone in Safari a site can't send notifications until it is on the
 * Home Screen, so there it says how, instead of offering a switch that
 * would fail.
 */
export default function ReminderPrompt({ onDone }) {
  const kind = support();
  const [time, setTime] = useState("18:00");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function enable(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    try { await turnOn(time); onDone("on"); }
    catch (x) { setErr(x.message || "Couldn't turn reminders on."); setBusy(false); }
  }

  if (kind === "ios-browser") {
    return (
      <div className="np-scrim" role="presentation">
        <div className="np" role="dialog" aria-modal="true" aria-label="Reminders">
          <p className="np__label is-first is-top">Want a reminder to come back?</p>
          <p className="np__hint">On iPhone, add Resurface to your Home Screen first: tap the Share button, then Add to Home Screen. Open it from there and turn reminders on in Profile.</p>
          <div className="np__row">
            <button type="button" className="np__save btn-press" onClick={() => onDone("ios")}>Got it</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="np-scrim" role="presentation">
      <form className="np" onSubmit={enable} role="dialog" aria-modal="true" aria-label="Reminders">
        <label className="np__label is-first is-top" htmlFor="rp-time">Want a reminder to come back?</label>
        <input id="rp-time" className="np__field is-labelled" type="time" step={900}
          value={time} onChange={e => setTime(e.target.value)} />
        <p className="np__hint">One notification at this time, only on days you have questions due. You can change it in Profile.</p>
        {err && <p className="name-err" role="alert">{err}</p>}
        <div className="np__row">
          <button type="button" className="np__skip" onClick={() => onDone("later")}>Not now</button>
          <button type="submit" className="np__save btn-press" disabled={busy || !time}>
            {busy ? "Turning on…" : "Remind me"}
          </button>
        </div>
      </form>
    </div>
  );
}
