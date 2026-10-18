import { usePlanner } from "../../state/PlannerContext.jsx";
import { SHADE_MODES } from "../../lib/zips.js";
import { fmt } from "../../lib/format.js";
import Card from "../ui/Card.jsx";

const short = (v, mode) => (mode === "density" ? (v < 10 ? v.toFixed(1) : fmt(v)) : fmt(v));

export function LegendCard() {
  const { scale, shade, setShade, R } = usePlanner();
  const live = scale?.ranges.filter(Boolean) ?? [];
  const lo = live[0]?.lo, hi = live[live.length - 1]?.hi;
  return (
    <Card title="Key" aside={
      <div className="seg seg-s" role="radiogroup" aria-label="Shade ZIPs by">
        {Object.entries(SHADE_MODES).map(([id, m]) => (
          <button key={id} type="button" role="radio" aria-checked={shade === id} className={shade === id ? "on" : ""} onClick={() => setShade(id)} title={m.note}>
            {m.label}
          </button>
        ))}
      </div>
    } dock="bottom" className="c-legend">
      <div className="ramp" aria-label={SHADE_MODES[shade].note}>
        {(scale?.colors ?? []).map((c, i) => (
          <i key={c} style={{ background: c }} title={scale.ranges[i] ? `${short(scale.ranges[i].lo, shade)}–${short(scale.ranges[i].hi, shade)} ${SHADE_MODES[shade].unit} (${scale.ranges[i].n} ZIPs)` : "no ZIPs in this class"} />
        ))}
      </div>
      <div className="ramp-l">
        <span>{lo != null ? short(lo, shade) : "–"}</span>
        <span>{SHADE_MODES[shade].unit}</span>
        <span>{hi != null ? short(hi, shade) : "–"}</span>
      </div>
      <ul className="lg-keys">
        <li><i className="k-hatch" /> Not covered</li>
        <li><i className="k-pin">1</i> Center</li>
        <li><i className="k-ring" /> {R} mi</li>
      </ul>
    </Card>
  );
}
