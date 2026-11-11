import { friendByCode } from "./_og/deck.mjs";

/*
 * A friend link (/f/<code>, rewritten here in vercel.json), 2026-11-11.
 * The same as deck-page: the app's own index.html, with the preview tags
 * saying who sent it, because WhatsApp reads those without running the app.
 * The picture stays the app's usual one.
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
  const [page, who] = await Promise.all([
    fetch(`${origin}/index.html`).then(r => r.text()),
    friendByCode(code),
  ]);
  let html = page;
  if (who) {
    const title = `Add ${who} on Resurface`;
    const desc = `${who} wants you on their leaderboard. Open the link to become friends and see who answers the most questions this week.`;
    for (const [k, v] of [["og:title", title], ["og:description", desc], ["og:url", `${origin}/f/${code}`], ["twitter:title", title], ["twitter:description", desc]]) {
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
