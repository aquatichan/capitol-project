// ZIP boundary polygons (Census ZCTA, cut by scripts/make_zip_shapes.py) and the single-hue shading scale.

const cache = new Map();

export function loadShapes(fips) {
  if (!cache.has(fips)) {
    const p = fetch(`/zips/${fips}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`ZIP boundaries for ${fips} returned ${r.status}`);
        return r.json();
      })
      .catch((e) => {
        cache.delete(fips);
        throw e;
      });
    cache.set(fips, p);
  }
  return cache.get(fips);
}

// One hue, dim to bright on the black map: more people on power-dependent equipment = brighter. Colour never encodes anything else.
export const RAMP = ["#16263b", "#1c3b62", "#23568a", "#3274b0", "#5596d1", "#8cbcea"];

export const SHADE_MODES = {
  people: { label: "People", unit: "people", note: "People who rely on powered medical equipment in the ZIP" },
  density: { label: "Per sq mi", unit: "per sq mi", note: "People per square mile of ZIP area" },
};

export function shadeValue(zip, shapes, mode) {
  if (mode === "density") {
    const a = shapes?.zips?.[zip.z]?.a;
    return a > 0 ? zip.w / a : 0;
  }
  return zip.w;
}

// Quantile classes: each shade holds about the same number of ZIPs, so the map stays readable in both dense and rural counties.
export function buildScale(county, shapes, mode) {
  const vals = county.zips.map((z) => shadeValue(z, shapes, mode));
  const sorted = [...vals].sort((a, b) => a - b);
  const n = RAMP.length;
  const breaks = [];
  for (let i = 1; i < n; i++) breaks.push(sorted[Math.min(sorted.length - 1, Math.floor((i * sorted.length) / n))]);
  const classOf = (v) => {
    let c = 0;
    for (const b of breaks) if (v >= b && b > sorted[0]) c++;
    return c;
  };
  const classes = vals.map(classOf);
  const ranges = RAMP.map((_, c) => {
    const inC = vals.filter((_, i) => classes[i] === c);
    return inC.length ? { lo: Math.min(...inC), hi: Math.max(...inC), n: inC.length } : null;
  });
  return { vals, classes, ranges, colors: RAMP };
}

export function boundsOf(shapes, zips) {
  let s = 90, w = 180, n = -90, e = -180;
  const eat = (lat, lon) => {
    if (lat < s) s = lat;
    if (lat > n) n = lat;
    if (lon < w) w = lon;
    if (lon > e) e = lon;
  };
  for (const z of zips) {
    const ent = shapes?.zips?.[z.z];
    if (ent) for (const poly of ent.p) for (const [lat, lon] of poly[0]) eat(lat, lon);
    else eat(z.lat, z.lon);
  }
  return [[s, w], [n, e]];
}
