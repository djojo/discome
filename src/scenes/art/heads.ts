import * as THREE from "three";
import { titleShape } from "@/brand/shape";
import { cook } from "./sculpt/oven";
import type { ParamDef, ParamValues } from "../types";

/** The families of the head library (the "Tête" setting lists them in this order). */
export const HEAD_FAMILIES = [
  { id: "animal", label: "Animaux" },
  { id: "visage", label: "Visages" },
  { id: "archetype", label: "Archétypes" },
  { id: "masque", label: "Masques" },
  { id: "sculpture", label: "Sculptures du monde" },
] as const;
export type HeadFamily = (typeof HEAD_FAMILIES)[number]["id"];

/**
 * What may be done with a head: "code" (sculpted by us), "cc0" (public domain), "cc-by" (free, credit due),
 * "personnel" (a Printables bust: personal use, see public/heads/CREDITS.md).
 */
export type HeadLicence = "code" | "cc0" | "cc-by" | "personnel";

/**
 * Where a head's field comes from: "sculpted" (a function of lib.glsl.ts, evaluated live), "file" (a grid baked by
 * scripts/bake-heads.mjs from a model, public/heads/<id>.sdf.gz), "code" (sculpted in code, sculpt/sculpt.glsl.ts,
 * and cooked into a grid on the graphics card at first use: nothing to download).
 */
export type HeadKind = "sculpted" | "file" | "code";

interface HeadInfo {
  id: string;
  label: string;
  family: HeadFamily;
  licence: HeadLicence;
  kind: HeadKind;
}

/**
 * The head library: real sculpted busts (Printables, see public/heads/CREDITS.md) baked by scripts/bake-heads.mjs
 * into signed distance grids, so every head effect (shell, shards, contour lines, halftone, chrome…) works with
 * any of them; heads sculpted in code (sculpt/), cooked into the same grids by the oven; "humain" and "patron",
 * sculpted heads of lib.glsl.ts evaluated live.
 */
export const HEADS = [
  { id: "humain", label: "Humain", family: "visage", licence: "code", kind: "sculpted" },
  { id: "patron", label: "Le Patron", family: "archetype", licence: "code", kind: "sculpted" },
  { id: "tresses", label: "Tresses", family: "visage", licence: "code", kind: "code" },
  { id: "chignon", label: "Chignon", family: "visage", licence: "code", kind: "code" },
  { id: "afro", label: "Afro", family: "visage", licence: "code", kind: "code" },
  { id: "aieule", label: "L'Aïeule", family: "visage", licence: "code", kind: "code" },
  { id: "jeune", label: "Le Jeune Homme", family: "visage", licence: "code", kind: "code" },
  { id: "locks", label: "Locks", family: "visage", licence: "code", kind: "code" },
  { id: "barbu", label: "Le Barbu", family: "visage", licence: "code", kind: "code" },
  { id: "aieul", label: "L'Aïeul", family: "visage", licence: "code", kind: "code" },
  { id: "tigre", label: "Tigre", family: "animal", licence: "personnel", kind: "file" },
  { id: "loup", label: "Loup", family: "animal", licence: "personnel", kind: "file" },
  { id: "faucon", label: "Faucon", family: "animal", licence: "personnel", kind: "file" },
  { id: "lion", label: "Lion", family: "animal", licence: "personnel", kind: "file" },
  { id: "hibou", label: "Hibou", family: "animal", licence: "personnel", kind: "file" },
  { id: "belier", label: "Bélier", family: "animal", licence: "personnel", kind: "file" },
  { id: "cobra", label: "Cobra", family: "animal", licence: "code", kind: "code" },
  { id: "moai", label: "Moai", family: "sculpture", licence: "personnel", kind: "file" },
  { id: "nefertiti", label: "Néfertiti", family: "sculpture", licence: "personnel", kind: "file" },
] as const satisfies readonly HeadInfo[];

export type HeadId = (typeof HEADS)[number]["id"];

/**
 * Not a head: the night's title or logo (brand/shape.ts), sculpted like one. Its typeface and relief come from the
 * plan's settings (titleFont, titleRelief "cut" | "puffy", titleDepth).
 */
export const TITLE_HEAD = "titre";

export const headParam = (def: HeadId = "humain"): ParamDef => ({
  type: "select",
  key: "head",
  label: "Tête",
  options: [
    ...HEAD_FAMILIES.flatMap((fam) =>
      HEADS.filter((h) => h.family === fam.id).map((h) => ({ value: h.id, label: h.label, group: fam.label })),
    ),
    { value: TITLE_HEAD, label: "Titre de la soirée" },
  ],
  default: def,
});

