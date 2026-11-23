/** Global post-effects applied by the compositor's final pass (on top of every scene). */
export type StrobeMode = "off" | "flash" | "invert";

export interface FxSettings {
  /** Chromatic aberration, pulsed by the beat. */
  chroma: number;
  scanlines: number;
  /** CRT screen curvature. */
  crt: number;
  grain: number;
  /** Tape look: line jitter, tracking band, colour bleed. */
  vhs: number;
  vignette: number;
  /** Degrees. */
  hue: number;
  saturation: number;
  contrast: number;
  brightness: number;
  /** Global mirror / kaleidoscope: 0 = off, else number of segments. */
  mirror: number;
  /** 0 = off, 1 = very few colour levels. */
  posterize: number;
  /** Big pixels and ordered dithering, like an old console. */
  pixel: number;
  /** Pixel and VHS only flare up on the big moments (the drop, the strong kicks), stronger and brief, instead of all the time. */
  retroOnHits: boolean;
  /** Feedback of the previous frame (light trails). */
  trails: number;
  /** Glow of light around the highlights (bloom). */
  bloom: number;
  /** Radial blur of travelling scenes, following their speed (nothing at cruise). */
  speedBlur: number;
  /** Strobe on the kicks of a drop. */
  strobe: StrobeMode;
}

export const NEUTRAL_FX: FxSettings = {
  chroma: 0,
  scanlines: 0,
  crt: 0,
  grain: 0,
  vhs: 0,
  vignette: 0.18,
  hue: 0,
  saturation: 1,
  contrast: 1,
  brightness: 0,
  mirror: 0,
  posterize: 0,
  pixel: 0,
  retroOnHits: false,
  trails: 0,
  bloom: 0,
  speedBlur: 0.5,
  strobe: "off",
};

type NumericFx = Exclude<keyof FxSettings, "strobe" | "mirror" | "retroOnHits">;

/** Slider definitions for the Post-FX panel. */
export const FX_SLIDERS: { key: NumericFx; label: string; min: number; max: number; step: number }[] = [
  { key: "chroma", label: "Aberration chromatique", min: 0, max: 1, step: 0.01 },
  { key: "trails", label: "Traînées", min: 0, max: 0.95, step: 0.01 },
  { key: "bloom", label: "Halo lumineux (bloom)", min: 0, max: 1, step: 0.01 },
  { key: "speedBlur", label: "Flou de vitesse", min: 0, max: 1, step: 0.01 },
  { key: "scanlines", label: "Scanlines", min: 0, max: 1, step: 0.01 },
  { key: "crt", label: "Courbure CRT", min: 0, max: 1, step: 0.01 },
  { key: "vhs", label: "VHS", min: 0, max: 1, step: 0.01 },
  { key: "grain", label: "Grain", min: 0, max: 1, step: 0.01 },
  { key: "vignette", label: "Vignette", min: 0, max: 1, step: 0.01 },
  { key: "posterize", label: "Postérisation", min: 0, max: 1, step: 0.01 },
  { key: "pixel", label: "Pixel (tramage)", min: 0, max: 1, step: 0.01 },
  { key: "hue", label: "Teinte", min: -180, max: 180, step: 1 },
  { key: "saturation", label: "Saturation", min: 0, max: 2, step: 0.01 },
  { key: "contrast", label: "Contraste", min: 0.5, max: 2, step: 0.01 },
  { key: "brightness", label: "Luminosité", min: -0.5, max: 0.5, step: 0.01 },
];

export const MIRROR_OPTIONS = [
  { value: 0, label: "Aucun" },
  { value: 2, label: "Miroir ×2" },
  { value: 4, label: "Kaléido ×4" },
  { value: 6, label: "Kaléido ×6" },
  { value: 8, label: "Kaléido ×8" },
];

export const STROBE_OPTIONS: { value: StrobeMode; label: string }[] = [
  { value: "off", label: "Aucun" },
  { value: "flash", label: "Flash blanc" },
  { value: "invert", label: "Inversion" },
];
