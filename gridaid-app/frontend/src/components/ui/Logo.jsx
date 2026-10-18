// The wordmark is an image file in frontend/public/. The site is dark, so it uses the light version
// (GridAid_LOGO.svg with the ink turned off-white, rendered to PNG); GridAid_LOGO_mono.png is the all-gray one for the footer.
export const LOGO_SRC = "/GridAid_LOGO_light.png";
export const LOGO_MONO = "/GridAid_LOGO_mono.png";

export default function Logo({ className = "", src = LOGO_SRC }) {
  return (
    <span className={`logo ${className}`.trim()} role="img" aria-label="GridAid">
      <img className="logo-img" src={src} alt="" />
    </span>
  );
}

// The same image for the hero, cut between "Grid" and "Aid" so the two halves can sit apart with the laser between
// them (each half is a clipped copy of the image; see .lg-half in stage.css). Each has its own mask for the rise animation (`.lg-ch`).
export function LogoRise({ className = "" }) {
  return (
    <span className={`logo logo-rise ${className}`.trim()} role="img" aria-label="GridAid">
      {["grid", "aid"].map((half) => (
        <span key={half} className={`lg-half lg-${half}`} aria-hidden="true">
          <span className="lg-mask"><img className="lg-ch logo-img" src={LOGO_SRC} alt="" /></span>
        </span>
      ))}
    </span>
  );
}
