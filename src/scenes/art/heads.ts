import * as THREE from "three";
import { titleShape } from "@/brand/shape";
import type { ParamDef, ParamValues } from "../types";

/**
 * The head library: real sculpted busts (Printables, see public/heads/CREDITS.md) baked by scripts/bake-heads.mjs
 * into signed distance grids, so every head effect (shell, shards, contour lines, halftone, chrome…) works with
 * any of them. "humain" is the sculpted head of lib.glsl.ts (no file).
 */
export const HEADS = [
  { id: "humain", label: "Humain" },
  { id: "tigre", label: "Tigre" },
  { id: "loup", label: "Loup" },
  { id: "faucon", label: "Faucon" },
  { id: "lion", label: "Lion" },
  { id: "hibou", label: "Hibou" },
  { id: "belier", label: "Bélier" },
  { id: "moai", label: "Moai" },
  { id: "nefertiti", label: "Néfertiti" },
] as const;

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
  options: [...HEADS.map((h) => ({ value: h.id, label: h.label })), { value: TITLE_HEAD, label: "Titre de la soirée" }],
  default: def,
});

const isBaked = (id: unknown): id is HeadId => typeof id === "string" && id !== "humain" && HEADS.some((h) => h.id === id);

export interface HeadGrid {
  tex: THREE.Data3DTexture;
  min: THREE.Vector3;
  size: THREE.Vector3;
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

/** Start loading a head (no-op if loaded, loading, or the sculpted human head). */
export function loadHead(id: unknown): Promise<HeadGrid | null> {
  if (!isBaked(id)) return Promise.resolve(null);
  const done = loaded.get(id);
  if (done) return Promise.resolve(done);
  let p = loading.get(id);
  if (!p) {
    p = fetchGrid(id);
    loading.set(id, p);
  }
  return p;
}

/** Warm the cache, e.g. with the heads of a world's plans, so a head never pops in late. */
export function preloadHeads(ids: Iterable<unknown>) {
  for (const id of ids) void loadHead(id);
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

/** Uniforms of one head slot: suffix "" for uHead*, or "B" for a second head (uHeadTexB…). */
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
    const t = titleShape(p?.titleFont);
    u[`uHeadOn${suffix}`].value = t ? 2 : 3;
    if (t) {
      u[`uHeadTex${suffix}`].value = t.tex;
      (u[`uHeadMin${suffix}`].value as THREE.Vector3).copy(t.min);
      (u[`uHeadSize${suffix}`].value as THREE.Vector3).copy(t.size);
      (u[`uHeadRelief${suffix}`].value as THREE.Vector2).set(...titleRelief(t.stroke, p));
    }
    return !!t;
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
 * the head's. Needs ART_LIB. uHeadOn: 0 sculpted head, 1 baked head, 2 title, 3 nothing (the title is being drawn).
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
  if (on < .5) return sdHead(p);
  if (on < 1.5) return bakedHead(tex, bmin, bsize, p);
  if (on < 2.5) return titleField(tex, bmin, bsize, relief, p);
  return 10.;
}
float headD(vec3 p) { return headSlot(uHeadTex, uHeadOn, uHeadMin, uHeadSize, uHeadRelief, p); }
float headBound(vec3 p) {
  if (uHeadOn < .5) return sdEllipsoid(p - vec3(0., -.05, -.02), vec3(.56, .95, .75));
  if (uHeadOn > 2.5) return 10.;
  if (uHeadOn > 1.5) return sdBox(p - vec3(uHeadMin.xy + uHeadSize.xy * .5, 0.), vec3(uHeadSize.xy * .5, uHeadRelief.x));
  return sdBox(p - uHeadMin - uHeadSize * .5, uHeadSize * .5);
}
`;
