import * as THREE from "three";
import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { num } from "../utils";
import { ART_LIB } from "./lib.glsl";
import { CIRCUIT_GLSL } from "./circuit.glsl";
import { FLIGHT_GLSL, flightParams } from "./flight";
import { inside, LANES, LAP, Pack, PACK_MAX, Steer, TRACK_GLSL, trackFrame, trackPoint, type Leap, type TrackFrame } from "./circuitTrack";
import { TRACK_SCENE_GLSL } from "./circuitScene.glsl";

const approach = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-dt * rate));

/** Metres per second at cruise (the scene's speed and the flight's multiplier on top). */
const CRUISE = 40;

/** Laps run over the night, every circuit scene together: the gantry's lights count them, then start again. */
let laps = 0;

interface RaceState {
  pack: Pack;
  /** Where in the lap this visit started (a new stretch of the circuit on every return). */
  offset: number;
  lap: number;
  leap: Leap | null;
  waveS: number;
  waveT: number;
  rail: number;
  boost: number;
  last: number;
  frame: TrackFrame;
  pos: THREE.Vector3;
  look: THREE.Vector3;
  /** The camera rides like a racer: its lane, its steering. */
  camLane: number;
  cam: Steer;
}

/**
 * Le Circuit: the race of the future, high above a megacity at night. An anti-gravity track of black glass with rails
 * of light, banked into its turns, rolling over long hills and twisting into corkscrews (the world turns around it),
 * through hoops of light; the camera rides it just above the deck in the middle of a pack of racers, each leaving two
 * trails of light. The kick sends a wave of light running ahead down the track (the boost pads light up as it
 * passes); through the build the rails' lights race ahead and the camera drops low; on the drop the track falls away
 * ahead and the pack flies over the void, the city far below, to land beyond. The race never ends: the same lap again
 * and again, one more light on the finish gantry every time it passes.
 */
