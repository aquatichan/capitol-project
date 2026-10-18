import { usePlanner } from "../state/PlannerContext.jsx";
import MapView from "./MapView.jsx";
import { IdentityCard, CountCard, ReachCard } from "./cards/Controls.jsx";
import CoverageCard from "./cards/CoverageCard.jsx";
import { CentersCard, GapsCard } from "./cards/Lists.jsx";
import BudgetCard from "./cards/Budget.jsx";
import ZipCard from "./cards/ZipCard.jsx";
import { LegendCard } from "./cards/Legend.jsx";

// Controls across the top, the map with the placement and gap lists beside it, budget, ZIP and key along the bottom.
export default function Planner({ mapRef }) {
  const { error } = usePlanner();
  return (
    <div className="planner" id="planner">
      <div className="band band-top">
        <IdentityCard />
        <CountCard />
        <ReachCard />
        <CoverageCard />
      </div>
      <MapView cellRef={mapRef} />
      <div className="side">
        <CentersCard />
        <GapsCard />
      </div>
      <div className="band band-bottom">
        <BudgetCard />
        <ZipCard />
        <LegendCard />
      </div>
      {error && (
        <div className="planner-error" role="alert">
          <h2>Can't load the data</h2>
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}
