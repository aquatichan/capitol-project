import { useEffect, useMemo, useRef, useState } from "react";
import { useScenario } from "../components/logistics/useScenario.js";
import Simulator, { GEN_LABEL } from "../components/logistics/Simulator.jsx";
import People from "../components/logistics/People.jsx";
import Sites from "../components/logistics/Sites.jsx";
import Steps from "../components/logistics/Steps.jsx";
import Chat from "../components/logistics/Chat.jsx";
import { money } from "../components/logistics/money.js";
import { briefingPdf } from "../components/logistics/pdf.js";
import Logo from "../components/ui/Logo.jsx";
import Footer from "../components/sections/Footer.jsx";
import Apa from "../components/ui/Apa.jsx";
import Boundary from "../components/ui/Boundary.jsx";
import { goTo } from "../lib/route.js";
import { estimate, GEN, sitesFor } from "../lib/budget.js";
import { costs } from "../lib/scenario.js";
import { fmt } from "../lib/format.js";
import { REFS } from "../data/references.js";
import logistics from "../data/logistics.json";
import "../styles/logistics.css";

const STATE = { AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", PR: "Puerto Rico" };
const longName = (name) => { const [c, st] = name.split(", "); return st ? `${c}, ${STATE[st] ?? st}` : name; };

const PAGE_REFS = ["empower", "zcta", "osm", "ncdps", "fema", "njoem", "vandalia", "herc", "eiaDiesel", "eiaGas", "stow", "santafe", "generac", "oregon", "inogen", "church", "nemhauser", "khuller", "leskovec", "lowerre", "kirkpatrick", "holland", "landdoig", "highs"];

// What the other county looks like at its own workbook budget, for the side-by-side row.
function compareRow(data, id, gen) {
  const c = data?.counties[id];
  if (!c) return null;
  const est = estimate(id, c), n = Math.max(1, Math.min(est.counts[gen], c.sites.length)), k = costs(n, gen);
  return { name: c.name, rely: c.total, n, setup: k.setup, local: k.local, per: k.setup / Math.max(1, c.total), fromTable: est.fromTable };
}

export default function Logistics() {
  const S = useScenario();
  const { data, county, fips, setFips, ev, sites, gen, est, edit } = S;
  const [selected, setSelected] = useState(null);
  const [cmp, setCmp] = useState("");
  const [busy, setBusy] = useState(false);
  const simRef = useRef(null);

  useEffect(() => { window.scrollTo(0, 0); }, []);
  useEffect(() => { if (county) document.title = `GridAid | ${county.name} logistics`; return () => { document.title = "GridAid | Backup-power planning for counties"; }; }, [county]);
  useEffect(() => { setSelected(null); }, [fips]);
  useEffect(() => { if (selected && !sites.some((s) => s.key === selected)) setSelected(null); }, [sites, selected]);

  const groups = useMemo(() => {
    if (!data) return [];
    const by = new Map();
    for (const [id, c] of Object.entries(data.counties)) {
      const st = c.name.includes(", ") ? c.name.split(", ").pop() : "DC";
      if (!by.has(st)) by.set(st, []);
      by.get(st).push([id, c.name]);
    }
    return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([st, items]) => [st, items.sort((a, b) => a[1].localeCompare(b[1]))]);
  }, [data]);

  if (!county || !ev) return <p className="page-wait">{S.error ?? "Loading the county…"}</p>;

  const T = logistics.counties[fips];
  const c = costs(sites.length, gen);
  const other = cmp ? compareRow(data, cmp, gen) : null;
  const methodName = { phased: "Phased", robust: "Robust", optimal: "Optimal" }[S.method] ?? S.rows?.find((r) => r.key === S.method)?.name ?? S.method;
  const doc = { ...S, methodName, logistics: T };
  const addAt = (z) => {
    edit.add(z.lat, z.lon, `New site near ZIP ${z.z}`);
    simRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
    <div className="lg">
      <nav className="lg-top" aria-label="GridAid">
        <button type="button" className="lg-back" onClick={() => goTo("planner")}>← <span>Back to the</span> map</button>
        <Logo className="lg-logo" />
        <label className="lg-county">
          <span className="sr">County</span>
          <select value={fips} onChange={(e) => setFips(e.target.value)}>
            {groups.map(([st, items]) => (
              <optgroup key={st} label={st}>{items.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</optgroup>
            ))}
          </select>
        </label>
      </nav>

      <header className="lg-head">
        <div>
          <h1>{longName(county.name)}</h1>
          <p>
            Backup-power plan for council review. {est?.type ? `${est.type} county, ` : ""}{fmt(county.total)} people rely on powered medical equipment.
            {!T && " This county is not in the workbook, so costs use the workbook's own formula."}
          </p>
        </div>
        <div className="lg-head-act">
          <label className="lg-cmp">
            <span className="sr">Compare with another county</span>
            <select value={cmp} onChange={(e) => setCmp(e.target.value)}>
              <option value="">Compare with…</option>
              {Object.keys(logistics.counties).filter((id) => id !== fips && data.counties[id]).map((id) => <option key={id} value={id}>{data.counties[id].name}</option>)}
            </select>
          </label>
          <button type="button" className="lg-btn" disabled={busy} onClick={async () => { setBusy(true); try { await briefingPdf(doc); } finally { setBusy(false); } }}>
            {busy ? "Making the PDF…" : "Download briefing (PDF)"}
          </button>
        </div>
      </header>

      <section className="lg-band" aria-label="Overview">
        <dl>
          <div><dt>Sites</dt><dd>{sites.length}</dd><p>{sites.length < S.k && !S.edited && est && S.k === sitesFor(est, gen, county) ? `budget buys ${S.k}; ${sites.length} already reach everyone in range` : `${GEN_LABEL[gen].toLowerCase()}, ${S.R} mi reach`}{T ? ` · workbook: ${T.sites.recommended} to ${T.sites.high}` : ""}</p></div>
          <div><dt>Within reach</dt><dd>{fmt(ev.reached)}</dd><p>{ev.pct.toFixed(1)}% of people who rely on power</p></div>
          <div><dt>Not reached</dt><dd className={ev.missed >= 0.5 ? "miss" : ""}>{fmt(ev.missed)}</dd><p>{ev.unreached.length} ZIP{ev.unreached.length === 1 ? "" : "s"} outside every circle</p></div>
          <div><dt>Full setup</dt><dd>{money(c.setup)}</dd><p>{money(GEN[gen].cost)} a site · {money(c.setup / Math.max(1, ev.reached))} per person reached</p></div>
          <div><dt>County share</dt><dd>{money(c.local)}</dd><p>if FEMA pays {money(c.fema)}</p></div>
        </dl>
        {other && (
          <div className="lg-cmp-row">
            <p><b>{other.name}</b>{other.fromTable ? "" : " (estimated)"}, at its own budget</p>
            <span>{fmt(other.rely)} rely on power</span>
            <span>{other.n} sites</span>
            <span>{money(other.setup)} setup</span>
            <span>{money(other.local)} county share</span>
            <span>{money(other.per)} per person who relies on power, against {money(c.setup / Math.max(1, county.total))} here</span>
          </div>
        )}
      </section>

      <div ref={simRef} className="lg-anchor" />
      <h2 className="lg-h2 lg-sim-h">Try the plan</h2>
      <p className="lg-sub">Move sites, change each one's reach, or let a different method choose. Every number on this page follows.</p>
      <Simulator S={S} selected={selected} setSelected={setSelected} />

      <People S={S} onAddAt={addAt} />
      <Sites S={S} selected={selected} setSelected={(k) => { setSelected(k); simRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }} />
      <Steps S={S} />

      <section className="lg-sec lg-refs" aria-labelledby="lg-refs-h">
        <h2 id="lg-refs-h" className="lg-h2">References</h2>
        <ol>
          {[...PAGE_REFS, ...(REFS[`out${fips}`] ? [`out${fips}`] : [])].map((id) => <li key={id}><Apa id={id} /></li>)}
        </ol>
      </section>

      <Boundary><Chat S={S} /></Boundary>
    </div>
    <Footer />
    </>
  );
}
