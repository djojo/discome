import * as THREE from "three";
import type { AudioFrame } from "@/lib/audio/AudioEngine";
import { wantCloudNoise } from "./cloudnoise";

/**
 * What the scenes of Olympe share, so that the world is one place:
 * - its clock: the world's own time, which slows down on the drop (a slow motion: the shards, the fragments, the
 *   veil, the dust and the clouds all slow down together, while the lights of the kick keep the tempo);
 * - its sun: how high it stands and how warm it is, following the track (low and golden in the intro, rising through
 *   the build, at its highest on the drop, sinking warm through the breakdown; the night warms it a little more). Each
 *   scene keeps its own bearing (the sun behind its subject);
 * - its feathers' whirl on the drop, and the canon drawn across its sky through a build.
 * Advanced once a frame, whichever scene draws first (two scenes draw during a transition).
 */
export const OLYMPE_UNIFORMS = {
  /** 0..1: how high the sun stands (sky.glsl.ts: sunY). */
  uSunEl: { value: 0.3 },
  /** 0..1: how warm its light is. */
  uSunWarm: { value: 0.3 },
  /** The time scale now (1, down to .2 in the slow motion). */
  uSlow: { value: 1 },
  /** How far the feathers have whirled round (a burst on each drop). */
  uFeatherSwirl: { value: 0 },
  /** The canon drawn across the sky through a build: how far (0..1), how visible (it fades after the drop). */
  uSkyCanon: { value: 0 },
  uSkyCanonA: { value: 0 },
};

let lastTime = Number.NaN;
let clock = 0;
let scale = 1;
let dropT = 99;

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

function step(f: AudioFrame, dt: number) {
  if (f.time === lastTime) return;
  lastTime = f.time;
  const bar = f.bpm > 0 ? 240 / f.bpm : 2;
  const beat = bar / 4;
  dropT = f.drop ? 0 : dropT + dt;
  // the slow motion: down to a fifth within a beat, held a bar, back over a bar (tamed with the flashes)
  const low = f.safeFlash ? 0.45 : 0.2;
  scale =
    dropT < beat
      ? 1 - (1 - low) * smooth(dropT / beat)
      : dropT < beat + bar
        ? low
        : dropT < beat + 2 * bar
          ? low + (1 - low) * smooth((dropT - beat - bar) / bar)
          : 1;
  clock += dt * scale;
  OLYMPE_UNIFORMS.uSlow.value = scale;
  // the feathers whirl round on the drop, and settle back to their slow fall
  OLYMPE_UNIFORMS.uFeatherSwirl.value += dt * scale * (0.03 + 1.6 * Math.exp(-dropT / (bar * 1.2)));
  // the canon drawn across the sky through the build, stroke after stroke; fading over four bars after it
  const sc = OLYMPE_UNIFORMS.uSkyCanon, sa = OLYMPE_UNIFORMS.uSkyCanonA;
  if (f.section === "build") {
    sc.value = Math.max(sc.value, sc.value + (f.buildProgress - sc.value) * (1 - Math.exp(-dt * 2)));
    sa.value = Math.min(1, sa.value + dt * 0.8);
  } else {
    sa.value = Math.max(0, sa.value - dt / (bar * 4));
    if (sa.value <= 0) sc.value = 0;
  }
  // the sun follows the track
  const el = f.section === "build" ? 0.25 + 0.5 * f.buildProgress : f.section === "drop" ? 0.85 : f.section === "breakdown" ? 0.08 : 0.25;
  const e = OLYMPE_UNIFORMS.uSunEl.value;
  OLYMPE_UNIFORMS.uSunEl.value = e + (el - e) * (1 - Math.exp(-dt * (el > e ? 0.6 : 0.25)));
  const warm = Math.min(1, (f.section === "breakdown" ? 0.9 : f.section === "drop" ? 0.05 : 0.3) + 0.35 * f.drift);
  const w = OLYMPE_UNIFORMS.uSunWarm.value;
  OLYMPE_UNIFORMS.uSunWarm.value = w + (warm - w) * (1 - Math.exp(-dt * 0.3));
}

/** The time warp of the world's scenes (defineShaderScene: timeWarp): its own time, and the frame's slowed step. */
export function olympeWarp(f: AudioFrame, dt: number) {
  step(f, dt);
  return { time: clock, dt: dt * scale };
}

/** The uniforms an Olympe scene needs: the clouds' noise and the shared sun, its own doves and feathers. */
export function olympeUniforms() {
  return { ...wantCloudNoise(), ...OLYMPE_UNIFORMS, ...flockUniforms(), ...featherUniforms() };
}

// ---- the feathers (sky.glsl.ts: feathersO)

