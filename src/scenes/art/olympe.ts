import type { AudioFrame } from "@/lib/audio/AudioEngine";
import { wantCloudNoise } from "./cloudnoise";

/**
 * What the scenes of Olympe share, so that the world is one place:
 * - its clock: the world's own time, which slows down on the drop (a slow motion: the shards, the fragments, the
 *   veil, the dust and the clouds all slow down together, while the lights of the kick keep the tempo);
 * - its sun: how high it stands and how warm it is, following the track (low and golden in the intro, rising through
 *   the build, at its highest on the drop, sinking warm through the breakdown; the night warms it a little more). Each
 *   scene keeps its own bearing (the sun behind its subject).
 * Advanced once a frame, whichever scene draws first (two scenes draw during a transition).
 */
export const OLYMPE_UNIFORMS = {
  /** 0..1: how high the sun stands (sky.glsl.ts: sunY). */
  uSunEl: { value: 0.3 },
  /** 0..1: how warm its light is. */
  uSunWarm: { value: 0.3 },
  /** The time scale now (1, down to .2 in the slow motion). */
  uSlow: { value: 1 },
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

/** The uniforms an Olympe scene needs from the world: the clouds' noise, and the shared sun. */
export function olympeUniforms() {
  return { ...wantCloudNoise(), ...OLYMPE_UNIFORMS };
}
