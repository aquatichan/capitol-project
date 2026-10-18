import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { boundsOf } from "../../lib/zips.js";
import { fmt, miles, peopleLabel } from "../../lib/format.js";

const MILE_M = 1609.34;
// the same dark-gray Esri canvas as the map page
const TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";
const LABELS = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}";
const INK = "#eef2f6", GAP = "#ff6a4d", ACCENT = "#6cb6ff", EDGE = "#06080c";

const icon = (n, cls) =>
  L.divIcon({ className: `sim-pin-wrap ${cls}`, html: `<span class="sim-pin"><b>${n}</b></span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
const ghostIcon = L.divIcon({ className: "sim-ghost", html: "<span></span>", iconSize: [16, 16], iconAnchor: [8, 8] });

// The simulator's map: drag a numbered site to move it, click one to edit it, click empty map to add one (in add
// mode). ZIPs are shaded by people and hatched when no site reaches them, recomputed as you drag.
export default function SimMap({ county, shapes, scale, sites, ev, selected, onSelect, onMove, onAdd, adding, shift }) {
  const elRef = useRef(null);
  const S = useRef({ markers: new Map(), circles: new Map(), zips: [], dragging: null });
  const cb = useRef({});
  cb.current = { onSelect, onMove, onAdd, adding };

  useEffect(() => {
    const el = elRef.current;
    const map = L.map(el, { zoomControl: false, attributionControl: false, zoomSnap: 0.25, minZoom: 3, maxZoom: 17, scrollWheelZoom: true, wheelPxPerZoomLevel: 120 }).setView([39, -98], 4);
    ["zips", "gaps", "labels", "rings", "shift"].forEach((n, i) => (map.createPane(n).style.zIndex = String(410 + i * 10)));
    L.tileLayer(TILES, { maxNativeZoom: 16, maxZoom: 19, className: "ga-tiles" }).addTo(map);
    L.tileLayer(LABELS, { maxNativeZoom: 16, maxZoom: 19, pane: "labels", className: "ga-labels" }).addTo(map);
    L.control.zoom({ position: "topright" }).addTo(map);
    L.control.scale({ position: "bottomleft", maxWidth: 110 }).addTo(map);
    Object.assign(S.current, {
      map,
      zipLayer: L.layerGroup().addTo(map),
      gapLayer: L.layerGroup().addTo(map),
      ringLayer: L.layerGroup().addTo(map),
      pinLayer: L.layerGroup().addTo(map),
      shiftLayer: L.layerGroup().addTo(map),
    });
    map.on("click", (e) => cb.current.adding && cb.current.onAdd(e.latlng.lat, e.latlng.lng));
    const ro = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    ro.observe(el);
    return () => { ro.disconnect(); map.remove(); };
  }, []);

  // ZIP shapes, once per county
  useEffect(() => {
    const s = S.current;
    if (!s.map || !county || !shapes) return;
    s.zipLayer.clearLayers();
    s.gapLayer.clearLayers();
    s.zips = county.zips.map((z) => {
      const ent = shapes.zips?.[z.z];
      const base = ent
        ? L.polygon(ent.p, { pane: "zips", color: EDGE, weight: 1, fillOpacity: 0.85, smoothFactor: 0.5 })
        : L.circleMarker([z.lat, z.lon], { pane: "zips", radius: 5, color: EDGE, weight: 1.4, fillOpacity: 0.95 });
      const gap = ent ? L.polygon(ent.p, { pane: "gaps", interactive: false, stroke: false, fillColor: "url(#ga-hatch)", fillOpacity: 0, smoothFactor: 0.5 }) : null;
      base.bindTooltip("", { sticky: true, direction: "top", offset: [0, -6], className: "ga-tip", opacity: 1 });
      s.zipLayer.addLayer(base);
      if (gap) s.gapLayer.addLayer(gap);
      return { base, gap };
    });
    s.map.fitBounds(L.latLngBounds(boundsOf(shapes, county.zips)), { padding: [24, 24], animate: false });
  }, [county, shapes]);

  // coverage colours, every time a site moves or a circle changes
  useEffect(() => {
    const s = S.current;
    if (!ev || !county || !scale || s.zips.length !== county.zips.length) return;
    county.zips.forEach((z, i) => {
      const it = s.zips[i], out = !ev.reachBy[i];
      it.base.setStyle({ fillColor: scale.colors[scale.classes[i]], color: out ? GAP : EDGE, weight: out ? 1.6 : 1 });
      it.gap?.setStyle({ fillOpacity: out ? 1 : 0 });
      const n = ev.near[i];
      it.base.setTooltipContent(
        `<b>ZIP ${z.z}</b><span>${peopleLabel(z)} people</span><em class="${out ? "out" : "in"}">${out ? "Not reached" : `Reached by ${ev.reachBy[i]} site${ev.reachBy[i] > 1 ? "s" : ""}`}${n >= 0 ? ` · ${miles(ev.nearD[i])} mi to #${n + 1}` : ""}</em>`
      );
    });
  }, [ev, county, scale]);

  // sites: markers and circles, reused by key so a drag never rebuilds them
  useEffect(() => {
    const s = S.current;
    if (!s.map) return;
    const keep = new Set(sites.map((x) => x.key));
    for (const [k, m] of s.markers) if (!keep.has(k)) { s.pinLayer.removeLayer(m); s.markers.delete(k); }
    for (const [k, c] of s.circles) if (!keep.has(k)) { s.ringLayer.removeLayer(c); s.circles.delete(k); }
    sites.forEach((site, i) => {
      const at = [site.lat, site.lon], hot = site.key === selected;
      const cls = `${hot ? "is-on" : ""} ${site.moved || site.custom ? "is-moved" : ""}`;
      let m = s.markers.get(site.key);
      if (!m) {
        m = L.marker(at, { icon: icon(i + 1, cls), draggable: true, autoPan: true, zIndexOffset: 1000 });
        m.on("click", () => cb.current.onSelect(m._key));
        m.on("dragstart", () => { s.dragging = m._key; cb.current.onSelect(m._key); });
        let raf = 0;
        m.on("drag", (e) => {
          const ll = e.target.getLatLng();
          s.circles.get(m._key)?.setLatLng(ll);
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => cb.current.onMove(m._key, ll.lat, ll.lng));
        });
        m.on("dragend", (e) => { const ll = e.target.getLatLng(); s.dragging = null; cb.current.onMove(m._key, ll.lat, ll.lng, true); });
        s.pinLayer.addLayer(m);
        s.markers.set(site.key, m);
      } else {
        if (s.dragging !== site.key) m.setLatLng(at);
        // swapping the icon replaces the marker's element, so only do it when its look really changed
        if (m._sig !== `${i}|${cls}`) { m.setIcon(icon(i + 1, cls)); m._sig = `${i}|${cls}`; }
      }
      m._key = site.key;
      const tip = `<b>${i + 1}. ${site.name.replace(/</g, "&lt;")}</b><span>${site.r} mi reach · drag to move</span>`;
      if (m._tip !== tip) {
        if (m.getTooltip()) m.setTooltipContent(tip);
        else m.bindTooltip(tip, { direction: "top", offset: [0, -16], className: "ga-tip", opacity: 1 });
        m._tip = tip;
      }
      let c = s.circles.get(site.key);
      const style = { pane: "rings", interactive: false, radius: site.r * MILE_M, color: hot ? ACCENT : INK, weight: hot ? 2.2 : 1.1, opacity: hot ? 1 : 0.7, dashArray: hot ? null : "4 5", fill: hot, fillColor: ACCENT, fillOpacity: 0.08 };
      if (!c) { c = L.circle(at, style); s.ringLayer.addLayer(c); s.circles.set(site.key, c); }
      else {
        if (s.dragging !== site.key) c.setLatLng(at);
        // the dragged site's circle is moved by the drag handler; restyle only when reach or selection changed
        if (c._sig !== `${site.r}|${hot}`) { c.setRadius(site.r * MILE_M); c.setStyle(style); c._sig = `${site.r}|${hot}`; }
      }
    });
  }, [sites, selected]);

  // the last change of plan: hollow dots where sites were, dashed lines to where they went
  useEffect(() => {
    const s = S.current;
    if (!s.map) return;
    s.shiftLayer.clearLayers();
    if (!shift) return;
    shift.from.forEach((p) => s.shiftLayer.addLayer(L.marker([p.lat, p.lon], { icon: ghostIcon, interactive: false, pane: "shift" })));
    shift.lines.forEach(([a, b]) => s.shiftLayer.addLayer(L.polyline([[a.lat, a.lon], [b.lat, b.lon]], { pane: "shift", interactive: false, color: GAP, weight: 1.5, dashArray: "3 5", opacity: 0.9 })));
  }, [shift]);

  return (
    <div className={`sim-map${adding ? " is-adding" : ""}`}>
      <div ref={elRef} className="sim-leaflet" />
      {!shapes && <div className="map-wait">Drawing ZIP boundaries…</div>}
      {adding && <p className="sim-hint">Click the map where the new site should go</p>}
      <p className="sim-attr">ZIP boundaries: US Census · Basemap © Esri, HERE, Garmin, OpenStreetMap contributors · {county ? `${fmt(county.total)} people in ${county.zips.length} ZIPs` : ""}</p>
    </div>
  );
}
