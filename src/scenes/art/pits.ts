import * as THREE from "three";
import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { CIRCUIT_GLSL } from "./circuit.glsl";
import { FLIGHT_GLSL, flightUniforms } from "./flight";
import { Cadrage, type Framing } from "./camera";
import { inside, LANES, PACK_MAX, Racers, TRACK_GLSL, TRACK_W, trackX, trackY } from "./circuitTrack";
import { TRACK_SCENE_GLSL } from "./circuitScene.glsl";

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const approach = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-dt * rate));

/** The garages' middle along the lap (the least banked stretch), their half-length; the hero's garage is the middle one. */
const SP = 960;
const HALF_L = 49;
/** The hero's parking line across the track. */
const CAR_X = TRACK_W + 15.25;
/** Arms at most, and their two segments. */
const ARMS = 5;
const L1 = 3.2;
const L2 = 3.0;
const CEIL = 6.7;

/** The pit lane's line (the same as the shader's pitLaneX). */
const pitLaneX = (s: number) => {
  const k = 1 - smooth(HALF_L, HALF_L + 140, Math.abs(s - SP));
  return TRACK_W + 1.2 + (TRACK_W + 6.5 - TRACK_W - 1.2) * k;
};

/** A point of the pits' level frame in the world (x across the track's centre, y up, z = SP - s; lap origin 0). */
function pitPoint(x: number, y: number, z: number, out: THREE.Vector3) {
  const s = SP - z;
  return out.set(trackX(s) + x, trackY(s) + y, -s);
}

/* Framings in the pits' frame (x across the track's centre, y up, z backwards along it). */
const FRAMINGS: Framing[] = [
  // from the pit lane, into the garage: the racer, the arms
  { az: -Math.PI / 2, el: 0.12, dist: 9, target: [CAR_X, 1.2, 0], focal: 1.8, weight: 2 },
  { az: -Math.PI / 2 + 0.75, el: 0.22, dist: 8, target: [CAR_X, 1.1, -0.5], focal: 1.9, weight: 2 },
  // from a back corner of the garage, looking down on the racer and the arms, the pit lane beyond
  { az: 2.3, el: 0.45, dist: 7.5, target: [CAR_X, 1, 0], focal: 1.7 },
  // from the track, across the wall: the packs pass between
  { az: -Math.PI / 2, el: 0.06, dist: 16, target: [CAR_X, 2, 0], focal: 1.75 },
  // high over the pit lane
  { az: -1.1, el: 0.8, dist: 48, target: [13, 0, 0], focal: 1.6 },
  // down the pit lane
  { az: 0, el: 0.1, dist: 32, target: [11, 1, -15], focal: 1.7 },
];

/** The spots the arms work on, round the racer (its frame: across, up, along). */
const SPOTS: [number, number, number][] = [
  [-0.5, 0.5, -1.05],
  [0.5, 0.5, -1.05],
  [0, 0.62, 0],
  [0, 0.45, 1.05],
  [-0.6, 0.42, -0.3],
  [0.6, 0.42, -0.3],
];
/** Where each arm hangs from the garage's ceiling (across, along, from the racer). */
const MOUNTS: [number, number][] = [
  [-3, -3.4],
  [3, -3],
  [0, 3.8],
  [-3.4, 2.8],
  [3.4, 3.3],
];

interface Arm {
  from: THREE.Vector3;
  to: THREE.Vector3;
  k: number;
  wait: number;
  spot: number;
}

interface Pass {
  t0: number;
  from: number;
  v: number;
}

interface PitsState {
  racers: Racers;
  cadrage: Cadrage;
  arms: Arm[];
  /** The hero: seconds since it came in, seconds since it left (< 0: still in). */
  arrive: number;
  launch: number;
  chase: number;
  passes: Pass[];
  next: number;
  clock: number;
  last: number;
  pos: THREE.Vector3;
  look: THREE.Vector3;
  cpos: THREE.Vector3;
  clook: THREE.Vector3;
  tmp: THREE.Vector3;
}

