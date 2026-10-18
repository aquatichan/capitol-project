import { useState } from "react";

// A range input with a printed scale. The thumb glides freely while dragging; the value it reports snaps to `step`.
export default function Slider({ value, min, max, step = 1, onChange, ticks = [], label, valueText }) {
  const [raw, setRaw] = useState(null);
  const shown = raw ?? value;
  const frac = (v) => (v - min) / (max - min);
  const snap = (v) => Math.max(min, Math.min(max, Math.round(v / step) * step));
  const release = () => setRaw(null);
  return (
    <div className="slider">
      <input
        type="range"
        min={min}
        max={max}
        step="any"
        value={shown}
        onChange={(e) => {
          const v = Number(e.target.value);
          setRaw(v);
          const s = snap(v);
          if (s !== value) onChange(s);
        }}
        onPointerUp={release}
        onBlur={release}
        onKeyDown={(e) => {
          const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
          if (!d) return;
          e.preventDefault();
          setRaw(null);
          onChange(snap(value + d * step));
        }}
        aria-label={label}
        aria-valuetext={valueText}
        style={{ "--p": frac(shown) }}
      />
      <div className="slider-scale" aria-hidden="true">
        {ticks.map((t) => (
          <i key={t.at} style={{ "--f": frac(t.at) }}>
            {t.label && <em>{t.label}</em>}
          </i>
        ))}
      </div>
    </div>
  );
}
