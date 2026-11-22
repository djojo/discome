import type { AudioFrame } from "@/lib/audio/AudioEngine";
import type { ParamDef } from "../types";

/**
 * Camera flight shared by the "travelling" scenes (Monolithe, Cathédrale, Canyon).
 * Speed follows the structure of the track instead of the instant loudness:
 * cruising on the groove, gliding through the breakdown, accelerating through the build,
 * a take-off boost on the drop. Inertia makes each change felt rather than seen as a jump.
 */
export type FlightMove = "cruise" | "slalom" | "dive" | "climb" | "roll";

const MOVE_LABELS: Record<FlightMove, string> = {
  cruise: "croisière",
  slalom: "slalom",
  dive: "piqué",
  climb: "remontée",
  roll: "tonneau",
};

/** Above this multiplier of the cruise speed, `uSpeed` reaches 1. */
const SPEED_FULL = 6;

/** Settings every flight scene exposes. */
export const flightParams = (speed = 1, dynamics = 1): ParamDef[] => [
  { type: "range", key: "speed", label: "Vitesse de croisière", min: 0, max: 3, step: 0.05, default: speed },
  { type: "range", key: "dynamics", label: "Dynamique", min: 0, max: 2, step: 0.05, default: dynamics },
];

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const approach = (cur: number, target: number, rate: number, dt: number) =>
  cur + (target - cur) * (1 - Math.exp(-dt * rate));
const smooth = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

export class Flight {
  /** Distance travelled, in "cruise seconds" scaled by the scene's own units. */
  travel = 0;
  /** Current multiplier of the cruise speed. */
  speed = 1;
  /** Rate of change of the speed, smoothed (positive = accelerating). */
  accel = 0;
  /** Roll, radians. */
  bank = 0;
  /** Sideways offset, -1..1. */
  sway = 0;
  /** Altitude, -1 (hugging the ground) .. 1.5 (above everything). */
  dive = 0;
  move: FlightMove = "cruise";

  private vel = 0;
  private pump = 0;
  private kick = 0;
  private boost = 0;
  /** Take-off: holds the camera high for a bar and a half after a drop, then lets it glide back down. */
  private air = 0;
  private airTime = 1e3;
  private moveTime = 0;
  private roll = 0;

  /**
   * Advance the flight. `cruise` is the scene's base speed (units per second); `pump` is how hard each kick
   * pushes forward (fraction of the cruise speed).
   */
  update(f: AudioFrame, dt: number, cruise: number, dynamics: number, pump = 0.35) {
    const bar = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;

    if (f.drop) {
      this.boost = 1;
      this.airTime = 0;
      this.pickMove(f, true);
    } else if (f.downbeat && f.phraseBar === 0) {
      this.pickMove(f, false);
    }
    // The take-off boost fades over about two bars
    this.boost *= Math.exp(-dt / (bar * 0.65));
    this.airTime += dt;
    this.air = this.airTime < bar * 1.5 ? 1 : Math.exp(-(this.airTime - bar * 1.5) / (bar * 1.5));

    // Target multiplier from the structure of the track
    let target = 1;
    if (!f.active) target = 1;
    else if (f.section === "breakdown") target = 0.25;
    else if (f.section === "build") target = 0.4 + 2.6 * f.buildProgress * f.buildProgress;
    else if (f.section === "drop") target = 1.8;
    target += 4.2 * this.boost;
    target = Math.max(0.06, 1 + (target - 1) * dynamics);

    // Mass: a damped spring, stiffer when the boost kicks in, softer when braking into a breakdown
    const w = this.boost > 0.5 ? 9 : target > this.speed ? 3.2 : 2.6;
    const a = -w * w * (this.speed - target) - 2 * w * this.vel;
    this.vel += a * dt;
    this.speed = Math.max(0.03, this.speed + this.vel * dt);
    this.accel = approach(this.accel, clamp(this.vel / 6, -1, 1), 3, dt);

    // Each kick pushes forward a little on the groove and the drop: a short, smooth surge (a jump in
    // speed on every beat reads as a stutter, not as a push)
    if (f.beat && (f.section === "calm" || f.section === "drop")) this.kick = Math.min(1, this.kick + 0.6);
    this.kick *= Math.exp(-dt * 5);
    this.pump = approach(this.pump, this.kick, 12, dt);

    this.travel += dt * cruise * (this.speed + pump * this.pump * dynamics);
    this.flyMove(f, dt, bar, dynamics);
  }

