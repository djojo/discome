import * as THREE from "three";
import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";
import { CIRCUIT_GLSL } from "./circuit.glsl";

const approach = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-dt * rate));

/** The coils round the tent, and the garlands from the mast to the ground. */
const COILS = 6;
const ARCS = 6;

const FRAMINGS: Framing[] = [
  // wide over the plain: the tent, its coils
  { az: 0.4, el: 0.08, dist: 175, target: [0, 16, 0], focal: 1.7, weight: 2 },
  { az: -1.1, el: 0.14, dist: 150, target: [0, 18, 0], focal: 1.6 },
  // low by a coil, the tent beyond
  { az: 0.52, el: 0.02, dist: 120, target: [0, 12, 0], focal: 1.9 },
  // high over it all
  { az: 2.4, el: 0.62, dist: 210, target: [0, 8, 0], focal: 1.6 },
  // close on the valance and its bulbs
  { az: -0.3, el: 0.12, dist: 72, target: [0, 9, 0], focal: 2 },
  { az: 1.9, el: 0.22, dist: 85, target: [0, 14, 0], focal: 1.8 },
];

/**
 * Le Chapiteau électrique: a huge big top alone on a dark plain, its striped canvas glowing from within, drawn in
 * thousands of bulbs (along its seams, its scalloped valance, the garlands strung from the mast to the ground), and
 * ringed by Tesla coils. Calm: the bulbs run in slow chases, the coils hum. Charge (the build): the coils charge, their
 * crowns of sparks grow, the bulbs falter (the power drawn away). The drop: arcs leap between the coils and the mast,
 * the plain flashes, the chases beat the time. The lightning respects the soft-flash setting.
 */
