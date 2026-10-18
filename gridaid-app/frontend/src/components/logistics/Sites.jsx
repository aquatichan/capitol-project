import { fmt, KIND, peopleLabel } from "../../lib/format.js";
import { costs, flagsFor, kwFor, visitorsFor } from "../../lib/scenario.js";
import { GEN, IN } from "../../lib/budget.js";
import { money } from "./money.js";

function Contact({ c, site, county }) {
  if (site.custom) return <span className="ct none">Pick a building first</span>;
  const q = encodeURIComponent(`${site.name} ${county.name}`);
  return (
    <span className="ct">
      <span className="ct-links">
        {c?.phone ? <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}>{c.phone}</a> : <span className="none">No public phone</span>}
        {c?.web && <a href={c.web} target="_blank" rel="noreferrer">Website</a>}
        <a href={`https://www.google.com/search?q=${q}`} target="_blank" rel="noreferrer">Search</a>
      </span>
      {(c?.addr || c?.op) && <small>{[c.addr, c.op].filter(Boolean).join(" · ")}</small>}
    </span>
  );
}

// Site by site: who each one newly reaches, the power it needs, how to start fast, and what to check first.
export default function Sites({ S, selected, setSelected }) {
  const { county, sites, ev, gen, contacts, method, plan } = S;
  if (!county || !ev) return null;
  const maxGain = Math.max(1, ...ev.per.map((m) => m.gain));
  const hook = costs(1, "hookup"), full = costs(1, gen);
  const order = ev.per.map((m, i) => [m.served, i]).sort((a, b) => b[0] - a[0]);
  const busiest = order[0]?.[1] ?? 0, top3 = new Set(order.slice(0, 3).map(([, i]) => i));
  const firstLeft = ev.unreached[0] != null ? county.zips[ev.unreached[0]] : null;

  return (
    <section className="lg-sec lg-sites" aria-labelledby="lg-sites-h">
      <h2 id="lg-sites-h" className="lg-h2">Site by site</h2>
      <div className="lg-card lg-table-wrap">
        <table className="lg-table">
          <thead>
            <tr>
              <th>#</th><th>Site and contact</th><th>New people reached</th><th>Power needed<sup>*</sup></th><th>Fast start</th><th>Full setup</th><th>Check first</th>
            </tr>
          </thead>
          <tbody>
            {sites.map((s, i) => {
              const m = ev.per[i], [lo, hi] = kwFor(m.served), flags = flagsFor(s, m, gen, { busy: top3.has(i) });
              const units = Math.max(1, Math.ceil(hi / IN.kwPerSite));
              return (
                <tr key={s.key} className={s.key === selected ? "on" : ""} onClick={() => setSelected(s.key)}>
                  <td className="n"><b className="pinno">{i + 1}</b></td>
                  <td className="site">
                    <strong>{s.name}</strong>
                    <em>{s.custom ? "Placed by hand" : KIND[s.type] ?? s.type}{s.osm ? ` · ${s.osm}` : ""}</em>
                    <Contact c={s.idx != null ? contacts[String(s.idx)] : null} site={s} county={county} />
                  </td>
                  <td className="gain">
                    <span className="g-bar"><i style={{ width: `${(100 * m.gain) / maxGain}%` }} /></span>
                    <b>{fmt(m.gain)}</b>
                    {m.within - m.gain >= 1 && <small>{fmt(m.within)} within {s.r} mi in all</small>}
                  </td>
                  <td className="kw"><b>{Math.round(lo)} to {Math.round(hi)} kW</b><small>about {fmt(visitorsFor(m.served))} people at once{units > 1 ? ` · ${units} generators at peak` : ""}</small></td>
                  <td className="fast"><b>Hookup {money(hook.setup)}</b><small>then {money(GEN.hookup.rentPerWeek)} a week to rent</small></td>
                  <td className="full"><b>{money(full.perSite)}</b><small>{GEN[gen].name.toLowerCase()}</small></td>
                  <td className="flags">
                    {flags.length ? <ul>{flags.map((f) => <li key={f.t} className={f.warn ? "warn" : ""}>{f.t}</li>)}</ul> : <span className="ok">Nothing flagged</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="lg-note">* Power for the people each site would serve (the nearest site that reaches them), at 25% turnout and 275 to 550 watts a person. Phones and addresses come only from public map listings.</p>
      </div>
    </section>
  );
}
