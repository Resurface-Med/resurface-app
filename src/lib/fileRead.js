import JSZip from "jszip";

/*
 * What can be read, decided the moment a file is added (2026-10-20).
 *
 * Anything was accepted before — the picker filtered, but a dropped file
 * did not — and a file that could not be read failed only after the deck
 * had been named and Generate pressed: an old .ppt with the zip library's
 * "Can't find end of central directory", a Word file with "No content to
 * generate from". Now each file is checked as it arrives, and one that
 * cannot be used is turned away there and then, saying what to do instead.
 */
const READABLE = ["pptx", "pdf", "apkg", "colpkg", "docx", "txt", "md", "text", "jpg", "jpeg", "png", "webp", "gif"];
export function unreadableReason(name) {
  const ext = String(name).split(".").pop().toLowerCase();
  if (READABLE.includes(ext)) return null;
  if (ext === "ppt") return `“${name}” is an older PowerPoint file, which can’t be read here. In PowerPoint, choose File › Save As › PowerPoint Presentation (.pptx), then add that.`;
  if (ext === "doc") return `“${name}” is an older Word file, which can’t be read here. In Word, choose File › Save As › Word Document (.docx), then add that.`;
  if (["key", "pages", "odp", "odt", "numbers"].includes(ext)) return `“${name}” can’t be read here. Export it as a PDF and add that instead.`;
  if (["heic", "heif"].includes(ext)) return `“${name}” is an iPhone photo format that can’t be read here. Take a screenshot of it, or share it as a JPEG, and add that.`;
  return `“${name}” can’t be read. Use a PDF, PowerPoint (.pptx), Word (.docx), Anki deck, text file or image.`;
}

export async function extractDocx(file) {
  const zip = await JSZip.loadAsync(file);
  const doc = zip.files["word/document.xml"];
  if (!doc) throw new Error("That Word file looks damaged. Try opening and saving it again, or save it as a PDF.");
  const xml = await doc.async("text");
  /* Paragraph by paragraph, so headings and lines stay apart. */
  return (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [])
    .map(p => (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(m => m.replace(/<[^>]+>/g, "")).join(""))
    .map(s => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim())
    .filter(Boolean)
    .join("\n");
}

