import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { createElement as h } from "react";
import fs from "node:fs";
import { deckByCode, countLabel, firstName } from "./_og/deck.mjs";

/*
 * The preview image for a shared deck's link (2026-10-28): the app's blue,
 * the logo, the deck's name, and how many questions and who shared it.
 * WhatsApp, iMessage and the rest show it instead of the generic picture.
 */
const semibold = fs.readFileSync(new URL("./_og/Poppins-SemiBold.ttf", import.meta.url));
const medium = fs.readFileSync(new URL("./_og/Poppins-Medium.ttf", import.meta.url));
const logo = `data:image/png;base64,${fs.readFileSync(new URL("./_og/logo.png", import.meta.url)).toString("base64")}`;

export async function GET(request) {
  const code = new URL(request.url).searchParams.get("code");
  const deck = await deckByCode(code);
  const name = deck ? (deck.name.length > 90 ? `${deck.name.slice(0, 88)}…` : deck.name) : "Revision questions made from your lectures";
  const who = deck ? firstName(deck.owner) : null;
  const sub = deck ? [countLabel(deck.questions), who ? `shared by ${who}` : null].filter(Boolean).join(" · ") : null;
  const size = name.length > 60 ? 54 : name.length > 32 ? 64 : 80;

  const svg = await satori(
    h("div", { style: {
      width: 1200, height: 630, display: "flex", position: "relative",
      color: "#fff", fontFamily: "Poppins",
      backgroundImage: "radial-gradient(circle at 80% 10%, #6d8ffb 0%, #3d65f2 45%, #2f55e6 100%)",
    } },
      h("img", { src: logo, width: 240, height: 56, style: { position: "absolute", top: 64, left: 84 } }),
      h("div", { style: { position: "absolute", left: 84, right: 84, bottom: 70, display: "flex", flexDirection: "column" } },
        h("div", { style: { display: "flex", fontSize: size, fontWeight: 600, lineHeight: 1.12, letterSpacing: -1.5 } }, name),
        sub ? h("div", { style: { display: "flex", marginTop: 20, fontSize: 32, fontWeight: 500, color: "rgba(255,255,255,0.86)" } }, sub) : null,
      ),
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Poppins", data: semibold, weight: 600, style: "normal" },
        { name: "Poppins", data: medium, weight: 500, style: "normal" },
      ],
    },
  );
  const png = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
  return new Response(png, {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
