import type * as THREE from "three";
import type { AudioFrame } from "@/lib/audio/AudioEngine";
import type { ParamDef, ParamValues } from "../types";
import { num } from "../utils";

/**
 * Shared pieces of the "Arcanes" world: a faceless robed figure (hood, pyramid or conical hat),
 * a cosmic robe (flowing contour lines dissolving into stars), neon outline, rainbow and starfield helpers.
 * Include after ART_LIB (needs hash12/hash13, vnoise, smin/smax, sdEllipsoid, sdCapsule).
 * Figure space: feet at y = -1.6, about 3 units tall, facing +z.
 */
export const ARCANE_GLSL = /* glsl */ `
uniform float uFlow;
uniform float uLines;
uniform float uRainbow;
uniform float uNeon;
uniform float uRobe;
uniform float uShift;

const float FEET = -1.6;

// ---------------------------------------------------------------- colour helpers
vec3 hue(float h) { return clamp(abs(fract(h + vec3(0., 2. / 3., 1. / 3.)) * 6. - 3.) - 1., 0., 1.); }
/** Prism spectrum, red (0) to violet (1). */
vec3 spectral(float t) { return hue(clamp(t, 0., 1.) * .78); }

/** Stars on the sky sphere: two layers of jittered points, twinkling. */
vec3 starfield(vec3 rd, float density) {
  vec3 col = vec3(0.);
  for (int i = 0; i < 2; i++) {
    float sc = i == 0 ? 70. : 150.;
    vec3 q = rd * sc;
    vec3 id = floor(q);
    vec3 f = fract(q) - .5;
    float h = hash13(id + float(i) * 17.);
    if (h > 1. - density) {
      vec3 o = (vec3(hash13(id + 1.3), hash13(id + 2.7), hash13(id + 5.1)) - .5) * .6;
      float d = length(f - o);
      float tw = .55 + .45 * sin(uTime * (1.5 + h * 4.) + h * 40.);
      col += (1. - smoothstep(0., .07 + .06 * h, d)) * tw * mix(vec3(1.), hue(h * 3.), .35) * (i == 0 ? 1. : .6);
    }
  }
  return col;
}

// ---------------------------------------------------------------- figure
float gHead;   // 0 hood, 1 pyramid, 2 conical hat
float gPose;   // 0 hands clasped at the waist, 1 right arm holding something forward
float gLift;   // 0..1 raises the held object
vec3 gHand;    // held object position (set by setupFigure)

void setupFigure(float head, float pose, float lift) {
  gHead = head;
  gPose = pose;
  gLift = lift;
  gHand = vec3(.6, .16 + .42 * lift, .64);
}

float sdPyramid(vec3 p, float h) {
  float m2 = h * h + .25;
  p.xz = abs(p.xz);
  p.xz = (p.z > p.x) ? p.zx : p.xz;
  p.xz -= .5;
  vec3 q = vec3(p.z, h * p.y - .5 * p.x, h * p.x + .5 * p.y);
  float s = max(-q.x, 0.);
  float t = clamp((q.y - .5 * p.z) / (m2 + .25), 0., 1.);
  float a = m2 * (q.x + s) * (q.x + s) + q.y * q.y;
  float b = m2 * (q.x + .5 * t) * (q.x + .5 * t) + (q.y - m2 * t) * (q.y - m2 * t);
  float d2 = min(q.y, -q.x * m2 - q.y * .5) > 0. ? 0. : min(a, b);
  return sqrt((d2 + q.z * q.z) / m2) * sign(max(q.z, -p.y));
}

/** Solid cone: base radius r at y0, apex at y1. */
float sdConeY(vec3 p, float r, float y0, float y1) {
  vec2 q = vec2(length(p.xz), p.y);
  vec2 n = normalize(vec2(y1 - y0, r));
  return max(dot(q - vec2(0., y1), n), y0 - q.y);
}

float sdRobe(vec3 p) {
  float top = .55;
  float h = clamp((top - p.y) / (top - FEET), 0., 1.);
  float a = atan(p.x, p.z);
  // Long vertical pleats, deeper toward the hem
  float r = mix(.3, .8, pow(h, .85)) + h * (.04 * sin(a * 9. + p.y * .7) + .02 * sin(a * 15. - p.y * 1.3));
  float d = max(length(p.xz * vec2(1., 1.3)) - r, max(p.y - top, FEET - p.y));
  d = smin(d, sdEllipsoid(p - vec3(0., .48, 0.), vec3(.46, .2, .3)), .16);
  return d * .8;
}

void armPoints(out vec3 elL, out vec3 hdL, out vec3 elR, out vec3 hdR) {
  elL = mix(vec3(-.46, -.12, .12), vec3(-.48, -.16, .03), gPose);
  hdL = mix(vec3(-.07, -.22, .36), vec3(-.4, -.58, .14), gPose);
  elR = mix(vec3(.46, -.12, .12), vec3(.6, .0, .28), gPose);
  hdR = mix(vec3(.07, -.22, .36), gHand - vec3(0., .1, .02), gPose);
}

float sdArms(vec3 p) {
  vec3 elL, hdL, elR, hdR;
  armPoints(elL, hdL, elR, hdR);
  float a = min(sdCapsule(p, vec3(-.36, .4, 0.), elL, .13), sdCapsule(p, elL, hdL, .115));
  float b = min(sdCapsule(p, vec3(.36, .4, 0.), elR, .13), sdCapsule(p, elR, hdR, .115));
  return min(a, b);
}

float sdHands(vec3 p) {
  vec3 elL, hdL, elR, hdR;
  armPoints(elL, hdL, elR, hdR);
  vec3 hl = hdL + normalize(hdL - elL) * .07;
  vec3 hr = hdR + normalize(hdR - elR) * .07;
  return min(length(p - hl) - .065, length(p - hr) - .065);
}

float sdFaceVoid(vec3 p) { return sdEllipsoid(p - vec3(0., .8, .02), vec3(.16, .2, .17)); }

float sdHood(vec3 p) {
  float outer = sdEllipsoid(p - vec3(0., .86, -.03), vec3(.27, .32, .3));
  outer = smin(outer, sdCapsule(p, vec3(0., 1.02, -.1), vec3(0., 1.45, -.17), .025), .17);
  float hole = sdEllipsoid(p - vec3(0., .82, .2), vec3(.16, .22, .2));
  return smax(outer, -hole, .03);
}

float sdHeadwear(vec3 p) {
  if (gHead < .5) return sdHood(p);
  if (gHead < 1.5) return sdPyramid((p - vec3(0., .78, 0.)) / .84, .9) * .84;
  return sdConeY(p, .68, .97, 1.36);
}

float figMap(vec3 p) {
  float d = smin(sdRobe(p), sdArms(p), .06);
  d = min(d, sdHands(p));
  d = min(d, sdFaceVoid(p));
  return min(d, sdHeadwear(p));
}

/** Material id at a hit: 0 cloth, 1 face void, 2 pyramid, 3 hat, 4 hand. */
float figPart(vec3 p) {
  float best = smin(sdRobe(p), sdArms(p), .06);
  float id = 0.;
  float h = sdHands(p);
  if (h < best) { best = h; id = 4.; }
  float v = sdFaceVoid(p);
  if (v < best) { best = v; id = 1.; }
  float w = sdHeadwear(p);
  if (w < best) id = gHead < .5 ? 0. : gHead < 1.5 ? 2. : 3.;
  return id;
}

vec3 figNormal(vec3 p) {
  const vec2 k = vec2(1, -1);
  const float e = .002;
  return normalize(k.xyy * figMap(p + k.xyy * e) + k.yyx * figMap(p + k.yyx * e) + k.yxy * figMap(p + k.yxy * e) + k.xxx * figMap(p + k.xxx * e));
}

/**
 * March the figure inside its bounding cylinder. Returns the hit distance (or -1) and, in dmin,
 * how close the ray came to the silhouette (for the neon halo).
 */
float figMarch(vec3 ro, vec3 rd, out float dmin) {
  dmin = 1e3;
  // Bounding cylinder r = 1.25 around the y axis
  float a = dot(rd.xz, rd.xz), b = dot(ro.xz, rd.xz), c = dot(ro.xz, ro.xz) - 1.56;
  float disc = b * b - a * c;
  if (disc < 0.) return -1.;
  float sq = sqrt(disc);
  float t = max((-b - sq) / a, 0.), t1 = (-b + sq) / a;
  for (int i = 0; i < 90; i++) {
    if (t > t1) break;
    float d = figMap(ro + rd * t);
    dmin = min(dmin, d);
    if (d < .0015) return t;
    t += d;
  }
  return -1.;
}

// ---------------------------------------------------------------- materials
/** Flowing contour field over the cloth. */
float robeField(vec3 p) {
  vec3 q = p * 2.3;
  q.xy += .6 * vec2(vnoise(q + vec3(0., uFlow, 0.)), vnoise(q + vec3(5.2, 1.3 - uFlow, 2.))) - .3;
  return vnoise(q * .9 + vec3(0., -uFlow * .35, 0.)) + .5 * vnoise(q * 1.9 + 3.1);
}

/** Small stars set into a surface. */
float surfaceStars(vec3 p, float dens) {
  vec3 q = p * 26.;
  vec3 id = floor(q);
  float h = hash13(id);
  if (h < 1. - dens) return 0.;
  vec3 o = (vec3(hash13(id + 1.1), hash13(id + 2.2), hash13(id + 3.3)) - .5) * .5;
  float d = length(fract(q) - .5 - o);
  return (1. - smoothstep(.03, .15, d)) * (.55 + .45 * sin(uTime * 3. + h * 60.));
}

/**
 * The cosmic robe: contour lines in palette / rainbow colours on a dark (or vivid) cloth,
 * dissolving into a starfield toward the hem. tint shifts the colours (several figures).
 */
vec3 robeColor(vec3 p, float tint) {
  float v = robeField(p) * uLines;
  float e = min(fract(v), 1. - fract(v));
  float w = fwidth(v);
  float lw = .035 + .035 * uBeat;
  float line = (1. - smoothstep(lw, lw + w * 1.5, e)) * (1. - smoothstep(.35, .7, w));
  float idx = floor(v + .5);
  vec3 lc = mix(pal(idx * .23 + uShift + tint), spectral(fract(idx * .137 + uShift + tint)), uRainbow) * 1.25;
  vec3 cloth = uRobe > .5 ? pal(tint + .1) * .55 + .03 : uBase * .6 + .015;
  vec3 c = mix(cloth, lc, line);
  // Toward the hem the lines dissolve into a starfield
  float m = 1. - smoothstep(-1.3, -.25, p.y + (vnoise(p * 3.) - .5) * .6);
  vec3 deep = uBase * .5 + pal(tint + .6) * .08 * vnoise(p * 2.5);
  vec3 sky = deep + surfaceStars(p, .55 + .25 * uTreble) * (vec3(.9, .95, 1.) + spectral(hash13(floor(p * 26.))) * .4);
  c = mix(c, sky, m);
  return c + surfaceStars(p * 1.7, .12) * .6 * (1. - m);
}

/** Pyramid drawn in horizontal lines, one face refracting a rainbow. */
vec3 pyramidColor(vec3 p, vec3 n) {
  float s = fract(p.y * 30. - uTime * .4);
  float stripe = smoothstep(.3, .4, s) * (1. - smoothstep(.8, .9, s));
  vec3 c = mix(vec3(.03), uInk * 1.15, stripe * (.45 + .55 * clamp(dot(n, normalize(vec3(-.5, .6, .6))), 0., 1.)));
  float prism = smoothstep(.3, .7, n.x);
  c = mix(c, spectral(clamp((p.y - .78) / .76 + .1 * sin(p.z * 6. + uTime), 0., 1.)) * (.4 + .9 * stripe) * (1. + uHat * .8), prism * .85);
  return c;
}

/** Conical hat in horizontal black and light stripes. */
vec3 hatColor(vec3 p) {
  float s = fract(p.y * 34. - uTime * .2);
  return mix(vec3(.02), vec3(.85) * (.6 + .4 * uInk), smoothstep(.45, .55, s));
}

/** Shaded colour of the figure at a hit. tint shifts the robe colours. */
vec3 shadeFigure(vec3 p, vec3 rd, float tint) {
  vec3 n = figNormal(p);
  float part = figPart(p);
  float dif = .55 + .45 * clamp(dot(n, normalize(vec3(-.4, .6, .7))), 0., 1.);
  vec3 c;
  if (part < .5) c = robeColor(p, tint) * dif;
  else if (part < 1.5) c = uBase * .2;
  else if (part < 2.5) c = pyramidColor(p, n);
  else if (part < 3.5) c = hatColor(p) * dif;
  else c = vec3(.02);
  // Neon outline
  float rim = pow(1. - abs(dot(n, -rd)), 2.5);
  c += mix(vec3(.25, .85, 1.), vec3(1., .88, .3), rim * rim) * rim * uNeon * (part > 3.5 ? 1.8 : .9);
  return c;
}

/** Neon halo hugging the silhouette, for rays that miss the figure. */
vec3 figHalo(float dmin) {
  return uNeon * (vec3(.3, .85, 1.) * exp(-dmin * 70.) * .9 + vec3(1., .85, .25) * exp(-dmin * 16.) * .22);
}
`;