export const bigtop = defineShaderScene({
  id: "circuit-bigtop",
  name: "Le Chapiteau électrique",
  energy: "intense",
  hdr: true,
  mask: true,
  renderScale: 0.7,
  camera: { framings: FRAMINGS, glideBars: 3 },
  description:
    "Un chapiteau géant seul dans une plaine noire, sa toile rayée qui rougeoie de l'intérieur, dessiné de milliers d'ampoules (coutures, lambrequin, guirlandes du mât au sol) et cerné de bobines Tesla. En calme les ampoules courent en chenillard ; en « Charge » les bobines se chargent et les ampoules faiblissent ; au drop les arcs jaillissent entre les bobines et le mât, la plaine s'illumine, les chenillards battent le temps.",
  params: [paletteParam("foraine"), { type: "toggle", key: "charge", label: "Charge (les bobines se chargent)", default: false }],
  uniforms: () => ({
    uChase: { value: 0 },
    uCharge: { value: 0 },
    uArc: { value: 0 },
    uStrike: { value: 0 },
    uFlash: { value: 0 },
    uSafe: { value: 0 },
    uArcA: { value: Array.from({ length: ARCS }, () => new THREE.Vector4()) },
    uArcB: { value: Array.from({ length: ARCS }, () => new THREE.Vector4()) },
  }),
  update(u, f, p, dt) {
    const bar = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;
    const charging = p.charge === true && f.section === "build";
    // the coils' charge: through the build (in Charge), released on the drop
    const ch = charging ? f.buildProgress : 0;
    u.uCharge.value = approach(u.uCharge.value as number, ch, 3, dt);
    if (f.drop) u.uArc.value = 1;
    u.uArc.value = (u.uArc.value as number) * Math.exp(-dt / (bar * 1.4));
    const arc = u.uArc.value as number;
    // the chases: slow on their own; one step on every kick once the drop has struck
    let chase = (u.uChase.value as number) + dt * (charging ? 0.6 : 1.4);
    if (f.beat && (arc > 0.2 || f.section === "drop")) chase += 1;
    u.uChase.value = chase;
    // the arcs strike again on the beats of the drop (one softer hit with soft flashes)
    u.uSafe.value = f.safeFlash ? 1 : 0;
    if (f.drop || (f.beat && arc > 0.25 && !f.safeFlash)) {
      u.uStrike.value = (u.uStrike.value as number) + 1;
      u.uFlash.value = f.safeFlash ? 0.4 : 1;
      // new paths: each arc from a coil's crown to the mast's top or to the next coil
      const A = u.uArcA.value as THREE.Vector4[];
      const B = u.uArcB.value as THREE.Vector4[];
      for (let i = 0; i < ARCS; i++) {
        const k = Math.floor(Math.random() * COILS);
        const a = (k / COILS) * Math.PI * 2 + 0.3;
        A[i].set(Math.cos(a) * 68, 26.5, Math.sin(a) * 68, Math.random() * 100);
        if (Math.random() < 0.55) B[i].set(0, 37, 0, 1);
        else {
          const b = a + ((Math.random() < 0.5 ? -1 : 1) * Math.PI * 2) / COILS;
          B[i].set(Math.cos(b) * 68, 26.5, Math.sin(b) * 68, 1);
        }
      }
    }
    u.uFlash.value = (u.uFlash.value as number) * Math.exp(-dt * 9);
  },
  fragment: /* glsl */ `
#define COILS ${COILS}
#define ARCS ${ARCS}
uniform float uChase;    // the bulbs' chase (one step a unit)
uniform float uCharge;   // the coils' charge (the build, in Charge)
uniform float uArc;      // the drop's lightning, fading over bars
uniform float uStrike;   // which strike (new jags)
uniform float uFlash;    // the plain lit by a strike
uniform float uSafe;
uniform vec4 uArcA[ARCS];
uniform vec4 uArcB[ARCS];
${ART_LIB}
${CAMERA_GLSL}
${CIRCUIT_GLSL}

const float R = 40.;      // the tent's radius at the eave
const float EAVE = 8.;    // the sidewall's height
const float PEAK = 31.;   // the canvas at the mast
const float MAST = 37.;
const float SEAMS = 16.;
const float CR = 68.;     // the coils' ring
float gMat;               // 0 canvas, 1 sidewall, 2 mast, 3 coil, 4 ground

/** The canvas' height at radius r and angle a: a cone sagging between the seams. */
float canvasY(float r, float a) {
  float k = clamp(r / R, 0., 1.);
  float sag = (1. - cos(a * SEAMS)) * .5 * 1.6 * k * (1. - k) * 4.;
  return mix(PEAK, EAVE, pow(k, .75)) - sag;
}

float tentD(vec3 p) {
  float r = length(p.xz);
  float a = atan(p.z, p.x);
  float canvas = max(abs(p.y - canvasY(r, a)) - .15, r - R) * .55;
  float wall = max(abs(r - R) - .15, max(p.y - EAVE - .3, -p.y));
  float mast = max(length(p.xz) - .5, p.y - MAST);
  float d = min(canvas, wall);
  gMat = canvas < wall ? 0. : 1.;
  if (mast < d) { d = mast; gMat = 2.; }
  return d;
}

/** The nearest coil (polar repetition): a tapering tower on a plinth, a torus crowning it. */
float coilD(vec3 p) {
  float a = atan(p.z, p.x) - .3;
  float sec = 6.2831853 / float(COILS);
  float ai = floor(a / sec + .5) * sec + .3;
  vec3 q = p - vec3(cos(ai) * CR, 0., sin(ai) * CR);
  float r = length(q.xz);
  float tower = max(r - mix(2., 1.1, clamp(q.y / 24., 0., 1.)), max(q.y - 24., -q.y)) * .9;
  float plinth = sdBox(q - vec3(0., .8, 0.), vec3(3.2, .8, 3.2));
  float torus = length(vec2(length(q.xz) - 4.2, q.y - 26.)) - 1.4;
  return min(min(tower, plinth), torus);
}

float mapD(vec3 p) {
  float t = tentD(p);
  float m = gMat;
  float c = coilD(p);
  if (c < t) { t = c; m = 3.; }
  gMat = m;
  return t;
}

vec3 nrm(vec3 p, float e) {
  const vec2 k = vec2(1, -1);
  return normalize(k.xyy * mapD(p + k.xyy * e) + k.yyx * mapD(p + k.yyx * e) + k.yxy * mapD(p + k.yxy * e) + k.xxx * mapD(p + k.xxx * e));
}

/** A bulb lit or not in a chase of three: bulb n, its chain's own phase. */
float chaseOn(float n, float ph) {
  float dim = 1. - .65 * uCharge * (.7 + .3 * sin(uTime * 37. + n));
  return (.25 + .75 * step(.5, fract((n - uChase + ph) / 3.))) * dim;
}

vec3 bulbC() { return mix(vec3(1., .78, .45), uInk, .25); }

/** The bulbs along the canvas' seams and the valance, at p on the tent. */
vec3 tentBulbs(vec3 p, float fw) {
  float r = length(p.xz);
  float a = atan(p.z, p.x);
  float seg = 6.2831853 / SEAMS;
  float an = floor(a / seg + .5);
  float ds = abs(a - an * seg) * r;
  // along the seams, a bulb every 1.3 m
  float n = floor(r / 1.3);
  float d = length(vec2(ds, (fract(r / 1.3) - .5) * 1.3));
  vec3 c = bulbC() * dotL(d, .16, fw) * 5. * chaseOn(n + an * 7., 0.) * step(r, R);
  // the valance: a scalloped edge round the eave, a bulb every 1.1 m
  float u = a * R;
  float scal = EAVE - .5 - .55 * abs(sin(a * SEAMS * 2.));
  float nv = floor(u / 1.1);
  float dv = length(vec2((fract(u / 1.1) - .5) * 1.1, p.y - scal));
  c += mix(bulbC(), vec3(1., .2, .1), step(.5, fract(nv * .5))) * dotL(dv, .17, fw) * 5. * chaseOn(nv, 1.) * step(R - 1., r);
  return c;
}

/** The striped canvas glowing from within, lit by its bulbs (and the strikes). */
vec3 canvasColor(vec3 p, vec3 n, vec3 rd, float t, float pa) {
  float r = length(p.xz);
  float a = atan(p.z, p.x);
  float fw = t * pa / max(abs(dot(n, rd)), .1);
  float stripe = step(.5, fract(a / (6.2831853 / SEAMS) + .5 * step(R - .5, r)));
  vec3 cloth = mix(vec3(.55, .05, .04), vec3(.75, .62, .45), stripe);
  // the light within, warmer low down, dimmed while the coils draw the power
  float within = (.08 + .1 * smoothstep(PEAK, EAVE, p.y)) * (1. - .55 * uCharge);
  vec3 c = cloth * within + cloth * (uFlash * .25 + uArc * .05) * vec3(.7, .8, 1.);
  c += tentBulbs(p, fw);
  return c;
}

vec3 coilColor(vec3 p, vec3 n, vec3 rd, float t, float pa) {
  float fw = t * pa;
  vec3 c = vec3(.01, .011, .013) + glassEnv(reflect(rd, n)) * fresnel(n, rd) * .5;
  // copper windings catching the bulbs' and the arcs' light
  float wind = .5 + .5 * sin(p.y * 40.);
  c += vec3(.6, .3, .12) * wind * .05 * step(p.y, 24.) * step(1.8, p.y);
  // the torus: polished, the arcs' light on it
  c += vec3(.7, .8, 1.) * smoothstep(24.5, 26., p.y) * (.03 + .5 * uCharge * uCharge + .6 * uArc);
  c += vec3(.7, .8, 1.) * (uFlash * .4 + uCharge * .1) * max(n.y, .2);
  // a ring of light round the plinth
  c += uTint * neon(abs(p.y - 1.6), .06, fw) * .8;
  return c;
}

/** A jagged bolt from a to b (seed): glow seen by the ray, up to tmax. */
float bolt(vec3 ro, vec3 rd, vec3 a, vec3 b, float seed, float tmax, float pa, float w) {
  float acc = 0.;
  vec3 prev = a;
  vec3 ab = b - a;
  vec3 side = normalize(cross(ab, vec3(0., 1., 0.)) + 1e-3);
  vec3 up2 = normalize(cross(side, ab));
  float L = length(ab);
  for (int i = 1; i <= 8; i++) {
    float u = float(i) / 8.;
    float j = i == 8 ? 0. : 1.;
    vec2 o = (vec2(hash12(vec2(seed, float(i))), hash12(vec2(float(i), seed + 3.1))) - .5) * L * .16 * sin(u * 3.1416) * j;
    vec3 cur = a + ab * u + side * o.x + up2 * o.y;
    // closest approach of the ray to this segment
    vec3 ba = cur - prev, wo = ro - prev;
    float bb = dot(ba, ba), bd = dot(ba, rd), dw = dot(rd, wo), ew = dot(ba, wo);
    float h = clamp((ew - bd * dw) / max(bb - bd * bd, 1e-6), 0., 1.);
    float t = max(dot(prev + ba * h - ro, rd), 0.);
    if (t < tmax) {
      float d = length(ro + rd * t - prev - ba * h);
      float r = max(w, t * pa);
      acc += (w / r) * exp(-d * d / (r * r)) * 2. + .06 * halo(d, r * 6.);
    }
    prev = cur;
  }
  return acc;
}

/** The garlands of bulbs strung from the mast's top to the ground, seen by the ray. */
vec3 garlands(vec3 ro, vec3 rd, float tmax, float pa) {
  vec3 acc = vec3(0.);
  const float N = 12.;
  vec3 top = vec3(0., MAST - .5, 0.);
  for (int g = 0; g < 12; g++) {
    float a = float(g) / N * 6.2831853 + .26;
    vec3 stake = vec3(cos(a) * 62., 0., sin(a) * 62.);
    // three spans sagging along a catenary
    vec3 prev = top;
    for (int k = 1; k <= 3; k++) {
      float u = float(k) / 3.;
      vec3 cur = mix(top, stake, u) - vec3(0., 5. * sin(u * 3.1416), 0.);
      vec3 ba = cur - prev, wo = ro - prev;
      float bb = dot(ba, ba), bd = dot(ba, rd), dw = dot(rd, wo), ew = dot(ba, wo);
      float h = clamp((ew - bd * dw) / max(bb - bd * bd, 1e-6), 0., 1.);
      float t = max(dot(prev + ba * h - ro, rd), 0.);
      if (t < tmax) {
        vec3 q = prev + ba * h;
        float d = length(ro + rd * t - q);
        float along = (float(k - 1) + h) * sqrt(bb);
        float n = floor(along / 1.5);
        float db = length(vec2(d, (fract(along / 1.5) - .5) * 1.5));
        float fw = t * pa;
        acc += bulbC() * dotL(db, .15, fw) * 5. * chaseOn(n + float(g) * 5., 2.);
        // the wire, barely
        acc += vec3(.02) * neon(d, .02, fw);
      }
      prev = cur;
    }
  }
  return acc;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 ro = uCamPos;
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));
  float pa = 1. / (uRes.y * uFocal);

  // the night: deep blue, a few stars
  vec3 col = mix(vec3(.006, .008, .02), vec3(.001, .002, .008), smoothstep(0., .5, rd.y));
  col += uTint * .04 * exp(-abs(rd.y) * 12.);
  vec2 sp = vec2(atan(rd.x, rd.z) * 80., rd.y * 80.);
  col += vec3(.7, .8, 1.) * step(.99, hash12(floor(sp))) * smoothstep(.4, .1, length(fract(sp) - .5)) * smoothstep(.05, .3, rd.y) * .4;
  // the strikes light the sky
  col += vec3(.5, .6, 1.) * uFlash * .08 * smoothstep(-.1, .4, rd.y);

  float tG = rd.y < -1e-4 ? -ro.y / rd.y : 1e5;
  float t = .1;
  bool hit = false;
  for (int i = 0; i < 140; i++) {
    vec3 p = ro + rd * t;
    float d = mapD(p);
    if (d < .002 * t) { hit = true; break; }
    t += d;
    if (t > min(tG, 900.)) break;
  }
  float tEnd = 1e5;
  if (hit) {
    vec3 p = ro + rd * t;
    mapD(p);
    float m = gMat;
    vec3 n = nrm(p, max(.01, t * pa));
    vec3 c;
    if (m < .5) c = canvasColor(p, n, rd, t, pa);
    else if (m < 1.5) {
      // the sidewall: the same cloth, glowing, a bulb every 1.1 m along its top
      c = canvasColor(p, n, rd, t, pa) * .9;
    } else if (m < 2.5) c = vec3(.02, .015, .01) + bulbC() * neon(abs(p.y - MAST + .3), .2, t * pa) * 3.;
    else c = coilColor(p, n, rd, t, pa);
    col = mix(c, col, 1. - exp(-t / 1500.));
    tEnd = t;
  } else if (tG < 1e4) {
    // the plain: dark earth, the tent's warm light pooled round it, the coils' rings, the strikes
    vec3 p = ro + rd * tG;
    float r = length(p.xz);
    vec3 c = vec3(.012, .01, .009) * (.6 + .4 * vnoise(vec3(p.xz * .3, 1.)));
    c *= .3;
    c += bulbC() * .06 * exp(-max(r - R, 0.) / 18.) * (1. - .5 * uCharge);
    c += vec3(.6, .7, 1.) * uFlash * .12 * exp(-r / 160.);
    float a = atan(p.z, p.x) - .3;
    float sec = 6.2831853 / float(COILS);
    float ai = floor(a / sec + .5) * sec + .3;
    float dc = length(p.xz - vec2(cos(ai), sin(ai)) * CR);
    c += uTint * exp(-dc * .35) * (.05 + .3 * uCharge + .3 * uArc);
    col = mix(c, col, 1. - exp(-tG / 1200.));
    tEnd = tG;
  }
  col += garlands(ro, rd, tEnd, pa);

  // the coils' crowns: a corona growing with the charge, small sparks on the hats
  for (int k = 0; k < COILS; k++) {
    float a = float(k) / float(COILS) * 6.2831853 + .3;
    vec3 c0 = vec3(cos(a) * CR, 26., sin(a) * CR);
    vec3 oc = c0 - ro;
    float tc = dot(oc, rd);
    if (tc < 0. || tc > tEnd + 3.) continue;
    float dd = length(oc - rd * tc);
    float r = max(1.4, tc * pa * 2.);
    col += vec3(.6, .7, 1.) * halo(dd, r * 3.) * (.05 + .9 * uCharge * uCharge + .4 * uArc);
    if (uCharge > .05 || uArc > .05) {
      float sp = hash12(vec2(float(k), floor(uTime * 14.)));
      vec3 dir = normalize(vec3(sin(sp * 31.), .3 + sp, cos(sp * 17.)));
      col += vec3(.7, .8, 1.) * bolt(ro, rd, c0, c0 + dir * (3. + 6. * uCharge), sp * 50. + float(k), tEnd, pa, .05) * uHat * (uCharge + uArc) * 1.5;
    }
  }
  // the drop's arcs, re-struck on the beats
  if (uArc > .02) {
    for (int i = 0; i < ARCS; i++) {
      float flick = .55 + .45 * step(.3, hash12(vec2(float(i), floor(uTime * (uSafe > .5 ? 6. : 20.)))));
      col += mix(vec3(.65, .75, 1.), uTint, .25) * bolt(ro, rd, uArcA[i].xyz, uArcB[i].xyz, uArcA[i].w + uStrike * 7., tEnd, pa, .09) * uArc * flick * 1.8;
    }
  }
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
