"use client";

import type { ParamDef, ParamValue } from "@/scenes";

interface Props {
  def: ParamDef;
  value: ParamValue;
  onChange: (value: ParamValue) => void;
}

type SelectOption = Extract<ParamDef, { type: "select" }>["options"][number];

/** The options of a select, gathered into runs of the same group (no group: listed as they are). */
function optionGroups(options: SelectOption[]) {
  const out: { group?: string; options: SelectOption[] }[] = [];
  for (const o of options) {
    const last = out[out.length - 1];
    if (last && last.group === o.group) last.options.push(o);
    else out.push({ group: o.group, options: [o] });
  }
  return out;
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
        {optionGroups(def.options).map((g, i) =>
          g.group ? (
            <optgroup key={g.group} label={g.group}>
              {g.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ) : (
            g.options.map((o) => (
              <option key={`${i}:${o.value}`} value={o.value}>
                {o.label}
              </option>
            ))
          ),
        )}
      </select>
    </label>
  );
}
