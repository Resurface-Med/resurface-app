/**
 * Whether a display name is allowed (2026-10-17).
 *
 * Names show on the cohort's leaderboard, so a few are not allowed. This is
 * the app's copy, for saying so the moment you type; the database has the
 * same lists and enforces them (migration 0012, name_is_inappropriate), so
 * the app cannot be talked past. Change both together.
 *
 * Two lists, because the difference between a slur and a surname is often
 * only where the letters sit:
 *  - ANYWHERE: caught inside anything, once disguises are undone — spaces
 *    and dots removed, digits read as letters (5h1t, f.u.c.k, fvck, fuuuck).
 *  - WHOLE: caught only as a word of its own (or with s / es / ing / ed /
 *    y — not "er", which made Spicer a slur), because the letters also live inside real names:
 *    Cassandra, Hassan, Hancock, Ashit, Scunthorpe, Pakistani, Spicer.
 * A repeated letter is allowed for in both ("fuuuck"), but never added, so
 * a word with a double letter in it does not match a name with one.
 */
export const ANYWHERE = [
  "fuck", "fvck", "fuk", "motherf", "shite", "bitch", "bastard", "bollock", "wanker",
  "twat", "prick", "dickhead", "cocksuck", "slut", "whore", "dildo", "jizz", "bellend",
  "nigger", "nigga", "faggot", "tranny", "retard", "nazi", "hitler", "kkk",
  "bumbaclat", "bumboclat", "bumbaclot", "bumboclot", "bomboclat", "bloodclat", "rassclat", "pussyclat",
  "pussy", "porn", "rapist", "pedo", "paedo", "nonce",
  "bullshit", "shithead", "shitface", "dipshit", "horseshit", "asswipe", "arsewipe",
];
export const WHOLE = [
  "ass", "arse", "arsehole", "asshole", "shit", "cunt", "cock", "dick", "piss", "crap",
  "tit", "tits", "boob", "boobs", "penis", "vagina", "anal", "cum", "sex", "sexy", "rape",
  "wank", "fag", "homo", "paki", "chink", "spic", "kike", "gook", "coon", "wog", "dyke",
  "negro", "spaz", "mong", "slag", "skank", "tosser", "hoe",
];

const LEET = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", "$": "s", "!": "i", "|": "i" };

/* "f+u+c+k+": each letter at least once, any number of times. */
const stretch = w => w.split("").map(c => `${c}+`).join("");
const anywhereRe = new RegExp(`(${ANYWHERE.map(stretch).join("|")})`);
const wholeRe = new RegExp(`(^| )(${WHOLE.map(stretch).join("|")})(s|es|ing|ed|y)?( |$)`);

export function normalise(name) {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[0134578@$!|]/g, c => LEET[c] ?? c);
}

export function isInappropriate(name) {
  const n = normalise(name);
  const squashed = n.replace(/[^a-z]/g, "");
  if (anywhereRe.test(squashed)) return true;
  const words = n.replace(/[^a-z]+/g, " ").trim();
  if (wholeRe.test(words)) return true;
  /* Spelled out a letter at a time ("a s s"): read it as one word. */
  const spelled = words.replace(/\b([a-z]) (?=[a-z]\b)/g, "$1");
  return spelled !== words && wholeRe.test(spelled);
}

export const NAME_NOT_ALLOWED = "That name isn’t allowed, as it shows on the leaderboard. Choose another.";