  /** 0..1, the normalised speed the shaders use for FOV, streaks and blur. */
  get speedNorm() {
    // the kicks stay out of it: the lens must not breathe on every beat
    return clamp(this.speed / SPEED_FULL, 0, 1.5);
  }

  /** 0..1, how much radial speed blur the compositor applies (nothing at cruise). */
  get motion() {
    return clamp((this.speed - 1.3) / 4, 0, 1);
  }

  describe() {
    return `vol ${this.speed.toFixed(2)}× · ${MOVE_LABELS[this.move]} · altitude ${this.dive.toFixed(2)}`;
  }

  private pickMove(f: AudioFrame, onDrop: boolean) {
    const options: FlightMove[] =
      f.section === "breakdown"
        ? ["cruise", "dive", "slalom"]
        : onDrop
          ? ["roll", "slalom", "climb"]
          : f.section === "drop"
            ? ["roll", "slalom", "climb", "dive"]
          : ["cruise", "slalom", "dive", "climb"];
    const pool = options.filter((m) => m !== this.move);
    this.move = pool[Math.floor(Math.random() * pool.length)];
    this.moveTime = 0;
  }

  private flyMove(f: AudioFrame, dt: number, bar: number, dynamics: number) {
    this.moveTime += dt;
    const amp = Math.min(1.5, dynamics);
    const t = this.moveTime / bar;

    let bank = 0;
    let sway = 0;
    let lift = 0;
    switch (this.move) {
      case "slalom":
        sway = Math.sin(t * Math.PI) * 0.8;
        bank = -Math.cos(t * Math.PI) * 0.28;
        break;
      case "dive":
        lift = -0.7 * smooth(t / 3);
        bank = 0.08 * Math.sin(t * 0.7);
        break;
      case "climb":
        lift = 0.8 * smooth(t / 3);
        bank = -0.06 * Math.sin(t * 0.6);
        break;
      case "roll":
        // One full barrel roll over the first two bars, then a gentle sway
        this.roll = Math.PI * 2 * smooth(t / 2);
        sway = Math.sin(t * 0.8) * 0.3;
        break;
      default:
        sway = Math.sin(t * 0.5) * 0.25;
        bank = Math.sin(t * 0.5 + 1) * 0.05;
    }
    if (this.move !== "roll") this.roll = 0;

    // The structure lifts or lowers the camera on top of the move
    if (f.section === "breakdown") lift += -0.6;
    else if (f.section === "build") lift += -0.6 + 1.2 * f.buildProgress;
    lift += 1.7 * this.air;

    this.sway = approach(this.sway, sway * amp, 1.6, dt);
    this.dive = approach(this.dive, clamp(lift * Math.max(0.3, amp), -1, 1.5), this.air > 0.5 ? 2.2 : 1.2, dt);
    this.bankBase = approach(this.bankBase, bank * amp, 2, dt);
    // The barrel roll is added unsmoothed so it completes a whole turn
    this.bank = this.bankBase + this.roll * Math.min(1, amp);
  }

  private bankBase = 0;
}

/**
 * GLSL side of the flight: uniforms plus helpers. Include after ART_LIB (uses hash12 and rot).
 */
export const FLIGHT_GLSL = /* glsl */ `
uniform float uTravel;
uniform float uSpeed;
uniform float uAccel;
uniform float uBank;
uniform float uSway;
uniform float uDive;
/** The lens opens with the speed: wider field of view = stronger sense of speed. */
float flightFocal(float base) { return base / (1. + uSpeed * .55); }
/**
 * A smooth vibration at high speed and during hard accelerations (take-off). Never random frame to frame:
 * a jitter reads as a rendering bug.
 */
vec2 flightShake() {
  float k = .0025 * uSpeed * uSpeed + .003 * max(uAccel, 0.);
  float t = uTime;
  return vec2(sin(t * 9.1) + .6 * sin(t * 15.7 + 1.3), sin(t * 8.3 + 2.1) + .6 * sin(t * 13.9)) * k;
}
`;

export const flightUniforms = () => ({
  uTravel: { value: 0 },
  uSpeed: { value: 0 },
  uAccel: { value: 0 },
  uBank: { value: 0 },
  uSway: { value: 0 },
  uDive: { value: 0 },
});
