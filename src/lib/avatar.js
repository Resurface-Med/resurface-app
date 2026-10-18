import { supabase, SUPABASE_URL } from "./supabase";

/**
 * Profile photos (2026-10-18, migration 0017).
 *
 * The photo is never in the database. It is shrunk on the device to a 256px
 * square WebP (about 10 KB) and kept in the public `avatars` bucket at the
 * person's id, served from Storage's CDN. The database keeps one number,
 * profiles.avatar_v: null means "their Google photo, if any", 0 means none,
 * and anything above is the version of their upload — part of the address,
 * so a browser can keep the image for good and fetch again only on a change.
 *
 * What the app passes around is an `avatar` string, as the leaderboard
 * returns it: "v<n>" for an upload, a Google photo's address, or null.
 */
const BUCKET = "avatars";
const EDGE = 256;
const QUALITY = 0.85;

/** The address to draw, or null for initials. */
export function avatarSrc(userId, avatar) {
  if (!avatar || !userId) return null;
  if (avatar.startsWith("v")) return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${userId}?v=${avatar.slice(1)}`;
  return avatar;
}

/** Your own: from your profile row and, for Google accounts, your sign-in. */
export function ownAvatar(user, avatarV) {
  if (avatarV > 0) return `v${avatarV}`;
  if (avatarV === 0) return null;
  const meta = user?.user_metadata ?? {};
  return meta.avatar_url || meta.picture || null;
}

/* The middle square of the picture, at EDGE pixels. A face is nearly always
   central; a crop tool is a lot of interface for the rare one that is not. */
async function square(file) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2, sy = (bitmap.height - side) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = EDGE; canvas.height = EDGE;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, EDGE, EDGE);
  bitmap.close?.();
  const webp = await new Promise(r => canvas.toBlob(r, "image/webp", QUALITY));
  if (webp?.type === "image/webp") return webp;
  return new Promise(r => canvas.toBlob(r, "image/jpeg", QUALITY));
}

/** Upload a new photo; returns the new avatar_v. */
export async function uploadAvatar(userId, file) {
  if (!file?.type?.startsWith("image/")) throw new Error("That isn’t an image. Choose a photo.");
  const blob = await square(file);
  const { error } = await supabase.storage.from(BUCKET)
    .upload(userId, blob, { contentType: blob.type, upsert: true, cacheControl: "31536000" });
  if (error) throw new Error("Couldn’t upload that photo. Try again.");
  const v = Math.floor(Date.now() / 1000);
  const { error: e2 } = await supabase.from("profiles").update({ avatar_v: v }).eq("id", userId);
  if (e2) throw new Error("Couldn’t save your photo. Try again.");
  return v;
}

/** No photo at all — not even Google's. */
export async function removeAvatar(userId) {
  await supabase.storage.from(BUCKET).remove([userId]).catch(() => {});
  const { error } = await supabase.from("profiles").update({ avatar_v: 0 }).eq("id", userId);
  if (error) throw new Error("Couldn’t remove your photo. Try again.");
}

/** Back to the Google photo (for Google accounts). */
export async function restoreGooglePhoto(userId) {
  await supabase.storage.from(BUCKET).remove([userId]).catch(() => {});
  const { error } = await supabase.from("profiles").update({ avatar_v: null }).eq("id", userId);
  if (error) throw new Error("Couldn’t change your photo. Try again.");
}

/** Admin: take someone's photo down. */
export async function adminRemoveAvatar(userId) {
  const { error } = await supabase.rpc("admin_remove_avatar", { uid: userId });
  if (error) throw new Error("Couldn’t remove that photo.");
}
