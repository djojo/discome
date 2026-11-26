import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { SceneGLDef } from "../types";
import { paletteParam } from "../palettes";
import { TONE_GLSL } from "@/engine/tone";
import { Cadrage, type Framing } from "./camera";

const approach = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-dt * rate));
const wrap = (a: number) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
const hashF = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Racers at most. */
const RMAX = 8;
/** Points of wall a racer leaves at most (one every STEP metres), and how high the wall stands. */
const NMAX = 1100;
const STEP = 1.1;
const WALL = 1.25;
/** Drops of rain around the camera; motes of light rising from the crumbling walls at most. */
const DROPS = 900;
const DUST = 2400;
/** The racers' size (the track scenes' craft, 2.4 m long, scaled), and how wide the light of a wall spills on the glass. */
const CRAFT = 1.6;
const SPILL = 3.2;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * The racer, as geometry: the track scenes' craft (a long arrowhead of black glass, a raised spine running to the
 * nose, two nacelles along its flanks, a low canopy), in its own frame: nose toward +z, belly at y = 0. Faceted.
 */
function craftGeometry() {
  const ring = (z: number): [number, number][] => {
    const u = clamp01((z + 1.15) / 2.4);
    const hw = 0.52 + (0.05 - 0.52) * u * (0.6 + 0.4 * u);
    const top = 0.07 + 0.15 * (1 - 0.65 * u);
    const shoulder = 0.07 + 0.15 * Math.sqrt(0.55) * (1 - 0.65 * u);
    return [[0, top], [hw * 0.45, shoulder], [hw, 0.07], [hw, 0.03], [0, 0.03], [-hw, 0.03], [-hw, 0.07], [-hw * 0.45, shoulder]];
  };
  const N = 16;
  const zs = Array.from({ length: N }, (_, i) => -1.15 + (2.4 * i) / (N - 1));
  const pos: number[] = [];
  for (let i = 0; i < N - 1; i++) {
    const a = ring(zs[i]);
    const b = ring(zs[i + 1]);
    for (let j = 0; j < 8; j++) {
      const j2 = (j + 1) % 8;
      pos.push(a[j][0], a[j][1], zs[i], b[j][0], b[j][1], zs[i + 1], a[j2][0], a[j2][1], zs[i]);
      pos.push(a[j2][0], a[j2][1], zs[i], b[j][0], b[j][1], zs[i + 1], b[j2][0], b[j2][1], zs[i + 1]);
    }
  }
  for (const z of [zs[0], zs[N - 1]]) {
    const a = ring(z);
    for (let j = 0; j < 8; j++) {
      const j2 = (j + 1) % 8;
      pos.push(0, 0.1, z, a[j][0], a[j][1], z, a[j2][0], a[j2][1], z);
    }
  }
  const hull = new THREE.BufferGeometry();
  hull.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  hull.computeVertexNormals();
  const parts: THREE.BufferGeometry[] = [hull];
  for (const sx of [-1, 1]) {
    const nac = new THREE.CapsuleGeometry(0.1, 0.87, 4, 10);
    nac.rotateX(Math.PI / 2);
    nac.translate(sx * 0.44, 0.115, -0.685);
    parts.push(nac);
  }
  const canopy = new THREE.SphereGeometry(1, 18, 10);
  canopy.scale(0.14, 0.08, 0.4);
  canopy.translate(0, 0.2, -0.02);
  parts.push(canopy);
  const flat = parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    n.deleteAttribute("uv");
    return n;
  });
  return mergeGeometries(flat)!;
}

/*
 * Framings round the pack (their target follows its centre): low among the walls, higher, from above; "top": straight
 * down on the weave (the Pose longue plan keeps to those).
 */
const FRAMINGS: Framing[] = [
  { az: 0.3, el: 0.05, dist: 38, target: [0, 1, 0], focal: 1.6, weight: 2 },
  { az: 2.2, el: 0.09, dist: 22, target: [12, 1, -8], focal: 1.9 },
  { az: -1.3, el: 0.3, dist: 110, target: [0, 0, 0], focal: 1.7 },
  { az: 0.9, el: 0.65, dist: 190, target: [0, 0, 0], focal: 1.6 },
  { az: 0, el: 1.42, dist: 260, target: [0, 0, 0], focal: 1.7, tag: "top" },
  { az: 1.6, el: 1.2, dist: 220, target: [0, 0, 0], focal: 1.6, tag: "top" },
];

/** Linear light out (the compositor grades it); tone-mapped here only when the GPU has no float targets. */
const OUT_GLSL = /* glsl */ `
${TONE_GLSL}
vec3 outC(vec3 c) {
#ifdef LDR_OUT
  return aces(c);
#else
  return clamp(c, 0., 64.);
#endif
}
`;

/** A line of light (d: distance to it, w: its half-width, fw: a pixel's footprint): never thinner than a pixel. */
const NEON_GLSL = /* glsl */ `
float neon(float d, float w, float fw) {
  float W = max(w, fw);
  return (1. - smoothstep(W * .6, W * 1.6, d)) * w / W;
}
`;

/**
 * The night over the plain, the megacity on the horizon all round: two rows of towers in silhouette against the
 * city's glow (the far row paler in the haze), their windows lit, now and then a spire; above them the glow rising.
 */