const FEATHERS = 24;
/** Each feather's own numbers: where in the box, how it sways and falls, its turn. */
const FEATHER_H = Array.from({ length: FEATHERS }, () => [Math.random(), Math.random(), Math.random(), Math.random()]);

function featherUniforms() {
  return {
    uFeathers: { value: Array.from({ length: FEATHERS }, () => new THREE.Vector4(0, -1e5, 0, 0)) },
    uFeatherL: { value: 0 },
  };
}

/** The box of air a scene's feathers fall through: its size, a feather's length, how fast they fall, how far ahead. */
export type FeatherBox = { size: number; length: number; fall: number; ahead: number };

const fCtr = new THREE.Vector3();
const fP = new THREE.Vector3();

/**
 * Where the scene's feathers are now (once a frame: the shader only reads them): falling and swaying in a box of air
 * ahead of the eye (eye: where it is, roughly; fwd: where it looks), fixed in the world, each wrapping round to the
 * other side as the eye moves on; whirled round on the drop (uFeatherSwirl). time: the world's slowed time.
 */
export function featherStep(
  u: Record<string, THREE.IUniform>,
  time: number,
  eye: THREE.Vector3,
  fwd: THREE.Vector3,
  box: FeatherBox,
) {
  const B = box.size, L = box.length;
  fCtr.copy(fwd).normalize().multiplyScalar(box.ahead).add(eye);
  const swirl = OLYMPE_UNIFORMS.uFeatherSwirl.value;
  const wrap = (x: number, o: number) => x - o - B * Math.floor((x - o) / B) + o;
  const out = u.uFeathers.value as THREE.Vector4[];
  FEATHER_H.forEach((h, i) => {
    const mx = Math.sin(time * (0.5 + 0.3 * h[1]) + i) * L * 1.5;
    const my = -time * box.fall * (0.7 + 0.6 * h[2]);
    const mz = Math.cos(time * (0.4 + 0.3 * h[0]) + i * 2) * L;
    fP.set(
      wrap(h[0] * B + mx, fCtr.x - B / 2) - fCtr.x,
      wrap(h[1] * B + my, fCtr.y - B / 2) - fCtr.y,
      wrap(h[2] * B + mz, fCtr.z - B / 2) - fCtr.z,
    );
    // the drop's whirl round the middle of the box
    const a = swirl * (0.6 + 0.8 * h[0]), c = Math.cos(a), s = Math.sin(a);
    out[i].set(fCtr.x + fP.x * c - fP.z * s, fCtr.y + fP.y, fCtr.z + fP.x * s + fP.z * c, h[3]);
  });
  u.uFeatherL.value = L;
}

// ---- the doves (sky.glsl.ts: dovesO)

function flockUniforms() {
  return {
    uFlockA: { value: new THREE.Vector3() },
    uFlockB: { value: new THREE.Vector3() },
    uFlockT: { value: -1 },
    uFlockR: { value: 1 },
    uFlockSize: { value: 1 },
    uFlockBurst: { value: 0 },
  };
}

/** Where a flight of doves goes in a scene: from a to b (its own world), the flock's spread, a wingspan, how long. */
export type FlockRoute = { a: [number, number, number]; b: [number, number, number]; r: number; size: number; dur: number; burst?: boolean };

const flocks = new WeakMap<object, { t: number; dur: number; phrase: number }>();

/**
 * The scene's flight of doves: one crosses the sky now and then (a phrase starting, one time in two), or right now
 * (launch: the drop out of the opened head). dt: the world's slowed step (they slow down with the rest).
 */
export function flockStep(u: Record<string, THREE.IUniform>, f: AudioFrame, dt: number, route: () => FlockRoute, launch = false) {
  // (without a tempo, a phrase every 16 seconds)
  const phrase = f.bpm > 0 ? Math.floor(f.bar / 8) : Math.floor(f.time / 16);
  let s = flocks.get(u);
  if (!s) flocks.set(u, (s = { t: -1, dur: 1, phrase }));
  const free = s.t < 0;
  if (launch || (free && phrase !== s.phrase && Math.random() < 0.5)) {
    const r = route();
    (u.uFlockA.value as THREE.Vector3).set(...r.a);
    (u.uFlockB.value as THREE.Vector3).set(...r.b);
    u.uFlockR.value = r.r;
    u.uFlockSize.value = r.size;
    u.uFlockBurst.value = r.burst ? 1 : 0;
    s.t = 0;
    s.dur = r.dur;
  }
  s.phrase = phrase;
  if (s.t >= 0) {
    s.t += dt / s.dur;
    if (s.t >= 1) s.t = -1;
  }
  u.uFlockT.value = s.t;
}
