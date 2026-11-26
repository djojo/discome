import type { AudioFrame } from "@/lib/audio/AudioEngine";

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * How deep the trip is (0..1), following the track: barely there in a quiet intro, a little more in a full groove,
 * rising through the build, all at once on the drop then easing back through its hold, deep and slow in a breakdown
 * (the inner moment: the visions come forward). A world doses it with its « Trip » setting (FxSettings.trip); the
 * visualizer hands the product to the scenes and the compositor as AudioFrame.trip.
 */
export class TripEnvelope {
  level = 0.25;
  private sinceDrop = 99;

  update(f: AudioFrame, dt: number) {
    const bar = f.bpm > 0 ? 240 / f.bpm : 2;
    if (f.drop) this.sinceDrop = 0;
    else this.sinceDrop = Math.min(99, this.sinceDrop + dt);
    let target: number;
    if (!f.active) target = 0.25;
    else if (f.section === "build") target = 0.4 + 0.45 * f.buildProgress;
    else if (f.section === "drop") target = 1 - 0.4 * smooth(0, bar * 8, this.sinceDrop);
    else if (f.section === "breakdown") target = 0.7;
    else target = 0.2 + 0.15 * smooth(0.3, 0.8, f.intensity);
    // the drop lands at once; the rest glides (quicker going up than coming down)
    if (f.drop) this.level = 1;
    else this.level += (target - this.level) * (1 - Math.exp(-dt * (target > this.level ? 1.2 : 0.4)));
    return this.level;
  }
}