const headInfo = (id: unknown): HeadInfo | undefined => HEADS.find((h) => h.id === id);
/** The heads whose field is a grid (a file to load, or cooked from code): the others are sculpted live, or the title. */
const isBaked = (id: unknown): id is HeadId => {
  const k = headInfo(id)?.kind;
  return k === "file" || k === "code";
};

export interface HeadGrid {
  tex: THREE.Data3DTexture;
  min: THREE.Vector3;
  size: THREE.Vector3;
  /** Let go of its texture (a cooked head: its render target). */
  dispose?: () => void;
}

const loaded = new Map<string, HeadGrid>();
const loading = new Map<string, Promise<HeadGrid | null>>();

async function fetchGrid(id: string): Promise<HeadGrid | null> {
  try {
    const res = await fetch(`/heads/${id}.sdf.gz`);
    if (!res.ok || !res.body) return null;
    let buf = await res.arrayBuffer();
    // still gzipped unless the server sent it with Content-Encoding
    const b = new Uint8Array(buf, 0, 2);
    if (b[0] === 0x1f && b[1] === 0x8b) {
      buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    }
    const v = new DataView(buf);
    if (String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3)) !== "SDF1") return null;
    const nx = v.getUint16(4, true);
    const ny = v.getUint16(6, true);
    const nz = v.getUint16(8, true);
    const f = (o: number) => v.getFloat32(o, true);
    const min = new THREE.Vector3(f(12), f(16), f(20));
    const size = new THREE.Vector3(f(24), f(28), f(32)).sub(min);
    const tex = new THREE.Data3DTexture(new Uint16Array(buf, 36, nx * ny * nz), nx, ny, nz);
    tex.format = THREE.RedFormat;
    tex.type = THREE.HalfFloatType;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = tex.wrapR = THREE.ClampToEdgeWrapping;
    tex.unpackAlignment = 2;
    tex.needsUpdate = true;
    const grid = { tex, min, size };
    loaded.set(id, grid);
    return grid;
  } catch {
    return null;
  }
}

/** A head sculpted in code, cooked into its grid by the oven (sculpt/oven.ts). */
async function cookGrid(id: string): Promise<HeadGrid | null> {
  const grid = await cook(id);
  if (grid) loaded.set(id, grid);
  return grid;
}

/** Start loading a head (no-op if loaded, loading, or the sculpted human head). */
export function loadHead(id: unknown): Promise<HeadGrid | null> {
  if (!isBaked(id)) return Promise.resolve(null);
  const done = loaded.get(id);
  if (done) return Promise.resolve(done);
  let p = loading.get(id);
  if (!p) {
    p = headInfo(id)?.kind === "code" ? cookGrid(id) : fetchGrid(id);
    loading.set(id, p);
  }
  return p;
}

/** Warm the cache, e.g. with the heads of a world's plans, so a head never pops in late. */
export function preloadHeads(ids: Iterable<unknown>) {
  for (const id of ids) void loadHead(id);
}

/**
 * Let go of the loaded heads that are not in `keep` (the heads of the worlds still on): their texture leaves the
 * graphics card. A scene that still shows one keeps it until it changes heads; asked for again, it loads again.
 */
export function releaseHeads(keep: Iterable<unknown>) {
  const k = new Set(keep);
  for (const [id, g] of loaded) {
    if (k.has(id)) continue;
    if (g.dispose) g.dispose();
    else g.tex.dispose();
    loaded.delete(id);
    loading.delete(id);
  }
}

/** The grid if it is ready; starts loading it otherwise. */
export function headGrid(id: unknown): HeadGrid | undefined {
  if (!isBaked(id)) return undefined;
  const g = loaded.get(id);
  if (!g) void loadHead(id);
  return g;
}

let placeholder: THREE.Data3DTexture | null = null;
function emptyTexture() {
  if (!placeholder) {
    placeholder = new THREE.Data3DTexture(new Uint16Array([THREE.DataUtils.toHalfFloat(1)]), 1, 1, 1);
    placeholder.format = THREE.RedFormat;
    placeholder.type = THREE.HalfFloatType;
    placeholder.needsUpdate = true;
  }
  return placeholder;
}

/**
 * The head slots a scene can load at once: "" (uHead*, HEAD_GLSL), then "B", "C", "D" for more heads at the same
 * time (uHeadTexB…, headSlotGLSL). Each slot is one 3D texture.
 */
export const HEAD_SLOTS = ["", "B", "C", "D"] as const;

