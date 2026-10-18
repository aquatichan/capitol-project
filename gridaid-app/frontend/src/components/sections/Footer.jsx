import Logo, { LOGO_MONO } from "../ui/Logo.jsx";

export default function Footer() {
  return (
    <footer className="foot-sec">
      {/* the wordmark across the whole width, all gray, fading out toward the bottom of the page */}
      <Logo className="foot-mark" src={LOGO_MONO} />
    </footer>
  );
}
