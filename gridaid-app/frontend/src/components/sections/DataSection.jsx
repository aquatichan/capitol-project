import { useRef } from "react";
import SectionHead from "./SectionHead.jsx";
import StarBorder from "../reactbits/StarBorder.jsx";
import SpotlightCard from "../reactbits/SpotlightCard.jsx";
import DecryptedText from "../reactbits/DecryptedText.jsx";
import { PANEL_LIGHT } from "./panel.js";
import JoinForm from "./JoinForm.jsx";
import { useReveal } from "./useReveal.js";
import Apa from "../ui/Apa.jsx";
import { RESEARCH, SOURCE_GROUPS, REFS } from "../../data/references.js";
import { goTo } from "../../lib/route.js";

export default function DataSection() {
  const ref = useRef(null);
  useReveal(ref);
  return (
    <section className="sec data" id="data" ref={ref}>
      <SectionHead
        title={<DecryptedText text="Join Our Mission Towards a Safer and Connected Community" animateOn="view" sequential speed={22} characters="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" encryptedClassName="sec-t-enc" />}
        action={
          <StarBorder as="button" className="logistics-btn" onClick={() => goTo("logistics")} color="#ffc24a" radius={8} thickness={1.2} duration={5} backgroundColor="var(--card-3)" textColor="var(--ink)" borderColor="rgba(255, 194, 74, 0.28)">
            See logistics <span aria-hidden="true">→</span>
          </StarBorder>
        }
      />
      <div className="data-grid">
        <JoinForm />

        <div className="data-side">
          <SpotlightCard className="card rv refs" {...PANEL_LIGHT} spotlightColor="#5fd3e8">
            <header className="card-h"><h3>Sources</h3></header>
            {SOURCE_GROUPS.map(([group, ids]) => (
              <details key={group} className="refs-g" open={group === "Data"}>
                <summary>{group} <span>{ids.length}</span></summary>
                <ol>
                  {ids.map((id) => (
                    <li key={id}>
                      <Apa id={id} />
                      {REFS[id].use && <p className="refs-use">{REFS[id].use}</p>}
                    </li>
                  ))}
                </ol>
              </details>
            ))}
          </SpotlightCard>
        </div>
      </div>
    </section>
  );
}
