import * as THREE from "three";

/*
 * The circuit of the Circuit world: one track, described once and read on both sides, identically. The CPU rides it
 * (the camera, the pack, their light trails); the GPU draws it in its own frame (straight there, the world twists
 * around it), so its curves, hills and corkscrews cost nearly nothing.
 *
 * The track is a lap: every function of it repeats after LAP metres, and the scenes rebase their coordinates on the
 * current lap (z = -(s - lap origin)): the same curves come back again and again, the same finish gantry, one more
 * light on it every lap. The race that never ends.
 */

/** One lap, in metres. */
export const LAP = 2400;
const K = (Math.PI * 2) / LAP;
/** Half the track's width (its rails stand on the edge). */
export const TRACK_W = 4.2;
/** How far the track banks into its turns (radians per unit of curvature). */
const BANK = 80;
/** The corkscrews: [start, end, turns] along the lap (one turn each way, so a lap ends level). */
const CORKSCREWS: [number, number, number][] = [
  [520, 700, 1],
  [1620, 1800, -1],
];
/** The racers' weave across their lane: wavelength LAP / WEAVE_N. */
const WEAVE_N = 50;
/** A racer floats this high above the track. */
export const HOVER = 0.34;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mod = (x: number, m: number) => x - m * Math.floor(x / m);

/** The track's centre, sideways (metres), at s. */
export const trackX = (s: number) => 30 * Math.sin(2 * K * s) + 12 * Math.sin(5 * K * s + 1.3) + 4 * Math.sin(11 * K * s + 2.1);
const trackDX = (s: number) =>
  K * (60 * Math.cos(2 * K * s) + 60 * Math.cos(5 * K * s + 1.3) + 44 * Math.cos(11 * K * s + 2.1));
const trackDDX = (s: number) =>
  -K * K * (120 * Math.sin(2 * K * s) + 300 * Math.sin(5 * K * s + 1.3) + 484 * Math.sin(11 * K * s + 2.1));
/** Its height (metres): long hills. */
export const trackY = (s: number) => 10 * Math.sin(3 * K * s + 0.7) + 4 * Math.sin(8 * K * s + 2.9);
const trackDY = (s: number) => K * (30 * Math.cos(3 * K * s + 0.7) + 32 * Math.cos(8 * K * s + 2.9));

/** How far the track has rolled at s (radians): banked into its turns, plus the corkscrews' whole turns. */
export function trackRoll(s: number) {
  const u = mod(s, LAP);
  let r = Math.max(-0.55, Math.min(0.55, trackDDX(s) * BANK));
  for (const [a, b, n] of CORKSCREWS) r += Math.PI * 2 * n * smooth(a, b, u);
  return r;
}

/** A racer's weave across its lane at s. */
export const weave = (s: number, phase: number) => 0.8 * Math.sin(WEAVE_N * K * s + phase);

/**
 * The drop's leap: the track sinks away ahead (a bell DIP metres deep between start and start + len), while everything
 * riding it keeps its line and rises a little (LIFT): the pack and the camera fly over the void and land beyond.
 * `open` 0..1 eases it in, so nothing jumps.
 */
export interface Leap {
  start: number;
  len: number;
  open: number;
}
export const DIP = 55;
export const LIFT = 7;
const bell = (leap: Leap | null, s: number) => {
  if (!leap || leap.open <= 0) return 0;
  const u = (s - leap.start) / leap.len;
  return u <= 0 || u >= 1 ? 0 : 0.5 - 0.5 * Math.cos(Math.PI * 2 * u);
};
/** How high something riding the track flies above it at s (the leap). */
export const leapLift = (leap: Leap | null, s: number) => (leap ? LIFT * leap.open * bell(leap, s) : 0);

/** The track's frame at s (world, relative to the lap origin `s0`): its centre and its right / up / forward. */
export interface TrackFrame {
  pos: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  fwd: THREE.Vector3;
}

export function trackFrame(s: number, s0: number, out?: TrackFrame): TrackFrame {
  const f = out ?? { pos: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), fwd: new THREE.Vector3() };
  f.pos.set(trackX(s), trackY(s), -(s - s0));
  f.fwd.set(trackDX(s), trackDY(s), -1).normalize();
  const r = trackRoll(s);
  // the cross-section's axes as the shader reads them (it rolls x and y around z), then square to the slope
  f.up.set(Math.sin(r), Math.cos(r), 0);
  f.right.crossVectors(f.fwd, f.up).normalize();
  f.up.crossVectors(f.right, f.fwd).normalize();
  return f;
}

