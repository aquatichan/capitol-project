import { useSyncExternalStore } from "react";

// The night-Earth intro plays once per browser tab (sessionStorage), only when the tab opens on the map page,
// and never with reduced motion. The hero waits for it before running its own entrance.
const KEY = "ga-intro";

function wanted() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  if (new URLSearchParams(window.location.hash.replace(/^#/, "")).get("p") === "logistics") return false;
  try {
    if (window.sessionStorage.getItem(KEY)) return false;
  } catch {
    /* storage blocked: play it; it just won't be remembered */
  }
  return true;
}

let pending = wanted();
const subs = new Set();

export const introPending = () => pending;

export function finishIntro() {
  if (!pending) return;
  pending = false;
  try {
    window.sessionStorage.setItem(KEY, "1");
  } catch {
    /* ignore */
  }
  subs.forEach((f) => f());
}

const subscribe = (f) => {
  subs.add(f);
  return () => subs.delete(f);
};

// true once the intro has finished (or was never going to play)
export const useIntroDone = () => !useSyncExternalStore(subscribe, introPending, introPending);
