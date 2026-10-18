import { describe, expect, it } from "vitest";
import { extractText } from "../src/lib/textFile.js";

/* A File-like thing from raw bytes, as the browser hands one over. */
const fileOf = bytes => ({ arrayBuffer: async () => new Uint8Array(bytes).buffer });
const utf8 = s => [...new TextEncoder().encode(s)];
const LECTURE = "Creatinine 60–120 µmol/L.\nAlbumin £ é";

describe("extractText", () => {
  it("reads UTF-8", async () => {
    expect(await extractText(fileOf(utf8(LECTURE)))).toBe(LECTURE);
  });
  it("drops a UTF-8 byte-order mark", async () => {
    expect(await extractText(fileOf([0xef, 0xbb, 0xbf, ...utf8(LECTURE)]))).toBe(LECTURE);
  });
  it("reads Windows Notepad's UTF-16", async () => {
    const le = [0xff, 0xfe];
    for (const ch of LECTURE) { const c = ch.charCodeAt(0); le.push(c & 0xff, c >> 8); }
    expect(await extractText(fileOf(le))).toBe(LECTURE);
  });
  it("reads big-endian UTF-16", async () => {
    const be = [0xfe, 0xff];
    for (const ch of LECTURE) { const c = ch.charCodeAt(0); be.push(c >> 8, c & 0xff); }
    expect(await extractText(fileOf(be))).toBe(LECTURE);
  });
  it("falls back to Windows-1252 for old Windows files", async () => {
    // "µmol £ é" in Windows-1252: µ = 0xB5, £ = 0xA3, é = 0xE9 — not valid UTF-8.
    const bytes = [0xb5, ...utf8("mol "), 0xa3, 0x20, 0xe9];
    expect(await extractText(fileOf(bytes))).toBe("µmol £ é");
  });
  it("normalises Windows line endings", async () => {
    expect(await extractText(fileOf(utf8("one\r\ntwo\rthree")))).toBe("one\ntwo\nthree");
  });
  it("refuses an empty file", async () => {
    await expect(extractText(fileOf(utf8("  \n ")))).rejects.toThrow("empty");
  });
});
