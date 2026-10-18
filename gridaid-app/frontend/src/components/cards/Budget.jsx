import { usePlanner } from "../../state/PlannerContext.jsx";
import { GEN, GEN_ORDER, IN } from "../../lib/budget.js";
import Card from "../ui/Card.jsx";

const money = (v) => v.toLocaleString("en-US", { style: "currency", currency: "USD", notation: v >= 1e5 ? "compact" : "standard", maximumFractionDigits: v >= 1e5 ? 2 : 0 });
const LABEL = { hookup: "Hookups only", diesel: "Diesel generator", gas: "Natural gas generator", solar: "Solar + battery" };

// The budget is fixed (GridAid_County_Plans.xlsx); each generator type buys a different number of sites with it.
// Picking a row plans the map with that type.
export default function BudgetCard() {
  const { est, gen, setGen } = usePlanner();
  if (!est) return <Card title="Budget" dock="bottom" className="c-budget-plan" />;
  return (
    <Card title="Budget" aside={`County pays ${money(est.budget * (1 - IN.fema))} after FEMA${est.fromTable ? "" : " · estimated"}`} dock="bottom" className="c-budget-plan">
      <div className="bud">
        <p className="bud-big">{money(est.budget)}</p>
        <table className="bud-t">
          <thead>
            <tr><th>Generator type</th><th>Per site</th><th>Sites</th></tr>
          </thead>
          <tbody>
            {GEN_ORDER.map((g) => (
              <tr key={g} className={g === gen ? "on" : ""} onClick={() => setGen(g)}>
                <td><button type="button" aria-pressed={g === gen} onClick={(e) => { e.stopPropagation(); setGen(g); }}>{LABEL[g]}</button></td>
                <td>{money(GEN[g].cost)}</td>
                <td>{est.counts[g]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
