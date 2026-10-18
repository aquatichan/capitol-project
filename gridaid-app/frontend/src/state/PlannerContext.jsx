import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePlan, KMIN } from "../lib/usePlan.js";
import { buildScale, loadShapes } from "../lib/zips.js";
import { estimate, sitesFor } from "../lib/budget.js";

const TYPE_BONUS = { library: 0.3, community_centre: 0.3, school: 0.2, fire_station: 0.1 };
const Ctx = createContext(null);
export const usePlanner = () => useContext(Ctx);

// Only the county is in the link for now: centers and reach follow from the county's fixed budget.
function readHash() {
  const p = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return { c: /^\d{5}$/.test(p.get("c") || "") ? p.get("c") : null };
}

export function PlannerProvider({ children }) {
  const init = useRef(null);
  if (!init.current) init.current = readHash();

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [fips, setFipsRaw] = useState(init.current.c);
  const [kSet, setK] = useState(null);         // null: as many generators as the fixed budget buys
  const [gen, setGen] = useState("diesel");     // generator type the budget is spent on
  const [radius, setRadius] = useState(null);
  const [mode, setMode] = useState("optimal");
  const [shade, setShade] = useState("people");
  const [hoverZip, setHoverZip] = useState(null);
  const [pinZip, setPinZip] = useState(null);
  const [hoverCenter, setHoverCenter] = useState(null);
  const [shapes, setShapes] = useState(null);
  const [shapeError, setShapeError] = useState(null);
  const [focusReq, setFocusReq] = useState(null);       // {lat, lon, key}: ask the map to fly somewhere

  useEffect(() => {
    fetch("/api/data")
      .then((r) => {
        if (!r.ok) throw new Error(`The data service returned ${r.status}.`);
        return r.json();
      })
      .then((d) => {
        // build.py breaks ties between equally good sites by quality; data.json drops it, so rebuild it the same way
        for (const c of Object.values(d.counties || {}))
          for (const s of c.sites) s.q = (/\([nwr]\d+\)$/.test(s.name) ? 0 : 1) + (TYPE_BONUS[s.type] ?? 0);
        setData(d);
        const ids = Object.keys(d.counties || {});
        setFipsRaw((cur) => (cur && d.counties[cur] ? cur : ids.includes("48201") ? "48201" : ids[0] ?? null));
      })
      .catch((e) => setError(e.message));
  }, []);

  const setFips = useCallback((id) => {
    setFipsRaw(id);
    setK(null);
    setRadius(null);
    setPinZip(null);
    setHoverZip(null);
  }, []);

  useEffect(() => {
    if (!fips) return;
    let live = true;
    setShapeError(null);
    loadShapes(fips)
      .then((s) => live && setShapes({ fips, ...s }))
      .catch((e) => live && (setShapes(null), setShapeError(e.message)));
    return () => { live = false; };
  }, [fips]);

  const est = useMemo(() => estimate(fips, data?.counties[fips]), [fips, data]);
  const k = kSet ?? (est ? sitesFor(est, gen, data.counties[fips]) : KMIN);
  const solved = usePlan({ data, fips, k, radius: radius ?? est?.reach ?? null, mode });
  const { county } = solved;
  const shapesNow = shapes && shapes.fips === fips ? shapes : null;
  const scale = useMemo(() => (county && shapesNow ? buildScale(county, shapesNow, shade) : null), [county, shapesNow, shade]);

  const zipIndex = useMemo(() => {
    const m = new Map();
    county?.zips.forEach((z, i) => m.set(z.z, i));
    return m;
  }, [county]);

  // every ZIP in the data -> its county, for the ZIP lookup
  const zipDirectory = useMemo(() => {
    const m = new Map();
    if (data) for (const [id, c] of Object.entries(data.counties)) for (const z of c.zips) m.set(z.z, id);
    return m;
  }, [data]);

  const totals = useMemo(() => {
    if (!data) return null;
    let people = 0, zips = 0, counties = 0, ratios = [];
    for (const c of Object.values(data.counties)) {
      counties++;
      zips += c.zips.length;
      people += c.total;
      for (const v of Object.values(c.k)) if (typeof v.ratio === "number") ratios.push(v.ratio);
    }
    ratios.sort((a, b) => a - b);
    return { people, zips, counties, ratios };
  }, [data]);

  // keep the address bar a shareable link to the current plan
  useEffect(() => {
    if (!fips) return;
    const t = setTimeout(() => {
      const p = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      p.set("c", fips);                                  // keep any other keys (the page) in place
      const hash = `#${p.toString()}`;
      if (hash !== window.location.hash) window.history.replaceState(null, "", hash);
    }, 250);
    return () => clearTimeout(t);
  }, [fips]);

  const value = {
    data, error, fips, setFips, k, setK, est, gen, setGen, radius, setRadius, mode, setMode,
    shade, setShade,
    hoverZip, setHoverZip, pinZip, setPinZip, hoverCenter, setHoverCenter,
    activeZip: hoverZip ?? pinZip,
    shapes: shapesNow, shapeError, scale, zipIndex, zipDirectory, totals,
    focusReq, setFocusReq,
    ...solved,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
