export const fmt = (n) => Math.round(n).toLocaleString("en-US");
export const fmt1 = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// HHS publishes any true count of 1-10 as 11, so a flagged ZIP is "1 to 10", not 11.
export const peopleLabel = (z) => (z.masked ? "1–10" : fmt(z.w));

export const miles = (d) => (d < 10 ? d.toFixed(1) : Math.round(d).toString());

export const KIND = {
  library: "Library",
  school: "School",
  community_centre: "Community center",
  fire_station: "Fire station",
};

// fetch_sites.py names unnamed OpenStreetMap features like "School (w1527648399)"; say what they are instead.
export function siteName(s) {
  const m = /^(.*?)\s*\(([nwr])(\d+)\)$/.exec(s.name);
  if (!m) return { name: s.name, unnamed: false };
  const what = (KIND[s.type] ?? "Site").toLowerCase();
  return { name: `Unnamed ${what}`, unnamed: true, osm: `OSM ${{ n: "node", w: "way", r: "relation" }[m[2]]} ${m[3]}` };
}
