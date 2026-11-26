import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";
import { CIRCUIT_GLSL } from "./circuit.glsl";

const approach = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-dt * rate));

/** The wheel's centre height, its radius, its cabins. */
const HUB = 62;
const RW = 55;
const CABINS = 24;

const FRAMINGS: Framing[] = [
  // across the water: the whole wheel and its reflection
  { az: 0.1, el: -0.1, dist: 200, target: [0, 42, 0], focal: 1.5, weight: 2 },
  { az: -0.45, el: -0.06, dist: 175, target: [0, 46, 0], focal: 1.6 },
  // three-quarters, closer
  { az: 0.7, el: 0.12, dist: 120, target: [0, 62, 0], focal: 1.8 },
  // the hub and its spokes
  { az: -0.25, el: 0.04, dist: 62, target: [0, 62, 0], focal: 1.9 },
  // from the shore, looking up at the cabins
  { az: 0.35, el: -0.32, dist: 85, target: [0, 70, 0], focal: 1.7 },
  // wide and low over the water
  { az: -0.15, el: -0.1, dist: 270, target: [0, 34, 0], focal: 1.5, weight: 2 },
];

/**
 * La Grande Roue: a giant wheel of light turning slowly over the sleeping fairground, mirrored in the water before
 * it: neon spokes and rims hung with bulbs, cabins swaying beneath the rim. On the kick a wave of light runs out
 * along the spokes from the hub; on the hats the bulbs chase round the rim. It turns, and goes nowhere. « Panne »
 * (the breakdowns): half of it dark, crackling, sparks dripping from a burnt junction; it slows to a stop, and
 * starts again. As the night drifts its bulbs die one by one.
 */
