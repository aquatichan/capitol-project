import { useEffect, useRef, useState } from "react";
import { areaOf } from "../../lib/scenario.js";

const ASK = (place) => [
  `Is anyone without power in ${place} right now?`,
  `What weather could knock out power in ${place} this week?`,
  `How did the last big outage in ${place} affect people's health?`,
];

// Floating assistant: grounded web search through /api/chat (backend/chat.py, Gemini). It gets the page's plan as
// context, so "what can the county do" answers use the sites and gaps on screen.
export default function Chat({ S }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef(null);
  const place = S.county?.name ?? "this county";
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs, busy]);

  const context = () => ({
    today: new Date().toLocaleDateString("en-CA"),       // the user's own date, YYYY-MM-DD (toISOString is UTC)
    county: S.county?.name, fips: S.fips,
    plan: S.ev && {
      sites: S.sites.length, reach_miles: S.R, generator: S.gen, people_reached: Math.round(S.ev.reached),
      people_not_reached: Math.round(S.ev.missed), percent_reached: +S.ev.pct.toFixed(1),
      zips_not_reached: S.ev.unreached.slice(0, 6).map((i) => ({ zip: S.county.zips[i].z, area: areaOf(S.county.zips[i].z), people: S.county.zips[i].w })),
    },
  });

  const send = async (text) => {
    const t = text.trim();
    if (!t || busy) return;
    const next = [...msgs, { role: "user", text: t }];
    setMsgs(next);
    setQ("");
    setBusy(true);
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next.filter((m) => !m.error), context: context() }) });
      const d = await r.json().catch(() => ({}));
      setMsgs((m) => [...m, r.ok ? { role: "assistant", text: d.text, sources: d.sources } : { role: "assistant", error: true, text: d.message ?? `Something went wrong (${r.status}).` }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", error: true, text: "Couldn't reach the server." }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`chat${open ? " is-open" : ""}`}>
      {open && (
        <section className="chat-panel" aria-label="Outage assistant">
          <header className="chat-h">
            <div>
              <b>Outages and storms, now</b>
              <span>Searches the web as you ask · {place}</span>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close the assistant">×</button>
          </header>
          <div className="chat-log" aria-live="polite">
            {msgs.length === 0 && (
              <div className="chat-empty">
                <p>Ask about current or recent outages, storms and heat or cold, and who they put at risk. Answers cite their sources.</p>
                {ASK(place.split(",")[0]).map((a) => <button key={a} type="button" onClick={() => send(a)}>{a}</button>)}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`chat-m ${m.role}${m.error ? " err" : ""}`}>
                <p>{m.text}</p>
                {m.sources?.length > 0 && (
                  <ol className="chat-src">
                    {m.sources.map((s) => <li key={s.uri}><a href={s.uri} target="_blank" rel="noreferrer">{s.title}</a></li>)}
                  </ol>
                )}
              </div>
            ))}
            {busy && <div className="chat-m assistant busy"><p>Searching…</p></div>}
            <div ref={end} />
          </div>
          <form className="chat-f" onSubmit={(e) => { e.preventDefault(); send(q); }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about outages, storms, heat…" maxLength={2000} aria-label="Your question" />
            <button type="submit" disabled={busy || !q.trim()}>Ask</button>
          </form>
          <p className="chat-legal">AI answers can be wrong. Not an emergency service: in an emergency, call 911.</p>
        </section>
      )}
      <button type="button" className="chat-fab" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? "Close" : "Ask about outages"}
      </button>
    </div>
  );
}
