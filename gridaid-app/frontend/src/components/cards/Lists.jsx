import { usePlanner } from "../../state/PlannerContext.jsx";
import { fmt, fmt1, KIND, peopleLabel, siteName } from "../../lib/format.js";
import { MODES } from "../../lib/usePlan.js";
import Card from "../ui/Card.jsx";

const MODE_HELP = {
  phased: "Centers are added one at a time; earlier ones stay put as the budget grows.",
  robust: "Best average coverage if the real reach is 20% shorter or longer than set.",
  optimal: "The best plan the exact search can find at this reach. Centers can move when the budget changes.",
};

function Placement() {
  const { mode, setMode, plan } = usePlanner();
  return (
    <div className="place">
      <div className={`seg${plan?.pending ? " is-busy" : ""}`} role="radiogroup" aria-label="Placement method" aria-busy={!!plan?.pending}>
        {Object.entries(MODES).map(([id, label]) => (
          <button key={id} type="button" role="radio" aria-checked={mode === id} className={mode === id ? "on" : ""} onClick={() => setMode(id)}>
            {label}
          </button>
        ))}
      </div>
      <p className="place-help">{MODE_HELP[mode]}</p>
    </div>
  );
}

export function CentersCard() {
  const { plan, hoverCenter, setHoverCenter, setFocusReq } = usePlanner();
  const rows = plan?.chosen ?? [];
  return (
    <Card title="Where the centers go" aside={plan?.pending ? "Updating…" : undefined} dock="right" className="c-centers">
      <Placement />
      <ol className="rows" onMouseLeave={() => setHoverCenter(null)}>
        {rows.map((c) => (
          <li key={c.idx} className={hoverCenter === c.n ? "hot" : ""}>
            <button
              type="button"
              onMouseEnter={() => setHoverCenter(c.n)}
              onFocus={() => setHoverCenter(c.n)}
              onBlur={() => setHoverCenter(null)}
              onClick={() => setFocusReq({ lat: c.lat, lon: c.lon, key: Date.now() })}
              title={`Reaches ${fmt(c.gain)} more people (${fmt1(c.cum)}% in total). Click to show on the map.`}
            >
              <b className="pinno">{c.n}</b>
              <span className="nm">
                <strong>{siteName(c).name}</strong>
                <em>{KIND[c.type] ?? c.type}</em>
              </span>
              <span className="gain">+{fmt(c.gain)}</span>
            </button>
          </li>
        ))}
      </ol>
    </Card>
  );
}

export function GapsCard() {
  const { plan, county, R, setPinZip, setFocusReq } = usePlanner();
  if (!plan || !county) return <Card title="Not covered" dock="right" className="c-gaps" />;
  const rows = plan.unc
    .map((i) => ({ z: county.zips[i], i }))
    .sort((a, b) => b.z.w - a.z.w);
  const people = rows.reduce((s, r) => s + r.z.w, 0);
  return (
    <Card title="Not covered" aside={`${fmt(people)} people`} dock="right" className="c-gaps">
      {rows.length === 0 ? (
        <p className="empty">Every ZIP is within {R} mi of a center.</p>
      ) : (
        <ul className="rows rows-gaps">
          {rows.map(({ z }) => (
            <li key={z.z}>
              <button
                type="button"
                onClick={() => {
                  setPinZip(z.z);
                  setFocusReq({ lat: z.lat, lon: z.lon, key: Date.now() });
                }}
                title="Show on the map"
              >
                <span className="zp">{z.z}</span>
                <span className="pp">{peopleLabel(z)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
