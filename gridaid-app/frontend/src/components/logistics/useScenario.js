import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlanner } from "../../state/PlannerContext.jsx";
import { MODES } from "../../lib/usePlan.js";
import { solve, solveLatest, solveSide } from "../../lib/solver.js";
import { hav } from "../../lib/plan.js";
import { siteName } from "../../lib/format.js";
import { evaluate } from "../../lib/scenario.js";

const EMPTY = { moved: {}, radius: {}, removed: [], added: [] };

// The simulator's state. County, centers, reach, generator type and the three placement modes are the planner's own
// state (shared with the map page, so a change here shows there). Hand edits (dragged sites, per-site reach, added
// or removed sites) and the seven extra algorithms live only on this page.
export function useScenario() {
  const P = usePlanner();
  const { fips, county, plan, R, k, mode, setMode, D } = P;
  const [method, setMethodRaw] = useState(mode);
  const [edits, setEdits] = useState(EMPTY);
  const [placements, setPlacements] = useState(null);
  const [modeCov, setModeCov] = useState({});
  const [contacts, setContacts] = useState({});

  useEffect(() => { setEdits(EMPTY); }, [fips]);
  useEffect(() => { if (mode in MODES && method in MODES && mode !== method) setMethodRaw(mode); }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const setMethod = useCallback((m) => {
    setMethodRaw(m);
    if (m in MODES) setMode(m);
  }, [setMode]);

  // all seven algorithms' placements for this county, budget and reach (worker, debounced)
  const pkey = county ? `${fips}|${k}|${R}` : null;
  useEffect(() => {
    if (!pkey) return;
    let live = true;
    const t = setTimeout(() => solveLatest(fips, county, "placements", { k, R, ms: 1200 }).then((rows) => live && setPlacements({ key: pkey, rows })).catch(() => {}), 250);
    return () => { live = false; clearTimeout(t); };
  }, [pkey]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = placements?.key === pkey ? placements.rows : null;

  // coverage of the robust and optimal plans even when another method is showing, so they can be compared
  useEffect(() => {
    if (!pkey || !D) return;
    let live = true;
    const Z = county.zips.length;
    const covOf = (sel) => {
      let w = 0;
      county.zips.forEach((z, i) => { if (sel.some((s) => D[s * Z + i] <= R)) w += z.w; });
      return (100 * w) / (county.total || 1);
    };
    setModeCov({});
    // the planner already asks its own worker for its current mode (same request, so it is shared); the other
    // mode goes to the side worker so it never delays the plan on the map
    ["robust", "optimal"].forEach((m) =>
      (m === mode ? solve : solveSide)(fips, county, "plan", { method: m, k, R }).then((r) => live && setModeCov((x) => ({ ...x, [m]: covOf(r.sel) }))).catch(() => {})
    );
    return () => { live = false; };
  }, [pkey, D, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!fips) return;
    let live = true;
    setContacts({});
    fetch(`/contacts/${fips}.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((d) => live && setContacts(d));
    return () => { live = false; };
  }, [fips]);

  const isMode = method in MODES;
  const row = !isMode && rows ? rows.find((r) => r.key === method) : null;
  const base = useMemo(() => {
    if (!county) return [];
    if (row) return row.sel.map((idx) => ({ ...county.sites[idx], idx }));
    return plan?.chosen ?? [];
  }, [county, row, plan]);
  const pending = isMode ? !!plan?.pending : !row;

  const sites = useMemo(() => {
    const out = base
      .filter((c) => !edits.removed.includes(`s${c.idx}`))
      .map((c) => {
        const key = `s${c.idx}`, mv = edits.moved[key], nm = siteName(c);
        return { key, idx: c.idx, name: nm.name, unnamed: nm.unnamed, osm: nm.osm, type: c.type, lat: mv?.lat ?? c.lat, lon: mv?.lon ?? c.lon, from: mv ? { lat: c.lat, lon: c.lon } : null, r: edits.radius[key] ?? R, moved: !!mv };
      });
    edits.added.forEach((a, i) => out.push({ key: a.key, idx: null, name: a.name ?? `Added site ${i + 1}`, custom: true, type: "custom", lat: a.lat, lon: a.lon, r: edits.radius[a.key] ?? R, moved: false }));
    return out;
  }, [base, edits, R]);

  const ev = useMemo(() => (county ? evaluate(county, sites) : null), [county, sites]);

  // what the last change of method or budget did: departed sites, arrivals, and a line from each to the nearest
  // only changes the user made count: the swap from a stand-in plan to the solved one on load is not a "shift"
  const prev = useRef(null);
  const [shift, setShift] = useState(null);
  useEffect(() => {
    if (pending) return;
    const before = prev.current;
    prev.current = base;
    if (!before?.length || before === base) return;
    const now = new Set(base.map((c) => c.idx)), was = new Set(before.map((c) => c.idx));
    const from = before.filter((c) => !now.has(c.idx)), to = base.filter((c) => !was.has(c.idx));
    if (!from.length && !to.length) { setShift(null); return; }
    const lines = from.map((g) => {
      let b = null, bd = Infinity;
      to.forEach((c) => { const d = hav(g.lat, g.lon, c.lat, c.lon); if (d < bd) { bd = d; b = c; } });
      return b ? [g, b] : null;
    }).filter(Boolean);
    setShift({ from, to, lines, kept: base.length - to.length });
  }, [base, pending]);
  useEffect(() => { setShift(null); }, [fips]);

  const edit = useMemo(() => ({
    move: (key, lat, lon) => setEdits((e) => key.startsWith("a")
      ? { ...e, added: e.added.map((a) => (a.key === key ? { ...a, lat, lon } : a)) }
      : { ...e, moved: { ...e.moved, [key]: { lat, lon } } }),
    radius: (key, r) => setEdits((e) => ({ ...e, radius: { ...e.radius, [key]: r } })),
    unmove: (key) => setEdits((e) => { const moved = { ...e.moved }; delete moved[key]; const radius = { ...e.radius }; delete radius[key]; return { ...e, moved, radius }; }),
    remove: (key) => setEdits((e) => (key.startsWith("a") ? { ...e, added: e.added.filter((a) => a.key !== key) } : { ...e, removed: [...e.removed, key] })),
    add: (lat, lon, name) => setEdits((e) => ({ ...e, added: [...e.added, { key: `a${Date.now()}`, lat, lon, name }] })),
    reset: () => setEdits(EMPTY),
  }), []);
  const edited = edits.added.length + edits.removed.length + Object.keys(edits.moved).length + Object.keys(edits.radius).length;

  return { ...P, method, setMethod, rows, modeCov, base, sites, ev, shift, edit, edited, pending, contacts };
}