const CITY_GLSL = /* glsl */ `
float h11(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5453); }
vec3 nightCity(vec3 d, vec3 tint, float drift) {
  float el = asin(clamp(d.y, -1., 1.));
  float az = atan(d.z, d.x);
  vec3 glow = mix(tint, vec3(1., .55, .25), .35) * (1. - .5 * drift);
  vec3 c = mix(vec3(.004, .006, .014), vec3(0., 0., .003), smoothstep(0., .5, el));
  c += glow * (.22 * exp(-max(el, 0.) * 9.) + .035 * exp(-max(el, 0.) * 2.5));
  float fwe = max(fwidth(el), 1e-5);
  for (int l = 0; l < 2; l++) {
    float fl = float(l);
    float x = az * (l == 0 ? 80. : 45.) + fl * 17.3;
    float fwx = max(fwidth(x), 1e-4);
    float fx = fract(x);
    float k = floor(x);
    float hk = h11(k + fl * 91.);
    float H = (l == 0 ? .012 : .02) + (l == 0 ? .03 : .06) * hk * hk + step(.9, hk) * (l == 0 ? .015 : .03);
    // a tower: its width in the cell, a setback near the top for some, an antenna on the tallest
    float gap = .06 + .22 * h11(k + 5.3);
    float set = step(.55, h11(k + 8.1)) * step(H * .72, el) * .14;
    float body = min(fx - gap - set, 1. - gap - set - fx);
    float inside = clamp(body / fwx + .5, 0., 1.) * clamp((H - el) / fwe + .5, 0., 1.);
    float mast = step(.9, hk) * clamp((.025 - abs(fx - .5)) / fwx + .5, 0., 1.) * clamp((H * 1.3 - el) / fwe + .5, 0., 1.);
    inside = max(inside, mast);
    if (inside <= 0.) continue;
    vec3 tc = l == 0 ? glow * .09 + vec3(.002) : vec3(.0012, .0014, .002);
    // the windows, floor by floor: some floors lit through, the rest here and there; warm, or white in the moment's
    // colour; finer than a pixel, their average
    vec2 w = vec2((fx - gap) / max(1. - 2. * gap, .1) * (6. + floor(6. * h11(k + 2.))), el / (l == 0 ? .0018 : .0026));
    vec2 wi = floor(w);
    float floorLit = step(.82, h11(wi.y * 5.7 + k * 1.3));
    float lit = max(floorLit, step(.72, h11(wi.x * 13.1 + wi.y * 7.7 + k * 3.3 + fl * 50.)));
    vec2 wf = abs(fract(w) - .5);
    float win = step(wf.x, .32) * step(wf.y, .26) * lit * step(.0, el) * (1. - mast * step(H, el));
    vec3 wc = mix(vec3(1., .72, .45), mix(tint, vec3(1.), .5), step(.75, h11(wi.y * 3.1 + k)));
    tc += wc * mix(win, .12, smoothstep(.35, .9, fwidth(w.y))) * (l == 0 ? .1 : .32);
    // the red light atop the masts
    tc += vec3(1., .1, .05) * mast * smoothstep(H * 1.22, H * 1.3, el) * .8;
    c = mix(c, tc, inside);
  }
  return c;
}
`;

/**
 * The wall's height (in walls) at a point d metres behind its racer, of this age: it rises from the glass behind the
 * racer, tallest close to it, and settles lower as it ages.
 */
const wallHeight = (d: number, age: number) =>
  (0.28 + 0.72 * smooth01(d / 7)) * (1.25 - 0.55 * smooth01((age - 0.08) / 0.92));
function smooth01(x: number) {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
}

const RIBBON_VERT = /* glsl */ `
attribute float aAge;
attribute float aV;
attribute float aOdo;
uniform float uOdo;
uniform float uTime;
varying float vAge;
varying float vV;
varying float vO;
void main() {
  vAge = aAge;
  vV = aV;
  vO = aOdo;
  // the wall rises from the glass behind its racer, tallest close to it, settling lower as it ages; its top breathes
  float d = uOdo - aOdo;
  float rise = smoothstep(0., 7., d);
  float h = (.28 + .72 * rise) * (1.25 - .55 * smoothstep(.08, 1., aAge)) + .05 * sin(aOdo * .35 - uTime * 2.4) * rise;
  vec3 p = position;
  p.y *= h;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
}
`;

