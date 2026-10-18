import { REFS } from "../../data/references.js";

// One APA reference: *text* becomes italics, and the URL (or DOI) follows as a link.
export default function Apa({ id, as: Tag = "p", className = "apa" }) {
  const r = REFS[id];
  if (!r) return null;
  const parts = r.apa.split("*");
  return (
    <Tag className={className}>
      {parts.map((t, i) => (i % 2 ? <i key={i}>{t}</i> : t))}
      {r.url && (
        <>
          {" "}
          <a href={r.url} target="_blank" rel="noreferrer">{r.url.replace(/^https?:\/\//, "")}</a>
        </>
      )}
    </Tag>
  );
}

export const apaPlain = (id) => {
  const r = REFS[id];
  return r ? `${r.apa.replace(/\*/g, "")}${r.url ? ` ${r.url}` : ""}` : "";
};