/**
 * A point riding the track: `x` across it, `y` above it (the leap's lift included), in the shader's own convention
 * (the cross-section rolls in the plane z = -s), so that it sits exactly where the shader draws the track.
 */
export function trackPoint(s: number, s0: number, x: number, y: number, leap: Leap | null, out = new THREE.Vector3()) {
  const r = trackRoll(s);
  const c = Math.cos(r);
  const sn = Math.sin(r);
  const yy = y + leapLift(leap, s);
  return out.set(trackX(s) + c * x + sn * yy, trackY(s) - sn * x + c * yy, -(s - s0));
}

/**
 * GLSL side, the same numbers: trackX/Y/Roll(s), toTrack(p) (a world point in the track's frame: x across, y above
 * its top, and s along it) and the leap's dip (uLeap: start, len, open; relative to the lap origin like the world).
 */
export const TRACK_GLSL = /* glsl */ `
uniform vec3 uLeap;
const float LAP = ${LAP.toFixed(1)};
const float TRACK_W = ${TRACK_W.toFixed(2)};
const float TK = ${K.toPrecision(9)};
float trackX(float s) { return 30. * sin(2. * TK * s) + 12. * sin(5. * TK * s + 1.3) + 4. * sin(11. * TK * s + 2.1); }
float trackDDX(float s) { return -TK * TK * (120. * sin(2. * TK * s) + 300. * sin(5. * TK * s + 1.3) + 484. * sin(11. * TK * s + 2.1)); }
float trackY0(float s) { return 10. * sin(3. * TK * s + .7) + 4. * sin(8. * TK * s + 2.9); }
float leapBell(float s) {
  float u = (s - uLeap.x) / uLeap.y;
  return (u <= 0. || u >= 1. || uLeap.z <= 0.) ? 0. : .5 - .5 * cos(6.2831853 * u);
}
/** The track's height, sunk by the leap where it opens. */
float trackY(float s) { return trackY0(s) - ${DIP.toFixed(1)} * uLeap.z * leapBell(s); }
float trackRoll(float s) {
  float u = mod(s, LAP);
  float r = clamp(trackDDX(s) * ${BANK.toFixed(1)}, -.55, .55);
${CORKSCREWS.map(([a, b, n]) => `  r += ${(Math.PI * 2 * n).toFixed(6)} * smoothstep(${a.toFixed(1)}, ${b.toFixed(1)}, u);`).join("\n")}
  return r;
}
/** A world point in the track's frame: (across, above the top, along). */
vec3 toTrack(vec3 p) {
  float s = -p.z;
  vec2 q = p.xy - vec2(trackX(s), trackY(s));
  float r = trackRoll(s);
  float c = cos(r), si = sin(r);
  return vec3(c * q.x - si * q.y, si * q.x + c * q.y, s);
}
`;

/** One racer of the pack: its lane, its weave, its colour, and how far ahead of the camera it rides (s). */
interface Racer {
  lane: number;
  phase: number;
  /** Mean distance ahead of the camera, and its swing (overtaking, falling back). */
  base: number;
  swing: number;
  rate: number;
  clock: number;
  colour: number;
  ahead: number;
}

/** Racers drawn at most (uniform arrays). */
export const PACK_MAX = 12;
/** Points along each light trail (3 segments). */
export const TRAIL_PTS = 4;

const hashF = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * The racers as the shader reads them (world, relative to the lap origin): position (w: colour index, < 0 = not
 * drawn), right, up, forward, and their two trails (TRAIL_PTS points per pod).
 */
