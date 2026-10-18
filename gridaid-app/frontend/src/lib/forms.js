// Formspree for every form on the site. Each form has its own Formspree form ID in an env var:
//   VITE_FORMSPREE_JOIN      the "offer a building" form on the map page
//   VITE_FORMSPREE_PETITION  the petition on the logistics page
// Without an ID the form still works locally (PDFs, checks) and simply says it isn't connected yet.
const IDS = {
  join: import.meta.env.VITE_FORMSPREE_JOIN,
  petition: import.meta.env.VITE_FORMSPREE_PETITION,
};

export const formReady = (kind) => !!IDS[kind];

export async function sendForm(kind, data) {
  const id = IDS[kind];
  if (!id) return { ok: false, reason: "not-configured" };
  if (data._gotcha) return { ok: true };                 // a bot filled the hidden field: pretend it worked
  try {
    const r = await fetch(`https://formspree.io/f/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ...data, _subject: `GridAid ${kind}${data.county ? `: ${data.county}` : ""}` }),
    });
    if (r.ok) return { ok: true };
    const body = await r.json().catch(() => ({}));
    return { ok: false, reason: "rejected", errors: body.errors ?? [] };
  } catch {
    return { ok: false, reason: "network" };
  }
}