/** Settings shared by every figure scene. */
export const arcaneParams = (lines = 12, rainbow = 0.5): ParamDef[] => [
  { type: "range", key: "lines", label: "Lignes de la robe", min: 5, max: 18, step: 1, default: lines },
  { type: "range", key: "rainbow", label: "Arc-en-ciel", min: 0, max: 1, step: 0.05, default: rainbow },
  { type: "range", key: "neon", label: "Contour néon", min: 0, max: 2, step: 0.05, default: 1 },
  {
    type: "select",
    key: "robe",
    label: "Robe",
    options: [
      { value: "dark", label: "Sombre" },
      { value: "vivid", label: "Vive" },
    ],
    default: "dark",
  },
];

export const arcaneUniforms = () => ({
  uFlow: { value: 0 },
  uLines: { value: 10 },
  uRainbow: { value: 0.5 },
  uNeon: { value: 1 },
  uRobe: { value: 0 },
  uShift: { value: 0 },
  uShiftTarget: { value: 0 },
});

/** Shared per-frame update: the contour lines flow with the energy, each drop shifts the colours. */
export function updateArcane(u: Record<string, THREE.IUniform>, f: AudioFrame, p: ParamValues, dt: number) {
  u.uFlow.value = (u.uFlow.value as number) + dt * (0.06 + 0.35 * f.volume + 0.4 * f.dropPulse);
  u.uLines.value = num(p.lines, 10);
  u.uRainbow.value = num(p.rainbow, 0.5);
  u.uNeon.value = num(p.neon, 1);
  u.uRobe.value = p.robe === "vivid" ? 1 : 0;
  if (f.drop) u.uShiftTarget.value = (u.uShiftTarget.value as number) + 0.37;
  const s = u.uShift.value as number;
  u.uShift.value = s + ((u.uShiftTarget.value as number) - s) * (1 - Math.exp(-dt * 2));
}
