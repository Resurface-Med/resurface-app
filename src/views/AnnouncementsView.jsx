import { useState } from "react";
import { h1, OF } from "../ui/theme";
import Wave from "../ui/Wave";
import { AnnouncementFeed } from "../ui/Announcements";

/**
 * Announcements, as a page of its own (2026-10-19): news from Resurface in
 * the same shape as every other page — the blue band with its title, the
 * wave, and the posts on the sheet. Reached from the bell; opening it marks
 * everything seen (App), but what was new keeps its label while you read.
 */
const band = { maxWidth: 1180, margin: "0 auto", padding: "0 clamp(20px, 3vw, 40px)", width: "100%" };

export default function AnnouncementsView(props) {
  const [composing, setComposing] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "var(--app-vh)" }}>
      <div className="page-band" style={{ ...band, paddingTop: "clamp(22px, 3.6vh, 36px)", paddingBottom: "clamp(18px, 2.8vh, 28px)" }}>
        <div className="ann-band">
          <div>
            <h1 data-in="left" style={{ ...h1, margin: 0, "--i": 0 }}>What’s new</h1>
            <p style={{ marginTop: 8, fontSize: 15, color: OF.soft, fontWeight: 500, letterSpacing: -0.2, maxWidth: "36em" }}>
              Updates and news from Resurface.
            </p>
          </div>
          {/* Admins: the page's action, on the band opposite its title. */}
          {props.isAdmin && !composing && (
            <button type="button" className="ann-new-btn btn-press" onClick={() => setComposing(true)}>New announcement</button>
          )}
        </div>
      </div>
      <Wave from="transparent" to="var(--c-card-solid)" />
      <div style={{ background: "var(--c-card-solid)", flex: 1 }}>
        <div style={{ ...band, maxWidth: 820, paddingTop: "clamp(16px, 2.6vh, 28px)", paddingBottom: "clamp(36px, 5vh, 56px)" }}>
          <AnnouncementFeed {...props} composing={composing} onComposeDone={() => setComposing(false)} />
        </div>
      </div>
    </div>
  );
}
