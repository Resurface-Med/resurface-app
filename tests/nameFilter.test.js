import { describe, expect, it } from "vitest";
import { isInappropriate } from "../src/lib/nameFilter.js";

describe("isInappropriate", () => {
  it.each([
    "fuck", "Fuck Off", "f.u.c.k", "f u c k", "fuuuuck", "fvck", "FuckFace", "motherfucker",
    "5h1t", "shit", "bullshit head", "piss off", "a s s", "my ass", "asshole", "cunts",
    "bumboclat", "Bumbaclaat", "b0mb0clat", "nazi", "N1gg3r", "faggot", "retarded",
    "bellend", "dickhead", "big tits", "sexy", "pussy", "wanker",
  ])("blocks %s", name => {
    expect(isInappropriate(name)).toBe(true);
  });

  it.each([
    // Real names here and words that hold a blocked one inside them.
    "Rafil", "Jake Reilly", "Vedant Patil", "Zain Arghandawi", "ElshishyA", "Annabelle Chan",
    "Chinonye", "Sitara", "Imaan", "Sofiia", "Rachel", "Meatball", "Clippy", "Jiggy",
    "Cassandra", "Hassan", "Hancock", "Ashit", "Scunthorpe", "Pakistani", "Spicer",
    "Dickens", "Shitake", "Matsushita", "Essex", "Sussex", "Analise", "Cumbria",
    "Penistone", "Arsenal", "Titus", "Sexton", "Dickinson", "Cockburn", "Raphael",
    "Wankowski", "Assad", "Niger Delta", "Snigdha", "Piassa", "Homosapiens fan",
  ])("allows %s", name => {
    expect(isInappropriate(name)).toBe(false);
  });
});
