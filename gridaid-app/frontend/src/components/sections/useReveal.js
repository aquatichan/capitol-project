import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

// Elements marked .rv rise into place as they enter the viewport; .sec-rule draws itself. Reduced motion: nothing hidden, nothing moves.
export function useReveal(scope, deps = []) {
  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const q = gsap.utils.selector(scope);
      const els = q(".rv");
      gsap.set(els, { autoAlpha: 0, y: 28 });
      ScrollTrigger.batch(els, {
        start: "top 90%",
        once: true,
        onEnter: (batch) => gsap.to(batch, { autoAlpha: 1, y: 0, duration: 0.85, stagger: 0.07, ease: "power3.out", overwrite: true }),
      });
      q(".sec-rule").forEach((rule) =>
        gsap.fromTo(rule, { scaleX: 0 }, { scaleX: 1, ease: "none", scrollTrigger: { trigger: rule, start: "top 92%", end: "top 55%", scrub: 0.4 } })
      );
    },
    { scope, dependencies: deps, revertOnUpdate: true }
  );
}
