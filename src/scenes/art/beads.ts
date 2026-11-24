import * as THREE from "three";
import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB, MARCH } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";
import { STUDIO_GLSL } from "./studio.glsl";
import { DETAIL_GLSL } from "./detail.glsl";

/** Mercury drops on the plate. */
const N = 8;
/** Fingers round the splash's crown, one per sector round the axis. */
const M = 18;
/** Droplets the splash throws at the camera. */
const K = 6;

const FRAMINGS: Framing[] = [
  // low, at the height of the drops
  { az: 0.2, el: 0.22, dist: 3.4, target: [0, 0.15, 0], focal: 1.9, weight: 3 },
  // macro: one drop and its neighbours, the room curving in them
  { az: -0.7, el: 0.15, dist: 2.2, target: [0, 0.12, 0], focal: 2.1, weight: 3 },
  { az: 1.3, el: 0.6, dist: 4, target: [0, 0, 0], focal: 1.9, weight: 2, tag: "open" },
  { az: 0.5, el: 1.2, dist: 5.5, target: [0, 0, 0], focal: 1.8, weight: 1, tag: "open" },
  // the drop only: close on the pool, a little above it, looking into the crown; the droplets come at the lens
  { az: 0.45, el: 0.36, dist: 2.9, target: [0, 0.34, 0], focal: 1.8, weight: 1, tag: "splash" },
];
const onSplash = (fr: Framing) => fr.tag === "splash";
const atRest = (fr: Framing) => fr.tag !== "splash";

/*
 * The drop, in seconds. Since the drop: the drops flow into one flat pool (MERGE), a drop falls into it (FALL) and
 * hits it (IMPACT). Since the impact: a crown rises (its fingers throw droplets all round, a few at the camera),
 * falls back, the jet rises from the crater (JET) and its top pinches off into a droplet (PINCH, since the jet) that
 * falls back; the camera may leave (RELEASE) and the drops gather again out of the pool (REGROW, for 5.5 s).
 */
const MERGE = 1.4;
const FALL = 0.55;
const IMPACT = 1.6;
const JET = 1.3;
const PINCH = 0.95;
const RELEASE = 3.8;
const REGROW = 3.9;
const END = IMPACT + REGROW + 5.6;
/** The crown, its fingers and droplets, the jet: alive this long after the impact. */
const LIVE = 4.5;
/** The pool: radius and height (a mercury puddle: flat, its edge rounded). */
const POOL_R = 1;
const POOL_H = 0.13;
/** The crown's foot, a little under the pool's surface. */
const FOOT = POOL_H - 0.04;
/** The jet: its height, and its tip droplet's speed and gravity once pinched off. */
const JET_H = 0.58;
const TIP_V = 0.4;
const TIP_G = 1;

const smooth = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};
const sstep = (a: number, b: number, x: number) => smooth((x - a) / (b - a));
/** The crown, s seconds after the impact: base radius, rim radius, height over the pool, wall thickness. */
const crownAt = (s: number) => {
  const up = 1 - Math.exp(-s * 3.2);
  const down = sstep(1, 2, s);
  const r0 = 0.16 + 0.34 * (1 - Math.exp(-s * 2.5));
  const r1 = r0 + 0.14 * up + 0.12 * down;
  const h = 0.5 * up * (1 - down);
  // the way the rim leans (out, up): the fingers grow along it
  const dx = 2 * (r1 - r0) + 0.35 * h + 0.01;
  const dy = h + 0.01;
  const l = Math.hypot(dx, dy);
  return { r0, r1, h, th: 0.016 * (1 - 0.4 * down), dx: dx / l, dy: dy / l };
};
/** A finger's length (h1: its own share). */
const fingerLen = (h1: number, s: number) => 0.15 * (0.5 + h1) * sstep(0.15, 0.6, s) * (1 - sstep(1, 2, s));
const jetRise = (t: number) => JET_H * (1 - Math.exp(-t * 2.6));
/** When the jet's droplet falls back into the pool (since the impact). */
const LAND = (() => {
  const h = jetRise(PINCH);
  return JET + PINCH + (TIP_V + Math.sqrt(TIP_V * TIP_V + 4 * TIP_G * h)) / (2 * TIP_G);
})();

