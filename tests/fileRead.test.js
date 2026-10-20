import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { unreadableReason, extractDocx } from "../src/lib/fileRead.js";

describe("unreadableReason", () => {
  it("lets every readable kind through, whatever the case", () => {
    for (const n of ["a.pptx", "b.PDF", "c.apkg", "d.colpkg", "e.docx", "f.txt", "g.md", "h.JPG", "i.jpeg", "j.png", "k.webp", "l.gif"]) {
      expect(unreadableReason(n)).toBeNull();
    }
  });
  it("explains old Office files with the way to fix them", () => {
    expect(unreadableReason("Renal 1.ppt")).toMatch(/older PowerPoint.*Save As.*\.pptx/);
    expect(unreadableReason("notes.DOC")).toMatch(/older Word.*\.docx/);
  });
  it("points Keynote, Pages and the like at PDF, and iPhone photos at JPEG", () => {
    expect(unreadableReason("lecture.key")).toMatch(/Export it as a PDF/);
    expect(unreadableReason("photo.HEIC")).toMatch(/JPEG/);
  });
  it("names what does work for anything else, including no extension", () => {
    expect(unreadableReason("archive.zip")).toMatch(/PDF, PowerPoint \(\.pptx\), Word \(\.docx\)/);
    expect(unreadableReason("README")).toMatch(/can’t be read/);
  });
});

async function docx(paragraphs) {
  const zip = new JSZip();
  const body = paragraphs.map(p => `<w:p><w:pPr/>${p.map(r => `<w:r><w:t xml:space="preserve">${r}</w:t></w:r>`).join("")}</w:p>`).join("");
  zip.file("word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${body}</w:body></w:document>`);
  return zip.generateAsync({ type: "uint8array" });
}

describe("extractDocx", () => {
  it("reads paragraphs in order, joining runs, decoding entities", async () => {
    const file = await docx([["Acute kidney ", "injury"], ["Pre-renal &amp; renal causes"], [], ["K&lt;sup&gt; rises"]]);
    expect(await extractDocx(file)).toBe("Acute kidney injury\nPre-renal & renal causes\nK<sup> rises");
  });
  it("says so when the file is not really a Word document", async () => {
    const zip = new JSZip();
    zip.file("other.xml", "<x/>");
    await expect(extractDocx(await zip.generateAsync({ type: "uint8array" }))).rejects.toThrow(/damaged/);
  });
});
