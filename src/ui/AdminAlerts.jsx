import { useEffect, useState } from "react";
import { btnGhost, primaryBtn, sectionH, meta } from "./theme";
import { current, support, turnOffAlerts, turnOnAlerts } from "../lib/push";
import { supabase } from "../lib/supabase";

/**
 * Admin alerts on this device (2026-11-25, migration 0107): a notification
 * when someone signs up and when a student reports a question. Rafil only
 * (is_owner; 0109 holds it in the database too); separate from the study
 * reminders above it, so either can be on alone.
 */
export default function AdminAlerts() {
  const [admin, setAdmin] = useState(false);
  const [state, setState] = useState("loading");       // loading | off | on | ios-browser | blocked | none
  const [sub, setSub] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    let live = true;
    supabase.rpc("is_owner").then(({ data }) => { if (live) setAdmin(data === true); }, () => {});
    const s = support();
    if (s !== "ok") { setState(s); return () => { live = false; }; }
    current().then(({ subscription, row }) => {
      if (!live) return;
      setSub(subscription);
      setState(subscription && row?.admin_alerts ? "on" : "off");
    }, () => live && setState("off"));
    return () => { live = false; };
  }, []);

  if (!admin) return null;

  async function enable() {
    setBusy(true); setNote("");
    try {
      setSub(await turnOnAlerts());
      setState("on");
      setNote("Alerts are on for this device.");
    } catch (e) {
      setNote(e.message);
      if (support() === "blocked") setState("blocked");
    } finally { setBusy(false); }
  }
  async function disable() {
    setBusy(true); setNote("");
    try { await turnOffAlerts(sub); setState("off"); setNote("Alerts are off for this device."); }
    finally { setBusy(false); }
  }

  return (
    <section className="profile-section rem-alerts" data-in="rise" style={{ "--i": 3 }}>
      <h2 style={sectionH}>Admin alerts</h2>
      <p style={{ ...meta, marginTop: 4 }}>
        A notification on this device when someone signs up and when a student reports a question. Tapping it opens Admin.
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
        <div className="rem-actions rem-alerts__acts">
          {state === "on"
            ? <button type="button" className="btn-press" style={btnGhost} onClick={disable} disabled={busy}>Turn off alerts</button>
            : <button type="button" className="btn-press" style={primaryBtn} onClick={enable} disabled={busy}>Turn on alerts</button>}
        </div>
      )}
      {note && <p className="rem-note" role="status">{note}</p>}
    </section>
  );
}
