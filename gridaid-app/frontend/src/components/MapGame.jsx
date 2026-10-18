import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { usePlanner } from "../state/PlannerContext.jsx";
import { disasterFor, makeStorm, zipAt } from "../lib/outage.js";
import { useReducedMotion } from "../lib/hooks.js";
import "../styles/mapgame.css";

// The game on the planner's map: drag the astronaut out of his tray (he swings from his antenna while carried) and drop
// him on the county. A storm then crosses the map (a hurricane in the South and on the hurricane coast, a tornado
// elsewhere) and ZIPs go dark; the plan's centers stay lit. Did his ZIP lose power?

const AW = 48, AH = 64;                           // px; drawn in a 60 x 80 box
const TOP = { x: AW / 2, y: 1 }, MID = { x: AW / 2, y: AH / 2 }, FEET = { x: AW / 2, y: AH };
const CLEAR = { stroke: false, fillOpacity: 0 };
const DARK = { stroke: true, color: "#46505e", weight: 1, fillColor: "#04060a", fillOpacity: 0.9 };
const DURATION = 5200;

const ASTRO = `<svg viewBox="0 0 60 80" aria-hidden="true"><g stroke="#0a0d12" stroke-width="2" stroke-linejoin="round">
<path d="M30 4V2"/><circle cx="30" cy="2.2" r="2.2" fill="#ffc24a"/>
<rect x="11" y="24" width="38" height="32" rx="8" fill="#aeb8c4"/>
<path d="M15 36C9 40 7 46 8 52" fill="none" stroke-width="7" stroke-linecap="round"/><path d="M15 36C9 40 7 46 8 52" fill="none" stroke-width="4" stroke-linecap="round" stroke="#eef1f5"/>
<path d="M45 36C51 40 53 46 52 52" fill="none" stroke-width="7" stroke-linecap="round"/><path d="M45 36C51 40 53 46 52 52" fill="none" stroke-width="4" stroke-linecap="round" stroke="#eef1f5"/>
<circle cx="8" cy="53" r="3.4" fill="#8a94a1" stroke-width="1.5"/><circle cx="52" cy="53" r="3.4" fill="#8a94a1" stroke-width="1.5"/>
<rect x="16" y="56" width="11" height="20" rx="4" fill="#eef1f5"/><rect x="33" y="56" width="11" height="20" rx="4" fill="#eef1f5"/>
<path d="M16 71h11v4a3 3 0 0 1-3 3h-5a3 3 0 0 1-3-3ZM33 71h11v4a3 3 0 0 1-3 3h-5a3 3 0 0 1-3-3Z" fill="#6f7985"/>
<rect x="15" y="30" width="30" height="31" rx="11" fill="#f4f6f9"/>
<rect x="23" y="39" width="14" height="11" rx="2.5" fill="#dfe4ea" stroke-width="1.5"/>
<circle cx="30" cy="20" r="16" fill="#f4f6f9"/></g>
<path d="M28.6 41.5h2.8v2.1h2.1v2.8h-2.1v2.1h-2.8v-2.1h-2.1v-2.8h2.1Z" fill="#d14732"/>
<ellipse class="mg-visor" cx="30" cy="21" rx="11" ry="8.5" fill="#12315a"/><ellipse cx="26" cy="18" rx="3.5" ry="2.2" fill="#fff" opacity="0.5"/>
<circle cx="39" cy="53.6" r="1.4" fill="#ffc24a"/></svg>`;

const rot = (v, th) => ({ x: v.x * Math.cos(th) - v.y * Math.sin(th), y: v.x * Math.sin(th) + v.y * Math.cos(th) });

