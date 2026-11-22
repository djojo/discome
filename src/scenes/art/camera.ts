import * as THREE from "three";
import type { AudioFrame } from "@/lib/audio/AudioEngine";

/**
 * Framings ("cadrages") for scenes built around a subject: instead of one camera move forever,
 * a new framing is drawn on every phrase and the camera glides to it over a couple of bars,
 * orbiting around the subject. The subject stays still; the camera tells the story.
 */
export interface Framing {
  /** Azimuth around the target, radians (0 = in front, on +z; positive toward +x). */
  az: number;
  /** Elevation, radians. */
  el: number;
  dist: number;
  target: [number, number, number];
  focal: number;
  weight?: number;
  /** Free label, e.g. "open": the scene decides when tagged framings are allowed. */
  tag?: string;
}

const smooth = (x: number) => x * x * (3 - 2 * x);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Shortest way round from a to b. */
const lerpAngle = (a: number, b: number, t: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

export class Cadrage {
  readonly pos = new THREE.Vector3();
  readonly target = new THREE.Vector3();
  focal = 2;
  /** Which framings may be drawn right now (set by the scene in its update). */
  allow: (f: Framing) => boolean = () => true;

  private from: Framing;
  private to: Framing;
  private k = 1;
  private seed = Math.random() * 100;
  private pending: string | null = null;
  /** Seconds since the last new framing. */
  private held = 0;

  constructor(
    private readonly framings: Framing[],
    private readonly glideBars = 2,
  ) {
    this.to = this.from = this.draw(null) ?? framings[0];
  }

  /** Called when the scene comes back on screen: start from a fresh framing, no glide. */
  reset(seed: number) {
    this.seed = seed;
    this.to = this.from = this.draw(null) ?? this.framings[0];
    this.k = 1;
    this.held = 0;
  }

  /** Glide to a framing with this tag as soon as possible (e.g. "open" on the drop). */
  request(tag: string) {
    this.pending = tag;
  }

  update(f: AudioFrame, dt: number) {
    const bar = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;
    this.held += dt;
    // A new framing on every phrase; without a tempo (quiet passages, no clear beat) every ~16 s anyway
    const phrase = (f.downbeat && f.phraseBar === 0) || this.held > (f.bpm > 0 ? 12 * bar : 16);
    if (this.pending || phrase || !this.allow(this.to)) {
      if (phrase) this.held = 0;
      const next = this.draw(this.pending) ?? this.draw(null);
      this.pending = null;
      if (next && next !== this.to) {
        this.from = this.current();
        this.to = next;
        this.k = 0;
      }
    }
    this.k = Math.min(1, this.k + dt / (bar * this.glideBars));
    const c = this.current();
    // A slow orbit on top (about ±10°, over a minute), so even a held framing keeps moving
    const t = f.time;
    const az = c.az + 0.13 * Math.sin(t * 0.09 + this.seed) + 0.05 * Math.sin(t * 0.23 + this.seed * 1.7);
    const el = c.el + 0.05 * Math.sin(t * 0.07 + this.seed * 2);
    const dist = c.dist * (1 + 0.06 * Math.sin(t * 0.08 + this.seed * 3));
    this.target.set(c.target[0], c.target[1], c.target[2]);
    this.pos.set(
      this.target.x + Math.sin(az) * Math.cos(el) * dist,
      this.target.y + Math.sin(el) * dist,
      this.target.z + Math.cos(az) * Math.cos(el) * dist,
    );
    this.focal = c.focal;
  }

  private current(): Framing {
    const e = smooth(this.k);
    const a = this.from;
    const b = this.to;
    return {
      az: lerpAngle(a.az, b.az, e),
      el: lerp(a.el, b.el, e),
      dist: lerp(a.dist, b.dist, e),
      target: [lerp(a.target[0], b.target[0], e), lerp(a.target[1], b.target[1], e), lerp(a.target[2], b.target[2], e)],
      focal: lerp(a.focal, b.focal, e),
    };
  }

  private draw(tag: string | null): Framing | null {
    const pool = this.framings.filter((fr) => fr !== this.to && this.allow(fr) && (!tag || fr.tag === tag));
    if (!pool.length) return null;
    let r = Math.random() * pool.reduce((s, fr) => s + (fr.weight ?? 1), 0);
    for (const fr of pool) {
      r -= fr.weight ?? 1;
      if (r <= 0) return fr;
    }
    return pool[pool.length - 1];
  }
}

export const cameraUniforms = () => ({
  uCamPos: { value: new THREE.Vector3(0, 0, 4) },
  uCamTarget: { value: new THREE.Vector3() },
  uFocal: { value: 2 },
});

/** GLSL side: the camera position, target and focal length written by the Cadrage. */
export const CAMERA_GLSL = /* glsl */ `
uniform vec3 uCamPos;
uniform vec3 uCamTarget;
uniform float uFocal;
`;
