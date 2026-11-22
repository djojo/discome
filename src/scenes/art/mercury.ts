import * as THREE from "three";
import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { num } from "../utils";
import { ART_LIB, MARCH } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";
import { HEAD_GLSL, headParam, headUniforms, setHead } from "./heads";

const FRAMINGS: Framing[] = [
  { az: 0, el: 0.12, dist: 3.6, target: [0, -0.05, 0], focal: 2.1, weight: 2 },
  { az: 0.9, el: 0.2, dist: 3.6, target: [0, -0.05, 0], focal: 2.1, weight: 2 },
  { az: -0.7, el: 0.05, dist: 3.2, target: [0, -0.05, 0], focal: 2.1, weight: 2 },
  { az: 0.2, el: 0.03, dist: 2.2, target: [0, 0, 0.3], focal: 2.3, weight: 2 },
  { az: 1.6, el: 0.45, dist: 4.2, target: [0, -0.25, 0], focal: 2, weight: 2 },
  { az: -2.2, el: 0.25, dist: 3.8, target: [0, -0.05, 0], focal: 2.1, weight: 1 },
];

/**
 * A chrome mask rising from a bath of liquid metal; colour only exists in the reflections.
 * The mask stays still. Each kick sends a ring across the liquid from the mask; the drop sweeps a blade of
 * light across the chrome.
 */
export const mercury = defineShaderScene({
  id: "mercury",
  name: "Mercure",
  tag: "Visage",
  energy: "medium",
  renderScale: 0.7,
  mask: true,
  camera: { framings: FRAMINGS, glideBars: 2 },
  description: "Masque chromé immobile dans un bain de métal liquide : chaque kick lance un anneau, le drop fait passer une lame de lumière.",
  params: [paletteParam("mercury"), headParam(), { type: "range", key: "swell", label: "Houle", min: 0, max: 2, step: 0.05, default: 1 }],
  uniforms: () => ({
    ...headUniforms(),
    uSwell: { value: 1 },
    uKicks: { value: new THREE.Vector4(9, 9, 9, 9) },
    uSweep: { value: 9 },
  }),
  update(u, f, p, dt) {
    setHead(u, p.head);
    u.uSwell.value = num(p.swell, 1);
    // Ages of the last four kicks: each one is a ring travelling outward
    const k = u.uKicks.value as THREE.Vector4;
    k.addScalar(dt);
    if (f.beat) k.set(0, k.x, k.y, k.z);
    const bar = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;
    u.uSweep.value = f.drop ? 0 : (u.uSweep.value as number) + dt / bar;
  },
  fragment: /* glsl */ `
uniform float uSwell;
uniform vec4 uKicks;
uniform float uSweep;
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
  vec3 h = p - vec3(0., .02 + .04 * sin(uTime * .3), 0.);
  h.xz *= rot(sin(uTime * .1 + uSeed) * .35);
  h.yz *= rot(.5);
  return smin(lq, headD(h), .16);
}
${MARCH}
vec3 env(vec3 r) {
  float az = atan(r.z, r.x) + uTime * .05;
  float el = r.y;
  vec3 c = uBase * 1.3 + uInk * .27 * smoothstep(-.05, .95, el) + uAccent * .04 * (1. - smoothstep(-.4, .1, el));
  float a1 = abs(mod(az - .8 + PI, 2. * PI) - PI);
  c += uAccent * 3.6 * (1. - smoothstep(.015, .04, abs(el - .28))) * (1. - smoothstep(.5, .75, a1));
  float a2 = abs(mod(az + 2.3 + PI, 2. * PI) - PI);
  c += uPal1 * 3. * (1. - smoothstep(.02, .05, abs(el - .08))) * (1. - smoothstep(.7, .95, a2));
  c += vec3(1.) * 1.1 * smoothstep(.9, .98, el);
  // The drop: a vertical blade of light sweeping once around the room
  if (uSweep < 1.3) {
    float as = abs(mod(az - (uSweep * 2. * PI - PI) + PI, 2. * PI) - PI);
    c += vec3(1.) * 5. * (1. - smoothstep(.03, .12, as)) * (1. - uSweep * .7);
  }
  return c;
}
void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 ro = uCamPos;
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));
  vec3 bg = uBase;
  vec3 col = bg;
  float tt = march(ro, rd, 14.);
  if (tt > 0.) {
    vec3 p = ro + rd * tt;
    vec3 n = calcNormal(p);
    float fre = pow(1. - clamp(dot(n, -rd), 0., 1.), 5.);
    col = env(reflect(rd, n)) * mix(uInk * .85, vec3(1.), fre);
    col *= .55 + .45 * calcAO(p, n);
    col = mix(col, bg, smoothstep(4., 12., tt));
  }
  col = aces(col);
  col *= vignette(fc / uRes);
  gl_FragColor = vec4(col, step(0., tt));
}
`,
});
