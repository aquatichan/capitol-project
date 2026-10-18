import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { usePlanner } from "../state/PlannerContext.jsx";
import { boundsOf } from "../lib/zips.js";
import { fmt, fmt1, KIND, miles, peopleLabel, siteName } from "../lib/format.js";
import MapGame from "./MapGame.jsx";

const MILE_M = 1609.34;
// Esri's dark-gray canvas (no key needed), pushed toward black in CSS: a quiet street base with its labels in a
// separate layer, so the labels can sit above the ZIPs.
const TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";
const LABELS = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}";
// on the dark map, "ink" (rings, outlines, the distance line) is light and "paper" (ZIP borders, halos) is near-black
const INK = "#eef2f6", PAPER = "#06080c", GAP = "#ff6a4d";
const NO_SHAPES = { zips: {} };

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const pinIcon = (n) =>
  L.divIcon({ className: "ga-pin-wrap", html: `<span class="ga-pin"><b>${n}</b></span>`, iconSize: [28, 28], iconAnchor: [14, 14] });

export default function MapView({ cellRef }) {
  const P = usePlanner();
  const { county, plan, R, scale, activeZip, zipIndex, hoverCenter, focusReq, shapeError } = P;
  const shapes = P.shapes ?? (shapeError ? NO_SHAPES : null);
  const { D } = P;

  // replay: show only the first `step` centers and what they cover; null shows the whole plan
  const [step, setStep] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [mapObj, setMapObj] = useState(null);        // the Leaflet map, for the astronaut game laid over it
  useEffect(() => { setStep(null); setPlaying(false); }, [plan]);
  const shown = useMemo(() => {
    if (!plan || step == null || !county || !D) return plan;
    const chosen = plan.chosen.slice(0, step), Z = county.zips.length;
    const uncovered = new Set(), nearN = new Int16Array(Z), nearD = new Float64Array(Z).fill(Infinity);
    let cov = 0;
    county.zips.forEach((z, i) => {
      chosen.forEach((c, j) => { const d = D[c.idx * Z + i]; if (d < nearD[i]) { nearD[i] = d; nearN[i] = j + 1; } });
      if (nearD[i] <= R) cov += z.w; else uncovered.add(i);
    });
    return { ...plan, chosen, uncovered, nearN, nearD, cov: (100 * cov) / (county.total || 1) };
  }, [plan, step, county, D, R]);

  const N = plan?.chosen.length ?? 0;
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => {
      if ((step ?? N) >= N) { setPlaying(false); return; }
      setStep((s) => (s ?? 0) + 1);
    }, Math.max(120, Math.min(700, 12000 / Math.max(1, N))));
    return () => clearTimeout(t);
  }, [playing, step, N]);
  const play = () => {
    if (playing) { setPlaying(false); return; }
    if (step == null || step >= N) setStep(0);
    setPlaying(true);
  };

  const elRef = useRef(null);
  const S = useRef({ pins: new Map(), rings: new Map(), items: [], fitted: null });
  const cb = useRef(P);
  cb.current = P;

  // ---- the map itself, once ----
  useEffect(() => {
    const el = elRef.current;
    const map = L.map(el, {
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: false,
      zoomSnap: 0,
      zoomDelta: 0.5,
      inertiaDeceleration: 2200,
      easeLinearity: 0.18,
      minZoom: 3,
      maxZoom: 17,
    }).setView([39, -98], 4);
    setMapObj(map);
    ["zips", "gaps", "labels", "rings", "focus"].forEach((name, i) => {
      map.createPane(name).style.zIndex = String(410 + i * 10);
    });
    L.tileLayer(TILES, { maxNativeZoom: 16, maxZoom: 19, className: "ga-tiles" }).addTo(map);
    L.tileLayer(LABELS, { maxNativeZoom: 16, maxZoom: 19, pane: "labels", className: "ga-labels" }).addTo(map);
    L.control.scale({ position: "bottomleft", maxWidth: 110 }).addTo(map);

    Object.assign(S.current, {
      map,
      zipLayer: L.layerGroup().addTo(map),
      gapLayer: L.layerGroup().addTo(map),
      ringLayer: L.layerGroup().addTo(map),
      pinLayer: L.layerGroup().addTo(map),
      focusLayer: L.layerGroup().addTo(map),
    });

    // Smooth wheel and pinch zoom: each wheel event moves a target zoom, and every frame eases a fifth of the way
    // toward it around the cursor. Fractional zoom (zoomSnap 0) keeps it continuous instead of stepping by levels.
    let target = null, anchor = null, raf = 0;
    const ease = () => {
      const z = map.getZoom(), d = target - z;
      const done = Math.abs(d) < 0.003;
      map.setZoomAround(anchor, done ? target : z + d * 0.2, { animate: false });
      if (done) { target = null; raf = 0; } else raf = requestAnimationFrame(ease);
    };
    const onWheel = (e) => {
      e.preventDefault();
      const per = e.deltaMode === 1 ? 0.06 : e.ctrlKey ? 0.012 : 0.0024;     // lines, pinch, pixels
      target = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), (target ?? map.getZoom()) - e.deltaY * per));
      anchor = map.mouseEventToContainerPoint(e);
      if (!raf) raf = requestAnimationFrame(ease);
    };
    el.addEventListener("wheel", onWheel, { passive: false });

    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
      const s = S.current;
      if (s.bounds && s.fitted !== "done" && el.clientWidth > 40) {
        map.fitBounds(s.bounds, { padding: [30, 30], animate: false });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      el.removeEventListener("wheel", onWheel);
      map.remove();
      S.current = { pins: new Map(), rings: new Map(), items: [], fitted: null };
      setMapObj(null);
    };
  }, []);

  // ---- ZIP polygons: rebuilt when the county (or its boundaries) change ----
  useEffect(() => {
    const s = S.current;
    if (!s.map || !county || !shapes) return;
    s.zipLayer.clearLayers();
    s.gapLayer.clearLayers();
    s.focusLayer.clearLayers();
    const bind = (layer, z) => {
      layer.bindTooltip("", { sticky: true, direction: "top", offset: [0, -6], className: "ga-tip", opacity: 1 });
      layer.on({
        mouseover: () => cb.current.setHoverZip(z.z),
        mouseout: () => cb.current.setHoverZip(null),
        click: (e) => {
          L.DomEvent.stopPropagation(e);
          cb.current.setPinZip((cur) => (cur === z.z ? null : z.z));
        },
      });
    };
    s.items = county.zips.map((z) => {
      const ent = shapes.zips[z.z];
      if (ent) {
        const base = L.polygon(ent.p, { pane: "zips", color: PAPER, weight: 1.1, fillOpacity: 0.88, smoothFactor: 0.5, bubblingMouseEvents: false });
        const gap = L.polygon(ent.p, { pane: "gaps", interactive: false, stroke: false, fillColor: "url(#ga-hatch)", fillOpacity: 0, smoothFactor: 0.5 });
        bind(base, z);
        s.zipLayer.addLayer(base);
        s.gapLayer.addLayer(gap);
        return { base, gap, point: false };
      }
      const base = L.circleMarker([z.lat, z.lon], { pane: "zips", radius: 5, color: PAPER, weight: 1.4, fillOpacity: 0.95, bubblingMouseEvents: false });
      bind(base, z);
      s.zipLayer.addLayer(base);
      return { base, gap: null, point: true };
    });
    s.itemsFor = county;
    s.bounds = L.latLngBounds(boundsOf(shapes, county.zips));
    if (s.map.getContainer().clientWidth > 40) {
      const first = s.fitted == null;
      if (first) s.map.fitBounds(s.bounds, { padding: [30, 30], animate: false });
      else s.map.flyToBounds(s.bounds, { padding: [30, 30], duration: 1.1 });
      s.fitted = "done";
    }
    s.styledFor = null;
  }, [county, shapes]);

  // ---- colours: people shade, out-of-reach hatch, tooltips ----
  useEffect(() => {
    const s = S.current;
    if (!s.map || !county || !shapes || !scale || !shown || s.items.length !== county.zips.length) return;
    const raise = [];
    county.zips.forEach((z, i) => {
      const it = s.items[i];
      const out = shown.uncovered.has(i);
      const fill = scale.colors[scale.classes[i]];
      if (it.point) it.base.setStyle({ fillColor: fill, color: out ? GAP : PAPER, weight: out ? 2.4 : 1.4 });
      else {
        it.base.setStyle({ fillColor: fill, color: out ? GAP : PAPER, weight: out ? 1.8 : 1.1 });
        it.gap.setStyle({ fillOpacity: out ? 1 : 0 });
        if (out) raise.push(it.base);
      }
      const d = shown.nearD[i];
      it.base.setTooltipContent(
        `<b>ZIP ${z.z}</b><span>${peopleLabel(z)} people</span><em class="${out ? "out" : "in"}">${out ? "Not covered" : "Covered"}${shown.chosen.length ? ` · ${miles(d)} mi to center ${shown.nearN[i]}` : ""}</em>`
      );
    });
    raise.forEach((l) => l.bringToFront());
  }, [county, shapes, scale, shown]);

  // ---- reach rings and numbered centers (reused between edits so dragging a slider does not flicker) ----
  useEffect(() => {
    const s = S.current;
    if (!s.map || !shown) return;
    if (s.pinsFor !== county) {                       // site indexes mean different places in another county
      s.pinLayer.clearLayers();
      s.ringLayer.clearLayers();
      s.pins.clear();
      s.pinsFor = county;
    }
    const keep = new Set(shown.chosen.map((c) => c.idx));
    for (const [idx, e] of s.pins) {
      if (!keep.has(idx)) {
        s.pinLayer.removeLayer(e.marker);
        s.ringLayer.removeLayer(e.halo);
        s.ringLayer.removeLayer(e.ring);
        s.pins.delete(idx);
      }
    }
    shown.chosen.forEach((c) => {
      let e = s.pins.get(c.idx);
      if (!e) {
        const at = [c.lat, c.lon];
        const halo = L.circle(at, { pane: "rings", interactive: false, radius: R * MILE_M, color: PAPER, weight: 3, opacity: 0.6, fill: false });
        const ring = L.circle(at, { pane: "rings", interactive: false, radius: R * MILE_M, color: INK, weight: 1, opacity: 0.55, fill: false });
        const marker = L.marker(at, { icon: pinIcon(c.n), zIndexOffset: 1000 - c.n, keyboard: false });
        marker.bindTooltip("", { direction: "top", offset: [0, -16], className: "ga-tip", opacity: 1 });
        marker.on("mouseover", () => cb.current.setHoverCenter(marker._n));
        marker.on("mouseout", () => cb.current.setHoverCenter(null));
        s.ringLayer.addLayer(halo);
        s.ringLayer.addLayer(ring);
        s.pinLayer.addLayer(marker);
        e = { marker, halo, ring, n: c.n };
        s.pins.set(c.idx, e);
      } else {
        e.halo.setRadius(R * MILE_M);
        e.ring.setRadius(R * MILE_M);
        if (e.n !== c.n) {
          e.marker.setIcon(pinIcon(c.n));
          e.n = c.n;
        }
      }
      e.marker._n = c.n;
      e.marker.setTooltipContent(`<b>${c.n}. ${esc(siteName(c).name)}</b><span>${esc(KIND[c.type] ?? c.type)} · reaches ${fmt(c.gain)} more people</span>`);
    });
  }, [shown, R, county]);

  useEffect(() => {
    for (const e of S.current.pins.values()) {
      const hot = hoverCenter != null && e.n === hoverCenter;
      e.marker.getElement()?.classList.toggle("is-hot", hot);
      e.ring.setStyle({ weight: hot ? 2 : 1, opacity: hot ? 1 : 0.55 });
    }
  }, [hoverCenter, shown]);

  // ---- the ZIP under the cursor or pinned: outline, a line to its nearest center, and the distance ----
  useEffect(() => {
    const s = S.current;
    if (!s.map || !county || !shown) return;
    s.focusLayer.clearLayers();
    if (!activeZip) return;
    const i = zipIndex.get(activeZip);
    if (i == null) return;
    const z = county.zips[i];
    const it = s.itemsFor === county ? s.items[i] : null;    // the polygons may still be the last county's
    if (it && !it.point) {
      const ll = it.base.getLatLngs();
      s.focusLayer.addLayer(L.polygon(ll, { pane: "focus", interactive: false, fill: false, color: INK, weight: 2.5 }));
    } else {
      s.focusLayer.addLayer(L.circleMarker([z.lat, z.lon], { pane: "focus", interactive: false, radius: 9, fill: false, color: INK, weight: 2.5 }));
    }
    const c = shown.chosen[shown.nearN[i] - 1];
    if (c) {
      const line = L.polyline([[z.lat, z.lon], [c.lat, c.lon]], { pane: "focus", interactive: false, color: INK, weight: 1.5, dashArray: "3 4" });
      line.bindTooltip(`${miles(shown.nearD[i])} mi`, { permanent: true, direction: "center", className: "ga-dist", opacity: 1 });
      s.focusLayer.addLayer(line);
      s.focusLayer.addLayer(L.circleMarker([z.lat, z.lon], { pane: "focus", interactive: false, radius: 3.5, color: PAPER, weight: 1.5, fillColor: INK, fillOpacity: 1 }));
    }
  }, [activeZip, shown, county, shapes, zipIndex]);

  useEffect(() => {
    const m = S.current.map;
    if (m && focusReq) m.flyTo([focusReq.lat, focusReq.lon], Math.max(m.getZoom(), 11), { duration: 0.8 });
  }, [focusReq]);

  const zoom = (d) => S.current.map?.flyTo(S.current.map.getCenter(), S.current.map.getZoom() + d, { duration: 0.35 });
  const fit = () => S.current.bounds && S.current.map.flyToBounds(S.current.bounds, { padding: [30, 30], duration: 0.8 });
  return (
    <section ref={cellRef} className="card map-card" data-map-cell aria-label="Map of ZIP codes, planned centers and reach">
      <div ref={elRef} className="map" />
      <MapGame map={mapObj} shown={shown} replaying={step != null} />
      <div className="map-tag">
        <b>{county ? county.name : "Loading…"}</b>
        <span>{county ? `${county.zips.length} ZIPs` : ""}</span>
      </div>
      <div className="map-ctl">
        <button type="button" onClick={() => zoom(0.5)} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => zoom(-0.5)} aria-label="Zoom out">−</button>
        <button type="button" onClick={fit} aria-label="Show the whole county" title="Show the whole county">⤢</button>
      </div>
      {N > 0 && (
        <div className="replay">
          <button type="button" className="replay-btn" onClick={play} aria-label={playing ? "Pause" : "Play: add the centers one at a time"}>
            {playing ? "❚❚" : "▶"}
          </button>
          <input
            type="range" min={0} max={N} step={1} value={step ?? N}
            onChange={(e) => { setPlaying(false); setStep(Number(e.target.value)); }}
            aria-label="Step through the centers" style={{ "--p": (step ?? N) / N }}
          />
          <span className="replay-l">{step == null ? `Play: add ${N} centers one at a time` : `${step} of ${N} centers · ${fmt1(shown.cov)}% covered`}</span>
        </div>
      )}
      {!shapes && !shapeError && <div className="map-wait">Drawing ZIP boundaries…</div>}
      {shapeError && <div className="map-wait warn">Boundaries unavailable. Showing ZIP points.</div>}
      <div className="map-foot">
        <span className="map-attr">
          ZIP boundaries: US Census ZCTA · Basemap © Esri, HERE, Garmin, <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors
        </span>
      </div>
    </section>
  );
}
