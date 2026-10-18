import { useEffect, useState } from "react";
import SimMap from "./SimMap.jsx";
import Slider from "../ui/Slider.jsx";
import { GEN, GEN_ORDER, sitesFor } from "../../lib/budget.js";
import { MODES, niceR, rToT, tToR } from "../../lib/usePlan.js";
import { ALGORITHMS } from "../../lib/algos.js";
import { fmt, fmt1, KIND } from "../../lib/format.js";
import { money } from "./money.js";

export const GEN_LABEL = { hookup: "Hookups only", diesel: "Diesel generators", gas: "Natural gas generators", solar: "Solar + battery" };
const MODE_ABOUT = {
  phased: "Greedy, one site at a time. Earlier sites never move as the budget grows.",
  robust: "Best average coverage if real travel is 20% shorter or longer.",
  optimal: "Best plan the exact search finds at this reach.",
};
const R_TICKS = [1, 3, 10, 30].map((r) => ({ at: rToT(r), label: String(r) }));

export default function Simulator({ S, selected, setSelected }) {
  const { county, shapes, scale, sites, ev, shift, edit, edited, est, gen, setGen, k, setK, R, radius, setRadius, method, setMethod, rows, modeCov, curve, plan, pending } = S;
  const [adding, setAdding] = useState(false);
  const [budget, setBudget] = useState(null);
  useEffect(() => { setBudget(null); }, [county]);
  // R is the reach the plan was computed at (it trails a slider drag by a frame); the slider follows the live value
  const Rnow = radius ?? est?.reach ?? county?.R ?? R;
  const cap = budget ?? est?.budget ?? 0;
  const buys = Math.max(1, Math.floor(cap / GEN[gen].cost + 1e-9));
  const maxK = Math.max(3, Math.min(county?.sites.length ?? 3, 150));
  const sel = sites.find((s) => s.key === selected) ?? null;
  const selN = sel ? sites.indexOf(sel) + 1 : 0;

  const methodRows = [
    ...Object.entries(MODES).map(([key, name]) => ({
      key, name, about: MODE_ABOUT[key],
      cov: key === method && plan && !plan.pending ? plan.cov : key === "phased" ? curve?.cum[Math.min(k, curve.cum.length) - 1] : modeCov[key],
    })),
    ...ALGORITHMS.map(([key, name, about]) => {
      const r = rows?.find((x) => x.key === key);
      return { key, name, about, cov: r?.cov, exact: r?.exact, ms: r?.ms };
    }),
  ];
  const top = Math.max(0, ...methodRows.map((r) => r.cov ?? 0));
  const methodName = methodRows.find((r) => r.key === method)?.name ?? "";

  return (
    <section className="lg-sim" aria-label="Simulator">
      <SimMap
        county={county} shapes={shapes} scale={scale} sites={sites} ev={ev} selected={selected} shift={shift} adding={adding}
        onSelect={setSelected}
        onMove={(key, lat, lon) => edit.move(key, lat, lon)}
        onAdd={(lat, lon) => { edit.add(lat, lon); setAdding(false); }}
      />

      <div className="lg-panel">
        <fieldset className="lg-group">
          <legend>Budget</legend>
          <label className="lg-money">
            <span>$</span>
            <input type="number" min="0" step="1000" value={Math.round(cap)} onChange={(e) => setBudget(Math.max(0, Number(e.target.value) || 0))} aria-label="Budget in dollars" />
          </label>
          <label className="lg-select">
            <span className="sr">Generator type</span>
            <select value={gen} onChange={(e) => setGen(e.target.value)}>
              {GEN_ORDER.map((g) => <option key={g} value={g}>{GEN_LABEL[g]} · {money(GEN[g].cost)} a site</option>)}
            </select>
          </label>
          <p className="lg-buys">
            <span>Buys <b>{buys}</b> site{buys === 1 ? "" : "s"}</span>
            {buys !== k && <button type="button" className="mini" onClick={() => setK(Math.min(maxK, buys))}>Plan {Math.min(maxK, buys)}</button>}
          </p>
        </fieldset>

        <fieldset className="lg-group">
          <legend>Sites and reach</legend>
          <div className="lg-row">
            <span>Sites</span>
            <div className="lg-step">
              <button type="button" onClick={() => setK(Math.max(1, k - 1))} disabled={k <= 1} aria-label="One fewer site">−</button>
              <b>{k}</b>
              <button type="button" onClick={() => setK(Math.min(maxK, k + 1))} disabled={k >= maxK} aria-label="One more site">+</button>
            </div>
            <span className={`lg-cost${k * GEN[gen].cost > cap + 1 ? " over" : ""}`}>{money(k * GEN[gen].cost)}</span>
          </div>
          <Slider value={k} min={1} max={maxK} onChange={setK} ticks={[]} label="Number of sites" valueText={`${k} sites`} />
          {sites.length < k && !edited && <p className="lg-hint lg-fewer">{k - sites.length} more would reach no one new, so {sites.length === 1 ? "only 1 is" : `${sites.length} are`} placed.</p>}
          <div className="lg-row">
            <span>Reach for every site</span>
            <b className="lg-r">{Rnow} mi</b>
          </div>
          <Slider value={rToT(Rnow)} min={rToT(0.5)} max={rToT(30)} step={0.5} onChange={(t) => setRadius(niceR(tToR(t)))} ticks={R_TICKS} label="Reach in miles" valueText={`${Rnow} miles`} />
          {(radius != null || (est && county && k !== sitesFor(est, gen, county))) && (
            <button type="button" className="lg-link" onClick={() => { setK(null); setRadius(null); setBudget(null); }}>Back to the county's numbers</button>
          )}
        </fieldset>

        <fieldset className="lg-group lg-methods">
          <legend>Who picks the sites <span>{pending ? "solving…" : ""}</span></legend>
          <ol>
            {methodRows.map((r) => (
              <li key={r.key}>
                <button type="button" className={r.key === method ? "on" : ""} onClick={() => setMethod(r.key)} title={r.about} aria-pressed={r.key === method}>
                  <span className="m-name">{r.name}{r.exact ? <em> proven best</em> : null}</span>
                  <span className="m-bar"><i style={{ width: `${r.cov ?? 0}%` }} className={r.cov != null && r.cov >= top - 0.05 ? "top" : ""} /></span>
                  <span className="m-cov">{r.cov != null ? `${fmt1(r.cov)}%` : "…"}</span>
                </button>
              </li>
            ))}
          </ol>
          {shift && (
            <p className="lg-shift">
              <i aria-hidden="true" /> Last change moved {shift.from.length} site{shift.from.length === 1 ? "" : "s"} and kept {shift.kept}.
            </p>
          )}
        </fieldset>

        <fieldset className="lg-group lg-edit">
          <legend>{sel ? `Site ${selN}` : "Edit the plan"}</legend>
          {sel ? (
            <>
              <p className="lg-sel-n">{sel.name}<span>{sel.custom ? "Placed by hand" : KIND[sel.type] ?? sel.type}{sel.moved ? " · moved" : ""}</span></p>
              <p className="lg-sel-m">{fmt(ev?.per[selN - 1]?.within ?? 0)} people within {sel.r} mi · {fmt(ev?.per[selN - 1]?.gain ?? 0)} reached by no earlier site</p>
              <div className="lg-row"><span>This site's reach</span><b className="lg-r">{sel.r} mi</b></div>
              <Slider value={rToT(sel.r)} min={rToT(0.5)} max={rToT(30)} step={0.5} onChange={(t) => edit.radius(sel.key, niceR(tToR(t)))} ticks={R_TICKS} label={`Reach of site ${selN}`} valueText={`${sel.r} miles`} />
              <div className="lg-btns">
                {(sel.moved || sel.r !== R) && !sel.custom && <button type="button" className="mini" onClick={() => edit.unmove(sel.key)}>Undo changes</button>}
                <button type="button" className="mini danger" onClick={() => { edit.remove(sel.key); setSelected(null); }}>Remove site</button>
                <button type="button" className="mini" onClick={() => setSelected(null)}>Done</button>
              </div>
            </>
          ) : (
            <>
              <p className="lg-hint">Drag a site to move it. Click one to change its reach or remove it.</p>
              <div className="lg-btns">
                <button type="button" className={`mini${adding ? " on" : ""}`} onClick={() => setAdding((a) => !a)}>{adding ? "Cancel adding" : "Add a site"}</button>
                {edited > 0 && <button type="button" className="mini" onClick={edit.reset}>Undo my {edited} edit{edited === 1 ? "" : "s"}</button>}
              </div>
            </>
          )}
        </fieldset>
        <p className="lg-src">Showing <b>{methodName}</b>{edited ? " with your edits" : ""}.</p>
      </div>
    </section>
  );
}