/** Uniforms of one head slot: suffix "" for uHead*, or "B", "C", "D" for more heads (uHeadTexB…). */
export function headUniforms(suffix = "") {
  return {
    [`uHeadTex${suffix}`]: { value: emptyTexture() },
    [`uHeadOn${suffix}`]: { value: 0 },
    [`uHeadMin${suffix}`]: { value: new THREE.Vector3() },
    [`uHeadSize${suffix}`]: { value: new THREE.Vector3(1, 1, 1) },
    [`uHeadRelief${suffix}`]: { value: new THREE.Vector2(0.1, 0.01) },
  };
}

/** The title's relief: half its depth and the radius of its edges (scene units). */
function titleRelief(stroke: number, p?: ParamValues): [number, number] {
  if (p?.titleRelief === "puffy") {
    const r = Math.min(stroke * 0.9, 0.1);
    return [r, r];
  }
  const depth = typeof p?.titleDepth === "number" ? p.titleDepth : 0.12;
  return [depth, Math.min(0.012, stroke * 0.3)];
}

/**
 * Point a head slot at a head. While a baked head is still loading, the slot shows the sculpted one; while the title
 * is being drawn, nothing. Returns whether the requested head is on screen. `p`: the plan's settings (the title's
 * typeface and relief).
 */
export function setHead(u: Record<string, THREE.IUniform>, id: unknown, suffix = "", p?: ParamValues) {
  if (id === TITLE_HEAD) {
    const t = titleShape(p?.titleFont, p?.titleWorld);
    u[`uHeadOn${suffix}`].value = t ? 2 : 3;
    if (t) {
      u[`uHeadTex${suffix}`].value = t.tex;
      (u[`uHeadMin${suffix}`].value as THREE.Vector3).copy(t.min);
      (u[`uHeadSize${suffix}`].value as THREE.Vector3).copy(t.size);
      (u[`uHeadRelief${suffix}`].value as THREE.Vector2).set(...titleRelief(t.stroke, p));
    }
    return !!t;
  }
  // the sculpted heads: 0 the human head, .25 the Patron (both "sculpted" for the scenes, which test < .5)
  if (id === "patron") {
    u[`uHeadOn${suffix}`].value = 0.25;
    return true;
  }
  const g = headGrid(id);
  u[`uHeadOn${suffix}`].value = g ? 1 : 0;
  if (g) {
    u[`uHeadTex${suffix}`].value = g.tex;
    (u[`uHeadMin${suffix}`].value as THREE.Vector3).copy(g.min);
    (u[`uHeadSize${suffix}`].value as THREE.Vector3).copy(g.size);
  }
  return !!g || !isBaked(id);
}

/**
 * GLSL: headD(p), the head of the scene in the frame of sdHead (y up, facing +z), sculpted or baked (a baked
 * bust floats, cut flat under its neck), or the night's title. headBound(p) is a cheap distance that never exceeds
 * the head's. Needs ART_LIB. uHeadOn: 0 sculpted head (.25 the Patron), 1 baked head, 2 title, 3 nothing (the title is
 * being drawn).
 */
