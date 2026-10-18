// The map game's storm (components/MapGame.jsx): a toy model, not a forecast. A storm crosses the map on a straight
// track; each ZIP is hit when the storm passes it and loses power by chance, more likely the closer it is to the track.
import { hav } from "./plan.js";

// Hurricanes for the South (Census region) and the hurricane-prone coast; tornadoes everywhere else.
const HURRICANE = new Set(["DE", "MD", "DC", "VA", "WV", "NC", "SC", "GA", "FL", "KY", "TN", "AL", "MS", "AR", "LA", "OK", "TX", "NY", "NJ", "CT", "RI", "MA", "HI", "PR"]);
export const disasterFor = (name) => {
  const st = name.includes(", ") ? name.split(", ").pop() : "DC";
  return HURRICANE.has(st) ? { kind: "hurricane", label: "Hurricane" } : { kind: "tornado", label: "Tornado" };
};

// pts: each ZIP's point in map pixels; w, h: the map's size in pixels; target: the astronaut's point, which the
// track always runs through, so the storm always passes him (a random point on the map if none is given)
export function makeStorm(kind, pts, w, h, target) {
  const rnd = Math.random, diag = Math.hypot(w, h);
  const c = target ?? { x: w * (0.5 + (rnd() - 0.5) * 0.4), y: h * (0.5 + (rnd() - 0.5) * 0.4) };
  const a = rnd() * Math.PI * 2, dir = { x: Math.cos(a), y: Math.sin(a) }, len = diag;
  const from = { x: c.x - dir.x * len, y: c.y - dir.y * len }, to = { x: c.x + dir.x * len, y: c.y + dir.y * len };
  const along = (p) => Math.max(0, Math.min(1, ((p.x - from.x) * dir.x + (p.y - from.y) * dir.y) / (2 * len)));
  const across = (p) => Math.abs((p.x - from.x) * -dir.y + (p.y - from.y) * dir.x);
  // a random size each time: hurricanes span roughly a fifth to a half of the map, tornadoes a narrow to medium band
  const r = (kind === "hurricane" ? 0.2 + 0.25 * rnd() : 0.025 + 0.04 * rnd()) * diag;
  const odds = (p) => {
    const d = across(p);
    return kind === "hurricane" ? 0.04 + 0.92 * Math.exp(-((d / r) ** 2)) : d < r ? 0.95 : d < 1.6 * r ? 0.3 : 0.02;
  };
  return { from, to, r, hits: pts.map((p) => 0.08 + 0.84 * along(p)), outs: pts.map((p) => rnd() < odds(p)) };
}

function inRing(ring, lat, lon) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ya, xa] = ring[i], [yb, xb] = ring[j];
    if ((ya > lat) !== (yb > lat) && lon < ((xb - xa) * (lat - ya)) / (yb - ya) + xa) inside = !inside;
  }
  return inside;
}

// which ZIP a point falls in: inside its boundary, or within 2 miles of a ZIP drawn as a point; null if none
export function zipAt(county, shapes, lat, lon) {
  let near = null, best = 2;
  for (let i = 0; i < county.zips.length; i++) {
    const z = county.zips[i], ent = shapes?.zips?.[z.z];
    if (ent) { if (ent.p.some((poly) => inRing(poly[0], lat, lon) && !poly.slice(1).some((h) => inRing(h, lat, lon)))) return i; }
    else { const d = hav(lat, lon, z.lat, z.lon); if (d < best) { best = d; near = i; } }
  }
  return near;
}