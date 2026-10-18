import { useLayoutEffect, useRef, useState } from "react";

export const PIN_QUERY = "(min-width: 1180px) and (min-height: 680px) and (prefers-reduced-motion: no-preference)";

function useMedia(query) {
  const [on, setOn] = useState(() => (typeof window === "undefined" ? false : window.matchMedia(query).matches));
  useLayoutEffect(() => {
    const mq = window.matchMedia(query);
    const h = () => setOn(mq.matches);
    h();
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [query]);
  return on;
}

// "pin": the hero pins and the map expands as you scroll. "flow": everything is laid out plainly (small screens, reduced motion).
export const useMotionMode = () => (useMedia(PIN_QUERY) ? "pin" : "flow");
export const useReducedMotion = () => useMedia("(prefers-reduced-motion: reduce)");

export function useSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}