const cam = new THREE.Vector3();
const fwd = new THREE.Vector3();
const right = new THREE.Vector3();
const upv = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Billes: drops of mercury resting on a black mirror plate, heavy, flattened by their weight. They slide slowly,
 * meet and merge, part again, and the whole room curves in them. The music never pushes them around: the kick
 * makes them tremble, the bass swells them a little. On the drop they all flow into one flat pool and the camera
 * comes down close to it: a drop falls in, a crown of splash rises like a drop falling into milk, its fingers
 * throwing droplets (a few straight at the lens), a jet rises from the crater and falls back, rings run over the
 * pool; then the drops gather again out of it and the camera draws back. The CPU moves the splash, the shader draws
 * it: each finger is read from its sector's uniforms, the droplets in the air are spheres met along the ray, and
 * reflections leave the fingers out, so that the splash costs little more than the drops at rest.
 */
export const beads = defineShaderScene({
  id: "mercury-beads",
  name: "Billes",
  energy: "calm",
  hdr: true,
  renderScale: 0.8,
  mask: true,
  camera: { framings: FRAMINGS, glideBars: 3 },
  description:
    "Gouttes de mercure lourdes posées sur un miroir noir : elles glissent lentement, se rejoignent et fusionnent ; elles tremblent au kick ; au drop elles coulent en une flaque où tombe une goutte : couronne d'éclaboussure, jet, gouttelettes vers la caméra, vus de près.",
  params: [paletteParam("mercury")],
  uniforms: () => ({
    uB: { value: Array.from({ length: N }, () => new THREE.Vector4(0, 0, 0, 0.3)) },
    uK: { value: 0.12 },
    uWob: { value: 0 },
    uPool: { value: new THREE.Vector2(0, POOL_H) },
    uFall: { value: new THREE.Vector4(0, 0, 0, 0) },
    uSplash: { value: 99 },
    uCrown: { value: new THREE.Vector4(0, 0, 0, 0) },
    uRimDir: { value: new THREE.Vector2(0, 1) },
    uCrater: { value: 0 },
    uFing: { value: Array.from({ length: M }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uTipBox: { value: new THREE.Vector4(1e3, -1e3, 1e3, -1e3) },
    uJet: { value: new THREE.Vector4(0, 0, 0, 0) },
    uAir: { value: Array.from({ length: K + M }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uAirS: { value: new Array<number>(K + M).fill(1) },
    uRip: { value: new THREE.Vector2(-1, -1) },
    // CPU side only
    uPh: { value: Array.from({ length: N * 4 }, () => Math.random()) },
    uFingP: { value: Array.from({ length: M * 3 }, () => Math.random()) },
    uFlyP: { value: Array.from({ length: K * 6 }, () => Math.random()) },
    uLow: { value: 0 },
    uDropAge: { value: 99 },
    uLast: { value: -99 },
  }),
  update(u, f, _p, dt, ctx) {
    if (f.time - (u.uLast.value as number) > 1.5) u.uDropAge.value = 99;
    u.uLast.value = f.time;
    const b = u.uLow.value as number;
    const low = b + (f.bass - b) * (1 - Math.exp(-dt * (f.bass > b ? 6 : 2)));
    u.uLow.value = low;
    // the kick: a tremble running through the metal, never a push
    u.uWob.value = f.beat ? 1 : (u.uWob.value as number) * Math.exp(-dt * 3.5);
    let td = u.uDropAge.value as number;
    // a drop while the last one still plays is let go: the pool cannot gather twice at once
    if (f.drop && td > END) {
      td = 0;
      ctx.camera?.request("splash");
      for (const key of ["uFingP", "uFlyP"]) {
        const r = u[key].value as number[];
        for (let i = 0; i < r.length; i++) r[i] = Math.random();
      }
    } else td += dt;
    u.uDropAge.value = td;
    const s = td - IMPACT;
    const live = s >= 0 && s < LIVE;
    // the close framing is only for the splash; the camera stays on it until the jet has fallen back
    if (ctx.camera) ctx.camera.allow = td < IMPACT + RELEASE ? onSplash : atRest;

    // the drops flow to the centre and drain into the pool; later they grow out of it again while it shrinks
    let spread = 1;
    let grow = 1;
    let pool = 0;
    if (td < IMPACT + REGROW) {
      spread = 1 - smooth(td / MERGE);
      grow = 1 - smooth((td - 0.4) / 0.9);
      pool = smooth((td - 0.2) / 1.1);
    } else if (td < END) {
      const g = smooth((s - REGROW) / 5.5);
      spread = Math.max(g, 0.02);
      grow = g;
      pool = 1 - g;
    }
    u.uK.value = 0.12 + 0.14 * (1 - spread);
    (u.uPool.value as THREE.Vector2).set(pool > 0.001 ? POOL_R * Math.sqrt(pool) : 0, POOL_H);

    // the drop falling into the pool, faster and faster, sinking into it
    const tf = (td - (IMPACT - FALL)) / FALL;
    const fall = u.uFall.value as THREE.Vector4;
    if (tf >= 0 && tf < 1.15) fall.set(0, 2.6 + (POOL_H - 2.6) * tf * tf, 0, 0.1);
    else fall.w = 0;

    // the crown: a sheet rising from the crater's rim, flaring out, falling back
    u.uSplash.value = live ? s : 99;
    const crown = crownAt(live ? s : 0);
    (u.uCrown.value as THREE.Vector4).set(crown.r0, crown.r1, live ? crown.h : 0, crown.th);
    (u.uRimDir.value as THREE.Vector2).set(crown.dx, crown.dy);
    u.uCrater.value = live ? 0.09 * (1 - Math.exp(-s * 6)) * (1 - sstep(0.8, 2.2, s)) : 0;

    // its fingers, each with a droplet at its tip that pinches off, flies out and falls on the plate, where it slides
    // a little further and fades; uTipBox bounds the fingers (distance to the axis, height). The droplets in the air
    // (uAir, after the ones thrown at the camera) are plain spheres, squashed once landed (uAirS).
    const fp = u.uFingP.value as number[];
    const fing = u.uFing.value as THREE.Vector4[];
    const air = u.uAir.value as THREE.Vector4[];
    const airS = u.uAirS.value as number[];
    let b0 = 1e3, b1 = -1e3, bb = 1e3, bt = -1e3;
    for (let i = 0; i < M; i++) {
      fing[i].set(0, 0, 0, 0);
      air[K + i].set(0, 0, 0, 0);
      const h1 = fp[i * 3], h2 = fp[i * 3 + 1], h3 = fp[i * 3 + 2];
      // a gap in the crown here and there
      if (!live || h1 < 0.12) continue;
      const sk = 0.7 + 0.35 * h2;
      let br = (0.022 + 0.016 * h3) * sstep(0.15, 0.5, s);
      const len = fingerLen(h1, s);
      const on = s < sk ? len + br * 0.5 : 0;
      fing[i].set(len * (1 - sstep(sk, sk + 0.35, s)), 0.011 + 0.005 * h3, on, s < sk ? br : 0);
      if (len > 0.005) {
        b0 = Math.min(b0, crown.r1 - 0.05);
        b1 = Math.max(b1, crown.r1 + crown.dx * (on + br) + br);
        bb = Math.min(bb, FOOT + crown.h - 0.04);
        bt = Math.max(bt, FOOT + crown.h + crown.dy * (on + br) + br);
      }
      if (s < sk || br < 0.002) continue;
      // flying, from where its tip was when it pinched off
      const c0 = crownAt(sk);
      const l0 = fingerLen(h1, sk) + br * 0.5;
      const px = c0.r1 + c0.dx * l0;
      const py = FOOT + c0.h + c0.dy * l0;
      const vx = c0.dx * (0.7 + 0.5 * h2) + 0.3;
      const vy = c0.dy * (0.7 + 0.5 * h2);
      const tt = s - sk;
      const tl = (vy + Math.sqrt(vy * vy + 4.4 * Math.max(py - br * 0.6, 0))) / 2.2;
      let x = px + vx * tt;
      let y = py + vy * tt - 1.1 * tt * tt;
      let fl = 1;
      if (tt > tl) {
        // landed
        const ts = tt - tl;
        br *= 1 - sstep(0.3, 1.1, ts);
        fl = 0.6;
        x = px + vx * tl + vx * 0.25 * (1 - Math.exp(-ts * 4));
        y = br * fl;
      }
      if (br < 0.002) continue;
      // in its finger's plane (the sector at angle i * 2π / M)
      const a = (i * Math.PI * 2) / M;
      air[K + i].set(x * Math.cos(a), y, x * Math.sin(a), br);
      airS[K + i] = fl;
    }
    (u.uTipBox.value as THREE.Vector4).set(b0 - 0.04, b1 + 0.04, bb - 0.04, bt + 0.04);

    // the jet rising from the crater, a droplet at its top
    const jet = u.uJet.value as THREE.Vector4;
    jet.set(0, 0, 0, 0);
    const sj = s - JET;
    if (live && sj > 0) {
      if (sj < PINCH) {
        const h = jetRise(sj);
        jet.set(h, 0, POOL_H + h, 0.075 * smooth(sj / 0.35));
      } else {
        // pinched off: the droplet flies on a little, falls back; the column draws back into the crater
        const t = sj - PINCH;
        const y = POOL_H + jetRise(PINCH) + TIP_V * t - TIP_G * t * t;
        jet.set(jetRise(PINCH) * (1 - smooth(t / 0.8)), 0, y, y > POOL_H - 0.12 ? 0.075 : 0);
      }
    }
    (u.uRip.value as THREE.Vector2).set(s >= 0 && td < END ? s : -1, s >= LAND && td < END ? s - LAND : -1);

    // droplets thrown from the rim on the camera's side, straight at the lens: they pass just beside it
    const qp = u.uFlyP.value as number[];
    const camera = ctx.camera;
    if (camera) {
      cam.copy(camera.pos);
      fwd.subVectors(camera.target, cam).normalize();
      right.crossVectors(fwd, UP).normalize();
      upv.crossVectors(right, fwd);
    }
    const camAz = Math.atan2(cam.z, cam.x);
    for (let i = 0; i < K; i++) {
      const o = i * 6;
      const s0 = 0.55 + 0.09 * i + 0.05 * qp[o];
      const k = (s - s0) / (0.95 + 0.4 * qp[o + 1]);
      if (!camera || !live || k < 0 || k > 1.3) {
        air[i].set(0, 0, 0, 0);
        continue;
      }
      const c0 = crownAt(s0);
      const a = camAz + (qp[o + 2] - 0.5);
      const lx = c0.r1 * Math.cos(a);
      const ly = POOL_H + c0.h + 0.03;
      const lz = c0.r1 * Math.sin(a);
      const oa = qp[o + 3] * Math.PI * 2;
      const or = 0.16 + 0.3 * qp[o + 4];
      const ax = cam.x + (right.x * Math.cos(oa) + upv.x * Math.sin(oa)) * or;
      const ay = cam.y + (right.y * Math.cos(oa) + upv.y * Math.sin(oa)) * or;
      const az = cam.z + (right.z * Math.cos(oa) + upv.z * Math.sin(oa)) * or;
      const arc = (0.15 + 0.35 * qp[o + 5]) * 4 * k * (1 - k);
      air[i].set(lx + (ax - lx) * k, ly + (ay - ly) * k + arc, lz + (az - lz) * k, (0.02 + 0.025 * qp[o + 5]) * smooth(k / 0.12));
    }

    const ph = u.uPh.value as number[];
    const drops = u.uB.value as THREE.Vector4[];
    // slow: a drop crosses the plate in about a minute
    const t = f.time * 0.045;
    for (let i = 0; i < N; i++) {
      const a = ph[i * 4], c = ph[i * 4 + 1], sz = ph[i * 4 + 3];
      const x = Math.sin(t * (0.7 + 0.5 * a) + a * 6.28) * 1.3 + 0.3 * Math.sin(t * 2.3 + c * 6.28);
      const z = Math.sin(t * (0.6 + 0.5 * c) + c * 6.28) * 1.1 + 0.3 * Math.cos(t * 1.9 + a * 6.28);
      const r = (0.16 + 0.2 * sz) * (1 + 0.15 * low);
      drops[i].set(x * spread, 0, z * spread, r * grow);
    }
  },
  fragment: /* glsl */ `
uniform vec4 uB[${N}];
uniform float uK;        // how softly they melt into each other
uniform float uWob;      // the kick: a tremble
uniform vec2 uPool;      // the pool the drop gathers them into: radius (0: none), height
uniform vec4 uFall;      // the drop falling into the pool: centre, radius (0: none)
uniform float uSplash;   // seconds since the drop hit the pool (99: none)
uniform vec4 uCrown;     // the crown: base radius, rim radius, height over the pool (0: none), wall thickness
uniform vec2 uRimDir;    // the way its rim leans (out, up): the fingers grow along it
uniform float uCrater;   // the crater's depth under it
uniform vec4 uFing[${M}];   // per finger: length, radius, where its droplet sits on it, that droplet's radius (0: flown)
uniform vec4 uTipBox;    // where the fingers are: distance to the axis (min, max), height (min, max)
uniform vec4 uJet;       // the jet: height over the pool, -, its tip droplet's height and radius
uniform vec4 uAir[${K + M}];   // droplets in the air (thrown at the camera, then flown from the fingers): centre, radius
uniform float uAirS[${K + M}]; // how squashed (landed on the plate)
uniform vec2 uRip;       // ages of the rings on the pool: the impact, the jet's droplet falling back (<0: none)
${ART_LIB}
${CAMERA_GLSL}
${STUDIO_GLSL}
${DETAIL_GLSL}

/** A drop on the plate: flattened by its weight, trembling on the kick. */
float drop(vec3 p, vec4 b, float i) {
  float w = uWob * .14 * sin(uTime * 17. + i * 2.1);
  vec3 rr = b.w * vec3(1. - .5 * w, .64 * (1. + w), 1. - .5 * w);
  return sdEllipsoid(p - vec3(b.x, rr.y * .92, b.z), rr);
}

float dropsD(vec3 p) {
  float d = 1e3;
  for (int i = 0; i < ${N}; i++) {
    vec4 b = uB[i];
    if (b.w > .005) d = smin(d, drop(p, b, float(i)), uK);
  }
  return d;
}

/** The pool: flat, its edge rounded like a mercury puddle's; the impact digs a crater under the crown. */
float poolD(vec3 p) {
  float R = uPool.x, h = min(uPool.y, R);
  float r = length(p.xz);
  float d = length(vec2(max(r - (R - h), 0.), p.y)) - h;
  if (uCrater > 0.) d += uCrater * exp(-r * r / max(uCrown.x * uCrown.x * .6, 1e-3));
  return d;
}

/** Distance from p to the segment ab, and where along it. */
vec2 seg2(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.);
  return vec2(length(pa - ba * h), h);
}

/**
 * The crown: a thin sheet rising from the crater's rim and flaring out, its rim scalloped, highest at each finger.
 * Fine: with its fingers and the droplets still on them, each in its own sector round the axis. Not fine (what
 * reflections see): the sheet alone, its rim even.
 */
float crownD(vec3 p, bool fine) {
  float r = length(p.xz);
  vec4 c = uCrown;
  float yb = uPool.y - .04;
  // what holds the sheet (distance to the axis, height) and the fingers: away from both, a bound is enough (more than
  // the blends' width, so that it never swells what it blends with)
  float wall = c.z > .005 ? max(max(c.x - r, r - c.y), max(yb - p.y, p.y - yb - c.z)) - .03 : 1e3;
  float box = fine ? max(max(uTipBox.x - r, r - uTipBox.y), max(uTipBox.z - p.y, p.y - uTipBox.w)) : 1e3;
  if (min(wall, box) > .06) return min(wall, box);
  // the angle round the axis: for the scalloped rim, and the fingers' sectors
  float sc = c.z > .005 ? smoothstep(.55, .75, (p.y - yb) / c.z) : 0.;
  float a = fine && r > .05 && ((sc > 0. && wall <= .06) || box <= .06) ? atan(p.z, p.x) : 0.;
  float d = wall;
  if (wall <= .06) {
    // its profile, flaring out (three segments: an exact distance, however low and open it gets)
    float Hs = c.z * (1. - .05 * (1. - cos(a * ${M}.)) * sc);
    vec2 q = vec2(r, p.y);
    vec2 w0 = vec2(c.x, yb), w3 = vec2(c.y, yb + Hs);
    vec2 w1 = mix(w0, w3, vec2(.16, .4)), w2 = mix(w0, w3, vec2(.49, .7));
    vec2 e0 = seg2(q, w0, w1), e1 = seg2(q, w1, w2), e2 = seg2(q, w2, w3);
    float t = e0.x < min(e1.x, e2.x) ? .4 * e0.y : e1.x < e2.x ? .4 + .3 * e1.y : .7 + .3 * e2.y;
    d = min(e0.x, min(e1.x, e2.x)) - c.w * (1. - .4 * t);
    // the rim: a bead along the top
    d = smin(d, length(q - w3) - c.w * .96, .02);
  }
  if (box > .06 || r < .1) return min(d, box);
  const float SW = 6.2831853 / ${M}.;
  float k = floor(a / SW + .5);
  float la = a - k * SW;
  vec3 q = vec3(r * cos(la), p.y, r * sin(la));
  vec4 fg = uFing[int(mod(k + ${M}.5, ${M}.))];
  vec2 base = vec2(c.y, yb + c.z);
  if (fg.x > .005) d = smin(d, sdCapsule(q, vec3(base, 0.), vec3(base + uRimDir * fg.x, 0.), fg.y), .025);
  if (fg.w > .002) d = smin(d, length(q - vec3(base + uRimDir * fg.z, 0.)) - fg.w, .02);
  return d;
}

float sdRoundCone(vec3 p, float r1, float r2, float h) {
  float b = (r1 - r2) / h, a = sqrt(1. - b * b);
  vec2 q = vec2(length(p.xz), p.y);
  float k = dot(q, vec2(-b, a));
  if (k < 0.) return length(q) - r1;
  if (k > a * h) return length(q - vec2(0., h)) - r2;
  return dot(q, vec2(a, b)) - r1;
}

/** The jet rising from the crater, and the droplet at its top. */
float jetD(vec3 p) {
  float d = 1e3;
  if (uJet.x > .005) d = sdRoundCone(p - vec3(0., uPool.y - .1, 0.), .12, .045, uJet.x + .1);
  if (uJet.w > .005) d = smin(d, length(p - vec3(0., uJet.z, 0.)) - uJet.w, .045);
  return d;
}

/**
 * The droplets in the air: plain spheres (squashed once landed), met along the ray directly rather than marched.
 * The nearest: its distance (1e5: none), and the normal there.
 */
float air(vec3 ro, vec3 rd, out vec3 n) {
  float ta = 1e5;
  n = vec3(0., 1., 0.);
  for (int i = 0; i < ${K + M}; i++) {
    vec4 b = uAir[i];
    if (b.w < .002) continue;
    vec3 sq = vec3(1., 1. / uAirS[i], 1.);
    vec3 o = (ro - b.xyz) * sq, dd = rd * sq;
    float A = dot(dd, dd), B = dot(o, dd), h = B * B - A * (dot(o, o) - b.w * b.w);
    if (h < 0.) continue;
    float t = (-B - sqrt(h)) / A;
    if (t > .05 && t < ta) {
      ta = t;
      n = normalize((ro + rd * t - b.xyz) * sq * sq);
    }
  }
  return ta;
}

float scene(vec3 p, bool fine) {
  float d = dropsD(p);
  if (uPool.x > .005) d = smin(d, poolD(p), .12);
  if (uFall.w > .005) d = smin(d, sdEllipsoid(p - uFall.xyz, uFall.w * vec3(1., 1.3, 1.)), .05);
  if (uSplash < 90.) {
    d = smin(d, jetD(p), .08);
    d = smin(d, crownD(p, fine), .05);
  }
  return d;
}
float map(vec3 p) { return scene(p, true); }
/** What reflections see: the splash without its fingers (a few pixels in a reflection, a lot of work). */
float mapR(vec3 p) { return scene(p, false); }
vec3 normalR(vec3 p) {
  const vec2 k = vec2(1, -1);
  const float h = .0015;
  return normalize(k.xyy * mapR(p + k.xyy * h) + k.yyx * mapR(p + k.yyx * h) + k.yxy * mapR(p + k.yxy * h) + k.xxx * mapR(p + k.xxx * h));
}
${MARCH}

/** The other drops, seen in a drop (or in the plate). */
float march2(vec3 ro, vec3 rd, float tmax) {
  float t = .01;
  for (int i = 0; i < 40; i++) {
    float d = mapR(ro + rd * t);
    if (d < .002) return t;
    t += d;
    if (t > tmax) break;
  }
  return -1.;
}

/**
 * Mercury: the room curved in it, nearly whole; the plate and the other drops in it too (deep: not for the splash's
 * fingers and droplets, too small and too quick to show them).
 */
vec3 mercury(vec3 p, vec3 n, vec3 rd, bool deep) {
  vec3 r = reflect(rd, n);
  float fre = pow(1. - clamp(dot(n, -rd), 0., 1.), 5.);
  vec3 c = studio(r);
  float t2 = deep ? march2(p + n * .005, r, 5.) : -1.;
  if (t2 > 0.) {
    vec3 q = p + n * .005 + r * t2;
    c = studio(reflect(r, normalR(q))) * .75;
  } else if (r.y < 0.) {
    // the black glass plate, seen in the drop: the room mirrored in it, darker
    c = studio(reflect(r, vec3(0., 1., 0.))) * .3;
  }
  c *= mix(uInk * .9, vec3(1.), fre);
  // contact: a thin dark line where the drop meets the plate
  c *= .25 + .75 * smoothstep(.0, .025, p.y);
  return c;
}

/**
 * Capillary ripples: fine rings running slowly out from the top of the nearest drop, never quite still, stirred by the
 * kick. Only close up, where they are wider than a few pixels.
 */
vec3 ripples(vec3 p, vec3 n, float pix) {
  const float F = 70.;
  float vis = resolved(3.1416 / F, pix);
  if (vis < .01) return n;
  float best = 1e3;
  vec4 bb = vec4(0.);
  for (int i = 0; i < ${N}; i++) {
    vec4 b = uB[i];
    if (b.w < .005) continue;
    float r = length(p.xz - b.xz) / b.w;
    if (r < best) { best = r; bb = b; }
  }
  if (best > 1.1) return n;
  vec2 dv = p.xz - bb.xz;
  float rr = length(dv);
  vec3 dir = vec3(dv.x, 0., dv.y) / max(rr, 1e-4);
  dir -= n * dot(dir, n);
  float amp = (.06 + .16 * uWob) * vis * smoothstep(1.1, .5, best) * smoothstep(.0, .3, best);
  return normalize(n - dir * cos(rr * F - uTime * 1.5) * amp);
}

/** The rings over the pool: one train from the impact, one from the jet's droplet falling back; the kick shakes it. */
vec3 rings(vec3 p, vec3 n, float pix) {
  const float F = 30.;
  float r = length(p.xz);
  float on = resolved(6.2832 / F, pix) * (1. - smoothstep(uPool.x - .25, uPool.x, r)) * smoothstep(.4, .8, n.y)
    * (1. - smoothstep(uPool.y + .01, uPool.y + .04, p.y));
  if (on < .01) return n;
  float w = .15 * uWob * sin(r * F - uTime * 4.);
  for (int j = 0; j < 2; j++) {
    float age = j == 0 ? uRip.x : uRip.y;
    if (age < 0. || age > 6.) continue;
    float x = r - (.1 + .4 * age);
    w += sin(x * F) * exp(-x * x * 8.) * exp(-age * .5);
  }
  vec3 dir = vec3(p.x, 0., p.z) / max(r, 1e-4);
  dir -= n * dot(dir, n);
  return normalize(n - dir * w * .3 * on);
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 ro = uCamPos;
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));
  vec3 col = uBase * .6 + uInk * .03 * exp(-2. * length(uv));
  float solid = 0.;
  float tp = rd.y < -1e-4 ? -ro.y / rd.y : 1e5;
  vec3 na;
  float ta = uSplash < 90. ? air(ro, rd, na) : 1e5;
  float t = march(ro, rd, min(min(tp, 20.), ta));
  if (ta < min(tp, 1e4) && t < 0.) {
    // a droplet in the air: its reflection is the room alone
    col = mercury(ro + rd * ta, na, rd, false);
    solid = 1.;
  } else if (t > 0.) {
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);
    float pix = pixelSize(t, n, rd);
    n = ripples(p, n, pix);
    if (uPool.x > .005) n = rings(p, n, pix);
    col = mercury(p, n, rd, uSplash > 90. || mapR(p) < .01);
    solid = 1.;
  } else if (tp < 40.) {
    // the plate: black glass, the drops mirrored in it, fading far away
    vec3 p = ro + rd * tp;
    vec3 r = reflect(rd, vec3(0., 1., 0.));
    float fre = .06 + .5 * pow(1. - abs(rd.y), 5.);
    vec3 c = uBase * .25 + studio(r) * fre * .5;
    float t2 = march2(p + vec3(0., .002, 0.), r, 6.);
    if (t2 > 0.) {
      vec3 q = p + r * t2;
      c = mercury(q, normalR(q), r, true) * .55;
    }
    float fade = exp(-length(p.xz) * .25);
    col = mix(col, c, fade);
    solid = fade;
  }
  gl_FragColor = vec4(hdrOut(col), solid);
}
`,
});
