import { deckByCode, countLabel, firstName } from "./_og/deck.mjs";

/*
 * A shared deck's link (/d/<code>, rewritten here in vercel.json), for link
 * previews (2026-10-28). WhatsApp, iMessage and the rest read the page's
 * preview tags without running the app, so a single-page app showed every
 * deck as the generic "Resurface" card. This returns the app's own
 * index.html with those tags filled in for the deck; a person opening the
 * link gets the app exactly as before.
 */
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function setMeta(html, prop, value) {
  const re = new RegExp(`(<meta\\s+(?:property|name)="${prop}"\\s+content=")[^"]*(")`);
  return re.test(html) ? html.replace(re, `$1${esc(value)}$2`) : html.replace("</head>", `  <meta property="${prop}" content="${esc(value)}" />\n</head>`);
}

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") || url.pathname.split("/").pop();
  const origin = `https://${request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host}`;
  const [page, deck] = await Promise.all([
    fetch(`${origin}/index.html`).then(r => r.text()),
    deckByCode(code),
  ]);
  let html = page;
  if (deck) {
    const who = firstName(deck.owner);
    const title = deck.name;
    const desc = `${countLabel(deck.questions)}${who ? `, shared by ${who}` : ""} on Resurface. Open it to add the deck and start answering.`;
    const image = `${origin}/api/og?code=${encodeURIComponent(code)}`;
    for (const [k, v] of [["og:title", title], ["og:description", desc], ["og:url", `${origin}/d/${code}`], ["og:image", image], ["twitter:title", title], ["twitter:description", desc], ["twitter:image", image]]) {
      html = setMeta(html, k, v);
    }
  }
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=86400",
    },
  });
}
