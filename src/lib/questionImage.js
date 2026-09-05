import { supabase } from "./supabase";

/**
 * Images attached to questions.
 *
 * The bucket is private and ownership is the first path segment —
 * {user_id}/{uuid}.webp — which is what the storage policies check against
 * auth.uid(). Reading therefore goes through a signed URL rather than a
 * public one, so a path cannot be guessed into.
 */
const BUCKET = "question-images";

/* 1600px on the long edge, WebP at 0.82.
 *
 * Measured on a 4.8MB phone photo of a lecture slide: 48KB out, a hundredfold
 * reduction, with 11pt small print still sharp. The same picture as JPEG at
 * the same size is 146KB, so WebP is worth three times the storage on its own.
 * 1200px would halve it again but starts to soften dense handwriting, and
 * 2000px costs 60% more for detail a phone screen cannot show. */
const MAX_EDGE = 1600;
const QUALITY = 0.82;

/** Draws the file to a canvas at a sane size and re-encodes it. */
export async function downscale(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const blob = await new Promise(resolve =>
    canvas.toBlob(resolve, "image/webp", QUALITY));

  /* Every browser this app supports encodes WebP, but toBlob falls back to PNG
     rather than failing if one does not — and a PNG of a photograph is larger
     than the original. JPEG is the honest second choice. */
  if (blob && blob.type === "image/webp") return blob;
  return new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", QUALITY));
}

/** Uploads one image and returns the path to store on the question. */
export async function uploadQuestionImage(userId, file) {
  const blob = await downscale(file);
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: blob.type, upsert: false });

  if (error) throw new Error(error.message || "Could not upload that image.");
  return path;
}

/* Signed URLs expire, so they are worth caching for the life of a session but
   never worth storing on the question. The question keeps the path; the URL is
   derived when something needs to draw it. */
const urlCache = new Map();

export async function questionImageUrl(path) {
  if (!path) return null;
  const hit = urlCache.get(path);
  if (hit && hit.expires > Date.now()) return hit.url;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return null;

  urlCache.set(path, { url: data.signedUrl, expires: Date.now() + 55 * 60 * 1000 });
  return data.signedUrl;
}

export async function removeQuestionImage(path) {
  if (!path) return;
  urlCache.delete(path);
  await supabase.storage.from(BUCKET).remove([path]);
}
