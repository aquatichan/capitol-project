import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { PlannerProvider } from "./state/PlannerContext.jsx";
import SvgDefs from "./components/SvgDefs.jsx";
import Stage from "./components/Stage.jsx";
import Sections from "./components/Sections.jsx";
import { goTo, usePage } from "./lib/route.js";
import Boundary from "./components/ui/Boundary.jsx";
import Galaxy from "./components/reactbits/Galaxy.jsx";
import { finishIntro, introPending } from "./lib/intro.js";

const Logistics = lazy(() => import("./pages/Logistics.jsx"));
const EarthIntro = lazy(() => import("./components/intro/EarthIntro.jsx"));

export default function App() {
  const page = usePage();
  // the night-Earth intro: once per tab, opening on the map page (lib/intro.js); three.js loads only for it
  const [intro, setIntro] = useState(() => introPending());
  const introGone = useCallback(() => setIntro(false), []);
  // web fonts change line heights after first paint; pins and reveals must be measured again once they land
  useEffect(() => {
    document.fonts?.ready.then(() => ScrollTrigger.refresh());
  }, []);
  return (
    <PlannerProvider>
      <SvgDefs />
      {/* one React Bits Galaxy behind every page; sections and cards are see-through around it */}
      <div className="space-bg" aria-hidden="true">
        <Galaxy
          density={0.7}
          glowIntensity={0.18}
          saturation={0.2}
          hueShift={210}
          starSpeed={0.12}
          speed={0.5}
          rotationSpeed={0.015}
          twinkleIntensity={0.35}
          mouseInteraction={false}
          mouseRepulsion={false}
          clickWarp={false}
          starSize={0.75}
          flareIntensity={0.25}
          opacity={0.7}
          dpr={1}
        />
      </div>
      {page === "logistics" ? (
        <Boundary fallback={<p className="page-wait">Something went wrong on this page. <button type="button" className="lg-link" onClick={() => goTo("planner")}>Back to the map</button></p>}>
          <Suspense fallback={<p className="page-wait">Loading the logistics page…</p>}>
            <Logistics />
          </Suspense>
        </Boundary>
      ) : (
        <>
          <main id="top">
            <Stage />
            <Sections />
          </main>
          {intro && (
            <Boundary fallback={<IntroFailed onGone={introGone} />}>
              <Suspense fallback={<div className="intro" />}>
                <EarthIntro onGone={introGone} />
              </Suspense>
            </Boundary>
          )}
        </>
      )}
    </PlannerProvider>
  );
}

// if the intro itself breaks, skip straight to the page
function IntroFailed({ onGone }) {
  useEffect(() => {
    finishIntro();
    onGone();
  }, [onGone]);
  return null;
}
