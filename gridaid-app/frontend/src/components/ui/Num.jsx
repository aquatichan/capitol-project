import { useEffect, useRef } from "react";
import gsap from "gsap";
import { useReducedMotion } from "../../lib/hooks.js";

// A number that counts to its new value. Written straight to the DOM so a slider drag never re-renders React per frame.
export default function Num({ value, decimals = 0, className, suffix = "" }) {
  const ref = useRef(null);
  const state = useRef({ v: value });
  const reduce = useReducedMotion();
  const text = (v) => v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) {
      state.current.v = value;
      el.textContent = text(value);
      return;
    }
    const tw = gsap.to(state.current, { v: value, duration: 0.55, ease: "power2.out", overwrite: true, onUpdate: () => (el.textContent = text(state.current.v)) });
    return () => tw.kill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimals, reduce]);
  return <span ref={ref} className={className}>{text(value)}</span>;
}
