import * as THREE from "three";
import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { num } from "../utils";
import { ART_LIB, MARCH } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";
import { HEAD_GLSL, headParam, headUniforms, setHead, TITLE_HEAD } from "./heads";

const FRAMINGS: Framing[] = [
  { az: 0, el: 0.12, dist: 3.6, target: [0, -0.05, 0], focal: 2.1, weight: 2 },
  { az: 0.9, el: 0.2, dist: 3.6, target: [0, -0.05, 0], focal: 2.1, weight: 2 },
  { az: -0.7, el: 0.05, dist: 3.2, target: [0, -0.05, 0], focal: 2.1, weight: 2 },
  { az: 0.2, el: 0.03, dist: 2.2, target: [0, 0, 0.3], focal: 2.3, weight: 2 },
  { az: 1.6, el: 0.45, dist: 4.2, target: [0, -0.25, 0], focal: 2, weight: 2 },
  { az: -2.2, el: 0.25, dist: 3.8, target: [0, -0.05, 0], focal: 2.1, weight: 1 },
  // The night's title, standing in the bath: from the front, a little from above to see the rings
  { az: 0, el: 0.1, dist: 4.3, target: [0, -0.08, 0], focal: 2.1, weight: 3, tag: "title" },
  { az: 0.25, el: 0.16, dist: 4.5, target: [0, -0.08, 0], focal: 2.1, weight: 2, tag: "title" },
  { az: -0.28, el: 0.06, dist: 4.2, target: [0, -0.08, 0], focal: 2.1, weight: 2, tag: "title" },
  { az: 0.08, el: 0.32, dist: 4.7, target: [0, -0.15, 0], focal: 2.1, weight: 1, tag: "title" },
];
/** The title framings' own heights (a tall title, a logo, raises them: see update). */
const TITLE_Y = FRAMINGS.filter((fr) => fr.tag === "title").map((fr) => [fr, fr.target[1]] as const);

/**
 * A chrome mask rising from a bath of liquid metal, in a product-photo studio: a luminous ceiling and two strip
 * softboxes, which the face and the bath both reflect; colour only exists in the reflections.
 * The mask stays still. Each kick sends a ring across the liquid from the mask; the drop darkens the studio and
 * sweeps a blade of light across the face and the bath.
 */
