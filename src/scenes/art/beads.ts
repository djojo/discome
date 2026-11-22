import * as THREE from "three";
import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB, MARCH } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";
import { STUDIO_GLSL } from "./studio.glsl";

/** Mercury beads floating together. */
const N = 9;

const FRAMINGS: Framing[] = [
  { az: 0, el: 0.15, dist: 5.2, target: [0, 0, 0], focal: 1.9, weight: 3, tag: "open" },
  { az: 1.2, el: -0.25, dist: 4.4, target: [0, 0, 0], focal: 2, weight: 2 },
  { az: -0.6, el: 0.3, dist: 2.6, target: [0.3, 0.1, 0], focal: 2.2, weight: 2 },
  { az: 2.4, el: 0.5, dist: 6.8, target: [0, 0, 0], focal: 1.8, weight: 2, tag: "open" },
];

const smooth = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

/**
 * Billes: drops of mercury floating weightless, brushing, merging and parting at their own pace in a dark studio
 * whose lights they reflect (and each other). They swell with the bass and are thrown apart a little on the kick;
 * on the drop they all flow into one big sphere that bursts into hundreds of beads, then gather again.
 */
export const beads = defineShaderScene({
  id: "mercury-beads",
  name: "Billes",
  energy: "medium",
  renderScale: 0.75,
  mask: true,
  camera: { framings: FRAMINGS, glideBars: 2 },
  description:
    "Gouttes de mercure en apesanteur qui se frôlent, fusionnent et se séparent ; elles gonflent sur les basses, au drop elles fusionnent en une sphère qui éclate en centaines de billes.",
  params: [paletteParam("mercury")],
  uniforms: () => ({
    uB: { value: Array.from({ length: N }, () => new THREE.Vector4(0, 0, 0, 0.3)) },
    uK: { value: 0.3 },
    uBurst: { value: 99 },
    uGlint: { value: 0 },
    // CPU side only
    uPh: { value: Array.from({ length: N * 4 }, () => Math.random()) },
    uLow: { value: 0 },
    uKickAge: { value: 9 },
    uDropAge: { value: 99 },
    uLast: { value: -99 },
  }),
  update(u, f, _p, dt, ctx) {
    if (f.time - (u.uLast.value as number) > 1.5) u.uDropAge.value = 99;
    u.uLast.value = f.time;
    const b = u.uLow.value as number;
    const low = b + (f.bass - b) * (1 - Math.exp(-dt * (f.bass > b ? 12 : 3)));
    u.uLow.value = low;
    u.uKickAge.value = f.beat ? 0 : (u.uKickAge.value as number) + dt;
    const kick = Math.exp(-(u.uKickAge.value as number) * 5);
    if (f.drop) {
      u.uDropAge.value = 0;
      ctx.camera?.request("open");
    } else u.uDropAge.value = (u.uDropAge.value as number) + dt;
    // The drop: all flow together (.45 s), hold, burst; the beads then grow back out of the centre
    const td = u.uDropAge.value as number;
    const merge = td < 0.45 ? smooth(td / 0.45) : td < 0.8 ? 1 : 0;
    const after = td >= 0.8 && td < 6;
    u.uBurst.value = after ? td - 0.8 : 99;
    const regrow = after ? smooth((td - 0.8 - 0.5) / 2.5) : 1;
    u.uK.value = 0.3 + 0.35 * merge;
    u.uGlint.value = kick;

    const ph = u.uPh.value as number[];
    const beadsV = u.uB.value as THREE.Vector4[];
    const t = f.time * 0.22;
    for (let i = 0; i < N; i++) {
      const a = ph[i * 4], c = ph[i * 4 + 1], d = ph[i * 4 + 2], s = ph[i * 4 + 3];
      let x = Math.sin(t * (0.7 + 0.3 * a) + a * 6.28) * 1.15;
      let y = Math.sin(t * (0.5 + 0.4 * c) + c * 6.28) * 0.75;
      let z = Math.sin(t * (0.6 + 0.3 * d) + d * 6.28) * 0.9;
      const spread = (1 + 0.3 * kick) * (after ? Math.max(regrow, 0.05) : 1) * (1 - merge);
      x *= spread;
      y *= spread;
      z *= spread;
      let r = (0.2 + 0.22 * s) * (1 + 0.4 * low);
      r = r + (0.5 - r) * merge;
      if (after) r *= regrow;
      beadsV[i].set(x, y, z, r);
    }
  },
  fragment: /* glsl */ `
uniform vec4 uB[${N}];
uniform float uK;        // how softly they melt into each other
uniform float uBurst;    // seconds since the burst
uniform float uGlint;    // the kick on the highlights
${ART_LIB}
${CAMERA_GLSL}
${STUDIO_GLSL}

float beadsD(vec3 p) {
  float d = 1e3;
  for (int i = 0; i < ${N}; i++) {
    vec4 b = uB[i];
    if (b.w > .005) d = smin(d, length(p - b.xyz) - b.w, uK);
  }
  return d;
}

/** The burst: hundreds of beads flying out on a sphere, one per cell of a cube map of directions. */
float burstD(vec3 p) {
  if (uBurst > 3.6) return 1e3;
  float R = .6 + 3.2 * (1. - exp(-uBurst * 1.4));
  float rb = .075 * (1. - smoothstep(1.8, 3.6, uBurst));
  float shell = abs(length(p) - R) - .5;
  if (shell > .2) return shell;
  vec3 a = abs(p);
  vec3 n;
  vec2 uv;
  if (a.x >= a.y && a.x >= a.z) { n = vec3(sign(p.x), 0., 0.); uv = p.yz / a.x; }
  else if (a.y >= a.z) { n = vec3(0., sign(p.y), 0.); uv = p.zx / a.y; }
  else { n = vec3(0., 0., sign(p.z)); uv = p.xy / a.z; }
  const float G = 8.;
  vec2 cell = floor((uv * .5 + .5) * G);
  vec2 c = (cell + .5) / G * 2. - 1.;
  vec3 key = n * 11. + vec3(cell, 0.) + vec3(0., 0., n.x * 3. + n.y * 5.);
  float h = hash13(key);
  if (h > .72) return .1;
  vec3 dir = n.x != 0. ? vec3(n.x, c.x, c.y) : n.y != 0. ? vec3(c.y, n.y, c.x) : vec3(c.x, c.y, n.z);
  vec3 ctr = normalize(dir) * R * (.88 + .3 * hash13(key + 1.7));
  return min(length(p - ctr) - rb * (.6 + .8 * hash13(key + 3.1)), .15);
}

float map(vec3 p) { return min(beadsD(p), burstD(p)); }
${MARCH}

/** A short march for the reflected ray: the other beads seen in a bead. */
float march2(vec3 ro, vec3 rd, float tmax) {
  float t = .02;
  for (int i = 0; i < 48; i++) {
    float d = map(ro + rd * t);
    if (d < .002) return t;
    t += d;
    if (t > tmax) break;
  }
  return -1.;
}

/** Liquid chrome: the studio in the reflection, the neighbouring beads in it too, colour only from the lights. */
vec3 chrome(vec3 p, vec3 n, vec3 rd) {
  vec3 r = reflect(rd, n);
  float fre = pow(1. - clamp(dot(n, -rd), 0., 1.), 5.);
  vec3 c = studio(r);
  float t2 = march2(p + n * .01, r, 6.);
  if (t2 > 0.) {
    vec3 q = p + n * .01 + r * t2;
    c = studio(reflect(r, calcNormal(q))) * .5;
  }
  c *= mix(uInk * .85, vec3(1.), fre);
  c *= .45 + .55 * calcAO(p, n);
  // the kick catches the brightest highlights
  return c * (1. + uGlint * .8 * smoothstep(1.2, 2.5, dot(c, vec3(.33))));
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 ro = uCamPos;
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));
  // the studio's dark, a soft light behind the beads
  vec3 col = uBase * .8 + uInk * .045 * exp(-2. * length(uv));
  float solid = 0.;
  float tt = march(ro, rd, 16.);
  if (tt > 0.) {
    vec3 p = ro + rd * tt;
    col = chrome(p, calcNormal(p), rd);
    solid = 1.;
  }
  col = aces(col);
  col *= vignette(fc / uRes);
  gl_FragColor = vec4(col, solid);
}
`,
});
