/**
 * A plain text file (.txt, also .md), read exactly as written (2026-10-18).
 *
 * Text editors do not agree on encoding. Mac and most apps write UTF-8;
 * Windows Notepad's "Unicode" is UTF-16 with a byte-order mark; and older
 * Windows files are Windows-1252, where a bare UTF-8 read turns every é, £
 * and µ (µmol/L is all over a lecture) into a replacement character. So: a
 * byte-order mark decides it when there is one; otherwise UTF-8, strictly,
 * falling back to Windows-1252 only when the bytes are not valid UTF-8.
 * Line endings are normalised and the mark itself is dropped.
 */
export async function extractText(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const bom = (...b) => b.every((x, i) => bytes[i] === x);
  let text;
  if (bom(0xff, 0xfe)) text = new TextDecoder("utf-16le").decode(bytes.subarray(2));
  else if (bom(0xfe, 0xff)) text = new TextDecoder("utf-16be").decode(bytes.subarray(2));
  else {
    const body = bom(0xef, 0xbb, 0xbf) ? bytes.subarray(3) : bytes;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(body); }
    catch { text = new TextDecoder("windows-1252").decode(body); }
  }
  text = text.replace(/\r\n?/g, "\n").split("\u0000").join("").trim();
  if (!text) throw new Error("That text file is empty.");
  return text;
}