export const race = defineShaderScene({
  id: "circuit-track",
  name: "Le Circuit",
  energy: "intense",
  hdr: true,
  mask: true,
  renderScale: 0.64,
  flight: { cruise: CRUISE, pump: 0.3 },
  description:
    "Une piste anti-gravité de verre noir suspendue très haut au-dessus d'une mégapole de nuit : virages relevés, bosses, tire-bouchons, anneaux de lumière. On roule au ras de la piste dans une meute de bolides aux traînées lumineuses ; au kick une vague de lumière file devant, au drop la piste se dérobe et la meute vole au-dessus du vide. Le même tour revient sans fin, une lumière de plus au portique à chaque passage.",
  params: [
    paletteParam("piste"),
    { type: "toggle", key: "cruise", label: "Croisière (moins de bolides, caméra plus haute)", default: false },
    ...flightParams(1, 1),
  ],
  uniforms: () => {
    const pack = new Pack();
    const st: RaceState = {
      pack,
      offset: 0,
      lap: 0,
      leap: null,
      waveS: -1e4,
      waveT: 99,
      rail: 0,
      boost: 0,
      last: -99,
      frame: { pos: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), fwd: new THREE.Vector3() },
      pos: new THREE.Vector3(),
      look: new THREE.Vector3(),
      camLane: 0,
      cam: new Steer(1.2),
    };
    return {
      uState: { value: st },
      ...pack.uniforms(),
      uLeap: { value: new THREE.Vector3(0, 1, 0) },
      uCamP: { value: new THREE.Vector3() },
      uCamR: { value: new THREE.Vector3(1, 0, 0) },
      uCamU: { value: new THREE.Vector3(0, 1, 0) },
      uCamF: { value: new THREE.Vector3(0, 0, -1) },
      uWave: { value: new THREE.Vector2(-1e4, 0) },
      uRail: { value: 0 },
      uBoost: { value: 0 },
      uBurn: { value: 0.3 },
      uGantry: { value: new THREE.Vector3() },
    };
  },
  update(u, f, p, dt, ctx) {
    const st = u.uState.value as RaceState;
    const fl = ctx.flight!;
    const bar = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;
    const cruise = p.cruise === true;
    // back on screen: another stretch of the circuit, another pack
    if (f.time - st.last > 1.5) {
      st.offset = Math.random() * LAP - fl.travel;
      st.pack.reseed(Math.random() * 100);
      st.leap = null;
      st.boost = 0;
      st.lap = Math.floor((fl.travel + st.offset) / LAP);
      st.camLane = LANES[1 + Math.floor(Math.random() * 3)];
      st.cam.reset(st.camLane);
    }
    st.last = f.time;
    const s = fl.travel + st.offset;
    const lap = Math.floor(s / LAP);
    if (lap > st.lap) laps++;
    st.lap = lap;
    const s0 = lap * LAP;
    const v = CRUISE * num(p.speed, 1) * fl.speed;

    // the drop: the track falls away ahead, the pack flies over the void and lands beyond
    if (f.drop) {
      const len = Math.min(700, Math.max(260, CRUISE * num(p.speed, 1) * 4 * bar * 2));
      st.leap = { start: s + 35, len, open: 0 };
      st.boost = 1;
    }
    if (st.leap) {
      st.leap.open = approach(st.leap.open, 1, 4, dt);
      if (s > st.leap.start + st.leap.len + 160) st.leap = null;
    }
    st.boost *= Math.exp(-dt / (bar * 0.9));
    const leap = st.leap;
    const lp = u.uLeap.value as THREE.Vector3;
    if (leap) lp.set(leap.start - s0, leap.len, leap.open);
    else lp.set(0, 1, 0);

    // the camera: just above the deck (higher in Croisière), lower through the build; it rides like a racer, holding a
    // lane, moving over now and then on a new phrase, taking the inside line in the turns
    if (f.downbeat && f.phraseBar === 0 && Math.random() < 0.5) {
      const li = LANES.indexOf(st.camLane);
      st.camLane = LANES[Math.max(0, Math.min(LANES.length - 1, li + (Math.random() < 0.5 ? -1 : 1)))];
    }
    const sway = st.cam.update(dt, st.camLane + 0.9 * inside(s));
    const h = (cruise ? 3.2 : 1.25) * (1 + 0.3 * Math.min(fl.dive, 0));
    trackPoint(s, s0, sway, h, leap, st.pos);
    trackPoint(s + (cruise ? 26 : 15), s0, sway * 0.6, h - (cruise ? 1.6 : 0.65), leap, st.look);
    const fr = trackFrame(s, s0, st.frame);
    const F = (u.uCamF.value as THREE.Vector3).subVectors(st.look, st.pos).normalize();
    // the track's up (its banked turns, its corkscrews), leaning a little into a change of lane
    const up = fr.up.clone().applyAxisAngle(F, -st.cam.vx * 0.06);
    const R = (u.uCamR.value as THREE.Vector3).crossVectors(F, up).normalize();
    (u.uCamU.value as THREE.Vector3).crossVectors(R, F);
    (u.uCamP.value as THREE.Vector3).copy(st.pos);

    // the pack: denser as the night drifts (the race consumes everything)
    const count = Math.min(PACK_MAX, Math.round((cruise ? 4 : 8) + 2 * f.drift));
    st.pack.update(dt, s, s0, count, 16 + 46 * fl.speedNorm, cruise ? 1.5 : 1, leap, f.time, v);

    // the kick's wave of light, running ahead faster than the pack
    if (f.beat) {
      st.waveS = s + 4;
      st.waveT = 0;
    }
    st.waveT += dt;
    st.waveS += dt * (v + 140);
    (u.uWave.value as THREE.Vector2).set(st.waveS - s0, Math.exp(-st.waveT * 1.3));
    // the rails' lights: still on the groove (they stream by), racing ahead through the build
    st.rail += dt * v * (f.section === "build" ? 0.4 + 1.6 * f.buildProgress : 0);
    u.uRail.value = st.rail - s0;
    u.uBoost.value = st.boost;
    const burn = f.section === "build" ? 0.3 + 0.7 * f.buildProgress : f.section === "breakdown" ? 0.15 : 0.35;
    u.uBurn.value = approach(u.uBurn.value as number, Math.max(burn, st.boost), 3, dt);
    // the finish gantry counts the laps
    (u.uGantry.value as THREE.Vector3).set(0, laps % 11, 0);
  },
  fragment: /* glsl */ `
uniform vec3 uCamP;
uniform vec3 uCamR;
uniform vec3 uCamU;
uniform vec3 uCamF;
${ART_LIB}
${FLIGHT_GLSL}
${CIRCUIT_GLSL}
${TRACK_GLSL}
${TRACK_SCENE_GLSL}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  uv += flightShake();
  float focal = flightFocal(1.35);
  vec3 rd = normalize(uv.x * uCamR + uv.y * uCamU + focal * uCamF);
  vec3 col = renderTrack(uCamP, rd, 1. / (uRes.y * focal));
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
