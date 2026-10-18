import { useEffect, useState } from "react";
import { GEN_ORDER, IN } from "../../lib/budget.js";
import { costs, GEN_NOTE, READY, timeline } from "../../lib/scenario.js";
import { money } from "./money.js";
import { GEN_LABEL } from "./Simulator.jsx";
import logistics from "../../data/logistics.json";

const CHECKS = [
  "Pick the first sites to confirm",
  "Call each site and confirm room, entrance, and outlets",
  "Get a written yes from each building's owner or board",
  "Install quick-connect boxes (hookups)",
  "Sign generator rental and fuel delivery contracts",
  "File the FEMA Hazard Mitigation Grant application",
  "Add the sites to the county emergency plan",
  "Tell households that rely on powered equipment where to go",
  "Run a drill before storm season",
];

function useChecklist(fips) {
  const key = `gridaid-checklist-${fips}`;
  const read = () => { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; } };
  const [done, setDone] = useState(read);
  useEffect(() => { setDone(read()); }, [fips]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (i) => setDone((d) => {
    const next = d.includes(i) ? d.filter((x) => x !== i) : [...d, i];
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* private window: keep it for this visit */ }
    return next;
  });
  return [done, toggle];
}

// What happens next: the money-versus-time choice, when each step lands, and a checklist to work through.
export default function Steps({ S }) {
  const { fips, sites, gen, setGen, est } = S;
  const [done, toggle] = useChecklist(fips);
  const n = sites.length;
  const T = logistics.counties[fips];
  const type = est?.type ?? (n > 10 ? "Urban" : "Rural");
  const steps = timeline(type, n, sites[0]?.name);

  return (
    <section className="lg-sec lg-steps" aria-labelledby="lg-steps-h">
      <h2 id="lg-steps-h" className="lg-h2">Next steps</h2>

      <article className="lg-card lg-trade">
        <h3 className="lg-h3">Time against cost, for {n} site{n === 1 ? "" : "s"}</h3>
        <table className="lg-table lg-trade-t">
          <thead>
            <tr><th>Option</th><th>Set up</th><th>County share<sup>†</sup></th><th>Each {IN.days}-day outage</th><th>Ready in</th><th></th></tr>
          </thead>
          <tbody>
            {GEN_ORDER.map((g) => {
              const c = costs(n, g);
              return (
                <tr key={g} className={g === gen ? "on" : ""}>
                  <th>{GEN_LABEL[g]}<small>{GEN_NOTE[g]}</small></th>
                  <td>{money(c.setup)}</td>
                  <td>{money(c.local)}</td>
                  <td>{c.running ? money(c.running) : "No fuel"}</td>
                  <td>{READY[g]}</td>
                  <td>{g === gen ? <span className="lg-cur">In the plan</span> : <button type="button" className="mini" onClick={() => setGen(g)}>Use</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="lg-note">† After FEMA pays {Math.round(IN.fema * 100)}%, the split in North Carolina's 2019 program; shares vary by program and state. Outage costs are rent and fuel for {IN.days} days at full load. Hookups are cheapest to set up and cost the most each time the power goes out.</p>
      </article>

      <div className="lg-steps-grid">
        <article className="lg-card lg-time">
          <h3 className="lg-h3">Timeline</h3>
          <ol>
            {steps.map(([when, what]) => <li key={when}><b>{when}</b><span>{what}</span></li>)}
          </ol>
          {T?.outage && (
            <div className="lg-why">
              <h4>Why now</h4>
              <p>{T.outage.what} ({T.outage.date}).</p>
            </div>
          )}
        </article>

        <article className="lg-card lg-check">
          <h3 className="lg-h3">Advocate Checklist <span>{done.length} of {CHECKS.length}</span></h3>
          <ul>
            {CHECKS.map((c, i) => (
              <li key={c}>
                <label className={done.includes(i) ? "done" : ""}>
                  <input type="checkbox" checked={done.includes(i)} onChange={() => toggle(i)} />
                  <span>{c}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="lg-note">Saved in this browser only.</p>
        </article>
      </div>
    </section>
  );
}
