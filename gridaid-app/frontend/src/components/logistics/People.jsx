import { fmt, miles, peopleLabel } from "../../lib/format.js";
import { areaOf, serviceSplit } from "../../lib/scenario.js";
import logistics from "../../data/logistics.json";

// Who the plan helps and who it leaves out, by the kind of care they rely on. The split by service is an estimate:
// the county's own mix (workbook) applied to the people reached and missed.
export default function People({ S, onAddAt }) {
  const { fips, county, ev, sites } = S;
  if (!county || !ev) return null;
  const T = logistics.counties[fips];
  const split = serviceSplit(fips, ev.reached, ev.missed);
  const left = ev.unreached.slice(0, 8).map((i) => ({ z: county.zips[i], i }));

  return (
    <section className="lg-sec lg-people" aria-labelledby="lg-people-h">
      <h2 id="lg-people-h" className="lg-h2">Who the plan helps, and who it doesn't</h2>
      <div className="lg-people-grid">
        <article className="lg-card lg-tally">
          <p className="lg-lede">
            You're reaching <b>{fmt(ev.reached)}</b> people across <b>{sites.length}</b> site{sites.length === 1 ? "" : "s"}.
            {ev.missed > 0.5 ? <> <b className="miss">{fmt(ev.missed)}</b> still live farther than a site can reach.</> : " Everyone in the ZIP data is within reach."}
          </p>
          <div className="lg-split" role="img" aria-label={`${ev.pct.toFixed(1)} percent reached`}>
            <i style={{ width: `${ev.pct}%` }} />
          </div>
          <p className="lg-split-l"><span>{ev.pct.toFixed(1)}% reached</span><span>{(100 - ev.pct).toFixed(1)}% not</span></p>
          {split ? (
            <>
              <table className="lg-svc">
                <caption>Of them, also receiving <span>estimated from the county mix</span></caption>
                <thead><tr><th></th><th>Reached</th><th>Not reached</th></tr></thead>
                <tbody>
                  {split.map((s) => (
                    <tr key={s.key}>
                      <th>{s.label}<small>{fmt(s.county)} in the county</small></th>
                      <td>{fmt(s.reached)}</td>
                      <td className={s.missed >= 0.5 ? "miss" : ""}>{fmt(s.missed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="lg-note">Services overlap: one person can use more than one. {fmt(T.rely)} people in {T.name.split(",")[0]} rely on powered equipment by the county count; the ZIP data shows {fmt(county.total)}.</p>
            </>
          ) : (
            <p className="lg-note">A breakdown by home oxygen, dialysis, home health and hospice is only in the workbook for its ten counties.</p>
          )}
        </article>

        <article className="lg-card lg-left">
          <h3 className="lg-h3">Not reached yet</h3>
          {left.length === 0 ? (
            <p className="lg-note">No ZIP is outside every site's reach.</p>
          ) : (
            <ol className="lg-left-l">
              {left.map(({ z, i }) => (
                <li key={z.z}>
                  <span className="z">{z.z}{areaOf(z.z) ? <small>{areaOf(z.z)}</small> : null}</span>
                  <span className="p">{peopleLabel(z)}</span>
                  <span className="d">{ev.near[i] >= 0 ? `${miles(ev.nearD[i])} mi to #${ev.near[i] + 1}` : "no site"}</span>
                  <button type="button" className="mini" onClick={() => onAddAt(z)}>Add a site here</button>
                </li>
              ))}
            </ol>
          )}
          {ev.unreached.length > left.length && <p className="lg-note">and {ev.unreached.length - left.length} smaller ZIPs.</p>}
        </article>
      </div>
    </section>
  );
}