export class Racers {
  readonly pos = Array.from({ length: PACK_MAX }, () => new THREE.Vector4(0, 0, 0, -1));
  readonly right = Array.from({ length: PACK_MAX }, () => new THREE.Vector3());
  readonly up = Array.from({ length: PACK_MAX }, () => new THREE.Vector3());
  readonly fwd = Array.from({ length: PACK_MAX }, () => new THREE.Vector3());
  readonly trailL = Array.from({ length: PACK_MAX * TRAIL_PTS }, () => new THREE.Vector3());
  readonly trailR = Array.from({ length: PACK_MAX * TRAIL_PTS }, () => new THREE.Vector3());
  private frame: TrackFrame = { pos: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), fwd: new THREE.Vector3() };
  private tmp = new THREE.Vector3();

  hide(i: number) {
    this.pos[i].w = -1;
  }

  /**
   * Place racer i at s on the track: `xAt(s)` its line across the track (where it is, and where it was: its trails
   * follow it), `lift` above its hover height, its trails reaching back `trail` metres but never before `from`.
   */
  place(i: number, s: number, s0: number, xAt: (s: number) => number, lift: number, colour: number, trail: number, leap: Leap | null, from = -Infinity) {
    const x = xAt(s);
    const f = trackFrame(s, s0, this.frame);
    trackPoint(s, s0, x, HOVER + lift, leap, this.tmp);
    this.pos[i].set(this.tmp.x, this.tmp.y, this.tmp.z, colour);
    // turned along its line
    const yaw = Math.atan(xAt(s + 0.5) - xAt(s - 0.5));
    const c = Math.cos(yaw);
    const sn = Math.sin(yaw);
    this.fwd[i].copy(f.fwd).multiplyScalar(c).addScaledVector(f.right, sn).normalize();
    this.up[i].copy(f.up);
    this.right[i].crossVectors(this.fwd[i], this.up[i]).normalize();
    // its trails: points behind it, along the track (where it was), from the pods
    const tail = Math.max(0, Math.min(trail, s - 1.05 - from));
    for (let k = 0; k < TRAIL_PTS; k++) {
      const ts = s - 1.05 - (tail * k) / (TRAIL_PTS - 1);
      const tx = xAt(ts);
      trackPoint(ts, s0, tx - 0.46, HOVER + 0.12, leap, this.trailL[i * TRAIL_PTS + k]);
      trackPoint(ts, s0, tx + 0.46, HOVER + 0.12, leap, this.trailR[i * TRAIL_PTS + k]);
    }
  }

  /** The racers' uniforms. */
  uniforms() {
    return {
      uRacerP: { value: this.pos },
      uRacerR: { value: this.right },
      uRacerU: { value: this.up },
      uRacerF: { value: this.fwd },
      uTrailL: { value: this.trailL },
      uTrailR: { value: this.trailR },
    };
  }
}

/**
 * The pack around the camera: each racer keeps its lane and weaves across it, drifts ahead and falls back on its own
 * slow clock (some pass the camera now and then), and leaves two trails of light behind its pods. The CPU places
 * them on the track (world positions, frames, trail points) for the shader.
 */
export class Pack extends Racers {
  private racers: Racer[] = [];

  constructor(seed = Math.random() * 100) {
    super();
    this.reseed(seed);
  }

  reseed(seed: number) {
    const lanes = [-2.7, 2.7, -0.9, 0.9, -1.8, 1.8, 0, -2.7, 2.7, 0.9, -0.9, 1.8];
    this.racers = lanes.map((lane, i) => {
      const h = hashF(seed + i * 7.3);
      return {
        lane: lane + (hashF(seed + i * 3.1) - 0.5) * 0.4,
        phase: h * 6.283,
        base: 7 + i * 11 + h * 6,
        swing: 5 + 10 * hashF(seed + i * 5.7),
        rate: 0.05 + 0.08 * hashF(seed + i * 9.1),
        clock: hashF(seed + i * 1.9) * 40,
        colour: i % 4,
        ahead: 0,
      };
    });
  }

  /**
   * Place the pack around the camera at s (the lap origin s0). `count`: racers on the track; `trail`: their trails'
   * length (metres); `spread` scales how far ahead they ride.
   */
  update(dt: number, s: number, s0: number, count: number, trail: number, spread: number, leap: Leap | null, time: number) {
    for (let i = 0; i < PACK_MAX; i++) {
      const r = this.racers[i];
      r.clock += dt * r.rate;
      r.ahead = (r.base + r.swing * Math.sin(r.clock)) * spread;
      if (i >= count) {
        this.hide(i);
        continue;
      }
      const bob = 0.04 * Math.sin(time * (2.1 + i * 0.37) + i);
      this.place(i, s + r.ahead, s0, (x) => r.lane + weave(x, r.phase), bob, r.colour, trail, leap);
    }
  }
}
