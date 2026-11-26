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
/** A racer floats this high above the track. */
export const HOVER = 0.34;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mod = (x: number, m: number) => x - m * Math.floor(x / m);

/** The track's centre, sideways (metres), at s. */
export const trackX = (s: number) => 30 * Math.sin(2 * K * s) + 12 * Math.sin(5 * K * s + 1.3) + 4 * Math.sin(11 * K * s + 2.1);
export const trackDX = (s: number) =>
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

/** The racing lanes across the track (a racer holds one, and changes now and then). */
export const LANES = [-2.8, -1.4, 0, 1.4, 2.8];

/** The racing line in the turns: how far toward the inside of the curve a racer rides at s (metres). */
export const inside = (s: number) => Math.max(-1, Math.min(1, trackDDX(s) * 220));

/**
 * Steering across the track like a vehicle: toward a target line with a critically damped spring, so a change of lane
 * is one long, smooth S (about 2 / w seconds), never a zigzag.
 */
export class Steer {
  x = 0;
  vx = 0;
  constructor(private readonly w = 1.7) {}
  reset(x: number) {
    this.x = x;
    this.vx = 0;
  }
  update(dt: number, to: number) {
    const w = this.w;
    const h = Math.min(dt, 0.05);
    for (let t = 0; t < dt - 1e-6; t += h) {
      const k = Math.min(h, dt - t);
      this.vx += (w * w * (to - this.x) - 2 * w * this.vx) * k;
      this.x += this.vx * k;
    }
    this.x = Math.max(-TRACK_W + 0.75, Math.min(TRACK_W - 0.75, this.x));
    return this.x;
  }
}

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

/** History of a racer's line (where it was across the track, every HIST_STEP metres), so its trails follow it. */
const HIST = 80;
const HIST_STEP = 2;

/** One driver of the pack: its lanes, its pace against the camera, its steering, its recent line. */
interface Driver {
  /** The lane it likes, the lane it steers for now. */
  pref: number;
  target: number;
  steer: Steer;
  /** How far ahead of the camera it rides (s), its speed against the camera, where that speed is heading, when it changes. */
  ahead: number;
  rel: number;
  relTo: number;
  relT: number;
  /** Seconds until it picks another lane to like; seconds it keeps out after passing. */
  prefT: number;
  holdT: number;
  colour: number;
  hs: Float64Array;
  hx: Float32Array;
  n: number;
  head: number;
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
  /** Where each one rides along the track: s (from the lap origin), across, its colour. */
  readonly track = Array.from({ length: PACK_MAX }, () => new THREE.Vector3());
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
    this.track[i].set(s - s0, x, colour);
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

  /**
   * Place racer i at s riding a wall round the track's axis (a tube): `at(s)` gives where it rides in the track's
   * frame: [x, y, angle] (its belly at x, y; its up turned by `angle` toward the axis: 0 on the floor). Its trails
   * follow it round.
   */
  placeAround(i: number, s: number, s0: number, at: (s: number) => [number, number, number], colour: number, trail: number, from = -Infinity) {
    const [x, y, a] = at(s);
    const f = trackFrame(s, s0, this.frame);
    trackPoint(s, s0, x, y, null, this.tmp);
    this.pos[i].set(this.tmp.x, this.tmp.y, this.tmp.z, colour);
    this.fwd[i].copy(f.fwd);
    this.localUp(s, a, this.up[i]);
    this.right[i].crossVectors(this.fwd[i], this.up[i]).normalize();
    this.up[i].crossVectors(this.right[i], this.fwd[i]).normalize();
    const tail = Math.max(0, Math.min(trail, s - 1.05 - from));
    for (let k = 0; k < TRAIL_PTS; k++) {
      const ts = s - 1.05 - (tail * k) / (TRAIL_PTS - 1);
      const [tx, ty, ta] = at(ts);
      // the pods: across the racer (turned with it round the axis), a little above its belly
      const cx = Math.cos(ta);
      const sx = Math.sin(ta);
      const ux = -sx * 0.12;
      const uy = cx * 0.12;
      trackPoint(ts, s0, tx - 0.46 * cx + ux, ty - 0.46 * sx + uy, null, this.trailL[i * TRAIL_PTS + k]);
      trackPoint(ts, s0, tx + 0.46 * cx + ux, ty + 0.46 * sx + uy, null, this.trailR[i * TRAIL_PTS + k]);
    }
  }