/** The hero's place along the track and across it at time-in-scene: coming in, parked, gone. */
function heroS(st: PitsState) {
  if (st.launch >= 0) {
    const a = 22;
    const vmax = 90;
    const tv = vmax / a;
    const t = st.launch;
    return SP + (t < tv ? 0.5 * a * t * t : 0.5 * vmax * tv + vmax * (t - tv));
  }
  const t = Math.min(st.arrive, 6.9);
  return SP - 90 + 26 * t - 0.5 * 3.77 * t * t;
}
const heroX = (st: PitsState) => (q: number) => {
  if (st.launch >= 0) {
    const out = CAR_X + (pitLaneX(q) - CAR_X) * smooth(SP, SP + 30, q);
    const lane = LANES[3] + 0.9 * inside(q);
    return out + (lane - out) * smooth(SP + HALF_L + 120, SP + HALF_L + 200, q);
  }
  return pitLaneX(q) + (CAR_X - pitLaneX(q)) * smooth(SP - 28, SP, q);
};

/**
 * Les Stands: the pit lane beside the track, a wall of light between them, a row of garages of black glass lit from
 * within. A racer slides into its garage; articulated arms of dark metal threaded with light come down from the
 * ceiling and work on it; through the build their pace and their shower of sparks grow, its engines charge; on the
 * drop the arms fly up, the racer leaves in a burst down the pit lane and back onto the track, and the camera follows
 * it. Now and then the pack goes by on the track in a rush of trails; sparks crackle on the hats. As the night drifts
 * the stops grow frantic: more arms, more sparks.
 */
