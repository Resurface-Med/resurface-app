import { supabase } from "./supabase";
import { apiFetch } from "./api";

/**
 * Reminder notifications on this device (2026-10-17, experimental).
 *
 * Turning them on asks the browser's permission, then gets this device's
 * push address (pushManager.subscribe, signed for with our public VAPID key)
 * and stores it with a time and time zone in push_subscriptions. From there
 * the database sends the reminders (migration 0011): once a day at that
 * time, only when questions are due. The service worker shows them.
 *
 * iPhone and iPad only allow this in the app added to the Home Screen, so
 * `support()` says which case this is.
 */
export const VAPID_PUBLIC_KEY = "BGaUYX0xBuxwGSHw_U5rU5IWGhl4Kx4WOkMDKgHLJM9CvNeCxOnpm1IOSQDipcBhjLGrsImSDy90v3TPgugPVDY";

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;

/** "ok", "ios-browser" (needs the Home Screen app), "blocked", or "none". */
export function support() {
  const can = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (isIOS() && !isStandalone()) return "ios-browser";
  if (!can) return "none";
  if (Notification.permission === "denied") return "blocked";
  return "ok";
}

function keyBytes(base64) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

async function registration() {
  return navigator.serviceWorker.ready;
}

/** This device's subscription and its saved row, or nulls. */
export async function current() {
  if (support() !== "ok") return { subscription: null, row: null };
  const reg = await registration();
  const subscription = await reg.pushManager.getSubscription();
  if (!subscription) return { subscription: null, row: null };
  const { data } = await supabase.from("push_subscriptions").select("remind_at, enabled").eq("endpoint", subscription.endpoint).maybeSingle();
  return { subscription, row: data ?? null };
}

/** Ask, subscribe, store. Throws with a sentence fit to show. */
export async function turnOn(remindAt) {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(permission === "denied"
      ? "Notifications are blocked for this site. Allow them in your browser's settings, then try again."
      : "Notifications weren't allowed, so reminders are still off.");
  }
  const reg = await registration();
  const subscription = (await reg.pushManager.getSubscription())
    ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
  const json = subscription.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert({
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London",
    remind_at: remindAt,
    enabled: true,
  }, { onConflict: "endpoint" });
  if (error) throw new Error("Couldn't save the reminder. Try again.");
  return subscription;
}

export async function setTime(subscription, remindAt) {
  await supabase.from("push_subscriptions").update({ remind_at: remindAt, last_sent_on: null }).eq("endpoint", subscription.endpoint);
}

export async function turnOff(subscription) {
  await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
  await subscription.unsubscribe().catch(() => {});
  navigator.clearAppBadge?.().catch(() => {});
}

export async function sendTest(subscription) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await apiFetch("/api/push/test", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${session?.access_token ?? ""}` },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || "Couldn't send the test.");
  }
}