  /** The direction (world) of a local up turned by `a` toward the track's axis, at s. */
  private localUp(s: number, a: number, out: THREE.Vector3) {
    const r = trackRoll(s);
    const c = Math.cos(r);
    const sn = Math.sin(r);
    // local axes in the world: ex = (c, -sn), ey = (sn, c); up = -sin(a) ex + cos(a) ey
    const lx = -Math.sin(a);
    const ly = Math.cos(a);
    return out.set(c * lx + sn * ly, -sn * lx + c * ly, 0).normalize();
  }

  /**
   * Place racer i off the banked track, on level ground beside it (the pits), its line `xAt(s)` across the track's
   * centre and `y` above its height; `onTrack(s)` 0..1 eases it into the track's own banked frame as it joins it.
   */
  placeLevel(i: number, s: number, s0: number, xAt: (s: number) => number, y: number, onTrack: (s: number) => number, colour: number, trail: number, from = -Infinity) {
    const at = (q: number, xx: number, yy: number, out: THREE.Vector3) => {
      const k = onTrack(q);
      const lx = trackX(q) + xx;
      const ly = trackY(q) + yy;
      trackPoint(q, s0, xx, yy, null, out);
      return out.set(lx + (out.x - lx) * k, ly + (out.y - ly) * k, -(q - s0));
    };
    const x = xAt(s);
    at(s, x, HOVER + y, this.tmp);
    this.pos[i].set(this.tmp.x, this.tmp.y, this.tmp.z, colour);
    this.track[i].set(s - s0, x, colour);
    const f = trackFrame(s, s0, this.frame);
    const yaw = Math.atan(xAt(s + 0.5) - xAt(s - 0.5));
    this.fwd[i].copy(f.fwd).multiplyScalar(Math.cos(yaw)).addScaledVector(f.right, Math.sin(yaw)).normalize();
    this.up[i].set(0, 1, 0).lerp(f.up, onTrack(s)).normalize();
    this.right[i].crossVectors(this.fwd[i], this.up[i]).normalize();
    this.up[i].crossVectors(this.right[i], this.fwd[i]).normalize();
    const tail = Math.max(0, Math.min(trail, s - 1.05 - from));
    for (let k = 0; k < TRAIL_PTS; k++) {
      const ts = s - 1.05 - (tail * k) / (TRAIL_PTS - 1);
      const tx = xAt(ts);
      at(ts, tx - 0.46, HOVER + y + 0.12, this.trailL[i * TRAIL_PTS + k]);
      at(ts, tx + 0.46, HOVER + y + 0.12, this.trailR[i * TRAIL_PTS + k]);
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
      uRacerT: { value: this.track },
    };
  }
}

/**
 * The pack around the camera, driven like a race: each racer holds its lane and takes the inside line in the turns;
 * now and then it picks another lane and moves over in one long S; the gaps change slowly (each has its own pace
 * against the camera), and a racer catching another in its lane pulls out to a free lane, passes, and moves back in
 * (or sits behind when it can't). Its trails follow the line it really took. The CPU places them on the track (world
 * positions, frames, trail points) for the shader.
 */
export class Pack extends Racers {
  private drivers: Driver[] = [];

  constructor(seed = Math.random() * 100) {
    super();
    this.reseed(seed);
  }

  reseed(seed: number) {
    this.drivers = Array.from({ length: PACK_MAX }, (_, i) => {
      const lane = LANES[(i * 2 + Math.floor(seed)) % LANES.length];
      const steer = new Steer(1.6 + 0.4 * hashF(seed + i * 2.2));
      steer.reset(lane);
      return {
        pref: lane,
        target: lane,
        steer,
        ahead: 8 + i * 11 + hashF(seed + i * 7.3) * 5,
        rel: 0,
        relTo: 0,
        relT: hashF(seed + i * 3.1) * 4,
        prefT: 6 + 14 * hashF(seed + i * 5.7),
        holdT: 0,
        colour: i % 4,
        hs: new Float64Array(HIST),
        hx: new Float32Array(HIST),
        n: 0,
        head: 0,
      };
    });
  }

