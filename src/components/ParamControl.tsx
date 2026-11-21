"use client";

import type { ParamDef, ParamValue } from "@/scenes";

interface Props {
  def: ParamDef;
  value: ParamValue;
  onChange: (value: ParamValue) => void;
}

/** Renders one scene setting from its declarative definition. */
export function ParamControl({ def, value, onChange }: Props) {
  if (def.type === "range") {
    const v = typeof value === "number" ? value : def.default;
    const decimals = (def.step ?? 0.01) >= 1 ? 0 : 2;
    return (
      <label className="field">
        <span className="field-head">
          <span>{def.label}</span>
          <span className="field-value">{v.toFixed(decimals)}</span>
        </span>
        <input
          type="range"
          min={def.min}
          max={def.max}
          step={def.step ?? 0.01}
          value={v}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </label>
    );
  }

  if (def.type === "toggle") {
    const v = typeof value === "boolean" ? value : def.default;
    return (
      <label className="field field-toggle">
        <span>{def.label}</span>
        <input type="checkbox" role="switch" checked={v} onChange={(e) => onChange(e.target.checked)} />
      </label>
    );
  }

  const v = typeof value === "string" ? value : def.default;
  return (
    <label className="field">
      <span className="field-head">
        <span>{def.label}</span>
      </span>
      <select value={v} onChange={(e) => onChange(e.target.value)}>
        {def.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