export const mercury = defineShaderScene({
  id: "mercury",
  name: "Mercure",
  tag: "Visage",
  energy: "medium",
  hdr: true,
  renderScale: 0.7,
  mask: true,
  camera: { framings: FRAMINGS, glideBars: 2 },
  description: "Masque chromé immobile dans un bain de métal liquide, sous les softbox d'un studio photo : chaque kick lance un anneau, le drop éteint le studio et fait passer une lame de lumière.",
  params: [paletteParam("mercury"), headParam(), { type: "range", key: "swell", label: "Houle", min: 0, max: 2, step: 0.05, default: 1 }],
  uniforms: () => ({
    ...headUniforms(),
    uSwell: { value: 1 },
    uKicks: { value: new THREE.Vector4(9, 9, 9, 9) },
    uSweep: { value: 9 },
    uChart: { value: 0.15 },
    uCrash: { value: 0 },
    uTitle: { value: 0 },
  }),
  update(u, f, p, dt, ctx) {
    // The night's title instead of the mask: chrome letters standing in the bath, their foot melting into it
    const title = p.head === TITLE_HEAD;
    setHead(u, p.head, "", p);
    u.uTitle.value = title ? 1 : 0;
    // a tall title (a logo) stands taller out of the bath: the framings look up to its middle, so that it fits whole
    if (title) {
      const mid = -0.55 + (u.uHeadSize.value as THREE.Vector3).y / 2;
      for (const [fr, y] of TITLE_Y) fr.target[1] = Math.max(y, mid + (y + 0.08));
    }
    if (ctx.camera) ctx.camera.allow = title ? (fr) => fr.tag === "title" : (fr) => fr.tag !== "title";
    // The swell follows the track: a mirror in the breakdown, rising through the build, strongest on the drop
    const sw = num(p.swell, 1) * (f.section === "breakdown" ? 0.2 : f.section === "build" ? 0.5 + 0.7 * f.buildProgress : f.section === "drop" ? 1.5 : 0.8);
    const cur = u.uSwell.value as number;
    u.uSwell.value = cur + (sw - cur) * (1 - Math.exp(-dt * 0.4));
    // Ages of the last four kicks: each one is a ring travelling outward
    const k = u.uKicks.value as THREE.Vector4;
    k.addScalar(dt);
    if (f.beat) k.set(0, k.x, k.y, k.z);
    const bar = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;
    u.uSweep.value = f.drop ? 0 : (u.uSweep.value as number) + dt / bar;
    // The chart on the horizon: it climbs on its own (faster as the night drifts), soars through the build,
    // crashes on the drop and only slowly recovers. The mask sinks as it climbs.
    if (f.drop) u.uCrash.value = 1;
    const crash = (u.uCrash.value = (u.uCrash.value as number) * Math.exp(-dt / (bar * 1.5)));
    let level = u.uChart.value as number;
    if (crash > 0.2) level -= level * (1 - Math.exp(-dt / (bar * 0.35)));
    else level += dt * (f.section === "build" ? 0.03 + 0.08 * f.buildProgress : f.section === "breakdown" ? 0.002 : 0.012 * (1 + f.drift));
    u.uChart.value = Math.min(1, Math.max(0.05, level));
  },
  fragment: /* glsl */ `
uniform float uSwell;
uniform vec4 uKicks;
uniform float uSweep;
uniform float uChart;  // level of the price chart, 0..1 (the mask sinks as it climbs)
uniform float uCrash;  // 1 on the drop: the chart collapses
uniform float uTitle;  // the night's title instead of the mask
${ART_LIB}
${HEAD_GLSL}
${CAMERA_GLSL}
float ring(float r, float age) {
  float R = .45 + age * 1.5;
  return sin((r - R) * 16.) * exp(-pow(r - R, 2.) * 7.) * exp(-age * 1.1);
}
float liquidH(vec2 xz) {
  float r = length(xz);
  float w = .012 * sin(r * 7. - uTime * 1.2) * exp(-r * .5);
  w += .012 * sin(xz.x * 3.1 + uTime * .7) * sin(xz.y * 2.7 - uTime * .5);
  w += .03 * uSwell * (ring(r, uKicks.x) + ring(r, uKicks.y) + ring(r, uKicks.z) + ring(r, uKicks.w));
  return -.32 + w;
}
float map(vec3 p) {
  float lq = (p.y - liquidH(p.xz)) * .75;
  if (uTitle > .5) {
    // the letters stand upright, their foot a little under the surface; they sink a little as the chart climbs
    // (the foot just above the surface: the second line must read; the waves of the drop lick it)
    vec3 h = p - vec3(0., -.24 - (uHeadMin.y + .11) - uChart * .04 + .02 * sin(uTime * .3), 0.);
    h.xz *= rot(sin(uTime * .1 + uSeed) * .12);
    return smin(lq, headD(h), .05);
  }
  vec3 h = p - vec3(0., .02 + .04 * sin(uTime * .3) - uChart * .4, 0.);
  h.xz *= rot(sin(uTime * .1 + uSeed) * .35);
  h.yz *= rot(.5);
  return smin(lq, headD(h), .16);
}
${MARCH}
/** The price at x (0..1 around the horizon): a steady climb with the chart's level, a cliff where it wraps. */
float price(float x) {
  return clamp(.08 + uChart * .8 * (.3 + .7 * fract(x)) + (vnoise(vec3(x * 40., uSeed, 0.)) - .5) * .1
               + (vnoise(vec3(x * 160., 1.3, 0.)) - .5) * .03, 0., 1.1);
}
/** A price chart glowing all around the horizon: its line and the area below it; the accent colour when it crashes. */
vec3 chart(vec3 r) {
  float y = (r.y - .02) / .3;
  if (y < -.05 || y > 1.2) return vec3(0.);
  float x = (atan(r.z, r.x) + PI) / (2. * PI) + uTime * .004;
  float v = price(x);
  float w = max(fwidth(y), .004);
  float line = 1. - smoothstep(w, w * 2.5, abs(y - v));
  float area = step(y, v) * smoothstep(0., v + .001, y) * .18;
  vec3 up = mix(uInk, vec3(.4, 1., .6), .35);
  return mix(up, uAccent * 1.3, step(.2, uCrash)) * (line * 1.6 + area);
}
/** Angle between two azimuths, wrapped. */
float azGap(float a, float b) { return abs(mod(a - b + PI, 2. * PI) - PI); }
/**
 * The product studio, fixed around the bath (azimuth 0 = the mask's front, +z; r.y >= 0): a luminous ceiling of
 * diffuser tiles over the set, deep enough that the bath catches its far end, and two tall strip softboxes on the
 * mask's sides, a little in front (they draw the cheeks), one white, one in the world's leading colour. The rest of
 * the room stays black: the dark between the lights is what draws a chrome shape. The seams of the ceiling bend over
 * the face like the zebra of a car designer.
 */
vec3 studio(vec3 r, float fw) {
  vec3 c = vec3(.02 + .05 * smoothstep(0., .8, r.y));
  // the luminous ceiling: 3 × 7 tiles from far behind the mask (what the bath sees) to over the camera (what the face
  // sees), brightest over the mask
  if (r.y > .1) {
    vec2 q = (r.xz / r.y - vec2(0., -.8)) / vec2(1.05, 2.8);
    vec2 aq = abs(q);
    float inside = (1. - smoothstep(.95, 1., aq.x)) * (1. - smoothstep(.97, 1., aq.y));
    vec2 g = (q + 1.) * vec2(1.5, 3.5);
    vec2 sd = abs(fract(g) - .5);
    // the seams, a hair under a tenth of a tile; gone where the chrome squeezes a tile under a few pixels
    float gw = fw * 1.4 / (r.y * r.y);
    vec2 seam = smoothstep(.45 - gw, .465 + gw, sd) * (1. - smoothstep(.06, .2, gw));
    float tile = .93 + .14 * hash12(floor(g) + 7.);
    float z = r.z / r.y;
    float heart = (1. - .3 * q.x * q.x) * (.45 + .55 * (1. - smoothstep(-1.6, 1.8, z))) * (.5 + .5 * smoothstep(-3.6, -1.8, z));
    c += vec3(2.2) * inside * tile * heart * (1. - .85 * max(seam.x, seam.y));
  }
  // the two strips: tall, narrow, a hot line down their middle; they breathe a little with the kick
  float az = atan(r.x, r.z);
  float tall = smoothstep(-.06, .03, r.y) * (1. - smoothstep(.86, .94, r.y)) * (.5 + .5 * smoothstep(-.05, .6, r.y));
  float d1 = azGap(az, 1.2) / .14, d2 = azGap(az, -1.2) / .14;
  float s1 = (1. - smoothstep(.8, 1., d1)) * (1. - .6 * d1 * d1), s2 = (1. - smoothstep(.8, 1., d2)) * (1. - .6 * d2 * d2);
  float pump = .88 + .24 * uBeat;
  c += mix(vec3(1.), uTint, .75) * 2. * s1 * tall * pump;
  c += vec3(1.8) * s2 * tall * pump;
  return c;
}
/** What the chrome sees in direction r; chartK: how much of the price chart it shows. */
vec3 env(vec3 r, float chartK) {
  // the pixel's footprint on the room (the seams of the ceiling fade where it is too large)
  float fw = length(fwidth(r));
  if (!(fw < 1.)) fw = 1.;
  // the drop: the studio goes dark while the blade passes, then comes back up
  float dark = smoothstep(0., .05, uSweep) * (1. - smoothstep(1.3, 2.8, uSweep));
  // below the horizon, the bath: the same studio, mirrored and darker
  vec3 c = studio(vec3(r.x, abs(r.y), r.z), fw) * mix(.5, 1., smoothstep(-.04, .01, r.y)) * (1. - .8 * dark);
  // the title's studio: a big softbox behind the camera, so the letters' faces read as bright chrome
  if (uTitle > .5) {
    vec3 sb = normalize(uCamPos - uCamTarget + vec3(0., .8, 0.));
    float k = dot(r, sb);
    c += mix(uInk, vec3(1.), .5) * 1.8 * smoothstep(.3, .8, k) * (.75 + .25 * smoothstep(-.2, .5, r.y));
    c += uTint * .9 * smoothstep(.15, .3, k) * (1. - smoothstep(.3, .45, k));
  }
  c += chart(r) * chartK;
  // The drop: in the darkened studio, a blade of light (a vertical plane turning about the mask) crosses the face
  // from one side to the other, its back half crossing the bath, then the lights come back up
  if (uSweep < 1.7) {
    float s = clamp(uSweep / 1.5, 0., 1.);
    s = 1. - (1. - s) * (1. - s);
    float side = fract(uSeed) > .5 ? 1. : -1.;
    float a = atan(uCamPos.x - uCamTarget.x, uCamPos.z - uCamTarget.z) + side * (3.9 * s - 1.95);
    float d = abs(dot(r, vec3(cos(a), 0., -sin(a))));
    float on = smoothstep(0., .04, uSweep) * (1. - smoothstep(1.3, 1.7, uSweep));
    c += (vec3(1.) * 9. * (1. - smoothstep(.035, .08, d)) + mix(uTint, vec3(1.), .35) * 1.8 * exp(-d * 12.)) * on;
  }
  return c;
}
void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 ro = uCamPos;
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));
  vec3 bg = uBase;
  // the chart also stands on the horizon itself, glowing in the dark
  vec3 col = bg + chart(rd) * .7;
  float tt = march(ro, rd, 14.);
  if (tt > 0.) {
    vec3 p = ro + rd * tt;
    vec3 n = calcNormal(p);
    float fre = pow(1. - clamp(dot(n, -rd), 0., 1.), 5.);
    // the chart glows in the bath; on the mask it would only draw a line round every contour
    float onMask = smoothstep(.02, .08, p.y - liquidH(p.xz));
    col = env(reflect(rd, n), 1. - .75 * onMask) * mix(uInk * .85, vec3(1.), fre);
    // under the title the bath stays a dark mirror, so the chrome letters stand out against it; the letters get a
    // satin sheen from the front, so that they read from every angle whatever the chrome mirrors
    col *= 1. - .75 * uTitle * (1. - onMask);
    col += mix(uInk, vec3(1.), .6) * .35 * uTitle * onMask * clamp(dot(n, -rd), 0., 1.);
    col *= .55 + .45 * calcAO(p, n);
    col = mix(col, bg, smoothstep(4., 12., tt));
  }
  gl_FragColor = vec4(hdrOut(col), step(0., tt));
}
`,
});
