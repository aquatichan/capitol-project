export default function SectionHead({ title, kicker, action }) {
  return (
    <header className="sec-head rv">
      <div>
        <h2 className="sec-t">{title}</h2>
        {kicker && <p className="sec-k">{kicker}</p>}
      </div>
      {action && <div className="sec-act">{action}</div>}
    </header>
  );
}
