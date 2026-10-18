export default function Card({ title, aside, className = "", dock, children, ...rest }) {
  return (
    <section className={`card ${className}`.trim()} data-dock={dock} {...rest}>
      {title && (
        <header className="card-h">
          <h3>{title}</h3>
          {aside != null && <span className="card-aside">{aside}</span>}
        </header>
      )}
      {children}
    </section>
  );
}
