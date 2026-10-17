/*
 * How many questions a lecture suggests: about one per slide with something
 * on it (Rafil, 2026-10-17). A slide or page under ~80 characters — a title,
 * "Questions?", a picture with a caption — counts for nothing; a dense one
 * (over ~600) for one and a half. Kept between 5 and 30. Pasted notes: one
 * per ~120 words. Null when there is nothing to count fairly (an Anki deck,
 * a PDF of pictures), and the slider keeps its own default.
 */
export function suggestFromSlides(text) {
  const chunks = String(text ?? "").split(/\n?--- Slide[^\n]*---\n/).map(t => t.trim()).filter(Boolean);
  let weight = 0;
  for (const c of chunks) weight += c.length < 80 ? 0 : c.length > 600 ? 1.5 : 1;
  if (weight < 1) return null;
  return Math.max(5, Math.min(30, Math.round(weight)));
}
export function suggestFromNotes(text) {
  const words = String(text ?? "").trim().split(/\s+/).filter(Boolean).length;
  if (words < 60) return null;
  return Math.max(5, Math.min(30, Math.round(words / 120)));
}