  /** Where driver d rode across the track at q (its recorded line; now beyond its last record). */
  private lineAt(d: Driver, q: number) {
    if (d.n === 0) return d.steer.x;
    let k = d.head;
    if (q >= d.hs[k]) return d.steer.x;
    for (let m = 1; m < d.n; m++) {
      const j = (d.head - m + HIST) % HIST;
      if (q >= d.hs[j]) {
        const t = (q - d.hs[j]) / Math.max(1e-6, d.hs[k] - d.hs[j]);
        return d.hx[j] + (d.hx[k] - d.hx[j]) * t;
      }
      k = j;
    }
    return d.hx[k];
  }

  /** Is the lane at x free between `from` and `to` metres ahead of the camera (for driver i)? */
  private free(i: number, x: number, from: number, to: number, count: number) {
    for (let j = 0; j < count; j++) {
      if (j === i) continue;
      const o = this.drivers[j];
      if (o.ahead > from && o.ahead < to && (Math.abs(o.steer.x - x) < 1.15 || Math.abs(o.target - x) < 0.7)) return false;
    }
    return true;
  }

  /**
   * Drive the pack around the camera at s (the lap origin s0), the camera going v m/s. `count`: racers on the track;
   * `trail`: their trails' length (metres); `spread` scales how far ahead they ride.
   */
  update(dt: number, s: number, s0: number, count: number, trail: number, spread: number, leap: Leap | null, time: number, v = 40) {
    const lo = -14 * spread;
    const hi = 135 * spread;
    for (let i = 0; i < PACK_MAX; i++) {
      const d = this.drivers[i];
      if (i >= count) {
        this.hide(i);
        continue;
      }
      // its pace against the camera: changing slowly, keeping it within the pack
      d.relT -= dt;
      if (d.relT < 0) {
        d.relTo = (Math.random() - 0.5) * 7;
        d.relT = 3 + 6 * Math.random();
      }
      if (d.ahead > hi) d.relTo = -Math.abs(d.relTo) - 1;
      if (d.ahead < lo) d.relTo = Math.abs(d.relTo) + 1;
      d.rel += (d.relTo - d.rel) * (1 - Math.exp(-dt * 0.6));
      // caught up with someone in its lane: pull out to a free lane, or sit behind
      let blocker: Driver | null = null;
      for (let j = 0; j < count; j++) {
        const o = this.drivers[j];
        if (j === i) continue;
        const gap = o.ahead - d.ahead;
        if (gap > 0 && gap < 14 && Math.abs(o.steer.x - d.steer.x) < 1.15 && Math.abs(o.target - d.target) < 0.7) blocker = o;
      }
      if (blocker && d.rel > blocker.rel - 0.2) {
        const li = LANES.indexOf(d.target);
        const sides = [li - 1, li + 1].filter((k) => k >= 0 && k < LANES.length).sort(() => Math.random() - 0.5);
        const out = sides.find((k) => this.free(i, LANES[k], d.ahead - 10, d.ahead + 22, count));
        if (out !== undefined) {
          d.target = LANES[out];
          d.holdT = 2.5;
        } else d.rel = Math.min(d.rel, blocker.rel);
      }
      // back to the lane it likes once clear; and now and then it likes another
      d.holdT -= dt;
      d.prefT -= dt;
      if (d.prefT < 0) {
        const li = LANES.indexOf(d.pref);
        const k = Math.max(0, Math.min(LANES.length - 1, li + (Math.random() < 0.5 ? -1 : 1)));
        d.pref = LANES[k];
        d.prefT = 8 + 12 * Math.random();
      }
      if (d.target !== d.pref && d.holdT < 0 && this.free(i, d.pref, d.ahead - 10, d.ahead + 16, count)) d.target = d.pref;
      // never drift back faster than the camera goes forward (its line along s must keep going on)
      d.rel = Math.max(d.rel, -0.5 * v);
      d.ahead += d.rel * dt * spread;
      const rs = s + d.ahead;
      d.steer.update(dt, d.target + 0.9 * inside(rs));
      // record its line
      if (d.n === 0 || rs - d.hs[d.head] >= HIST_STEP) {
        d.head = (d.head + 1) % HIST;
        d.hs[d.head] = rs;
        d.hx[d.head] = d.steer.x;
        d.n = Math.min(HIST, d.n + 1);
      } else if (rs < d.hs[d.head]) {
        // (the camera jumped back: start the line again)
        d.n = 0;
      }
      const bob = 0.04 * Math.sin(time * (2.1 + i * 0.37) + i);
      this.place(i, rs, s0, (q) => this.lineAt(d, q), bob, d.colour, trail, leap);
    }
  }
}