export const ferris = defineShaderScene({
  id: "circuit-ferris",
  name: "La Grande Roue",
  energy: "calm",
  hdr: true,
  mask: true,
  renderScale: 0.75,
  camera: { framings: FRAMINGS, glideBars: 4 },
  description:
    "Une roue de lumière géante tourne lentement au-dessus de la fête foraine endormie, reflétée dans l'eau : rayons et jantes de néon semés d'ampoules, nacelles suspendues. Au kick la lumière court le long des rayons, sur les charleys les ampoules font le tour de la jante. « Panne » : à moitié éteinte, elle grésille, lâche des étincelles, ralentit jusqu'à l'arrêt et repart.",
  params: [paletteParam("foraine"), { type: "toggle", key: "broken", label: "Panne", default: false }],
  uniforms: () => ({
    uRot: { value: Math.random() * 6.28 },
    uSpin: { value: 0.03 },
    uPulse: { value: 9 },
    uRim: { value: 0 },
    uBroken: { value: 0 },
    uClock: { value: 0 },
  }),
  update(u, f, p, dt) {
    const broken = p.broken === true;
    u.uBroken.value = approach(u.uBroken.value as number, broken ? 1 : 0, 1.5, dt);
    u.uClock.value = (u.uClock.value as number) + dt;
    // it turns at its own pace; broken, it slows to a stop and starts again (a 20 s cycle)
    const cyc = ((u.uClock.value as number) % 20) / 20;
    const want = broken ? 0.03 * Math.min(1, Math.abs(Math.cos(cyc * Math.PI)) * 1.6) * (cyc > 0.4 && cyc < 0.6 ? 0 : 1) : 0.03;
    u.uSpin.value = approach(u.uSpin.value as number, want, 0.6, dt);
    u.uRot.value = (u.uRot.value as number) + dt * (u.uSpin.value as number);
    u.uPulse.value = f.beat ? 0 : (u.uPulse.value as number) + dt;
    if (f.onset) u.uRim.value = (u.uRim.value as number) + 1;
  },
  fragment: /* glsl */ `
#define CABINS ${CABINS}.
uniform float uRot;     // the wheel's angle
uniform float uPulse;   // seconds since the kick: light running out along the spokes
uniform float uRim;     // the rim's chase, one step per hat
uniform float uBroken;  // Panne
uniform float uClock;
${ART_LIB}
${CAMERA_GLSL}
${CIRCUIT_GLSL}
const vec3 C = vec3(0., ${HUB}., 0.);
const float RW = ${RW}.;
const float SHORE = 30.;   // the water before the wheel (z > SHORE), the fairground behind
float gMat;               // 0 cabin, 1 legs, 2 hub

/** Whether a piece of the wheel still lights (dead bulbs as the night drifts, whole sectors out in Panne). */
float alive(float id) {
  float h = hash12(vec2(id, 4.7));
  float dead = step(h, uDrift * .55);
  float sector = step(.5, hash12(vec2(floor(id / 3.), 9.1))) * uBroken;
  float crackle = uBroken * step(.6, hash12(vec2(id, floor(uClock * 18.))));
  return (1. - dead) * (1. - sector) * (1. - .7 * crackle);
}

/** The light of one rim plane (z = zc) seen by the ray: rims, spokes, the inner ring, their bulbs. */
vec3 wheelPlane(vec3 ro, vec3 rd, float zc, float tmax, float pa) {
  if (abs(rd.z) < 1e-4) return vec3(0.);
  float t = (zc - ro.z) / rd.z;
  if (t < 0. || t > tmax) return vec3(0.);
  vec2 q = (ro + rd * t).xy - C.xy;
  float r = length(q);
  if (r > RW + 4.) return vec3(0.);
  float fw = t * pa / max(abs(rd.z), .06);
  q = rot(uRot) * q;
  float a = atan(q.y, q.x);
  const float N = CABINS;
  float sec = 6.2831853 / N;
  float k = floor(a / sec + .5);
  float ds = abs(sin(a - k * sec)) * r;
  vec3 neonC = mix(uTint, vec3(1., .6, .35), .35);
  vec3 bulb = vec3(1., .8, .5);
  vec3 c = vec3(0.);
  // the rims and the inner ring, neon tubes
  float onR = alive(floor(a / sec * 2.) + 100.);
  c += neonC * (neon(abs(r - RW), .28, fw) + .7 * neon(abs(r - RW + 3.), .14, fw) + .6 * neon(abs(r - 16.), .2, fw)) * onR * .8;
  // the spokes, and the light the kick sends out along them
  float onS = alive(k);
  float spoke = neon(ds, .16, fw) * step(r, RW) * step(3., r);
  float pulse = exp(-pow((r - uPulse * 70.) / 5., 2.)) * exp(-uPulse * .8);
  c += neonC * spoke * (.28 + 2.6 * pulse + 1.2 * uDrop) * onS;
  // the bulbs: along the spokes every 2 m, round the rim every 1.6 m (chasing on the hats)
  float nb = floor(r / 2.);
  float db = length(vec2(ds, (fract(r / 2.) - .5) * 2.));
  c += bulb * dotL(db, .24, fw) * 6. * step(r, RW - 1.) * step(4., r) * onS * (.6 + .4 * step(.5, fract(nb * .5 + uRim * .25)));
  float u = a * (RW + 1.2);
  float nr = floor(u / 1.6);
  float dr = length(vec2((fract(u / 1.6) - .5) * 1.6, r - RW - 1.2));
  c += mix(bulb, vec3(1., .25, .15), step(.66, fract(nr / 3.))) * dotL(dr, .26, fw) * 6. * alive(nr + 300.) * (.35 + .65 * step(.5, fract((nr - uRim) / 4.)));
  return c;
}

/** The cabins (hanging upright under the rim), the A-frame legs, the hub. */
float wheelD(vec3 p) {
  vec3 q = p - C;
  // the nearest cabin: its pivot on the rim, the cabin hanging beneath
  float a = atan(q.y, q.x) + uRot;
  float sec = 6.2831853 / CABINS;
  float k = floor(a / sec + .5);
  float th = k * sec - uRot;
  vec3 piv = vec3(cos(th), sin(th), 0.) * RW;
  float sway = .06 * sin(uTime * .7 + k);
  vec3 cq = q - piv;
  cq.xy = rot(sway) * cq.xy;
  float cab = sdBox(cq - vec3(0., -2.6, 0.), vec3(1.5, 1.4, 2.3)) - .25;
  float rod = sdCapsule(cq, vec3(0.), vec3(0., -1.3, 0.), .12);
  float d = min(cab, rod);
  gMat = 0.;
  // the legs: an A on either side
  vec3 lq = vec3(abs(p.x), p.y, abs(p.z));
  float leg = sdCapsule(lq, vec3(30., 0., 8.), vec3(0., C.y, 4.6), .9);
  float hub = max(length(q.xy) - 2.6, abs(q.z) - 5.);
  if (leg < d) { d = leg; gMat = 1.; }
  if (hub < d) { d = hub; gMat = 2.; }
  return d;
}

vec3 nrm(vec3 p, float e) {
  const vec2 k = vec2(1, -1);
  return normalize(k.xyy * wheelD(p + k.xyy * e) + k.yyx * wheelD(p + k.yyx * e) + k.yxy * wheelD(p + k.yxy * e) + k.xxx * wheelD(p + k.xxx * e));
}

float marchWheel(vec3 ro, vec3 rd, float tmax) {
  // only where the wheel can be: its slab (|z| < 10), up to the ground
  float t0 = 0., t1 = tmax;
  if (abs(rd.z) > 1e-5) {
    float ta = (-10. - ro.z) / rd.z, tb = (10. - ro.z) / rd.z;
    t0 = max(min(ta, tb), 0.);
    t1 = min(max(ta, tb), tmax);
  } else if (abs(ro.z) > 10.) return -1.;
  float t = t0;
  for (int i = 0; i < 110; i++) {
    if (t > t1) break;
    float d = wheelD(ro + rd * t);
    if (d < .002 * t) return t;
    t += d;
  }
  return -1.;
}

/** The night sky over the fair: blue-black, a few stars, a warm glow on the horizon. */
vec3 sky(vec3 rd) {
  vec3 c = mix(vec3(.006, .008, .02), vec3(.001, .002, .008), smoothstep(0., .5, rd.y));
  c += mix(uTint, vec3(1., .55, .3), .5) * .05 * exp(-abs(rd.y) * 10.);
  vec2 sp = vec2(atan(rd.x, rd.z) * 80., rd.y * 80.);
  c += vec3(.7, .8, 1.) * step(.99, hash12(floor(sp))) * smoothstep(.4, .1, length(fract(sp) - .5)) * smoothstep(.05, .3, rd.y) * .4;
  return c;
}

/** Sparks dripping from the burnt junction (Panne): glowing points falling and fading. */
vec3 sparks(vec3 ro, vec3 rd, float tmax, float pa) {
  vec3 acc = vec3(0.);
  float th = 1.1 - uRot;
  vec3 src = C + vec3(cos(th), sin(th), 0.) * (RW - 8.) + vec3(0., 0., 3.);
  for (int i = 0; i < 18; i++) {
    float fi = float(i);
    float life = fract(uClock * .8 + fi / 18.);
    vec3 v0 = vec3(hash12(vec2(fi, floor(uClock * .8 + fi / 18.))) - .5, .3, hash12(vec2(fi + 3., floor(uClock * .8 + fi / 18.))) - .5) * 9.;
    vec3 sp = src + v0 * life + vec3(0., -9.8, 0.) * life * life * .5 * 4.;
    vec3 oc = sp - ro;
    float tc = dot(oc, rd);
    if (tc < 0. || tc > tmax) continue;
    float d = length(oc - rd * tc);
    float r = max(.12, tc * pa);
    acc += vec3(1., .7, .35) * (.12 / r) * exp(-d * d / (r * r)) * (1. - life) * 3.;
  }
  return acc * uBroken * step(.3, hash12(vec2(floor(uClock * 6.), 1.)));
}

/** Everything but the water: the wheel, its light, the fairground, the sky. */
vec3 scene(vec3 ro, vec3 rd, float pa, bool reflected) {
  float tG = rd.y < -1e-4 ? -ro.y / rd.y : 1e5;
  float tw = reflected ? -1. : marchWheel(ro, rd, min(tG, 900.));
  vec3 col = sky(rd);
  float tEnd = 1e5;
  if (tw > 0.) {
    vec3 p = ro + rd * tw;
    wheelD(p);
    float m = gMat;
    vec3 n = nrm(p, max(.01, tw * pa));
    float fw = tw * pa;
    vec3 c = vec3(.012, .011, .012) + glassEnv(reflect(rd, n)) * fresnel(n, rd) * .4;
    // the wheel's own light falling on its iron
    c += vec3(1., .8, .5) * .05 * max(dot(n, normalize(C - p)), 0.) * (1. - .7 * uBroken);
    if (m < .5) {
      // a cabin: windows glowing warm (some dark), a light line round its roof
      vec3 q = p - C;
      float a = atan(q.y, q.x) + uRot;
      float k = floor(a / (6.2831853 / CABINS) + .5);
      float win = step(abs(fract(p.x * .7) - .5), .3) * step(abs(p.y - (C.y + sin(k * 6.2831853 / CABINS - uRot) * RW) + 2.4), .6);
      c += vec3(1., .78, .45) * win * .6 * alive(k + 50.) * step(.25, abs(n.z) + abs(n.x));
      c += uTint * neon(abs(p.y - (C.y + sin(k * 6.2831853 / CABINS - uRot) * RW) + 1.15), .05, fw) * .8 * alive(k + 70.);
    } else if (m < 1.5) {
      c += uTint * neon(abs(fract(p.y / 6.) - .5) * 6., .06, fw) * .25;
    } else {
      c += uTint * neon(abs(abs(p.z - C.z) - 4.9), .08, fw) * 1.2;
    }
    col = c;
    tEnd = tw;
  } else if (tG < 1e4 && (reflected || (ro + rd * tG).z < SHORE)) {
    // the sleeping fairground: dark ground, a few warm lamps, stalls' outlines
    vec3 p = ro + rd * tG;
    vec3 c = vec3(.008, .007, .007);
    vec2 g = floor(p.xz / 14.);
    vec2 o = fract(p.xz / 14.) - .5;
    float lamp = step(.82, hash12(g + 2.2)) * dotL(length(o) * 14., .35, tG * pa / max(-rd.y, .05));
    c += vec3(1., .7, .4) * lamp * 2.;
    c += vec3(1., .75, .45) * .05 * exp(-length(p.xz - C.xz) / 50.) * (1. - .6 * uBroken);
    col = mix(c, col, 1. - exp(-tG / 900.));
    tEnd = tG;
  }
  // the wheel's light, both rims (hidden by what stands before them)
  col += wheelPlane(ro, rd, 4.3, tEnd, pa) + wheelPlane(ro, rd, -4.3, tEnd, pa) * .9;
  if (!reflected) col += sparks(ro, rd, tEnd, pa);
  return col;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 ro = uCamPos;
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));
  float pa = 1. / (uRes.y * uFocal);
  vec3 col;
  float tG = rd.y < -1e-4 ? -ro.y / rd.y : 1e5;
  vec3 pG = ro + rd * tG;
  if (tG < 1e4 && pG.z > SHORE && ro.y > 0.) {
    // the water: black, rippled, mirroring the wheel and the sky
    float tw = marchWheel(ro, rd, tG);
    if (tw > 0.) col = scene(ro, rd, pa, false);
    else {
      vec3 n = normalize(vec3((vnoise(vec3(pG.xz * .15, uTime * .4)) - .5) * .08, 1., (vnoise(vec3(pG.xz * .15 + 5., uTime * .4)) - .5) * .08));
      vec3 rr = reflect(rd, n);
      float fr = fresnel(n, rd);
      col = vec3(.002, .003, .005) + scene(pG, rr, pa * 1.5, true) * (.35 + .65 * fr);
      col = mix(col, sky(rd), 1. - exp(-tG / 1200.));
    }
  } else col = scene(ro, rd, pa, false);
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
