import type * as THREE from "three";
import type { AudioFrame } from "@/lib/audio/AudioEngine";

/*
 * How a scene should react to the music (the "Discome principle"):
 * - The subject (face, figure, architecture, landscape) lives at its own pace: slow, continuous, organic.
 *   It only changes state on the big moments of the track (build, drop, breakdown), like a story event,
 *   with transitions lasting bars, never on every kick.
 * - The effects carry the rhythm: light, colour, particles, waves, glints, post-effects react to the kick,
 *   the attacks and the frequency bands.
 * - Something keeps evolving over minutes (and uSeed varies each comeback), so a scene can be watched for long.
 */

/** Declarative scene settings: the control panel builds its UI from these. */
export type ParamDef =
  | { type: "range"; key: string; label: string; min: number; max: number; step?: number; default: number }
  | { type: "toggle"; key: string; label: string; default: boolean }
  | {
      type: "select";
      key: string;
      label: string;
      /** `group`: options listed under a heading (consecutive options of the same group). */
      options: { value: string; label: string; group?: string }[];
      default: string;
    };

export type ParamValue = number | string | boolean;
export type ParamValues = Record<string, ParamValue>;

/** CSS size of the stage plus the device pixel ratio actually used. */
export interface Viewport {
  width: number;
  height: number;
  dpr: number;
}

export interface SceneInstance {
  resize?(viewport: Viewport): void;
  render(frame: AudioFrame, params: ParamValues, dt: number): void;
  /** WebGL scenes that don't end in `target` (e.g. an EffectComposer) return their final texture here. */
  output?(): THREE.Texture;
  /** Travelling scenes: 0..1, how fast it feels right now (the compositor adds a radial speed blur). */
  motion?(): number;
  /** One line for the debug panel (D). */
  describe?(): string;
  dispose?(): void;
}

/** How hard a scene hits: the auto director picks scenes that fit the music. */
export type Energy = "calm" | "medium" | "intense";

export interface SceneMeta {
  id: string;
  name: string;
  description: string;
  /** Badge shown in the library. */
  tag: "2D" | "Shader" | "3D" | "Visage";
  energy: Energy;
  /** Render offscreen at this fraction of the screen resolution (heavy shaders). Default 1. */
  renderScale?: number;
  /** Alpha of the output is the subject's silhouette: the background stays behind it. */
  mask?: boolean;
  /**
   * Photographic scene: it hands over its light, linear and unbounded, and the compositor grades it (tone curve,
   * vignette, bloom of its real highlights) like every other one. Graphic scenes (2D, line drawings, the classic 3D)
   * write screen values themselves.
   */
  hdr?: boolean;
  /**
   * The library heads (scenes/art/heads.ts) the scene shows by itself, besides its "head" setting: they load with
   * the worlds that hold the scene, so that none pops in late. Given the plan's settings when they depend on them
   * (a museum's collection, a cycle of heads).
   */
  heads?: readonly string[] | ((p: ParamValues) => readonly string[]);
  params: ParamDef[];
}

/** 2D scenes draw into their own canvas (the compositor uploads it as a texture). */
export interface Scene2DDef extends SceneMeta {
  kind: "2d";
  create(ctx: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; viewport: Viewport }): SceneInstance;
}

/** WebGL scenes render into `target` (or expose `output()`), never to the screen. */
export interface SceneGLDef extends SceneMeta {
  kind: "webgl";
  create(ctx: { renderer: THREE.WebGLRenderer; viewport: Viewport; target: THREE.WebGLRenderTarget }): SceneInstance;
}

export type SceneDef = Scene2DDef | SceneGLDef;

export function defaultParams(def: SceneDef): ParamValues {
  const out: ParamValues = {};
  for (const p of def.params) out[p.key] = p.default;
  return out;
}
