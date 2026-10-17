import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Circle, Marker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import { TARGETS, KLIVE, buildDistances, evaluatePlan, getCurve, minCenters, minReach } from "./lib/plan.js";

const KMIN = 3;
const KMAX = 25;          // budget slider; plans for more than KPRE centers are computed live in the browser
const KPRE = 10;          // largest budget with a precomputed plan (and the robust plan)
const RMIN = 0.25, RMAX = 60;          // reach slider, in miles, on a log scale (small counties need fine steps)
const rToT = (r) => Math.max(0, Math.min(100, (100 * Math.log(r / RMIN)) / Math.log(RMAX / RMIN)));
const tToR = (t) => RMIN * Math.pow(RMAX / RMIN, t / 100);
const niceR = (r) => (r < 2 ? Math.round(r * 20) / 20 : r < 10 ? Math.round(r * 10) / 10 : Math.round(r * 2) / 2);
const upR = (r) => (r < 2 ? Math.ceil(r * 20) / 20 : r < 10 ? Math.ceil(r * 10) / 10 : Math.ceil(r * 2) / 2);
const MILE_M = 1609.34;
const TYPE_LABEL = {
  fire_station: "Fire station",
  library: "Library",
  community_centre: "Community center",
  school: "School",
};
const COLORS = { covered: "#0e7c66", uncovered: "#c8321e", center: "#0b3c5d" };

