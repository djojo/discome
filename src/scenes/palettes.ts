import * as THREE from "three";
import type { ParamDef } from "./types";

type RGB = [number, number, number];
interface Palette {
  label: string;
  a: RGB;
  b: RGB;
  c: RGB;
  d: RGB;
}

/** Cosine palettes (Inigo Quilez): color(t) = a + b·cos(2π(c·t + d)). Shared by 2D and GLSL scenes. */
export const PALETTES: Record<string, Palette> = {
  acid: { label: "Acide", a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [1, 1, 1], d: [0, 0.33, 0.67] },
  neon: { label: "Néon", a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [2, 1, 0], d: [0.5, 0.2, 0.25] },
  sunset: { label: "Couchant", a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [1, 1, 0.5], d: [0.8, 0.9, 0.3] },
  ocean: { label: "Océan", a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [1, 1, 1], d: [0.3, 0.2, 0.2] },
  fire: { label: "Feu", a: [0.8, 0.5, 0.4], b: [0.2, 0.4, 0.2], c: [2, 1, 1], d: [0, 0.25, 0.25] },
  ice: { label: "Glace", a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [1, 0.7, 0.4], d: [0, 0.15, 0.2] },
};

export const paletteOptions = Object.entries(PALETTES).map(([value, p]) => ({ value, label: p.label }));

export function paletteParam(def = "acid"): ParamDef {
  return { type: "select", key: "palette", label: "Palette", options: paletteOptions, default: def };
}

export function getPalette(key: unknown): Palette {
  return PALETTES[String(key)] ?? PALETTES.acid;
}

export function palRGB(p: Palette, t: number): RGB {
  const k = Math.PI * 2;
  return [
    p.a[0] + p.b[0] * Math.cos(k * (p.c[0] * t + p.d[0])),
    p.a[1] + p.b[1] * Math.cos(k * (p.c[1] * t + p.d[1])),
    p.a[2] + p.b[2] * Math.cos(k * (p.c[2] * t + p.d[2])),
  ];
}

export function palCss(p: Palette, t: number, alpha = 1): string {
  const [r, g, b] = palRGB(p, t);
  const c = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  return `rgba(${c(r)},${c(g)},${c(b)},${alpha})`;
}

export const PALETTE_GLSL = /* glsl */ `
uniform vec3 uPalA;
uniform vec3 uPalB;
uniform vec3 uPalC;
uniform vec3 uPalD;
vec3 pal(float t) { return uPalA + uPalB * cos(6.2831853 * (uPalC * t + uPalD)); }
`;

export function paletteUniforms() {
  return {
    uPalA: { value: new THREE.Vector3() },
    uPalB: { value: new THREE.Vector3() },
    uPalC: { value: new THREE.Vector3() },
    uPalD: { value: new THREE.Vector3() },
  };
}

export function applyPalette(u: ReturnType<typeof paletteUniforms>, key: unknown) {
  const p = getPalette(key);
  u.uPalA.value.fromArray(p.a);
  u.uPalB.value.fromArray(p.b);
  u.uPalC.value.fromArray(p.c);
  u.uPalD.value.fromArray(p.d);
}