export const pits = defineShaderScene({
  id: "circuit-pits",
  name: "Les Stands",
  energy: "medium",
  hdr: true,
  mask: true,
  renderScale: 0.7,
  motion: (u) => u.uMotion.value as number,
  description:
    "La voie des stands le long de la piste, un mur de lumière entre elles, une rangée de garages de verre noir éclairés de l'intérieur. Un bolide glisse dans son garage, des bras articulés descendent du plafond et travaillent sur lui ; pendant la montée leur cadence et la pluie d'étincelles grandissent, ses moteurs se chargent ; au drop les bras se relèvent, il repart en trombe et rejoint la piste, la caméra à sa suite. La meute passe de temps en temps sur la piste.",
  params: [paletteParam("piste")],
  uniforms: () => {
    const st: PitsState = {
      racers: new Racers(),
      cadrage: new Cadrage(FRAMINGS, 2),
      arms: Array.from({ length: ARMS }, () => ({ from: new THREE.Vector3(), to: new THREE.Vector3(), k: 1, wait: 0, spot: 0 })),
      arrive: 0,
      launch: -1,
      chase: 0,
      passes: [
        { t0: -1, from: 0, v: 0 },
        { t0: -1, from: 0, v: 0 },
      ],
      next: 0,
      clock: 0,
      last: -99,
      pos: new THREE.Vector3(),
      look: new THREE.Vector3(),
      cpos: new THREE.Vector3(),
      clook: new THREE.Vector3(),
      tmp: new THREE.Vector3(),
    };
    return {
      uState: { value: st },
      ...st.racers.uniforms(),
      ...flightUniforms(),
      uLeap: { value: new THREE.Vector3(0, 1, 0) },
      uPits: { value: new THREE.Vector2(SP, HALF_L) },
      uCamP: { value: new THREE.Vector3() },
      uCamR: { value: new THREE.Vector3(1, 0, 0) },
      uCamU: { value: new THREE.Vector3(0, 1, 0) },
      uCamF: { value: new THREE.Vector3(0, 0, -1) },
      uFocalV: { value: 1.8 },
      uWave: { value: new THREE.Vector2(-1e4, 0) },
      uRail: { value: 0 },
      uBoost: { value: 0 },
      uBurn: { value: 0.3 },
      uGantry: { value: new THREE.Vector3() },
      uArm: { value: Array.from({ length: ARMS * 3 }, () => new THREE.Vector3()) },
      uWeld: { value: new Array<number>(ARMS).fill(0) },
      uArmN: { value: 3 },
      uSparks: { value: 0 },
      uMotion: { value: 0 },
    };
  },
  update(u, f, _p, dt) {
    const st = u.uState.value as PitsState;
    const bar = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;
    if (f.time - st.last > 1.5) {
      st.cadrage.reset(Math.random() * 100);
      st.arrive = 0;
      st.launch = -1;
      st.chase = 0;
      st.passes.forEach((ps) => (ps.t0 = -1));
      for (const a of st.arms) {
        a.k = 1;
        a.wait = Math.random();
        a.spot = Math.floor(Math.random() * SPOTS.length);
      }
    }
    st.last = f.time;
    st.clock += dt;
    st.arrive += dt;
    if (f.drop && st.launch < 0) st.launch = 0;
    if (st.launch >= 0) st.launch += dt;
    const build = f.section === "build" ? f.buildProgress : 0;

    // the hero, coming in, parked, then gone (back onto the track)
    const hs = heroS(st);
    const hx = heroX(st);
    const onTrack = (q: number) => smooth(SP + HALF_L + 100, SP + HALF_L + 200, q);
    // (its trails die away once it stops in its garage)
    const trail = st.launch >= 0 ? 24 + 30 * smooth(0, 2, st.launch) : 14 * (1 - smooth(5, 7.5, st.arrive));
    st.racers.placeLevel(0, hs, 0, hx, 0, onTrack, 1, trail, st.launch >= 0 ? SP : SP - 90);

    // the arms: from their mounts to spots on the racer, one move after another (faster through the build and as the
    // night drifts); welding when there; on the drop they fly up
    const count = Math.min(ARMS, 3 + Math.round(2 * f.drift));
    u.uArmN.value = count;
    const parked = st.launch < 0 && st.arrive > 6.5;
    const pace = 0.35 + 2.2 * build + 0.8 * f.drift;
    const car = pitPoint(CAR_X, 0, 0, st.tmp).clone();
    const arm = u.uArm.value as THREE.Vector3[];
    const weld = u.uWeld.value as number[];
    let sparks = 0;
    for (let i = 0; i < ARMS; i++) {
      const a = st.arms[i];
      const [mx, mz] = MOUNTS[i];
      const base = pitPoint(CAR_X + mx, CEIL, -mz, new THREE.Vector3());
      // where it wants to be: a spot on the racer, or folded up under its mount
      let want: THREE.Vector3;
      if (parked && i < count) {
        a.wait -= dt * pace;
        if (a.wait < 0 && a.k >= 1) {
          a.from.copy(a.to);
          a.spot = (a.spot + 1 + Math.floor(Math.random() * (SPOTS.length - 1))) % SPOTS.length;
          a.k = 0;
          a.wait = 0.6 + Math.random();
        }
        const [sx, sy, sz] = SPOTS[a.spot];
        want = pitPoint(CAR_X + sx, sy + 0.34, -sz, new THREE.Vector3());
      } else want = base.clone().add(new THREE.Vector3(0, -1.6, 0));
      if (!(parked && i < count)) {
        a.to.lerp(want, 1 - Math.exp(-dt * (st.launch >= 0 ? 9 : 2)));
        a.from.copy(a.to);
        a.k = 1;
      } else {
        a.to.copy(want);
        a.k = Math.min(1, a.k + dt * (1.2 + 1.5 * pace));
      }
      const e = a.k * a.k * (3 - 2 * a.k);
      const tip = a.from.clone().lerp(a.to, e);
      // two-bone reach from the mount to the tip, the elbow bent outward, away from the racer
      const dir = tip.clone().sub(base);
      const d = Math.min(dir.length(), L1 + L2 - 0.01);
      dir.normalize();
      const along = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
      const h = Math.sqrt(Math.max(0, L1 * L1 - along * along));
      const hint = base.clone().sub(car).setY(0).normalize().add(new THREE.Vector3(0, 0.4, 0));
      const perp = hint.sub(dir.clone().multiplyScalar(hint.dot(dir))).normalize();
      arm[i * 3].copy(base);
      arm[i * 3 + 1].copy(base).addScaledVector(dir, along).addScaledVector(perp, h);
      arm[i * 3 + 2].copy(base).addScaledVector(dir, d);
      weld[i] = parked && i < count && a.k >= 1 ? 1 : 0;
      sparks += weld[i];
    }
    u.uSparks.value = approach(u.uSparks.value as number, sparks > 0 ? (0.5 + 1.5 * build + 0.5 * f.drift) * (0.7 + 0.6 * f.onsetPulse) : 0, 8, dt);

    // the packs on the track: one a phrase, one every two bars once the drop has struck
    const start = (v: number) => {
      const ps = st.passes[st.next];
      st.next = (st.next + 1) % st.passes.length;
      ps.t0 = st.clock;
      ps.from = SP - 260;
      ps.v = v;
    };
    if (f.downbeat && ((f.section === "drop" && f.bar % 2 === 0) || f.phraseBar === 0)) start(90);
    const per = Math.floor((PACK_MAX - 1) / 2);
    for (let k = 0; k < 2; k++) {
      const ps = st.passes[k];
      for (let j = 0; j < per; j++) {
        const i = 1 + k * per + j;
        if (ps.t0 < 0) {
          st.racers.hide(i);
          continue;
        }
        const from = ps.from - j * 8;
        const s = from + ps.v * (st.clock - ps.t0);
        if (s > SP + 400) {
          st.racers.hide(i);
          if (j === per - 1) ps.t0 = -1;
          continue;
        }
        const lane = LANES[(j * 2 + k) % LANES.length];
        st.racers.place(i, s, 0, (q) => lane + 0.9 * inside(q), 0, (j + k) % 4, 30 + ps.v * 0.4, null, from);
      }
    }

    // the camera: a framing of the pits, then (once the racer has left) the chase
    const cad = st.cadrage;
    cad.update(f, dt);
    pitPoint(cad.pos.x, cad.pos.y, cad.pos.z, st.pos);
    pitPoint(cad.target.x, cad.target.y, cad.target.z, st.look);
    let focal = cad.focal;
    let v = 0;
    if (st.launch >= 0) {
      st.chase = Math.min(1, st.chase + dt / 1.2);
      const k = smooth(0, 1, st.chase);
      const x = hx(hs);
      pitPoint(x * 0.85, 1.9, SP - (hs - 9), st.cpos);
      pitPoint(hx(hs + 30) * 0.7, 0.6, SP - (hs + 30), st.clook);
      st.pos.lerp(st.cpos, k);
      st.look.lerp(st.clook, k);
      focal += (1.45 - focal) * k;
      v = Math.min(90, 22 * st.launch);
    }
    const F = (u.uCamF.value as THREE.Vector3).subVectors(st.look, st.pos).normalize();
    const R = (u.uCamR.value as THREE.Vector3).crossVectors(F, new THREE.Vector3(0, 1, 0)).normalize();
    (u.uCamU.value as THREE.Vector3).crossVectors(R, F);
    (u.uCamP.value as THREE.Vector3).copy(st.pos);
    u.uFocalV.value = focal;
    u.uMotion.value = Math.min(0.8, Math.max(0, (v - 30) / 80)) * st.chase;
    u.uSpeed.value = Math.min(1, v / 160);
    // the engines charge through the build, burn on the way out
    const burn = st.launch >= 0 ? 1 : 0.3 + 0.7 * build + 0.2 * f.beatPulse;
    u.uBurn.value = approach(u.uBurn.value as number, burn, 5, dt);
    u.uBoost.value = st.launch >= 0 ? Math.exp(-st.launch / bar) : 0;
  },
  fragment: /* glsl */ `
#define PITS
#define ARMS ${ARMS}
uniform vec3 uCamP;
uniform vec3 uCamR;
uniform vec3 uCamU;
uniform vec3 uCamF;
uniform float uFocalV;
uniform vec3 uArm[ARMS * 3];   // each arm: its mount, its elbow, its tip
uniform float uWeld[ARMS];     // 1: the arm's tool at work
uniform float uArmN;
uniform float uSparks;
${ART_LIB}
${FLIGHT_GLSL}
${CIRCUIT_GLSL}
${TRACK_GLSL}
${TRACK_SCENE_GLSL}

const float CEIL = ${CEIL.toFixed(1)};
float gArm;

float armsD(vec3 p) {
  float d = 1e9;
  for (int i = 0; i < ARMS; i++) {
    if (float(i) >= uArmN) break;
    vec3 b = uArm[i * 3], e = uArm[i * 3 + 1], t = uArm[i * 3 + 2];
    float bound = length(p - (b + t) * .5) - 5.;
    if (bound > 1.) { d = min(d, bound); continue; }
    float a = min(min(sdCapsule(p, b, e, .2), sdCapsule(p, e, t, .14)), min(length(p - e) - .3, length(p - b) - .4));
    // the tool: a short nozzle at the tip
    a = min(a, length(p - t) - .11);
    if (a < d) { d = a; gArm = float(i); }
  }
  return d;
}

float sceneD(vec3 p) {
  float d = mapD(p);
  float m = gMat;
  vec3 tq = gTq;
  float da = armsD(p);
  if (da < d) { gMat = 20.; return da; }
  gMat = m;
  gTq = tq;
  return d;
}

/** How far inside a garage p is (its ceiling's white light falls there): 0 outside, 1 well within. */
float garageLight(vec3 p) {
  float s = -p.z;
  vec3 lv = vec3(p.x - trackX(s), p.y - trackY0(s), s);
  float dps = s - uPits.x;
  float gz = mod(dps + 7., 14.) - 7.;
  return smoothstep(TRACK_W + 8.5, TRACK_W + 12., lv.x) * (1. - smoothstep(5.5, 6.9, abs(gz))) * step(abs(dps), uPits.y) * step(lv.y, 6.6);
}
/** The white light of a garage on a surface (n: its normal). */
vec3 whiteLight(vec3 n, vec3 rd, float k) {
  vec3 L = vec3(.85, .9, 1.);
  return L * k * (.06 + .32 * max(n.y, 0.) + .1 * max(-n.y, 0.)) + L * k * .25 * pow(max(dot(reflect(rd, n), vec3(0., 1., 0.)), 0.), 8.);
}

/** The pits' light: the pit lane, the wall, the garages (their ceiling lights pour onto the floor). */
vec3 pitColor(vec3 p, vec3 rd, float t, float pa) {
  float m = gMat;
  vec3 q = gTq;
  vec3 n = nrmTrack(p, max(.006, t * pa * 2.));
  float fw = t * pa / max(abs(dot(n, rd)), .1);
  vec3 lv = vec3(p.x - trackX(q.z), p.y - trackY0(q.z), q.z);
  float dps = q.z - uPits.x;
  float inG = step(abs(dps), uPits.y);
  // the garage's light, in each one
  float gz = mod(dps + 7., 14.) - 7.;
  vec3 c = vec3(.005, .006, .009) + glassEnv(reflect(rd, n)) * fresnel(n, rd) * .8;
  if (m < 12.5) {
    // the pit lane's floor: its edge lines, a box in front of each garage; inside, the light of the ceiling
    float xp = pitLaneX(q.z);
    c += uTint * (neon(abs(lv.x - xp + 3.3), .04, fw) + neon(abs(lv.x - xp - 3.3), .04, fw) * (1. - inG)) * .6;
    float bx = max(abs(gz) - 5.5, abs(lv.x - TRACK_W - 12.) - 1.6);
    c += mix(uTint, vec3(1.), .5) * neon(abs(bx), .04, fw) * inG * .5;
    float inside = inG * step(TRACK_W + 10.5, lv.x);
    c += vec3(.9, .95, 1.) * inside * .3 * exp(-gz * gz * .02) * (1. - .5 * abs(lv.x - TRACK_W - 16.) / 6.);
    // the hero's glow on the floor of its garage
    vec3 o = p - uRacerP[0].xyz;
    c += racerCol(uRacerP[0].w) * exp(-dot(o.xz, o.xz) * .4) * .5 * (.5 + uBurn);
  } else if (m < 13.5) {
    // the wall: a strip of light along its top, small lamps
    c += uTint * neon(abs(lv.y - 1.35), .05, fw) * 1.2;
    c += vec3(1., .5, .2) * dotL(length(vec2(fract(q.z / 4.) - .5, (lv.y - .8) / 4.)) * 4., .08, fw) * 2.;
  } else {
    // the garages: black glass, their edges in light; under the ceiling, two long panels of white light
    vec2 e = vec2(abs(abs(gz) - 6.75), abs(lv.x - TRACK_W - 10.5));
    c += uTint * neon(max(e.x, e.y), .05, fw) * .8;
    if (n.y < -.5 && lv.y < 7.) {
      float panel = (1. - smoothstep(.35, .5, abs(abs(lv.x - TRACK_W - 16.) - 2.2))) * step(abs(gz), 5.5);
      c += vec3(1.) * panel * 3.;
    }
    c += uTint * neon(abs(lv.y - 6.65), .05, fw) * step(abs(lv.x - TRACK_W - 9.1), .2) * 1.5;
    // inside, the walls take the white light
    c += vec3(.85, .9, 1.) * .16 * garageLight(p - n * .3) * step(abs(n.y), .5);
  }
  return c;
}

/** An arm: dark metal, rings of light at its joints, its tool white-hot when it works. */
vec3 armColor(vec3 p, vec3 rd, float t, float pa) {
  int i = int(gArm + .5);
  vec3 b = uArm[i * 3], e = uArm[i * 3 + 1], tip = uArm[i * 3 + 2];
  const vec2 k = vec2(1, -1);
  const float h = .004;
  vec3 n = normalize(k.xyy * armsD(p + k.xyy * h) + k.yyx * armsD(p + k.yyx * h) + k.yxy * armsD(p + k.yxy * h) + k.xxx * armsD(p + k.xxx * h));
  float fw = t * pa;
  vec3 c = vec3(.03, .032, .036) + glassEnv(reflect(rd, n)) * fresnel(n, rd) * 1.2 + whiteLight(n, rd, garageLight(p) * 1.4);
  c += uTint * (neon(abs(length(p - e) - .31), .02, fw) + neon(abs(length(p - b) - .41), .02, fw)) * 1.5;
  c += vec3(1., .75, .4) * exp(-length(p - tip) * 18.) * uWeld[i] * (2. + 4. * uSparks);
  return c;
}

/** Sparks spraying from the tools at work, falling and fading. */
vec3 sparks(vec3 ro, vec3 rd, float tmax, float pa) {
  vec3 acc = vec3(0.);
  if (uSparks < .01) return acc;
  for (int i = 0; i < ARMS; i++) {
    if (float(i) >= uArmN || uWeld[i] < .5) continue;
    vec3 tip = uArm[i * 3 + 2];
    for (int k = 0; k < 10; k++) {
      float fk = float(k);
      float cyc = uTime * 1.6 + fk / 10. + float(i) * .37;
      float life = fract(cyc);
      float id = floor(cyc);
      vec3 v0 = vec3(hash12(vec2(id, fk + float(i) * 13.)) - .5, .25 + .3 * hash12(vec2(fk, id + 3.)), hash12(vec2(id + 7., fk)) - .5) * vec3(5., 4., 5.);
      vec3 sp = tip + v0 * life * .6 + vec3(0., -9.8, 0.) * life * life * .18;
      vec3 oc = sp - ro;
      float tc = dot(oc, rd);
      if (tc < 0. || tc > tmax) continue;
      float d = length(oc - rd * tc);
      float r = max(.025, tc * pa);
      acc += vec3(1., .72, .35) * (.025 / r) * exp(-d * d / (r * r)) * (1. - life) * 2.5;
    }
  }
  return acc * uSparks;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 ro = uCamP;
  vec3 rd = normalize(uv.x * uCamR + uv.y * uCamU + uFocalV * uCamF);
  float pa = 1. / (uRes.y * uFocalV);
  float t = .05;
  bool hit = false;
  for (int i = 0; i < 170; i++) {
    vec3 p = ro + rd * t;
    float d = sceneD(p);
    if (d < .0012 * t) { hit = true; break; }
    t += d;
    if (t > 650.) break;
  }
  vec3 col = nightSky(rd);
  vec4 city = cityBelow(ro, rd, pa);
  col = mix(col, city.rgb, city.a);
  float tEnd = 1e4;
  if (hit) {
    vec3 p = ro + rd * t;
    tEnd = t;
    float racer = gMat > 4.5 && gMat < 5.5 ? 1. : 0.;
    int ri = int(gRacer + .5);
    vec3 c = gMat > 19.5 ? armColor(p, rd, t, pa) : gMat > 11.5 ? pitColor(p, rd, t, pa) : shadeHit(p, rd, t, pa);
    // a racer in its garage takes the white light too
    float gl = racer * garageLight(p);
    if (gl > 0.) {
      vec3 o = p - uRacerP[ri].xyz;
      vec3 R = uRacerR[ri], U = uRacerU[ri], F = uRacerF[ri];
      vec3 cp = vec3(dot(o, R), dot(o, U), dot(o, F));
      const vec2 kk = vec2(1, -1);
      vec3 nl = normalize(kk.xyy * craftD(cp + kk.xyy * .004) + kk.yyx * craftD(cp + kk.yyx * .004) + kk.yxy * craftD(cp + kk.yxy * .004) + kk.xxx * craftD(cp + kk.xxx * .004));
      vec3 n = normalize(nl.x * R + nl.y * U + nl.z * F);
      c += whiteLight(n, rd, gl);
    }
    col = mix(c, col, smoothstep(320., 650., t));
  }
  col += trailsLight(ro, rd, tEnd, pa, 1.);
  col += sparks(ro, rd, tEnd, pa);
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