const RIBBON_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uKick;
uniform float uKickT;
uniform float uHat;
uniform float uTime;
uniform float uRefl;
varying float vAge;
varying float vV;
varying float vO;
${OUT_GLSL}
/** The trail's colour along it: white-hot at the racer, its colour, a deep violet dissolving at the tail. */
vec3 heat(vec3 col, float h) {
  vec3 deep = col.gbr * .3 + vec3(.22, .02, .42);
  return mix(mix(vec3(1.), col, smoothstep(0., .06, h)), deep, smoothstep(.4, 1., h));
}
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  // a wall of light: its top edge burning, its body a glow fading down; older, dimmer; the head white-hot; on every
  // kick a pulse runs down the wall from the racer
  float edge = smoothstep(.86, .97, vV) * (1. - smoothstep(.985, 1., vV) * .4);
  float body = .04 + .17 * vV * vV;
  float fade = 1. - smoothstep(.55, 1., vAge);
  float head = exp(-vAge * 90.);
  float spark = step(.985, fract(sin(floor(vO * .4 + uTime * 9.) * 91.7) * 4371.3)) * uHat * 2.;
  float pulse = 1. + 3. * exp(-pow((vAge - uKickT * .6) / .03, 2.)) * exp(-uKickT * 1.2);
  // currents of energy running along it, away from the racer, in two lanes; quicker and brighter on the kick
  float lanes = exp(-pow((vV - .38) / .035, 2.)) + exp(-pow((vV - .7) / .03, 2.)) * .7;
  float ph = fract((vO + uTime * 26.) / 9. + step(.5, vV) * .37);
  float current = lanes * smoothstep(0., .08, ph) * (1. - smoothstep(.08, .6, ph)) * (.6 + 1.6 * uKick);
  vec3 hc = heat(uColor, vAge);
  vec3 c = hc * (edge * (1.4 + 1.6 * uKick) + body * (1. + .6 * uKick) + spark + current * 1.2) * fade * pulse + mix(uColor, vec3(1.), .6) * head * 1.5;
  // ageing, it breaks up block by block (the top first): each block flares as it goes, then is gone; afar, where a
  // pixel spans the blocks, only their average
  float n = hash(floor(vec2(vO * .7, vV * 4.))) * .6 + hash(floor(vec2(vO * 2.1, vV * 12.)) + 17.) * .4;
  float crumble = smoothstep(.38, 1., vAge) * (1.05 + .25 * vV);
  float alive = step(crumble, n);
  float flare = (1. - smoothstep(0., .06, n - crumble)) * alive * step(.01, crumble);
  float far = smoothstep(.5, 2., fwidth(vO) * 2.1);
  alive = mix(alive, clamp(1.05 - crumble, 0., 1.), far);
  c = c * alive * (1. + 1.8 * flare * (1. - far));
  // the reflection in the black glass: dimmer, fading with depth
  c *= uRefl > 0. ? uRefl * (.35 + .65 * vV) : 1.;
  gl_FragColor = vec4(outC(c), 1.);
}
`;

const FLOOR_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uTint;
uniform float uTime;
uniform float uDrift;
uniform vec3 uCam;
varying vec3 vP;
${OUT_GLSL}
${CITY_GLSL}
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec3 rd = normalize(vP - uCam);
  float dist = length(vP.xz - uCam.xz);
  // great slabs of polished black glass, each a shade apart, their seams catching a little light
  vec2 s = vP.xz / 24.;
  vec3 c = vec3(.002, .0025, .004) * (.75 + .5 * h12(floor(s) + 5.1));
  vec2 fw = fwidth(s);
  vec2 e = .5 - abs(fract(s) - .5);
  vec2 sw = max(vec2(.004), fw * 1.2);
  vec2 seam = (1. - smoothstep(sw * .5, sw * 1.5, e)) * .004 / sw;
  c += mix(uTint, vec3(1.), .5) * max(seam.x, seam.y) * .05;
  // the glass mirrors the night and the city on the horizon (the walls and the racers by their own geometry)
  float fr = .04 + .96 * pow(1. - clamp(-rd.y, 0., 1.), 5.);
  c += nightCity(vec3(rd.x, -rd.y, rd.z), uTint, uDrift) * fr * .8;
  // rain on the black glass: rings opening here and there (close by only: afar they would shimmer)
  vec2 g = floor(vP.xz / 1.6);
  vec2 o = fract(vP.xz / 1.6) - .5 - (vec2(h12(g), h12(g + 3.7)) - .5) * .5;
  float ph = fract(uTime * .9 + h12(g + 9.1));
  float ring = exp(-pow((length(o) - ph * .45) / .02, 2.)) * (1. - ph) * step(.55, h12(g + 1.3));
  c += mix(uTint, vec3(1.), .6) * ring * .12 * exp(-dist / 35.);
  // the haze far off, in the city's glow
  c = mix(c, mix(uTint, vec3(1., .55, .25), .35) * .03, smoothstep(500., 3200., dist) * .7);
  gl_FragColor = vec4(outC(c), 1.);
}
`;

const SKY_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uTint;
uniform float uDrift;
varying vec3 vD;
${OUT_GLSL}
${CITY_GLSL}
void main() { gl_FragColor = vec4(outC(nightCity(normalize(vD), uTint, uDrift)), 1.); }
`;

/** The wall's light spilt on the glass: a wide pool of its colour lying under it, fading to the sides. */
const SPILL_VERT = /* glsl */ `
attribute float aAge;
attribute float aSide;
varying float vAge;
varying float vSide;
void main() {
  vAge = aAge;
  vSide = aSide;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
}
`;
const SPILL_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uKick;
varying float vAge;
varying float vSide;
${OUT_GLSL}
void main() {
  vec3 deep = uColor.gbr * .3 + vec3(.22, .02, .42);
  vec3 hc = mix(uColor, deep, smoothstep(.4, 1., vAge));
  float fade = 1. - smoothstep(.55, 1., vAge);
  float across = exp(-vSide * vSide * 5.) + exp(-vSide * vSide * 60.) * .8;
  gl_FragColor = vec4(outC(hc * across * fade * (.07 + .05 * uKick)), 1.);
}
`;

