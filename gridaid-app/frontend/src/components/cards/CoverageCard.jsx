import { usePlanner } from "../../state/PlannerContext.jsx";
import Card from "../ui/Card.jsx";
import Num from "../ui/Num.jsx";

export default function CoverageCard() {
  const { plan, R, county } = usePlanner();
  const cov = plan?.cov ?? 0;
  return (
    <Card title="Coverage" dock="top" className="c-coverage" aria-live="polite">
      <div className="cov">
        <p className="cov-n">
          <Num value={cov} decimals={cov >= 100 ? 0 : 1} className="cov-num" />
          <small>%</small>
        </p>
        <div className="cov-r">
          <div className="bar" role="img" aria-label={`${cov.toFixed(1)} percent covered`}>
            <i style={{ width: `${cov}%` }} />
          </div>
          <p>
            of people who rely on powered medical equipment in {county ? county.name.split(",")[0] : "the county"} live within {R} mi of a center.
          </p>
        </div>
      </div>
    </Card>
  );
}
