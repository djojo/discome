import * as THREE from "three";
import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { CIRCUIT_GLSL } from "./circuit.glsl";
import { FLIGHT_GLSL, flightUniforms } from "./flight";
import { Cadrage, type Framing } from "./camera";
import { HEAD_GLSL, headUniforms, setHead, TITLE_HEAD } from "./heads";
import { inside, LANES, LAP, PACK_MAX, Racers, TRACK_GLSL, trackFrame, trackPoint, type TrackFrame } from "./circuitTrack";
import { TRACK_SCENE_GLSL } from "./circuitScene.glsl";

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const approach = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-dt * rate));
const hashF = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** The middle of the grid, along the track (the start line is at s = 0, under the gantry). */
const MID = -25;

/**
 * Framings around the grid, in its own frame: x across the track, y up, z backwards along it (z = MID - s): az = 0
 * is behind the grid looking down the track toward the gantry.
 */
const FRAMINGS: Framing[] = [
  // behind the pack, low: the rows of racers, the gantry beyond
  { az: 0.05, el: 0.1, dist: 22, target: [0, 0.8, -8], focal: 1.8, weight: 2 },
  // down between the racers
  { az: 0.28, el: 0.03, dist: 7, target: [-0.6, 0.5, 4], focal: 2.2 },
  { az: -0.35, el: 0.05, dist: 9, target: [0.8, 0.5, -6], focal: 2 },
  // from the gantry, looking back at the grid
  { az: Math.PI, el: 0.32, dist: 28, target: [0, 0.5, 6], focal: 1.9 },
  // from the side, over the void: the rows, the city far below
  { az: Math.PI / 2, el: 0.08, dist: 16, target: [0, 0.6, 0], focal: 1.6 },
  { az: -Math.PI / 2 + 0.3, el: 0.18, dist: 20, target: [0, 0.6, 4], focal: 1.7 },
  // high above: the whole grid, the gantry, the city
  { az: 0.6, el: 0.75, dist: 60, target: [0, 0, -10], focal: 1.6 },
  // the title plan: looking up at the gantry and its sign, the racers below
  { az: 0, el: -0.24, dist: 30, target: [0, 9.6, -24], focal: 1.75, tag: "title", weight: 2 },
  { az: 0.32, el: -0.18, dist: 25, target: [0, 9.4, -24], focal: 1.7, tag: "title" },
  { az: -0.28, el: -0.2, dist: 27, target: [0, 9.4, -24], focal: 1.75, tag: "title" },
];

interface GridRacer {
  s: number;
  x: number;
  lane: number;
  delay: number;
  accel: number;
  vmax: number;
  colour: number;
}

interface GridState {
  racers: Racers;
  grid: GridRacer[];
  cadrage: Cadrage;
  /** Seconds since the start (lights out); < 0: on the grid. */
  launch: number;
  /** How far the camera has gone over from its framing to the chase. */
  chase: number;
  lit: number;
  waveS: number;
  waveT: number;
  boost: number;
  last: number;
  frame: TrackFrame;
  pos: THREE.Vector3;
  look: THREE.Vector3;
  cpos: THREE.Vector3;
  clook: THREE.Vector3;
}

/** How far racer r has gone after `t` seconds of the start (standing start, then its top speed). */
function launched(r: GridRacer, t: number) {
  const tau = t - r.delay;
  if (tau <= 0) return 0;
  const tv = r.vmax / r.accel;
  return tau < tv ? 0.5 * r.accel * tau * tau : 0.5 * r.vmax * tv + r.vmax * (tau - tv);
}

/**
 * La Grille de départ: the start of the race, again and again. On the suspended track, a dozen racers wait on the
 * grid in staggered rows, their engines idling under the gantry and its five start lights; the city far below.
 * On the groove the engines throb with the kick; through the build a start light comes on with every fifth of it,
 * the engines rev and the camera closes in; on the drop the lights go out and the pack launches; the camera follows
 * it down the track into the first curves. Every return, the start again. The title plan writes the night's title in
 * light on the gantry, above the waiting grid.
 */
