// Server-side proxy for question generation.
//
// The Anthropic key lives here as an env var and never reaches the browser.
// The system prompt is built here too, so the endpoint can only ever produce
// MCQs — it can't be repurposed as a free general-purpose Claude proxy.

const MAX_COUNT = 20;

const DIFF_DESC = {
  easy:   "direct single-fact recall (where/what/which enzyme)",
  medium: "mechanism/application (why does X, what happens if Y inhibited)",
  hard:   "clinical vignette — every question must open with a patient scenario",
};

// Best-effort throttle. Serverless instances are recycled, so this caps
// runaway loops rather than providing real per-user quotas. Swap for Upstash
// Redis if the access code ever leaks beyond the group.
const hits = new Map();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;

function rateLimited(id) {
  const now = Date.now();
  const recent = (hits.get(id) || []).filter(t => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(id, recent);
  return recent.length > MAX_PER_WINDOW;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const passcode = process.env.ASCEND_PASSCODE;
  if (passcode && req.headers["x-ascend-passcode"] !== passcode) {
    return res.status(401).json({ error: "Wrong access code." });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY." });
  }

  const id = req.headers["x-forwarded-for"] || "anon";
  if (rateLimited(id)) {
    return res.status(429).json({ error: "Slow down — too many generations. Try again in a minute." });
  }

  const { userContent, difficulty = "medium", count = 5 } = req.body || {};

  if (!Array.isArray(userContent) || userContent.length === 0) {
    return res.status(400).json({ error: "No content to generate from." });
  }

  const n = Math.min(Math.max(parseInt(count) || 5, 1), MAX_COUNT);
  const diffDesc = DIFF_DESC[difficulty] || DIFF_DESC.medium;

  const systemPrompt = `MCQ generator for Year 1 MBChB. Output ONLY a JSON array, no markdown.
Rules: ${n} questions, 5 opts each, difficulty=${diffDesc}.
Options: all 5 must be equal length (±3 words), parallel grammar, plausible distractors.
exp=2 sentences why correct. optExp=1 sentence why each wrong opt is wrong (null at ans index).
Vary ans position. Schema: [{"q":"...","opts":[...],"ans":N,"exp":"...","optExp":[...]}]`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      // Don't leak upstream account details to the client.
      const msg = r.status === 401 || r.status === 403
        ? "Server API key was rejected."
        : err?.error?.message || `Upstream error ${r.status}`;
      return res.status(r.status === 401 || r.status === 403 ? 500 : r.status).json({ error: msg });
    }

    const data = await r.json();
    const text = data.content?.[0]?.text || "";
    const clean = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    let parsed;
    try { parsed = JSON.parse(clean); }
    catch { return res.status(502).json({ error: "Claude returned invalid JSON. Try again." }); }

    if (!Array.isArray(parsed)) {
      return res.status(502).json({ error: "Expected a JSON array from Claude." });
    }

    return res.status(200).json({ questions: parsed });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Generation failed." });
  }
}
