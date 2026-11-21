/** Linear interpolation into the band array, x in 0..1. */
export function sampleBands(bands: Float32Array, x: number): number {
  const f = Math.min(1, Math.max(0, x)) * (bands.length - 1);
  const i = Math.floor(f);
  const t = f - i;
  return bands[i] * (1 - t) + bands[Math.min(bands.length - 1, i + 1)] * t;
}

/** Fold 0..1 into a mirrored 0..1..0 so circular layouts close without a seam. */
export function mirror01(x: number): number {
  return 1 - Math.abs(1 - 2 * x);
}

export const num = (v: unknown, fallback = 0) => (typeof v === "number" ? v : fallback);
