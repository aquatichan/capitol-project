// $1,234 under $100k, $1.17M above: the way a budget line is read aloud at a council meeting.
export const money = (v) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", notation: v >= 1e5 ? "compact" : "standard", maximumFractionDigits: v >= 1e5 ? 2 : 0 });

export const kw = (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)} MW` : `${Math.round(v)} kW`);
