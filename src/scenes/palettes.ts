import * as THREE from "three";
import type { ParamDef } from "./types";

type RGB = [number, number, number];

/**
 * A palette is an art-direction decision, not a rainbow:
 * - `base`: the dark the image sits on (background, deep shadows),
 * - `ramp`: 2–4 light colours; `pal(t)` glides back and forth along it,
 * - roles derived from the ramp: `ink` (main light / material) = first, `accent` (rare events) = last.
 * Colours are display values (no sRGB conversion anywhere in the pipeline).
 */
export interface Palette {
  label: string;
  base: RGB;
  ramp: RGB[];
  /** Art-directed (restrained) or legacy vivid. */
  family: "art" | "vivid";
}

const hex = (h: string): RGB => {
  const n = parseInt(h.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const P = (label: string, base: string, ramp: string[], family: Palette["family"] = "art"): Palette => ({
  label,
  base: hex(base),
  ramp: ramp.map(hex),
  family,
});

export const PALETTES: Record<string, Palette> = {
  // ---- art direction
  porcelain: P("Porcelaine", "#121110", ["#ECE7DF", "#CFC7BA", "#E5482D"]),
  mono: P("Noir & blanc", "#000000", ["#FFFFFF", "#9A9A9A"]),
  mercury: P("Mercure", "#07080B", ["#C9CDD3", "#3E6BFF", "#FF8A3D"]),
  signalRed: P("Rouge signal", "#050404", ["#FF2B1C", "#FF6A4D", "#FFE9E0"]),
  whiteLight: P("Lumière blanche", "#050506", ["#FFFFFF", "#DCE6F5"]),
  concrete: P("Béton", "#1B1D22", ["#8E8A83", "#B9B2A6", "#F2C48D"]),
  flesh: P("Chair", "#140808", ["#E8DCD2", "#D99A94", "#8E1420"]),
  cobalt: P("Cobalt", "#03050C", ["#3E6BFF", "#9DB4FF", "#FFFFFF"]),
  sodium: P("Sodium", "#0A0603", ["#FF8A3D", "#FFC58F", "#FFF1E0"]),
  bone: P("Os", "#0E0D0C", ["#E8E2D6", "#A39C90"]),
  desert: P("Désert", "#140A22", ["#E9A86C", "#C4532F", "#7B3FB0", "#FF3D8B"]),
  peyote: P("Peyote", "#060A20", ["#3FD9C8", "#7A4CFF", "#FF8A1F"]),
  cosmos: P("Cosmos", "#04030C", ["#5B7CFF", "#B04BFF", "#FF5A6E", "#FFD34E"]),
  mars: P("Mars", "#1A0705", ["#C4573A", "#E89A5B", "#53D8FB"]),
  mousse: P("Mousse", "#02060A", ["#7CFF4F", "#2E6BFF", "#FFE45C"]),
  fauve: P("Fauve", "#0B0806", ["#EFE6D6", "#B88A4A", "#F0A93B"]),
  // ---- legacy, vivid (kept for the "Classique" world)
  acid: P("Acide", "#000000", ["#B6FF00", "#FF00E1", "#00F0FF"], "vivid"),
  neon: P("Néon", "#05000A", ["#FF2A6D", "#D300C5", "#05D9E8"], "vivid"),
  sunset: P("Couchant", "#0A0410", ["#FF9E6B", "#C8456D", "#6B2E8E"], "vivid"),
  ocean: P("Océan", "#020818", ["#2D6CDF", "#0A3A8F", "#8FE3FF"], "vivid"),
  ice: P("Glace", "#03060A", ["#C8F0FF", "#7DD3FC", "#FFFFFF"], "vivid"),
  fire: P("Feu", "#0A0200", ["#FF3D00", "#FF9E00", "#FFE3A0"], "vivid"),
  chrome: P("Chrome", "#05070A", ["#D9E2EC", "#7DA3C8", "#FFFFFF"], "vivid"),
  vhs: P("VHS", "#0C0A10", ["#F4A6C0", "#7EC4CF", "#FFF2CC"], "vivid"),
};

export const paletteOptions = Object.entries(PALETTES).map(([value, p]) => ({ value, label: p.label }));

export function paletteParam(def = "porcelain"): ParamDef {
  return { type: "select", key: "palette", label: "Palette", options: paletteOptions, default: def };
}

export function getPalette(key: unknown): Palette {
  return PALETTES[String(key)] ?? PALETTES.mono;
}

export const ink = (p: Palette): RGB => p.ramp[0];
export const accent = (p: Palette): RGB => p.ramp[p.ramp.length - 1];

/** Back-and-forth along the ramp: t and t+1 give the same colour, like the old periodic palettes. */
export function palRGB(p: Palette, t: number): RGB {
  const x = 1 - Math.abs((t - Math.floor(t)) * 2 - 1);
  const f = x * (p.ramp.length - 1);
  const i = Math.min(p.ramp.length - 2, Math.floor(f));
  const k = f - i;
  const a = p.ramp[i];
  const b = p.ramp[i + 1];
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

export function palCss(p: Palette, t: number, alpha = 1): string {
  const [r, g, b] = palRGB(p, t);
  const c = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  return `rgba(${c(r)},${c(g)},${c(b)},${alpha})`;
}

export function rgbCss(c: RGB, alpha = 1): string {
  return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${alpha})`;
}

export const PALETTE_GLSL = /* glsl */ `
uniform vec3 uPal0;
uniform vec3 uPal1;
uniform vec3 uPal2;
uniform vec3 uPal3;
uniform float uPalN;
uniform vec3 uBase;
uniform vec3 uInk;
uniform vec3 uAccent;
vec3 pal(float t) {
  float x = 1.0 - abs(fract(t) * 2.0 - 1.0);
  float f = x * (uPalN - 1.0);
  vec3 c = mix(uPal0, uPal1, clamp(f, 0.0, 1.0));
  c = mix(c, uPal2, clamp(f - 1.0, 0.0, 1.0));
  c = mix(c, uPal3, clamp(f - 2.0, 0.0, 1.0));
  return c;
}
`;

export function paletteUniforms() {
  return {
    uPal0: { value: new THREE.Vector3() },
    uPal1: { value: new THREE.Vector3() },
    uPal2: { value: new THREE.Vector3() },
    uPal3: { value: new THREE.Vector3() },
    uPalN: { value: 2 },
    uBase: { value: new THREE.Vector3() },
    uInk: { value: new THREE.Vector3() },
    uAccent: { value: new THREE.Vector3() },
  };
}

export function applyPalette(u: ReturnType<typeof paletteUniforms>, key: unknown) {
  const p = getPalette(key);
  const r = p.ramp;
  const at = (i: number) => r[Math.min(i, r.length - 1)];
  u.uPal0.value.fromArray(at(0));
  u.uPal1.value.fromArray(at(1));
  u.uPal2.value.fromArray(at(2));
  u.uPal3.value.fromArray(at(3));
  u.uPalN.value = r.length;
  u.uBase.value.fromArray(p.base);
  u.uInk.value.fromArray(ink(p));
  u.uAccent.value.fromArray(accent(p));
}
