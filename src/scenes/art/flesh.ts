import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { num } from "../utils";
import { ART_LIB, MARCH } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";

const FRAMINGS: Framing[] = [
  { az: 0, el: 0.05, dist: 5, target: [0, 0, 0], focal: 2, weight: 3 },
  { az: 0.8, el: 0.3, dist: 4.6, target: [0, 0.1, 0], focal: 2, weight: 2 },
  { az: -1.2, el: -0.1, dist: 4.8, target: [0, 0, 0], focal: 2, weight: 2 },
  { az: 0.35, el: 0.15, dist: 2.8, target: [0.3, 0.2, 0.6], focal: 2.2, weight: 1 },
  { az: 2.6, el: 0.2, dist: 5, target: [0, 0, 0], focal: 2, weight: 2 },
];

/**
 * Organic matter, translucent and pearly. The form breathes slowly at its own pace; the music lives in its light:
 * the inner glow beats with the kick, a ring of light runs over the skin, the drop blooms from inside.
 */
export const flesh = defineShaderScene({
  id: "flesh",
  name: "Chair",
  energy: "calm",
  renderScale: 0.7,
  mask: true,
  camera: { framings: FRAMINGS, glideBars: 2 },
  description: "Matière organique translucide et nacrée qui respire lentement ; la lumière intérieure bat avec la musique, le drop l'embrase.",
  params: [
    paletteParam("flesh"),
    { type: "range", key: "breath", label: "Respiration", min: 0, max: 2, step: 0.05, default: 1 },
    { type: "range", key: "detail", label: "Relief", min: 0.6, max: 2, step: 0.05, default: 1.1 },
  ],
  uniforms: () => ({ uBreath: { value: 1 }, uDetail: { value: 1.1 }, uWave: { value: 9 } }),
  update(u, f, p, dt) {
    u.uBreath.value = num(p.breath, 1);
    u.uDetail.value = num(p.detail, 1.1);
    u.uWave.value = f.beat ? 0 : (u.uWave.value as number) + dt;
  },
  fragment: /* glsl */ `
uniform float uBreath;
uniform float uDetail;
uniform float uWave;
${ART_LIB}
${CAMERA_GLSL}
vec3 toMatter(vec3 p) {
  p.xz *= rot(uTime * .05 + uSeed);
  p.xy *= rot(uTime * .035);
  return p;
}
float map(vec3 p) {
  p = toMatter(p);
  // a slow breath, its own tempo (not the beat)
  float pulse = 1. + .03 * sin(uTime * .45) * uBreath;
  float d = length(p) - pulse * .9;
  d -= (fbm3(p * uDetail + vec3(uSeed, uTime * .08, 0.)) - .5) * .5;
  d = smin(d, length(p - vec3(1.05 * sin(uTime * .2), .6 * cos(uTime * .15), .4)) - .34, .38);
  d = smin(d, length(p - vec3(-.9, -.7 * sin(uTime * .17), .5 * cos(uTime * .21))) - .27, .32);
  return d * .7;
}
${MARCH}
void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 ro = uCamPos;
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));
  vec3 col = uBase + uAccent * .12 * exp(-length(uv - vec2(.05, .1)) * 2.);
  float tt = march(ro, rd, 9.);
  if (tt > 0.) {
    vec3 p = ro + rd * tt;
    vec3 n = calcNormal(p);
    float ao = calcAO(p, n);
    // Lights follow the framing: a soft key from the camera side, a back light for the translucency
    vec3 V = normalize(uCamPos - uCamTarget);
    vec3 F = normalize(V + vec3(-.6, .4, 0.));
    vec3 L = normalize(-V + vec3(0., .8, 0.));
    float dif = clamp(dot(n, F) * .5 + .5, 0., 1.);
    float sss = clamp(map(p + L * .3) / .3, 0., 1.);
    float fre = pow(1. - clamp(dot(n, -rd), 0., 1.), 3.);
    vec3 glow = mix(uAccent, vec3(1., .42, .3), .6);
    col = mix(uPal1 * .55, uInk, dif * dif) * (.12 + .68 * dif);
    col *= mix(uAccent * 1.2, vec3(1.), ao * ao);
    // The inner light beats with the kick and blooms on the drop
    float inner = (.25 + .35 * uBass + .6 * uBeat) * (1. + 3. * uDrop);
    col += glow * sss * inner;
    col += glow * pow(fre, 1.5) * clamp(dot(n, L) + .4, 0., 1.) * (.9 + 1.5 * uDrop);
    float s = pow(clamp(dot(reflect(-F, n), -rd), 0., 1.), 28.);
    vec3 irid = .5 + .5 * cos(6.2831 * (fre * 1.3 + vec3(0., .33, .67)));
    col += s * .3 * mix(vec3(1.), irid, .6) + fre * irid * .1;
    // A ring of light running over the skin from a pole on every kick
    vec3 m = toMatter(p);
    float r = acos(clamp(dot(normalize(m), normalize(vec3(.3, 1., .2))), -1., 1.));
    col += irid * exp(-pow(r - uWave * 2.2, 2.) * 40.) * exp(-uWave * 1.6) * .8;
  }
  col = aces(col * 1.1);
  col *= vignette(fc / uRes);
  gl_FragColor = vec4(col, step(0., tt));
}
`,
});
