import { useMemo } from "react";
import { usePlanner } from "../../state/PlannerContext.jsx";
import Card from "../ui/Card.jsx";
import Logo from "../ui/Logo.jsx";
import Num from "../ui/Num.jsx";
import { GEN, sitesFor } from "../../lib/budget.js";

export function IdentityCard() {
  const { data, fips, setFips } = usePlanner();
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

  return (
    <Card dock="top" className="c-identity">
      <div className="ident">
        <Logo className="ident-logo" />
        <label className="select">
          <span className="sr">County</span>
          <select value={fips ?? ""} onChange={(e) => setFips(e.target.value)} disabled={!data}>
            {groups.map(([st, items]) => (
              <optgroup key={st} label={st}>
                {items.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
    </Card>
  );
}

// Centers and reach are fixed for now: as many sites as the county's fixed budget buys of the chosen generator type,
// at the workbook's reach, placed for the most coverage by the exact search.
// Sliders come back with the logistics page.
export function CountCard() {
  const { k, plan, est, gen, county } = usePlanner();
  const placed = plan?.chosen.length ?? k;
  // the logistics page can set the count by hand; only then is it not what the budget buys
  const fromBudget = !!est && !!county && k === sitesFor(est, gen, county);
  return (
    <Card title="Centers" dock="top" className="c-budget">
      <p className="stat"><Num value={placed} className="stat-v" /></p>
      <p className="stat-note">
        {placed < k
          ? fromBudget ? `Budget buys ${k}; ${placed} already reach everyone in range` : `${k - placed} more would reach no one new`
          : fromBudget ? `Budget ÷ ${GEN[gen].cost.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} per site` : ""}
      </p>
    </Card>
  );
}

export function ReachCard() {
  const { R, est } = usePlanner();
  return (
    <Card title="Travel distance" dock="top" className="c-reach">
      <p className="stat"><Num value={R} decimals={R % 1 ? 1 : 0} className="stat-v" /><span className="stat-u">mi</span></p>
      <p className="stat-note">{est?.type && R === est.reach ? `${est.type} reach, straight line` : "Straight line to the nearest center"}</p>
    </Card>
  );
}