export const HEAD_GLSL = /* glsl */ `
uniform highp sampler3D uHeadTex;
uniform float uHeadOn;
uniform vec3 uHeadMin;
uniform vec3 uHeadSize;
uniform vec2 uHeadRelief;

/**
 * Cubic B-spline sampling from 8 linear fetches (Sigg & Hadwiger): a smooth field, so normals and highlights
 * do not show the voxels the way plain trilinear sampling does.
 */
float tricubic(highp sampler3D tex, vec3 uvw) {
  vec3 res = vec3(textureSize(tex, 0));
  vec3 c = uvw * res - .5;
  vec3 i = floor(c);
  vec3 f = c - i;
  vec3 f2 = f * f, f3 = f2 * f;
  vec3 w0 = (1. - 3. * f + 3. * f2 - f3) / 6.;
  vec3 w1 = (4. - 6. * f2 + 3. * f3) / 6.;
  vec3 w2 = (1. + 3. * f + 3. * f2 - 3. * f3) / 6.;
  vec3 w3 = f3 / 6.;
  vec3 g0 = w0 + w1, g1 = w2 + w3;
  vec3 h0 = (i - .5 + w1 / g0) / res;
  vec3 h1 = (i + 1.5 + w3 / g1) / res;
  float a = mix(textureLod(tex, h1, 0.).r, textureLod(tex, vec3(h0.x, h1.yz), 0.).r, g0.x);
  float b = mix(textureLod(tex, vec3(h1.x, h0.y, h1.z), 0.).r, textureLod(tex, vec3(h0.xy, h1.z), 0.).r, g0.x);
  float cz1 = mix(a, b, g0.y);
  a = mix(textureLod(tex, vec3(h1.xy, h0.z), 0.).r, textureLod(tex, vec3(h0.x, h1.y, h0.z), 0.).r, g0.x);
  b = mix(textureLod(tex, vec3(h1.x, h0.yz), 0.).r, textureLod(tex, h0, 0.).r, g0.x);
  float cz0 = mix(a, b, g0.y);
  return mix(cz1, cz0, g0.z);
}

/** Distance to a baked head: the grid inside its box (smooth near the surface), plus the distance to the box. */
float bakedHead(highp sampler3D tex, vec3 bmin, vec3 bsize, vec3 p) {
  vec3 uvw = (p - bmin) / bsize;
  vec3 c = clamp(uvw, 0., 1.);
  float d = textureLod(tex, c, 0.).r;
  // smooth near the surface, blended so that ambient occlusion and shadows see no seam
  if (d < .08) d = mix(tricubic(tex, c), d, smoothstep(.04, .08, d));
  return d + length((uvw - c) * bsize);
}
/**
 * The night's title: its outline (a 2D distance field in a texture one texel deep), extruded around z = 0, relief.x
 * deep on each side, edges rounded by relief.y (relief.x = relief.y: round and puffy).
 */
float titleField(highp sampler3D tex, vec3 bmin, vec3 bsize, vec2 relief, vec3 p) {
  vec2 uv = (p.xy - bmin.xy) / bsize.xy;
  vec2 c = clamp(uv, 0., 1.);
  float d = textureLod(tex, vec3(c, .5), 0.).r;
  if (d < .06) d = mix(tricubic(tex, vec3(c, .5)), d, smoothstep(.03, .06, d));
  d += length((uv - c) * bsize.xy);
  vec2 w = vec2(d + relief.y, abs(p.z) - relief.x + relief.y);
  return min(max(w.x, w.y), 0.) + length(max(w, 0.)) - relief.y;
}
/** A head slot: the sculpted head (on = 0), a baked one, which floats (no column under the bust), or the title. */
float headSlot(highp sampler3D tex, float on, vec3 bmin, vec3 bsize, vec2 relief, vec3 p) {
  if (on < .5) return on > .2 ? sdPatron(p) : sdHead(p);
  if (on < 1.5) return bakedHead(tex, bmin, bsize, p);
  if (on < 2.5) return titleField(tex, bmin, bsize, relief, p);
  return 10.;
}
float headD(vec3 p) { return headSlot(uHeadTex, uHeadOn, uHeadMin, uHeadSize, uHeadRelief, p); }
/** The title's outline in its own plane (2D distance, negative inside; one fetch): for titles made of light. */
float titleD2(vec2 xy) {
  vec2 uv = (xy - uHeadMin.xy) / uHeadSize.xy;
  vec2 c = clamp(uv, 0., 1.);
  return textureLod(uHeadTex, vec3(c, .5), 0.).r + length((uv - c) * uHeadSize.xy);
}
float headBound(vec3 p) {
  if (uHeadOn < .5) return sdEllipsoid(p - vec3(0., -.05, -.02), uHeadOn > .2 ? vec3(.64, 1.02, .8) : vec3(.56, .95, .75));
  if (uHeadOn > 2.5) return 10.;
  if (uHeadOn > 1.5) return sdBox(p - vec3(uHeadMin.xy + uHeadSize.xy * .5, 0.), vec3(uHeadSize.xy * .5, uHeadRelief.x));
  return sdBox(p - uHeadMin - uHeadSize * .5, uHeadSize * .5);
}
`;

/**
 * GLSL of one more head slot ("B", "C", "D": see HEAD_SLOTS), after HEAD_GLSL: its uniforms (headUniforms(suffix),
 * pointed at a head with setHead(u, id, suffix)) and headD<suffix>(p), the same field as headD for that slot.
 */
export const headSlotGLSL = (suffix: string) => /* glsl */ `
uniform highp sampler3D uHeadTex${suffix};
uniform float uHeadOn${suffix};
uniform vec3 uHeadMin${suffix};
uniform vec3 uHeadSize${suffix};
uniform vec2 uHeadRelief${suffix};
float headD${suffix}(vec3 p) { return headSlot(uHeadTex${suffix}, uHeadOn${suffix}, uHeadMin${suffix}, uHeadSize${suffix}, uHeadRelief${suffix}, p); }
`;