/** The dust of the crumbling walls: soft motes of light, rising, going out. */
const DUST_VERT = /* glsl */ `
attribute vec3 aCol;
attribute float aLife;
uniform float uScale;
varying vec3 vCol;
varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.);
  float px = .16 * uScale / max(-mv.z, .1);
  gl_PointSize = aLife > 0. ? clamp(px, 1.5, 24.) : 0.;
  vA = aLife * min(1., px * px / 2.25);
  vCol = aCol;
  gl_Position = projectionMatrix * mv;
}
`;
const DUST_FRAG = /* glsl */ `
precision highp float;
uniform float uRefl;
varying vec3 vCol;
varying float vA;
${OUT_GLSL}
void main() {
  vec2 q = gl_PointCoord - .5;
  gl_FragColor = vec4(outC(vCol * exp(-dot(q, q) * 16.) * vA * 2.6 * (uRefl > 0. ? uRefl : 1.)), 1.);
}
`;

/** The glow of a racer's levitation on the glass under it. */
const POOL_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uBurn;
varying vec2 vUv;
${OUT_GLSL}
void main() {
  vec2 q = (vUv - .5) * vec2(2.2, 2.);
  gl_FragColor = vec4(outC(uColor * exp(-dot(q, q) * 3.) * (.35 + .25 * uBurn)), 1.);
}
`;

const CRAFT_VERT = /* glsl */ `
varying vec3 vC;
varying vec3 vW;
varying vec3 vN;
void main() {
  vC = position;
  vec4 w = modelMatrix * vec4(position, 1.);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

/**
 * The racer's light (the track scenes' craft): black glass reflecting the night and the city, neon along its edges
 * and spine, the canopy's smoked glass with its lit base, the engines' rings burning at the back, the glow of its
 * levitation underneath.
 */
const CRAFT_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform vec3 uTint;
uniform float uDrift;
uniform float uBurn;
uniform float uRefl;
uniform float uPa;
varying vec3 vC;
varying vec3 vW;
varying vec3 vN;
${OUT_GLSL}
${NEON_GLSL}
${CITY_GLSL}
void main() {
  vec3 rd = normalize(vW - cameraPosition);
  vec3 n = normalize(vN);
  if (dot(n, rd) > 0.) n = -n;
  float fw = uPa * length(vW - cameraPosition) / ${CRAFT.toFixed(2)};
  vec3 c = vC;
  vec3 col = uColor;
  float fr = .04 + .96 * pow(1. - clamp(dot(n, -rd), 0., 1.), 5.);
  vec3 rr = reflect(rd, n);
  vec3 env = rr.y > 0. ? nightCity(rr, uTint, uDrift) : col * .05;
  vec3 cc = vec3(.006, .007, .01) + env * fr * 1.4;
  float u = clamp((c.z + 1.15) / 2.4, 0., 1.);
  float hw = mix(.52, .05, u * (.6 + .4 * u));
  float ax = abs(c.x);
  // the hull's rim and the spine to the nose
  float rim = neon(abs(hw - ax), .014, fw) * step(c.y, .1) * step(-1.15, c.z);
  float spine = neon(ax, .012, fw) * step(.12, c.y) * step(.35, c.z);
  cc += col * (rim * 2.4 + spine * 1.6);
  // the canopy: smoked glass, a thin line where it meets the hull
  if (length((c - vec3(0., .2, -.02)) / vec3(.14, .08, .4)) < 1.08) {
    cc = vec3(.01, .012, .02) + env * fr * 2.;
    cc += col * neon(abs(c.y - .145), .008, fw) * 1.5;
  }
  // the nacelles: a stripe along them; at the back the engine, a ring of light round a burning core
  float r = length(vec2(ax - .44, c.y - .115));
  if (r < .13 && c.z < -.2) {
    cc += col * neon(abs(c.y - .16), .006, fw) * step(-1.05, c.z) * step(.47, ax) * .9;
    float back = smoothstep(-1.1, -1.18, c.z);
    float ring = neon(abs(r - .075), .012, fw);
    float core = 1. - smoothstep(.03, .065, r);
    cc += back * (col * ring * (2. + 2. * uBurn) + mix(col, vec3(1.), .35) * core * (.6 + 1.6 * uBurn));
  }
  // underneath: the levitation's glow
  cc += col * smoothstep(-.2, -.8, n.y) * step(c.y, .06) * .5 * (.6 + .4 * uBurn);
  gl_FragColor = vec4(outC(cc * (uRefl > 0. ? uRefl : 1.)), 1.);
}
`;

const FLAT_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
${OUT_GLSL}
void main() { gl_FragColor = vec4(outC(uColor), 1.); }
`;

interface Racer {
  x: number;
  z: number;
  heading: number;
  phase: number;
  colour: THREE.Color;
  /** Distance since the last wall point. */
  since: number;
  count: number;
  /** How far it leans into its turn; how hard its engines burn; how far it has gone. */
  bank: number;
  burn: { value: number };
  odo: { value: number };
  odos: Float32Array;
  pos: Float32Array;
  age: Float32Array;
  spill: Float32Array;
  geo: THREE.BufferGeometry;
  spillGeo: THREE.BufferGeometry;
  mats: THREE.ShaderMaterial[];
  meshes: THREE.Object3D[];
  craft: THREE.Mesh;
  mirror: THREE.Mesh;
  pool: THREE.Mesh;
}

/**
 * Les Traînées: an endless plain of great slabs of polished black glass under the rain, the megacity on the horizon
 * all round (towers in silhouette against its glow, their windows lit, mirrored in the glass), and racers (the track
 * scenes' craft of black glass and neon, leaning into their turns) that leave walls of light behind them, coiling
 * and crossing like a long exposure; the walls mirrored in the glass, their light spilt on it. The walls live: they
 * rise from the glass behind their racer, tallest close to it, currents of energy running along them; ageing they
 * settle, then break up block by block, each block flaring as it goes, shedding motes of light that rise and go out. They pulse with the kick and spark
 * with the hats; through the build the racers speed up and their loops tighten; on the drop they all break away in a
 * star. The walls stay: as the night drifts they grow longer and the plain fills up, the racers shut in by their own
 * light. « Pose longue »: straight down on the weave, growing slowly.
 */
export const trails: SceneGLDef = {
  id: "circuit-trails",
  name: "Les Traînées",
  tag: "3D",
  energy: "intense",
  kind: "webgl",
  hdr: true,
  mask: true,
  description:
    "Une plaine infinie de dalles de verre noir sous la pluie, la mégapole tout autour à l'horizon : des bolides de verre noir et de néon laissent derrière eux des murs de lumière qui s'enroulent et se croisent comme une photo en pose longue, reflétés dans le verre. Les murs montent du sol derrière eux, parcourus de courants, puis se défont bloc par bloc en lâchant une poussière lumineuse. Au kick les murs pulsent ; pendant la montée les bolides accélèrent et leurs boucles se resserrent ; au drop ils s'écartent tous en étoile. « Pose longue » : vu de haut, le tissage grandit lentement.",
  params: [paletteParam("piste"), { type: "toggle", key: "top", label: "Pose longue (vu de haut)", default: false }],
  create({ renderer, viewport, target }) {
    const ldr = target.texture.type === THREE.UnsignedByteType;
    const defines = ldr ? { LDR_OUT: "" } : {};
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0, 0, 0);
    const camera = new THREE.PerspectiveCamera(40, viewport.width / viewport.height, 0.1, 6000);
    const tint = new THREE.Vector3(0.25, 0.9, 1);
    const shared = { uKick: { value: 0 }, uKickT: { value: 9 }, uHat: { value: 0 }, uTime: { value: 0 } };

    // the sky, the glass floor
    const skyGeo = new THREE.SphereGeometry(5000, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: { uTint: { value: tint }, uDrift: { value: 0 } },
      vertexShader: "varying vec3 vD; void main() { vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      defines,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.renderOrder = -2;
    scene.add(sky);
    const floorGeo = new THREE.PlaneGeometry(8000, 8000);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.ShaderMaterial({
      uniforms: { uTint: { value: tint }, uTime: shared.uTime, uDrift: skyMat.uniforms.uDrift, uCam: { value: new THREE.Vector3() } },
      vertexShader: "varying vec3 vP; void main() { vec4 w = modelMatrix * vec4(position, 1.); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
      fragmentShader: FLOOR_FRAG,
      depthWrite: false,
      defines,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.renderOrder = -1;
    scene.add(floor);

    // the racers and their walls (each wall drawn as itself, mirrored in the glass, and its light spilt on the glass;
    // its odometer at each of its points, to fix its currents and its holes on it)
    const index: number[] = [];
    for (let i = 0; i < NMAX - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const indexAttr = new THREE.Uint16BufferAttribute(index, 1);
    const sides = new Float32Array(NMAX * 2);
    for (let k = 0; k < NMAX; k++) {
      sides[k * 2] = -1;
      sides[k * 2 + 1] = 1;
    }
    const sideAttr = new THREE.BufferAttribute(sides, 1);
    const craftGeo = craftGeometry();
    const poolGeo = new THREE.PlaneGeometry(CRAFT * 2.6, CRAFT * 3.6);
    poolGeo.rotateX(-Math.PI / 2);
    const pa = { value: 0.001 };
    const racers: Racer[] = [];
    for (let i = 0; i < RMAX; i++) {
      const pos = new Float32Array(NMAX * 2 * 3);
      const age = new Float32Array(NMAX * 2);
      const spill = new Float32Array(NMAX * 2 * 3);
      const odos = new Float32Array(NMAX * 2);
      const odo = { value: 0 };
      const vv = new Float32Array(NMAX * 2);
      for (let k = 0; k < NMAX; k++) vv[k * 2 + 1] = 1;
      const ageAttr = new THREE.BufferAttribute(age, 1).setUsage(THREE.DynamicDrawUsage);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute("aAge", ageAttr);
      geo.setAttribute("aV", new THREE.BufferAttribute(vv, 1));
      geo.setAttribute("aOdo", new THREE.BufferAttribute(odos, 1).setUsage(THREE.DynamicDrawUsage));
      geo.setIndex(indexAttr);
      geo.setDrawRange(0, 0);
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
      const spillGeo = new THREE.BufferGeometry();
      spillGeo.setAttribute("position", new THREE.BufferAttribute(spill, 3).setUsage(THREE.DynamicDrawUsage));
      spillGeo.setAttribute("aAge", ageAttr);
      spillGeo.setAttribute("aSide", sideAttr);
      spillGeo.setIndex(indexAttr);
      spillGeo.setDrawRange(0, 0);
      spillGeo.boundingSphere = geo.boundingSphere;
      const colour = new THREE.Color();
      const col = new THREE.Vector3();
      const burn = { value: 0 };
      const mk = (refl: number) =>
        new THREE.ShaderMaterial({
          uniforms: { uColor: { value: col }, uRefl: { value: refl }, uOdo: odo, ...shared },
          vertexShader: RIBBON_VERT,
          fragmentShader: RIBBON_FRAG,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          defines,
        });
      const mat = mk(0);
      const refl = mk(0.3);
      const wall = new THREE.Mesh(geo, mat);
      const wallMirror = new THREE.Mesh(geo, refl);
      wallMirror.scale.y = -1;
      const spillMat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: col }, uKick: shared.uKick },
        vertexShader: SPILL_VERT,
        fragmentShader: SPILL_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        defines,
      });
      const spillMesh = new THREE.Mesh(spillGeo, spillMat);
      const craftMat = (r: number) =>
        new THREE.ShaderMaterial({
          uniforms: { uColor: { value: col }, uTint: { value: tint }, uDrift: skyMat.uniforms.uDrift, uBurn: burn, uRefl: { value: r }, uPa: pa },
          vertexShader: CRAFT_VERT,
          fragmentShader: CRAFT_FRAG,
          side: THREE.DoubleSide,
          defines,
        });
      const cm = craftMat(0);
      const cmr = craftMat(0.38);
      const craft = new THREE.Mesh(craftGeo, cm);
      craft.rotation.order = "YXZ";
      craft.scale.setScalar(CRAFT);
      const mirror = new THREE.Mesh(craftGeo, cmr);
      mirror.rotation.order = "YXZ";
      mirror.scale.set(CRAFT, -CRAFT, CRAFT);
      const poolMat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: col }, uBurn: burn },
        vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
        fragmentShader: POOL_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        defines,
      });
      const pool = new THREE.Mesh(poolGeo, poolMat);
      spillMesh.renderOrder = 0;
      pool.renderOrder = 0;
      wallMirror.renderOrder = 1;
      mirror.renderOrder = 1;
      wall.renderOrder = 2;
      craft.renderOrder = 3;
      for (const m of [wall, wallMirror, spillMesh]) m.frustumCulled = false;
      scene.add(spillMesh, pool, wallMirror, mirror, wall, craft);
      racers.push({
        x: 0,
        z: 0,
        heading: 0,
        phase: 0,
        colour,
        since: 0,
        count: 0,
        bank: 0,
        burn,
        odo,
        odos,
        pos,
        age,
        spill,
        geo,
        spillGeo,
        mats: [mat, refl, spillMat, cm, cmr, poolMat],
        meshes: [wall, wallMirror, spillMesh, craft, mirror, pool],
        craft,
        mirror,
        pool,
      });
    }

    // the rain round the camera
    const rainPos = new Float32Array(DROPS * 2 * 3);
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3).setUsage(THREE.DynamicDrawUsage));
    const rainCol = new THREE.Vector3();
    const rainMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: rainCol } },
      vertexShader: "void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
      fragmentShader: FLAT_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      defines,
    });
    const rain = new THREE.LineSegments(rainGeo, rainMat);
    rain.frustumCulled = false;
    rain.renderOrder = 4;
    scene.add(rain);
    const drops = Array.from({ length: DROPS }, () => new THREE.Vector3(Math.random() * 80 - 40, Math.random() * 40, Math.random() * 80 - 40));

    // the dust: motes of light shed by the crumbling walls, rising and going out (mirrored in the glass)
    const dustPos = new Float32Array(DUST * 3);
    const dustCol = new Float32Array(DUST * 3);
    const dustLife = new Float32Array(DUST);
    const dustT = new Float32Array(DUST);
    const dustRate = new Float32Array(DUST);
    const dustVel = new Float32Array(DUST * 3);
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3).setUsage(THREE.DynamicDrawUsage));
    dustGeo.setAttribute("aCol", new THREE.BufferAttribute(dustCol, 3).setUsage(THREE.DynamicDrawUsage));
    dustGeo.setAttribute("aLife", new THREE.BufferAttribute(dustLife, 1).setUsage(THREE.DynamicDrawUsage));
    const dustScale = { value: 1000 };
    const dustMat = (refl: number) =>
      new THREE.ShaderMaterial({
        uniforms: { uScale: dustScale, uRefl: { value: refl } },
        vertexShader: DUST_VERT,
        fragmentShader: DUST_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        defines,
      });
    const dustMats = [dustMat(0), dustMat(0.3)];
    const dust = new THREE.Points(dustGeo, dustMats[0]);
    const dustMirror = new THREE.Points(dustGeo, dustMats[1]);
    dustMirror.scale.y = -1;
    dust.frustumCulled = false;
    dustMirror.frustumCulled = false;
    dust.renderOrder = 4;
    dustMirror.renderOrder = 1;
    scene.add(dust, dustMirror);
    let dustNext = 0;
    /** Shed a mote from the crumbling part of a racer's wall. */
    const shed = (r: Racer, k0: number, nmax: number) => {
      const k = k0 + Math.floor(Math.random() * (r.count - k0));
      const age = k / Math.max(1, nmax - 1);
      const i = dustNext;
      dustNext = (dustNext + 1) % DUST;
      const h = WALL * wallHeight(r.odo.value - r.odos[k * 2], age) * Math.random();
      dustPos.set([r.pos[k * 6] + (Math.random() - 0.5) * 0.3, h, r.pos[k * 6 + 2] + (Math.random() - 0.5) * 0.3], i * 3);
      dustVel.set([(Math.random() - 0.5) * 0.7, 0.5 + 1.1 * Math.random(), (Math.random() - 0.5) * 0.7], i * 3);
      dustT[i] = 1;
      dustRate[i] = 1 / (1.6 + 1.8 * Math.random());
      // its wall's colour at that age (white-hot near the racer, deep violet at the tail)
      const c = r.colour;
      const m = smooth01((age - 0.4) / 0.6);
      dustCol.set([c.r + (c.g * 0.3 + 0.22 - c.r) * m, c.g + (c.b * 0.3 + 0.02 - c.g) * m, c.b + (c.r * 0.3 + 0.42 - c.b) * m], i * 3);
    };

    const cad = new Cadrage(FRAMINGS, 3);
    const centre = new THREE.Vector3();
    const look = new THREE.Vector3();
    let last = -99;
    let kick = 0;
    let star = 99;
    let boost = 0;

    const reset = (seed: number) => {
      racers.forEach((r, i) => {
        const a = (i / RMAX) * Math.PI * 2 + hashF(seed + i) * 0.6;
        r.x = Math.cos(a) * (20 + 30 * hashF(seed + i * 2.1));
        r.z = Math.sin(a) * (20 + 30 * hashF(seed + i * 2.1));
        r.heading = a + Math.PI / 2;
        r.phase = hashF(seed + i * 3.7) * 100;
        r.count = 0;
        r.since = 0;
        r.bank = 0;
        r.odo.value = 0;
        r.geo.setDrawRange(0, 0);
        r.spillGeo.setDrawRange(0, 0);
      });
      cad.reset(seed);
      dustT.fill(0);
      dustLife.fill(0);
      star = 99;
      boost = 0;
    };

    /** Push a new wall point at the racer's position (the head point always follows it). */
    const advance = (r: Racer, dist: number, nmax: number) => {
      r.since += dist;
      r.odo.value += dist;
      if (r.count === 0 || r.since >= STEP) {
        r.since = 0;
        r.pos.copyWithin(6, 0, (NMAX - 1) * 6);
        r.spill.copyWithin(6, 0, (NMAX - 1) * 6);
        r.odos.copyWithin(2, 0, (NMAX - 1) * 2);
        r.count = Math.min(nmax, r.count + 1);
      }
      r.odos[0] = r.odo.value;
      r.odos[1] = r.odo.value;
      r.pos[0] = r.x;
      r.pos[1] = 0;
      r.pos[2] = r.z;
      r.pos[3] = r.x;
      r.pos[4] = WALL;
      r.pos[5] = r.z;
      // its light on the glass, across the way it goes
      const nx = -Math.sin(r.heading) * SPILL;
      const nz = Math.cos(r.heading) * SPILL;
      r.spill.set([r.x - nx, 0.02, r.z - nz, r.x + nx, 0.02, r.z + nz], 0);
      for (let k = 0; k < r.count; k++) {
        const a = k / Math.max(1, nmax - 1);
        r.age[k * 2] = a;
        r.age[k * 2 + 1] = a;
      }
      r.geo.setDrawRange(0, Math.max(0, r.count - 1) * 6);
      r.spillGeo.setDrawRange(0, Math.max(0, r.count - 1) * 6);
      (r.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (r.geo.attributes.aAge as THREE.BufferAttribute).needsUpdate = true;
      (r.spillGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (r.geo.attributes.aOdo as THREE.BufferAttribute).needsUpdate = true;
    };

    return {
      resize(v) {
        camera.aspect = v.width / v.height;
        camera.updateProjectionMatrix();
      },
      render(f, p, dt) {
        const bar = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;
        if (f.time - last > 1.5) reset(Math.random() * 100);
        last = f.time;
        const top = p.top === true;
        if (f.tint) tint.set(f.tint[0], f.tint[1], f.tint[2]);
        shared.uTime.value = f.time;
        kick = f.beat ? 1 : kick * Math.exp(-dt * 6);
        shared.uKick.value = kick;
        shared.uKickT.value = f.beat ? 0 : shared.uKickT.value + dt;
        shared.uHat.value = f.onsetPulse;
        skyMat.uniforms.uDrift.value = f.drift;
        // the walls grow longer as the night drifts: the plain fills up
        const nmax = Math.round(NMAX * (0.5 + 0.5 * f.drift));
        const count = Math.min(RMAX, Math.round(5 + 3 * f.drift));
        const build = f.section === "build" ? f.buildProgress : 0;
        if (f.drop) {
          star = 0;
          boost = 1;
        }
        star += dt;
        boost *= Math.exp(-dt / (bar * 1.2));
        const speed = (top ? 13 : 17) * (1 + 1.2 * build + 1.4 * boost) * (f.section === "breakdown" ? 0.5 : 1);

        // the pack: each racer steers its own curves, drawn back toward the middle; tighter through the build; on the
        // drop they all break away from the centre in a star, straight, for two bars
        let cx = 0;
        let cz = 0;
        let n = 0;
        for (const r of racers) {
          if (n < count) {
            cx += r.x;
            cz += r.z;
          }
          n++;
        }
        cx /= Math.max(1, count);
        cz /= Math.max(1, count);
        racers.forEach((r, i) => {
          const on = i < count;
          for (const m of r.meshes) m.visible = on;
          if (!on) return;
          const c = r.colour;
          c.setRGB(tint.x, tint.y, tint.z);
          if (i % 4 === 1) c.offsetHSL(0.5, 0, 0);
          else if (i % 4 === 2) c.lerp(new THREE.Color(1, 1, 1), 0.65);
          else if (i % 4 === 3) c.offsetHSL(0.25, 0, 0);
          (r.mats[0].uniforms.uColor.value as THREE.Vector3).set(c.r, c.g, c.b);
          r.burn.value = 0.35 + 0.8 * boost + 0.6 * kick + 0.5 * build;
          r.phase += dt;
          let k = (Math.sin(r.phase * 0.35 + i) + 0.6 * Math.sin(r.phase * 0.83 + i * 2.3)) * 0.035 * (1 + 2.2 * build);
          const dx = -r.x;
          const dz = -r.z;
          const d = Math.hypot(dx, dz);
          k += wrap(Math.atan2(dz, dx) - r.heading) * 0.0009 * Math.max(0, d - 40);
          if (star < bar * 2) {
            if (star < dt * 1.5) r.heading = Math.atan2(r.z - cz, r.x - cx);
            k = 0;
          }
          r.heading += k * speed * dt;
          r.x += Math.cos(r.heading) * speed * dt;
          r.z += Math.sin(r.heading) * speed * dt;
          advance(r, speed * dt, nmax);
          // the craft ahead of its wall (the wall leaves from its tail), hovering, leaning into its turn
          r.bank = approach(r.bank, Math.max(-0.6, Math.min(0.6, k * speed * 0.3)), 5, dt);
          const fx = Math.cos(r.heading);
          const fz = Math.sin(r.heading);
          const ox = r.x + fx * 1.15 * CRAFT;
          const oz = r.z + fz * 1.15 * CRAFT;
          const yaw = Math.PI / 2 - r.heading;
          r.craft.position.set(ox, 0.16, oz);
          r.craft.rotation.set(0, yaw, r.bank);
          r.mirror.position.set(ox, -0.16, oz);
          r.mirror.rotation.set(0, yaw, -r.bank);
          r.pool.position.set(ox, 0.03, oz);
          r.pool.rotation.set(0, yaw, 0);
          // the crumbling part of its wall sheds its dust
          const k0 = Math.ceil(0.42 * (nmax - 1));
          if (r.count > k0 + 1) {
            const rate = 90 * ((r.count - k0) / nmax) * (1 + 1.5 * boost);
            for (let n = Math.floor(rate * dt + Math.random()); n > 0; n--) shed(r, k0, nmax);
          }
        });

        // the camera: a framing round the pack's centre (straight down in Pose longue)
        centre.set(approach(centre.x, cx, 0.5, dt), 0, approach(centre.z, cz, 0.5, dt));
        cad.allow = (fr) => (top ? fr.tag === "top" : fr.tag !== "top");
        cad.update(f, dt);
        camera.position.copy(cad.pos).add(centre);
        look.copy(cad.target).add(centre);
        camera.up.set(0, 1, 0);
        if (camera.position.y > 150 && Math.abs(camera.position.x - look.x) + Math.abs(camera.position.z - look.z) < 20) camera.up.set(0, 0, -1);
        camera.lookAt(look);
        camera.fov = (2 * Math.atan(0.5 / cad.focal) * 180) / Math.PI;
        camera.updateProjectionMatrix();
        pa.value = 1 / (cad.focal * target.height);
        (floorMat.uniforms.uCam.value as THREE.Vector3).copy(camera.position);
        sky.position.copy(camera.position);

        // the dust rises, slows, goes out
        dustScale.value = target.height * cad.focal;
        const drag = Math.exp(-dt * 0.6);
        for (let i = 0; i < DUST; i++) {
          if (dustT[i] <= 0) {
            dustLife[i] = 0;
            continue;
          }
          const t = (dustT[i] -= dt * dustRate[i]);
          dustVel[i * 3] *= drag;
          dustVel[i * 3 + 2] *= drag;
          dustPos[i * 3] += dustVel[i * 3] * dt;
          dustPos[i * 3 + 1] += dustVel[i * 3 + 1] * dt;
          dustPos[i * 3 + 2] += dustVel[i * 3 + 2] * dt;
          dustLife[i] = t <= 0 ? 0 : t > 0.85 ? (1 - t) / 0.15 : t / 0.85;
        }
        (dustGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        (dustGeo.attributes.aCol as THREE.BufferAttribute).needsUpdate = true;
        (dustGeo.attributes.aLife as THREE.BufferAttribute).needsUpdate = true;

        // the rain falls round the camera
        rainCol.set(tint.x, tint.y, tint.z).lerp(new THREE.Vector3(1, 1, 1), 0.6).multiplyScalar(0.12);
        for (let i = 0; i < DROPS; i++) {
          const dr = drops[i];
          dr.y -= dt * 28;
          if (dr.y < 0) {
            dr.y += 40;
            dr.x = Math.random() * 80 - 40;
            dr.z = Math.random() * 80 - 40;
          }
          const x = camera.position.x + dr.x;
          const z = camera.position.z + dr.z;
          const y = Math.max(0, camera.position.y - 20) + dr.y;
          rainPos.set([x, y, z, x, y + 0.6, z], i * 6);
        }
        (rainGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;

        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
      },
      dispose() {
        skyGeo.dispose();
        skyMat.dispose();
        floorGeo.dispose();
        floorMat.dispose();
        craftGeo.dispose();
        poolGeo.dispose();
        rainGeo.dispose();
        rainMat.dispose();
        dustGeo.dispose();
        for (const m of dustMats) m.dispose();
        for (const r of racers) {
          r.geo.dispose();
          r.spillGeo.dispose();
          for (const m of r.mats) m.dispose();
        }
      },
    };
  },
};
