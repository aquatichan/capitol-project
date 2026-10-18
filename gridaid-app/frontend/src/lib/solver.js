// Main-thread side of solver.worker.js: a worker per client, promise per request, results cached by request.
// `solve` is the planner's own worker. `solveSide` is a second one for the logistics page's extra comparisons, so
// they never queue ahead of the plan the map is showing.
function client() {
  let worker, seq = 0;
  const pending = new Map(), loaded = new Set(), cache = new Map();

  function call(op, args) {
    if (!worker) {
      worker = new Worker(new URL("./solver.worker.js", import.meta.url), { type: "module" });
      worker.onmessage = ({ data: { id, result, error } }) => {
        const p = pending.get(id);
        pending.delete(id);
        error ? p?.reject(new Error(error)) : p?.resolve(result);
      };
    }
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, op, ...args });
    });
  }

  return function solve(fips, county, op, args) {
    if (!loaded.has(fips)) {
      loaded.add(fips);
      call("load", { fips, zips: county.zips.map((z) => [z.lat, z.lon, z.w]), sites: county.sites.map((s) => [s.lat, s.lon, s.q ?? 0]) });
    }
    const key = JSON.stringify([fips, op, args]);
    if (!cache.has(key)) {
      if (cache.size > 200) cache.delete(cache.keys().next().value);
      cache.set(key, call(op, { fips, ...args }).catch((e) => { cache.delete(key); throw e; }));
    }
    return cache.get(key);
  };
}

export const solve = client();
export const solveSide = client();

// The logistics page's seven-algorithm comparison runs in its own worker. A newer request (another county, budget
// or reach) terminates the one in flight instead of queueing behind it, and nothing on the map page waits on it.
let side = null;
const sideCache = new Map();

export function solveLatest(fips, county, op, args) {
  const key = JSON.stringify([fips, op, args]);
  if (sideCache.has(key)) return Promise.resolve(sideCache.get(key));
  if (side) {
    side.worker.terminate();
    side.reject(new Error("superseded"));
  }
  const worker = new Worker(new URL("./solver.worker.js", import.meta.url), { type: "module" });
  return new Promise((resolve, reject) => {
    side = { worker, reject };
    worker.onmessage = ({ data: { id, result, error } }) => {
      if (id !== 2) return;                                   // 1 is the county load
      worker.terminate();
      if (side?.worker === worker) side = null;
      if (error) { reject(new Error(error)); return; }
      if (sideCache.size > 40) sideCache.delete(sideCache.keys().next().value);
      sideCache.set(key, result);
      resolve(result);
    };
    worker.postMessage({ id: 1, op: "load", fips, zips: county.zips.map((z) => [z.lat, z.lon, z.w]), sites: county.sites.map((s) => [s.lat, s.lon, s.q ?? 0]) });
    worker.postMessage({ id: 2, op, fips, ...args });
  });
}
