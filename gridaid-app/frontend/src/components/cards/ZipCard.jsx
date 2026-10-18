import { useState } from "react";
import { usePlanner } from "../../state/PlannerContext.jsx";
import { miles, peopleLabel, siteName } from "../../lib/format.js";
import Card from "../ui/Card.jsx";

// Type a ZIP, or hover / click one on the map: the same card answers both. ZIP only, never an address.
export default function ZipCard() {
  const { zipDirectory, fips, setFips, county, plan, zipIndex, setPinZip, pinZip, activeZip, setFocusReq, data } = usePlanner();
  const [q, setQ] = useState("");

  const zip = q.length === 5 ? q : null;
  const home = zip ? zipDirectory.get(zip) : null;

  const go = (v) => {
    const digits = v.replace(/\D/g, "").slice(0, 5);
    setQ(digits);
    if (digits.length === 5 && zipDirectory.get(digits) === fips) {
      const z = county.zips[zipIndex.get(digits)];
      setPinZip(digits);
      setFocusReq({ lat: z.lat, lon: z.lon, key: Date.now() });
    }
  };

  const shown = activeZip ?? null;
  const i = shown ? zipIndex.get(shown) : null;
  let body;
  if (zip && !home) {
    body = <p className="res bad">No data for {zip} yet.</p>;
  } else if (zip && home !== fips) {
    body = (
      <p className="res">
        {zip} is in <b>{data.counties[home].name}</b>. <button type="button" className="mini" onClick={() => { setFips(home); setPinZip(zip); }}>Open</button>
      </p>
    );
  } else if (i != null && plan) {
    const z = county.zips[i];
    const out = plan.uncovered.has(i);
    const c = plan.chosen[plan.nearN[i] - 1];
    body = (
      <div className="res">
        <p className="res-h">
          <span className={`chip ${out ? "out" : "in"}`}>{out ? "Not covered" : "Covered"}</span>
          {pinZip === z.z && <button type="button" className="mini" onClick={() => { setPinZip(null); setQ(""); }}>Unpin</button>}
        </p>
        <p>
          {peopleLabel(z)} people. Nearest center is {siteName(c).name}, {miles(plan.nearD[i])} mi away.
        </p>
      </div>
    );
  } else {
    body = <p className="hint">Type a ZIP or hover over the map.</p>;
  }

  return (
    <Card title={i != null && plan ? `ZIP ${shown}` : "Look up a ZIP"} dock="bottom" className={`c-zip${i != null && plan ? " has-zip" : ""}`}>
      <label className="zipin">
        <span className="sr">ZIP code</span>
        <input inputMode="numeric" autoComplete="off" maxLength={5} placeholder="77077" value={q} onChange={(e) => go(e.target.value)} aria-describedby="zip-res" />
        {q && <button type="button" onClick={() => setQ("")} aria-label="Clear ZIP">×</button>}
      </label>
      <div id="zip-res" aria-live="polite">{body}</div>
    </Card>
  );
}