export const grid = defineShaderScene({
  id: "circuit-grid",
  name: "La Grille de départ",
  energy: "medium",
  hdr: true,
  mask: true,
  renderScale: 0.7,
  description:
    "La ligne de départ sur la piste suspendue : une douzaine de bolides en quinconce, moteurs au ralenti, sous le portique et ses cinq feux. Pendant la montée un feu s'allume à chaque cinquième, les moteurs montent en régime ; au drop les feux s'éteignent, la meute part et on la suit dans les premières courbes. À chaque retour, de nouveau le départ.",
  params: [
    paletteParam("piste"),
    {
      type: "select",
      key: "end",
      label: "Sur le portique",
      options: [
        { value: "rien", label: "Les feux seuls" },
        { value: "titre", label: "Le titre de la soirée" },
      ],
      default: "rien",
    },
  ],
  motion: (u) => (u.uMotion.value as number) ?? 0,
  uniforms: () => {
    const st: GridState = {
      racers: new Racers(),
      grid: [],
      cadrage: new Cadrage(FRAMINGS, 2),
      launch: -1,
      chase: 0,
      lit: 0,
      waveS: -1e4,
      waveT: 99,
      boost: 0,
      last: -99,
      frame: { pos: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), fwd: new THREE.Vector3() },
      pos: new THREE.Vector3(),
      look: new THREE.Vector3(),
      cpos: new THREE.Vector3(),
      clook: new THREE.Vector3(),
    };
    return {
      uState: { value: st },
      ...st.racers.uniforms(),
      ...flightUniforms(),
      ...headUniforms(),
      uLeap: { value: new THREE.Vector3(0, 1, 0) },
      uCamP: { value: new THREE.Vector3() },
      uCamR: { value: new THREE.Vector3(1, 0, 0) },
      uCamU: { value: new THREE.Vector3(0, 1, 0) },
      uCamF: { value: new THREE.Vector3(0, 0, -1) },
      uFocalV: { value: 1.8 },
      uWave: { value: new THREE.Vector2(-1e4, 0) },
      uRail: { value: 0 },
      uBoost: { value: 0 },
      uBurn: { value: 0.3 },
      uGantry: { value: new THREE.Vector3(1, 0, 1) },
      uTitle: { value: 0 },
      uTitleT: { value: 0 },
      uMotion: { value: 0 },
    };
  },
  update(u, f, p, dt) {
    const st = u.uState.value as GridState;
    const bar = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;
    // back on screen: the grid again, every racer in its place, the lights out
    if (f.time - st.last > 1.5) {
      const seed = Math.random() * 100;
      st.grid = Array.from({ length: PACK_MAX }, (_, i) => {
        const row = Math.floor(i / 2);
        const left = i % 2 === 0;
        return {
          s: (left ? -7 : -11.5) - 9 * row,
          x: left ? -1.7 : 1.7,
          lane: LANES[Math.floor(hashF(seed + i * 3.3) * LANES.length)],
          delay: 0.05 * row + 0.08 * hashF(seed + i * 1.7),
          accel: 24 + 8 * hashF(seed + i * 5.9),
          vmax: 85 + 25 * hashF(seed + i * 2.3),
          colour: (i + Math.floor(seed)) % 4,
        };
      });
      st.launch = -1;
      st.chase = 0;
      st.lit = 0;
      st.boost = 0;
      st.cadrage.reset(seed);
    }
    st.last = f.time;

    const title = p.end === "titre" && setHead(u, TITLE_HEAD, "", p);
    u.uTitle.value = title ? 1 : 0;
    u.uTitleT.value = title ? (u.uTitleT.value as number) + dt : 0;

    // the start lights: one more with every fifth of the build; all out on the drop, and the pack is gone
    if (f.drop && st.launch < 0) {
      st.launch = 0;
      st.boost = 1;
    }
    if (st.launch >= 0) st.launch += dt;
    const lit = st.launch >= 0 ? 0 : f.section === "build" ? Math.min(5, Math.floor(f.buildProgress * 5) + 1) : 0;
    st.lit = lit;
    (u.uGantry.value as THREE.Vector3).set(1, lit, st.launch >= 0 ? 0 : 1);
    st.boost *= Math.exp(-dt / (bar * 0.9));
    u.uBoost.value = st.boost;

    // the racers: waiting on the grid, then away (each with its own start, merging into its racing line); the camera
    // chases the fifth one
    const at = st.grid.map((r) => r.s + (st.launch >= 0 ? launched(r, st.launch) : 0));
    const follow = st.grid[4];
    const followS = at[4];
    const lead = Math.max(...at);
    // the lap origin: where the camera is (they all stay within a lap of it)
    const s0 = Math.floor((st.launch >= 0 ? followS : 0) / LAP) * LAP;
    for (let i = 0; i < PACK_MAX; i++) {
      const r = st.grid[i];
      const xAt = (x: number) => {
        const k = smooth(0, 90, x - r.s);
        return r.x + (r.lane + 0.9 * inside(x) - r.x) * k;
      };
      const idle = st.launch < 0 ? 0.025 * Math.sin(f.time * 9 + i * 1.7) * (1 + (f.section === "build" ? f.buildProgress : 0)) : 0;
      st.racers.place(i, at[i], s0, xAt, -0.06 + idle, r.colour, 26 + 30 * smooth(0, 3, st.launch), null, r.s);
    }

    // the camera: a framing of the grid, then (once the pack is away) the chase down the track
    const cad = st.cadrage;
    cad.allow = (fr) => (title ? fr.tag === "title" : fr.tag !== "title");
    cad.update(f, dt);
    trackPoint(MID - cad.pos.z, s0, cad.pos.x, cad.pos.y, null, st.pos);
    trackPoint(MID - cad.target.z, s0, cad.target.x, cad.target.y, null, st.look);
    let focal = cad.focal;
    if (st.launch >= 0 && !title) {
      st.chase = Math.min(1, st.chase + dt / 1.4);
      const fx = follow.lane * 0.5;
      trackPoint(followS - 9, s0, fx, 1.7, null, st.cpos);
      trackPoint(followS + 28, s0, fx * 0.4, 0.5, null, st.clook);
      const k = smooth(0, 1, st.chase);
      st.pos.lerp(st.cpos, k);
      st.look.lerp(st.clook, k);
      focal += (1.4 - focal) * k;
    }
    const camS = MID - cad.pos.z + (st.launch >= 0 && !title ? (followS - 9 - (MID - cad.pos.z)) * smooth(0, 1, st.chase) : 0);
    const fr = trackFrame(camS, s0, st.frame);
    const F = (u.uCamF.value as THREE.Vector3).subVectors(st.look, st.pos).normalize();
    const R = (u.uCamR.value as THREE.Vector3).crossVectors(F, fr.up).normalize();
    (u.uCamU.value as THREE.Vector3).crossVectors(R, F);
    (u.uCamP.value as THREE.Vector3).copy(st.pos);
    u.uFocalV.value = focal;

    // the engines: idling, throbbing with the kick; revving through the build; full on at the start
    const rev = f.section === "build" ? 0.35 + 0.6 * f.buildProgress : 0.3;
    const burn = st.launch >= 0 ? 1 - 0.4 * smooth(0, 4, st.launch) : rev + 0.35 * f.beatPulse + 0.15 * f.onsetPulse * (f.section === "build" ? 1 : 0);
    u.uBurn.value = approach(u.uBurn.value as number, burn, 8, dt);
    // speed for the trails' width and the blur, once away
    const v = st.launch >= 0 ? Math.min(follow.vmax, follow.accel * Math.max(0, st.launch - follow.delay)) : 0;
    u.uSpeed.value = Math.min(1, v / 160);
    u.uMotion.value = title ? 0 : Math.min(0.8, Math.max(0, (v - 40) / 90)) * st.chase;

    // the kick's wave, running from the grid toward the gantry and beyond
    if (f.beat) {
      st.waveS = Math.min(followS, lead) - 30;
      st.waveT = 0;
    }
    st.waveT += dt;
    st.waveS += dt * (140 + v);
    (u.uWave.value as THREE.Vector2).set(st.waveS - s0, Math.exp(-st.waveT * 1.3));
    u.uRail.value = f.section === "build" && st.launch < 0 ? -f.time * 30 * f.buildProgress : 0;
    (u.uLeap.value as THREE.Vector3).set(0, 1, 0);
  },
  fragment: /* glsl */ `
#define TITLE_SIGN
uniform vec3 uCamP;
uniform vec3 uCamR;
uniform vec3 uCamU;
uniform vec3 uCamF;
uniform float uFocalV;
${ART_LIB}
${FLIGHT_GLSL}
${HEAD_GLSL}
${CIRCUIT_GLSL}
${TRACK_GLSL}
${TRACK_SCENE_GLSL}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 rd = normalize(uv.x * uCamR + uv.y * uCamU + uFocalV * uCamF);
  vec3 col = renderTrack(uCamP, rd, 1. / (uRes.y * uFocalV));
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