const fmt = (n) => Math.round(n).toLocaleString("en-US");
const pin = (n) =>
  L.divIcon({ className: "pin", html: `<span>${n}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });

function FitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [32, 32] });
  }, [bounds, map]);
  return null;
}

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [fips, setFips] = useState(null);
  const [k, setK] = useState(5);
  const [showAll, setShowAll] = useState(false);
  const [mode, setMode] = useState("phased");
  const [radius, setRadius] = useState(null);      // null = this county's default reach
  const [target, setTarget] = useState(90);

  useEffect(() => {
    fetch("/api/data")
      .then((r) => {
        if (!r.ok) throw new Error(`The data service returned ${r.status}.`);
        return r.json();
      })
      .then((d) => {
        setData(d);
        const ids = Object.keys(d.counties || {});
        setFips(ids.includes("48201") ? "48201" : ids[0] ?? null);
      })
      .catch((e) => setError(e.message));
  }, []);

  const county = data && fips ? data.counties[fips] : null;
  useEffect(() => setRadius(null), [fips]);               // a new county starts at its own default reach

  const R = county ? radius ?? county.R : 0;
  const atDefault = !county || radius == null || Math.abs(radius - county.R) < 1e-9;
  const pre = county && atDefault && k <= KPRE ? county.k[String(k)] : null;     // precomputed plans (incl. robust)
  const live = !!county && !pre;                                                  // anything else is computed in the browser

  const view = useMemo(() => {
    if (!county) return null;
    return L.latLngBounds(county.zips.map((z) => [z.lat, z.lon]));
  }, [county]);
  const D = useMemo(() => (county ? buildDistances(county) : null), [county]);
  const livePlan = useMemo(() => {
    if (!live || !D) return null;
    const curve = getCurve(county, D, R);
    const sel = curve.sel.slice(0, k);
    return { sel, gains: curve.gains.slice(0, k), ...evaluatePlan(county, D, sel, R, Number(fips) || 0) };
  }, [live, D, county, R, k, fips]);

  // the trade-off panel is computed from deferred values so dragging a slider stays smooth
  const dR = useDeferredValue(R), dk = useDeferredValue(k);
  const panel = useMemo(() => {
    if (!county || !D) return null;
    const curve = getCurve(county, D, dR);
    return { R: dR, k: dk, need: TARGETS.map((t) => ({ t, n: minCenters(curve, t) })), reach: minReach(county, D, dk, target) };
  }, [county, D, dR, dk, target]);

  if (error) return <Message title="Can't load the data" body={error} />;
  if (!data) return <Message title="Loading…" />;
  if (!county)
    return <Message title="No counties built yet" body="Run scripts/build.py after fetching sites, then reload." />;

  const countyHasRobust = Array.isArray(county.k[String(KPRE)]?.rsel);
  const hasRobust = !!pre && Array.isArray(pre.rsel);
  const robust = mode === "robust" && hasRobust;
  let v;
  if (pre && robust)
    v = { sel: pre.rsel, gains: pre.rgains, unc: pre.runc, cov: pre.rcov, red: pre.rred, exp: pre.rexp, lo: pre.rlo, hi: pre.rhi };
  else if (pre)
    v = { sel: pre.sel, gains: county.gains, unc: pre.unc, cov: pre.cov, red: pre.red, exp: pre.exp, lo: pre.lo, hi: pre.hi };
  else v = livePlan;
  const opt = pre ? pre.opt : null, ratio = pre ? pre.ratio : null;
  const { sel, gains: gainsArr, unc: uncList, cov, red, exp, lo, hi } = v;
  const gap = opt != null ? opt - cov : null;
  const chosen = sel.map((si, i) => ({ ...county.sites[si], n: i + 1, gain: gainsArr[i] }));
  const uncovered = new Set(uncList);
  const maxW = Math.max(...county.zips.map((z) => z.w), 1);
  const worst = uncList
    .map((i) => county.zips[i])
    .sort((a, b) => b.w - a.w)
    .slice(0, 3);

  return (
    <div className="app">
      <aside className="rail">
        <header>
          <h1>GridAid</h1>
          <p className="tag">Where to put backup-power centers before the next outage.</p>
        </header>

        <label className="field">
          <span>County</span>
          <select value={fips} onChange={(e) => setFips(e.target.value)}>
            {Object.entries(data.counties).map(([id, c]) => (
              <option key={id} value={id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>
            Backup-power centers <b className="kval">{k}</b>
          </span>
          <input
            type="range"
            min={KMIN}
            max={KMAX}
            step={1}
            value={k}
            onChange={(e) => setK(Number(e.target.value))}
            aria-valuetext={`${k} centers`}
          />
        </label>

        <label className="field">
          <span>
            Reach <b className="kval">{R} mi</b>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={0.5}
            value={rToT(R)}
            onChange={(e) => setRadius(niceR(tToR(Number(e.target.value))))}
            aria-valuetext={`${R} miles`}
          />
          {!atDefault && (
            <button type="button" className="linkbtn" onClick={() => setRadius(null)}>
              Reset to {county.R} mi, this county's default
            </button>
          )}
        </label>

        {countyHasRobust && (
          <fieldset className="seg">
            <legend>Placement</legend>
            <label className={!robust ? "on" : ""}>
              <input type="radio" name="mode" checked={!robust} onChange={() => setMode("phased")} />
              Phased
            </label>
            <label className={robust ? "on" : ""}>
              <input type="radio" name="mode" checked={robust} disabled={!hasRobust} onChange={() => setMode("robust")} />
              Robust for {k}
            </label>
          </fieldset>
        )}
        {countyHasRobust && !hasRobust && (
          <p className="note">The robust plan is solved only at this county's default reach ({county.R} mi) and up to {KPRE} centers.</p>
        )}

        <section className="hero" aria-live="polite">
          <div className="big">
            {cov.toFixed(1)}
            <small>%</small>
          </div>
          <div className="bar" aria-hidden="true">
            <i style={{ width: `${cov}%` }} />
          </div>
          <p>
            of people on power-dependent medical equipment live within <b>{R} mi</b> of a planned center, on paper.
          </p>
          <p className="sub">
            <b>Expected {exp.toFixed(0)}%</b> if ZIP centers are a little off. If the real reach is 20% smaller or larger:{" "}
            <b>{lo.toFixed(0)}–{hi.toFixed(0)}%</b>.
          </p>
          <p className="sub">
            {gap == null
              ? live
                ? "Greedy placement, computed live for this reach and budget."
                : "Placement chosen by a greedy algorithm."
              : gap < 0.05
              ? "Matches the best possible on paper."
              : robust
              ? `Gives up ${gap.toFixed(1)} points on paper (best possible: ${opt.toFixed(1)}%) to hold up better when the data is a little off.`
              : `Reaches ${ratio.toFixed(1)}% of the best possible on paper (${opt.toFixed(1)}%).`}
            {robust && sel.length < k ? ` Full coverage needs only ${sel.length}; more would add nothing.` : ""}
          </p>
          <p className="sub">
            {red < 0.5
              ? "Almost nobody is within reach of two centers, so losing one center leaves its area uncovered."
              : `${red.toFixed(0)}% are within reach of two or more centers, so they stay covered if one is knocked out.`}
          </p>
          {countyHasRobust && hasRobust && (
            <p className="sub">
              {robust
                ? "Chosen to hold up if the data is a little off. Re-solved for each N, so centers can move as you drag the slider."
                : "Centers are added one at a time; earlier ones stay put."}
            </p>
          )}
        </section>

        <section className="trade">
          <h2>Reach vs. budget</h2>
          <p className="note">
            More centers or a longer reach both raise coverage. They trade off against each other, so fix one and solve for the other.
          </p>
          <fieldset className="seg targets">
            <legend>Coverage target</legend>
            {TARGETS.map((t) => (
              <label key={t} className={target === t ? "on" : ""}>
                <input type="radio" name="target" checked={target === t} onChange={() => setTarget(t)} />
                {t}%
              </label>
            ))}
          </fieldset>
          {panel && (
            <>
              <p>
                At <b>{panel.R} mi</b>, reaching <b>{target}%</b> takes{" "}
                {(() => {
                  const n = panel.need.find((x) => x.t === target).n;
                  return n === null ? (
                    <b>more than {KLIVE} centers</b>
                  ) : (
                    <button type="button" className="linkbtn" disabled={n > KMAX} onClick={() => setK(Math.max(KMIN, n))}>
                      {n} center{n === 1 ? "" : "s"}
                    </button>
                  );
                })()}
                .
              </p>
              <p>
                With <b>{panel.k} centers</b>, reaching <b>{target}%</b> takes a reach of{" "}
                {panel.reach === null ? (
                  <b>more than 150 mi</b>
                ) : (
                  <button type="button" className="linkbtn" onClick={() => setRadius(upR(panel.reach))}>
                    {upR(panel.reach)} mi
                  </button>
                )}
                .
              </p>
              <p className="note">
                Centers needed at {panel.R} mi:{" "}
                {panel.need.map((x, i) => (
                  <span key={x.t}>
                    {i > 0 && " · "}
                    {x.t}% needs {x.n === null ? `>${KLIVE}` : x.n}
                  </span>
                ))}
              </p>
              <p className="note">
                Greedy estimates. Reach is the distance people can realistically travel in an outage. Loosening it raises coverage on paper
                without helping anyone, so treat it as a standard to meet, not a dial to hit a number.
              </p>
            </>
          )}
        </section>

        <section>
          <h2>Planned centers</h2>
          <ol className="centers">
            {chosen.map((c) => (
              <li key={c.n}>
                <span className="num">{c.n}</span>
                <span className="who">
                  <b>{c.name}</b>
                  <em>{TYPE_LABEL[c.type] || "Facility"}</em>
                </span>
                <span className="gain">{c.gain > 0 ? `+${fmt(c.gain)}` : "0"}</span>
              </li>
            ))}
          </ol>
          <p className="note">“+” is how many people each center newly brings within reach, in the order it is added.</p>
        </section>

        {worst.length > 0 && (
          <section>
            <h2>Still out of reach</h2>
            <ul className="worst">
              {worst.map((z) => (
                <li key={z.z}>
                  <span>ZIP {z.z}</span>
                  <b>{z.masked ? "<11" : fmt(z.w)}</b>
                </li>
              ))}
            </ul>
          </section>
        )}

        <label className="check">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Show all {fmt(county.sites.length)} candidate sites
        </label>

        <details className="assume">
          <summary>How this is measured, and its limits</summary>
          <ul>
            <li>Data: HHS emPOWER counts of Medicare beneficiaries who use electricity-dependent medical equipment, by ZIP. Younger people and non-Medicare users are not counted.</li>
            <li>“Within reach” means a straight-line distance of {R} miles from the ZIP’s center, not travel time. Roads, flooding, and mobility needs make real access harder.</li>
            <li>“Expected” assumes each ZIP’s true population center is off by roughly a third of the distance to the next ZIP’s center. That is an assumption, not a measurement; large rural ZIPs can be off by more.</li>
            <li>Changing the reach or asking for more than {KPRE} centers recomputes the greedy plan live in your browser. The robust plan and the “best possible” figure are precomputed only at the county's default reach.</li>
            <li>Counts of 1 to 10 are published as 11, so small ZIPs are slightly overstated.</li>
            <li>Candidate sites come from OpenStreetMap and are not checked for generators, staffing, or willingness to participate.</li>
            <li>Planning support only. It is not a safety guarantee.</li>
          </ul>
        </details>
      </aside>

      <main className="mapwrap">
        <MapContainer center={[39, -98]} zoom={5} preferCanvas className="map" scrollWheelZoom>
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
            maxZoom={18}
          />
          <FitBounds bounds={view} />

          {showAll &&
            county.sites.map((s, i) => (
              <CircleMarker
                key={`s${i}`}
                center={[s.lat, s.lon]}
                radius={2.5}
                pathOptions={{ color: "#5b6b7a", weight: 0, fillOpacity: 0.45 }}
                interactive={false}
              />
            ))}

          {chosen.map((c) => (
            <Circle
              key={`r${fips}-${c.n}`}
              center={[c.lat, c.lon]}
              radius={R * MILE_M}
              pathOptions={{ color: COLORS.center, weight: 1, opacity: 0.35, fillColor: COLORS.center, fillOpacity: 0.05 }}
              interactive={false}
            />
          ))}

          {county.zips.map((z, i) => {
            const out = uncovered.has(i);
            const col = out ? COLORS.uncovered : COLORS.covered;
            return (
              <CircleMarker
                key={`z${fips}-${z.z}`}
                center={[z.lat, z.lon]}
                radius={4 + 14 * Math.sqrt(z.w / maxW)}
                pathOptions={{ color: col, weight: 1.5, fillColor: col, fillOpacity: out ? 0.7 : 0.4 }}
              >
                <Tooltip>
                  ZIP {z.z} · {z.masked ? "fewer than 11" : fmt(z.w)} people · {out ? "out of reach" : "within reach"}
                </Tooltip>
              </CircleMarker>
            );
          })}

          {chosen.map((c) => (
            <Marker key={`m${fips}-${c.n}`} position={[c.lat, c.lon]} icon={pin(c.n)} zIndexOffset={1000}>
              <Tooltip>
                {c.n}. {c.name}
              </Tooltip>
            </Marker>
          ))}
        </MapContainer>

        <div className="legend" aria-hidden="true">
          <span><i style={{ background: COLORS.covered }} />ZIP within reach</span>
          <span><i style={{ background: COLORS.uncovered }} />ZIP out of reach</span>
          <span><i className="sq" />Planned center</span>
        </div>
      </main>
    </div>
  );
}

function Message({ title, body }) {
  return (
    <div className="message">
      <h1>{title}</h1>
      {body && <p>{body}</p>}
    </div>
  );
}