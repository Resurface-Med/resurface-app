import { useSyncExternalStore } from "react";

/**
 * Small preferences that follow a person between devices.
 *
 * Kept on their profile row, not in localStorage — the app's rule is that the
 * browser holds the theme and the retry queue and nothing else. App.jsx
 * loads them with the rest of the snapshot and hands over the function that
 * saves them, so anything deep in the tree can read and set one without the
 * value being threaded down through every view on the way.
 */
let state = { showAllOptions: false };
let save = null;
const subs = new Set();
const emit = () => subs.forEach(fn => fn());

export function loadPrefs(values, saver) {
  state = { ...state, ...values };
  save = saver;
  emit();
}

export function setPref(key, value) {
  if (state[key] === value) return;
  state = { ...state, [key]: value };
  emit();
  save?.({ [key]: value });
}

export function usePref(key) {
  return useSyncExternalStore(
    fn => { subs.add(fn); return () => subs.delete(fn); },
    () => state[key],
  );
}