// shown: what the map is drawing (the whole plan, or the replay's first few centers); replaying: the replay is in use
export default function MapGame({ map, shown, replaying }) {
  const { county, shapes, R } = usePlanner();
  const reduce = useReducedMotion();
  const layerRef = useRef(null), dockRef = useRef(null), astroRef = useRef(null), stormRef = useRef(null);
  const G = useRef({ items: [], marker: null, raf: 0, outs: null, zi: null });
  const A = useRef({ mode: "dock", pivot: { x: 0, y: 0 }, target: { x: 0, y: 0 }, anchor: { ...MID }, phi: 0, om: 0, ptr: null, vel: { x: 0, y: 0 }, acc: { x: 0, y: 0 }, raf: 0, last: 0 });
  const [mode, setMode] = useState("dock");             // dock | drag | placed
  const [phase, setPhase] = useState("idle");           // idle | running | done
  const [pill, setPill] = useState("");
  const [hintOff, setHintOff] = useState(false);       // the "drag me" caption goes once he has been moved
  const cb = useRef({});
  const disaster = county ? disasterFor(county.name) : null;

  // ---- positions in the layer over the map (the same box as the map, so they are the map's own pixels)
  const scaleOf = () => { const l = layerRef.current; return l.getBoundingClientRect().width / (l.offsetWidth || 1) || 1; };
  const local = (e) => { const r = layerRef.current.getBoundingClientRect(), s = scaleOf(); return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s }; };
  const dockPoint = () => { const d = dockRef.current; return { x: d.offsetLeft + d.offsetWidth / 2, y: d.offsetTop + d.offsetHeight / 2 }; };

  // ---- the astronaut's physics: a pendulum from the cursor while carried, a spring back to his tray otherwise
  const render = () => {
    const a = A.current, el = astroRef.current;
    if (!el) return;
    el.style.transformOrigin = `${a.anchor.x}px ${a.anchor.y}px`;
    el.style.transform = `translate(${a.pivot.x - a.anchor.x}px, ${a.pivot.y - a.anchor.y}px) rotate(${-a.phi}rad)`;
  };
  const tick = (now) => {
    const a = A.current;
    const dt = a.last ? Math.min(0.033, Math.max(0.001, (now - a.last) / 1000)) : 1 / 60;
    a.last = now;
    let alpha;
    if (a.mode === "drag" && a.ptr) {
      const vx = (a.ptr.x - a.pivot.x) / dt, vy = (a.ptr.y - a.pivot.y) / dt, clip = (v) => Math.max(-9000, Math.min(9000, v));
      a.acc = { x: a.acc.x + (clip((vx - a.vel.x) / dt) - a.acc.x) * 0.35, y: a.acc.y + (clip((vy - a.vel.y) / dt) - a.acc.y) * 0.35 };
      a.vel = { x: vx, y: vy };
      a.pivot = { ...a.ptr };
      const k = Math.min(1, dt * 14);                    // the grip slides up to his antenna
      a.anchor = { x: a.anchor.x + (TOP.x - a.anchor.x) * k, y: a.anchor.y + (TOP.y - a.anchor.y) * k };
      alpha = -((1900 + a.acc.y) * Math.sin(a.phi) + a.acc.x * Math.cos(a.phi)) / 58 - 1.6 * a.om;
    } else {
      const k = Math.min(1, dt * 7);
      a.pivot = { x: a.pivot.x + (a.target.x - a.pivot.x) * k, y: a.pivot.y + (a.target.y - a.pivot.y) * k };
      alpha = -60 * a.phi - 9 * a.om;
    }
    if (reduce) { a.phi = 0; a.om = 0; }
    else { a.om += alpha * dt; a.phi = Math.max(-1.35, Math.min(1.35, a.phi + a.om * dt)); }
    render();
    const settled = a.mode !== "drag" && Math.abs(a.phi) < 0.002 && Math.abs(a.om) < 0.01 && Math.hypot(a.pivot.x - a.target.x, a.pivot.y - a.target.y) < 0.5;
    a.raf = settled ? 0 : requestAnimationFrame(tick);
    if (settled) a.last = 0;
  };
  const kick = () => { if (!A.current.raf) A.current.raf = requestAnimationFrame(tick); };
  const reanchor = (p) => {                             // move the pivot to another point of him without moving him
    const a = A.current, v = rot({ x: p.x - a.anchor.x, y: p.y - a.anchor.y }, -a.phi);
    a.pivot = { x: a.pivot.x + v.x, y: a.pivot.y + v.y };
    a.anchor = { ...p };
  };

  // ---- the outage layer: one dark shape per ZIP, above the shading and hatching, below the reach rings and centers
  useEffect(() => {
    if (!map || !county) return;
    if (!map.getPane("outage")) map.createPane("outage").style.zIndex = "435";
    const group = L.layerGroup().addTo(map);
    G.current.items = county.zips.map((z) => {
      const ent = shapes?.zips?.[z.z];
      const layer = ent
        ? L.polygon(ent.p, { pane: "outage", interactive: false, smoothFactor: 0.5, ...CLEAR })
        : L.circleMarker([z.lat, z.lon], { pane: "outage", interactive: false, radius: 6, ...CLEAR });
      group.addLayer(layer);
      return { layer, dark: false };
    });
    return () => { group.remove(); G.current.items = []; };
  }, [map, county, shapes]);
  const clearOutage = () => G.current.items.forEach((it) => { if (it.dark) { it.dark = false; it.layer.setStyle(CLEAR); } });

  // ---- placed: he becomes a pin on the map, so he pans and zooms with it
  const say = (text, cls) => {
    const el = G.current.marker?.getElement();
    if (!el) return;
    el.classList.remove("is-safe", "is-danger");
    if (cls) el.classList.add(cls);
    const s = el.querySelector(".mg-say");
    s.textContent = text;
    s.hidden = !text;
  };
  const removePin = () => { clearTimeout(G.current.timer); G.current.marker?.remove(); G.current.marker = null; };
  // buttons beside the result: run the same storm path again at the same spot, or send him back to his tray
  const again = () => {
    const g = G.current;
    if (phase === "running" || !g.marker) return;
    run(g.zi, g.marker.getLatLng());
  };
  const putBack = () => {
    const g = G.current, a = A.current;
    if (phase === "running" || !g.marker) return;
    const p = map.latLngToContainerPoint(g.marker.getLatLng());
    removePin(); clearOutage(); g.outs = null; setPhase("idle"); setPill("");
    a.anchor = { ...MID }; a.pivot = { x: p.x, y: p.y - AH / 2 }; a.phi = 0; a.om = 0; a.ptr = null;
    a.mode = "dock"; a.target = dockPoint();
    setMode("dock");
    kick();
  };
  const startDrag = (e, from) => {
    const a = A.current, p = local(e);
    if (from) { a.anchor = { ...FEET }; a.pivot = { ...from }; a.phi = 0; a.om = 0; }
    const g = rot({ x: p.x - a.pivot.x, y: p.y - a.pivot.y }, a.phi);   // grab him where the pointer is
    a.anchor = { x: Math.max(0, Math.min(AW, a.anchor.x + g.x)), y: Math.max(0, Math.min(AH, a.anchor.y + g.y)) };
    a.pivot = { ...p }; a.ptr = { ...p }; a.vel = { x: 0, y: 0 }; a.acc = { x: 0, y: 0 };
    a.mode = "drag";
    astroRef.current.setPointerCapture?.(e.pointerId);
    render();
    setMode("drag");
    kick();
  };
  const pickUp = (e) => {                                // from the map: take the pin off and carry him again
    if (cb.current.phase === "running" || (e.button != null && e.button !== 0)) return;
    e.preventDefault(); e.stopPropagation();
    const at = G.current.marker.getLatLng(), p = map.latLngToContainerPoint(at);
    removePin(); clearOutage(); G.current.outs = null; setPhase("idle"); setPill("");
    startDrag(e, { x: p.x, y: p.y });
  };
  const land = (ll, zi, wobble = true) => {
    const a = A.current;
    a.mode = "placed"; a.ptr = null;
    removePin();
    const m = L.marker(ll, {
      icon: L.divIcon({ className: "mg-pin", html: `<span class="mg-astro${wobble && !reduce ? " land" : ""}">${ASTRO}</span><span class="mg-say" hidden></span>`, iconSize: [AW, AH], iconAnchor: [FEET.x, FEET.y] }),
      zIndexOffset: 2000, keyboard: false, bubblingMouseEvents: false,
    }).addTo(map);
    const el = m.getElement();
    L.DomEvent.disableClickPropagation(el);
    el.addEventListener("pointerdown", (e) => cb.current.pickUp(e));
    G.current.marker = m;
    setMode("placed");
    clearTimeout(G.current.timer);                       // a pin picked up again within the beat must not start a storm
    G.current.timer = setTimeout(() => cb.current.run(zi, ll), reduce ? 50 : 650);
  };

  // ---- the storm
  const run = (zi, ll) => {
    const g = G.current;
    if (!map || !county || !g.marker) return;
    cancelAnimationFrame(g.raf);
    clearOutage();
    g.outs = null;
    map.getPane("outage")?.classList.remove("is-calm");
    const size = map.getSize(), pts = county.zips.map((z) => map.latLngToContainerPoint([z.lat, z.lon]));
    const storm = makeStorm(disaster.kind, pts, size.x, size.y, map.latLngToContainerPoint(ll));
    const from = map.containerPointToLatLng([storm.from.x, storm.from.y]), to = map.containerPointToLatLng([storm.to.x, storm.to.y]), z0 = map.getZoom();
    setPhase("running"); setPill(`${disaster.label} hitting ${county.name.split(",")[0]}`); say("", null);
    const t0 = performance.now(), length = reduce ? DURATION * 0.5 : DURATION;
    const step = (now) => {
      const t = Math.min(1, (now - t0) / length), u = Math.max(0, Math.min(1, (t - 0.08) / 0.84));
      const el = stormRef.current;
      if (el) {                                          // follows the map if it is panned or zoomed meanwhile
        const p = map.latLngToContainerPoint([from.lat + (to.lat - from.lat) * u, from.lng + (to.lng - from.lng) * u]);
        const d = storm.r * 2.3 * 2 ** (map.getZoom() - z0);
        Object.assign(el.style, { width: `${d}px`, height: `${d}px`, transform: `translate(${p.x - d / 2}px, ${p.y - d / 2}px)` });
      }
      g.items.forEach((it, i) => {
        if (!storm.outs[i] || t < storm.hits[i]) return;
        const dark = reduce || t >= storm.hits[i] + 0.04 || Math.floor(now / 70) % 2 === 1;   // a flicker, then dark
        if (dark !== it.dark) { it.dark = dark; it.layer.setStyle(dark ? DARK : CLEAR); }
      });
      if (t < 1) { g.raf = requestAnimationFrame(step); return; }
      g.outs = storm.outs; g.zi = zi;
      setPhase("done");
      cb.current.paint();
    };
    g.raf = requestAnimationFrame(step);
  };
  // after the storm: every ZIP it hit stays dark until a center that reaches it is on the map. The replay brings the
  // centers in one at a time, so the lights come back as it plays; without the replay the storm's damage stands.
  const paint = () => {
    const g = G.current;
    if (!g.outs || !county) return;
    map.getPane("outage")?.classList.add("is-calm");   // lights now fade back in smoothly (no flicker to keep)
    const restored = (i) => replaying && shown?.nearD && shown.nearD[i] <= R;
    let dark = 0;
    g.items.forEach((it, i) => {
      const d = g.outs[i] && !restored(i);
      if (d) dark++;
      if (d !== it.dark) { it.dark = d; it.layer.setStyle(d ? DARK : CLEAR); }
    });
    const Z = county.zips.length;
    setPill(`${disaster.label}: ${dark} of ${Z} ZIPs without power${!replaying && dark ? " · press ▶ to add centers" : ""}`);
    const zi = g.zi;
    if (!g.outs[zi]) say("Safe · power stayed on", "is-safe");
    else if (restored(zi)) say(`Safe · center ${shown.nearN[zi]} has power`, "is-safe");
    else say("In danger · no power", "is-danger");
  };
  Object.assign(cb.current, { run, pickUp, phase, paint });
  useEffect(() => { if (phase === "done") paint(); }, [shown, replaying, R, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- carrying him from the tray
  const onDown = (e) => {
    if (phase === "running" || (e.button != null && e.button !== 0) || A.current.mode !== "dock") return;
    e.preventDefault();
    setHintOff(true);
    startDrag(e);
  };
  const onMove = (e) => { if (A.current.mode === "drag") A.current.ptr = local(e); };
  const toDock = () => {
    const a = A.current;
    reanchor(MID);
    a.mode = "dock"; a.ptr = null; a.target = dockPoint();
    setMode("dock");
    kick();
  };
  const onUp = () => {
    const a = A.current;
    if (a.mode !== "drag") return;
    reanchor(FEET);                                       // he lands where his boots are
    const size = map?.getSize();
    if (map && county && a.pivot.x >= 0 && a.pivot.y >= 0 && a.pivot.x <= size.x && a.pivot.y <= size.y) {
      const ll = map.containerPointToLatLng([a.pivot.x, a.pivot.y]), zi = zipAt(county, shapes, ll.lat, ll.lng);
      if (zi != null) { land(ll, zi); return; }
    }
    toDock();                                             // not on the county: back to the tray
  };
  const onKey = (e) => {                                  // keyboard: drop him in a ZIP at random
    if ((e.key !== "Enter" && e.key !== " ") || phase === "running" || !county || !map) return;
    e.preventDefault();
    const zi = Math.floor(Math.random() * county.zips.length), z = county.zips[zi];
    land(L.latLng(z.lat, z.lon), zi, true);
  };

  // in the tray at the start, after a resize, and for every new county (which starts the game over)
  useEffect(() => {
    if (!map) return;
    const g = G.current;
    cancelAnimationFrame(g.raf);
    removePin(); clearOutage(); g.outs = null; setPhase("idle"); setPill("");
    const a = A.current;
    a.mode = "dock"; a.ptr = null; a.anchor = { ...MID }; a.phi = 0; a.om = 0;
    a.target = a.pivot = dockPoint();
    setMode("dock");
    render();
  }, [map, county]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!map) return;
    const onResize = () => { const a = A.current; if (a.mode === "dock") { a.target = dockPoint(); kick(); } };
    map.on("resize", onResize);
    return () => { map.off("resize", onResize); cancelAnimationFrame(A.current.raf); cancelAnimationFrame(G.current.raf); removePin(); };
  }, [map]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mg" ref={layerRef}>
      {phase === "running" && (
        <div ref={stormRef} className="mg-storm" aria-hidden="true">
          <svg viewBox="-50 -50 100 100">
            <defs>
              <radialGradient id="mg-storm-g">
                <stop offset="0" stopColor="#dbe7f5" stopOpacity="0.5" />
                <stop offset="0.55" stopColor="#8fa6c2" stopOpacity="0.32" />
                <stop offset="1" stopColor="#6b84a3" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle r="50" fill="url(#mg-storm-g)" />
            <g fill="none" stroke="#dbe7f5" strokeWidth="4" strokeLinecap="round" opacity="0.8">
              <path d="M0 -8C18 -10 30 4 26 22" /><path d="M0 8C-18 10 -30 -4 -26 -22" />
              <path d="M8 0C10 18 -4 30 -22 26" /><path d="M-8 0C-10 -18 4 -30 22 -26" />
            </g>
            <circle r="3" fill="#dbe7f5" opacity="0.5" />
          </svg>
        </div>
      )}
      {pill && (
        <div className="mg-bar" role="status">
          <p>{pill}</p>
          {phase === "done" && (
            <>
              <button type="button" onClick={again}>Run again</button>
              <button type="button" onClick={putBack}>Put him back</button>
            </>
          )}
        </div>
      )}
      <div className="mg-dock" ref={dockRef} aria-hidden="true" />
      {mode === "dock" && !hintOff && disaster && <p className="mg-hint" aria-hidden="true">Drag him onto your county<br />to see if a {disaster.kind} cuts his power</p>}
      <button
        ref={astroRef}
        type="button"
        className={`mg-astro-free is-${mode}`}
        aria-label={disaster ? `Astronaut. Drag him onto the map to see if a ${disaster.kind} knocks out his power, or press Enter to drop him somewhere.` : "Astronaut"}
        title="Drag me onto the map"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
        dangerouslySetInnerHTML={{ __html: `<span class="mg-bob">${ASTRO}</span>` }}
      />
    </div>
  );
}
