import { useState } from "react";
import { sendForm } from "../../lib/forms.js";
import StarBorder from "../reactbits/StarBorder.jsx";
import SpotlightCard from "../reactbits/SpotlightCard.jsx";
import { PANEL_LIGHT } from "./panel.js";

const TYPES = ["Library", "School", "Community center", "Fire station", "Place of worship", "Other"];
const GETS = [
  "A backup power estimate for the building",
  "Help finding grant money for a generator",
  "A spot on the GridAid map",
  "A window sign so neighbors know where to go",
];
const OTHER = ["Volunteer at a site", "Check buildings in your county", "Bring GridAid to your county", "Join our team"];

function Choice({ name, options, value, onChange }) {
  return (
    <div className="jf-choice" role="radiogroup">
      {options.map((o) => (
        <label key={o} className={value === o ? "on" : ""}>
          <input type="radio" name={name} value={o} checked={value === o} onChange={() => onChange(o)} />
          {o}
        </label>
      ))}
    </div>
  );
}

// Sends to Formspree when VITE_FORMSPREE_JOIN is set (lib/forms.js); otherwise it checks the form and says nothing was sent.
export default function JoinForm() {
  const [f, setF] = useState({ gen: "", access: "" });
  const [state, setState] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));

  const submit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (!form.checkValidity()) { form.reportValidity(); return; }
    setState("sending");
    const r = await sendForm("join", Object.fromEntries(new FormData(form)));
    setState(r.ok ? "sent" : r.reason === "not-configured" ? "done" : "error");
  };

  return (
    <SpotlightCard className="join card rv" {...PANEL_LIGHT} spotlightColor="#ffc24a">
      <div className="join-pitch">
        <h3 className="join-h">Offer a building as a backup-power site</h3>
        <p className="join-lead">When the power is out for days, people who rely on medical equipment need somewhere to go. Your building can be that place.</p>
        <h4>What you get</h4>
        <ul className="join-gets">{GETS.map((g) => <li key={g}>{g}</li>)}</ul>
        <h4>What it involves</h4>
        <p>It's free. We pass your building to the county's emergency team, and you decide whether to take part.</p>
        <h4>Other ways to help</h4>
        <ul className="join-other">{OTHER.map((o) => <li key={o}>{o}</li>)}</ul>
      </div>

      {(state === "done" || state === "sent") && (
        <div className="join-done" role="status">
          <p className="join-kick">Thank you</p>
          <h3 className="join-h">{state === "sent" ? "We got your offer." : "Your building is noted."}</h3>
          <p>{state === "sent" ? "The GridAid team will email you, then pass the building to your county's emergency team." : "Sign-ups aren't connected to a county team yet, so nothing was sent. Keep this page open, or come back once counties are taking offers."}</p>
          <button type="button" className="jf-submit" onClick={() => setState(null)}>Edit the details</button>
        </div>
      )}
      <form className="jf" onSubmit={submit} noValidate hidden={state === "done" || state === "sent"}>
          <fieldset>
            <legend>The building</legend>
            <label className="jf-f wide"><span>Building name</span><input required name="building" placeholder="Main Street Library" autoComplete="organization" /></label>
            <label className="jf-f"><span>Type</span>
              <select required name="type" defaultValue=""><option value="" disabled>Choose one</option>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
            </label>
            <label className="jf-f"><span>About how many people fit</span><input name="capacity" type="number" min="1" inputMode="numeric" placeholder="60" /></label>
            <label className="jf-f wide"><span>Address</span><input required name="address" placeholder="Street, town, ZIP" autoComplete="street-address" /></label>
          </fieldset>
          <fieldset>
            <legend>You</legend>
            <label className="jf-f"><span>Your name</span><input required name="name" autoComplete="name" /></label>
            <label className="jf-f"><span>Your role</span><input name="role" placeholder="Owner, director, manager" autoComplete="organization-title" /></label>
            <label className="jf-f"><span>Email</span><input required name="email" type="email" autoComplete="email" /></label>
            <label className="jf-f"><span>Phone</span><input name="phone" type="tel" autoComplete="tel" /></label>
          </fieldset>
          <fieldset>
            <legend>Readiness</legend>
            <div className="jf-f"><span>Backup generator already?</span><Choice name="generator" options={["Yes", "No", "Not sure"]} value={f.gen} onChange={set("gen")} /></div>
            <div className="jf-f"><span>Step-free entrance?</span><Choice name="step_free" options={["Yes", "No"]} value={f.access} onChange={set("access")} /></div>
          </fieldset>
          <label className="jf-ok">
            <input type="checkbox" required name="consent" />
            <span>I'm allowed to offer this building, and GridAid may share these details with my county's emergency team.</span>
          </label>
          <input type="text" name="_gotcha" tabIndex={-1} autoComplete="off" className="hp" aria-hidden="true" />
          <StarBorder as="button" type="submit" className="jf-submit" disabled={state === "sending"} color="#ffc24a" radius={8} thickness={1.2} duration={5} backgroundColor="var(--card-3)" textColor="var(--ink)" borderColor="rgba(255, 194, 74, 0.28)">
            {state === "sending" ? "Sending…" : "Offer this building"}
          </StarBorder>
          {state === "error" && <p className="jf-err" role="alert">That didn't go through. Check your connection and try again.</p>}
      </form>
    </SpotlightCard>
  );
}
