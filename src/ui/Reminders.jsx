import { useEffect, useState } from "react";
import { btnGhost, primaryBtn, sectionH, meta } from "./theme";
import { current, sendTest, setTime, support, turnOff, turnOn } from "../lib/push";

/**
 * Profile's reminders section (experimental, 2026-10-17): a time, on/off, and
 * a test. See lib/push.js for how a device is signed up and migration 0011
 * for how reminders are sent.
 */
export default function Reminders() {
  const [state, setState] = useState("loading");       // loading | off | on | ios-browser | blocked | none
  const [sub, setSub] = useState(null);
  const [time, setTimeValue] = useState("18:00");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    let live = true;
    const s = support();
    if (s !== "ok") { setState(s); return; }
    current().then(({ subscription, row }) => {
      if (!live) return;
      if (subscription && row) {
        setSub(subscription);
        setTimeValue(String(row.remind_at).slice(0, 5));
        setState("on");
      } else setState("off");
    }, () => live && setState("off"));
    return () => { live = false; };
  }, []);

  async function enable() {
    setBusy(true); setNote("");
    try {
      const s = await turnOn(time);
      setSub(s);
      setState("on");
      setNote("Reminders are on for this device.");
    } catch (e) {
      setNote(e.message);
      if (support() === "blocked") setState("blocked");
    } finally { setBusy(false); }
  }
  async function disable() {
    setBusy(true); setNote("");
    try { await turnOff(sub); setSub(null); setState("off"); setNote("Reminders are off for this device."); }
    finally { setBusy(false); }
  }
  async function changeTime(v) {
    setTimeValue(v);
    if (state === "on" && sub && v) await setTime(sub, v).catch(() => {});
  }
  async function test() {
    setBusy(true); setNote("");
    try { await sendTest(sub); setNote("Sent. It should appear in a few seconds."); }
    catch (e) { setNote(e.message); }
    finally { setBusy(false); }
  }

  return (
    <section className="profile-section" data-in="rise" style={{ "--i": 2 }}>
      <h2 style={sectionH}>Reminders <span className="rem-tag">Experimental</span></h2>
      <p style={{ ...meta, marginTop: 4 }}>
        A notification at the time you choose when you have questions due. Nothing is sent on days when nothing is due.
      </p>

      {state === "ios-browser" ? (
        <p className="rem-note">
          On iPhone, add Resurface to your Home Screen first: tap the Share button, choose Add to Home Screen, then open Resurface from there and come back to this page.
        </p>
      ) : state === "blocked" ? (
        <p className="rem-note">Notifications are blocked for this site. Allow them in your browser’s settings, then reload this page.</p>
      ) : state === "none" ? (
        <p className="rem-note">This browser can’t show notifications.</p>
      ) : state === "loading" ? null : (
        <div className="profile-stack">
          <label className="profile-field">
            <span className="profile-label">Remind me at</span>
            <input className="profile-input rem-time" type="time" value={time} step={900}
              onChange={e => changeTime(e.target.value)} />
          </label>
          <div className="rem-actions">
            {state === "on" ? (
              <>
                <button type="button" className="btn-press" style={primaryBtn} onClick={test} disabled={busy}>Send a test notification</button>
                <button type="button" className="btn-press" style={btnGhost} onClick={disable} disabled={busy}>Turn off</button>
              </>
            ) : (
              <button type="button" className="btn-press" style={primaryBtn} onClick={enable} disabled={busy}>Turn on reminders</button>
            )}
          </div>
        </div>
      )}
      {note && <p className="rem-note" role="status">{note}</p>}
    </section>
  );
}
