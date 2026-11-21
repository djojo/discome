import type * as THREE from "three";
import type { AudioFrame } from "@/lib/audio/AudioEngine";

/** Declarative scene settings: the control panel builds its UI from these. */
export type ParamDef =
  | { type: "range"; key: string; label: string; min: number; max: number; step?: number; default: number }
  | { type: "toggle"; key: string; label: string; default: boolean }
  | { type: "select"; key: string; label: string; options: { value: string; label: string }[]; default: string };

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
  dispose?(): void;
}

interface SceneMeta {
  id: string;
  name: string;
  description: string;
  /** Badge shown in the library. */
  tag: "2D" | "Shader" | "3D";
  params: ParamDef[];
}

export interface Scene2DDef extends SceneMeta {
  kind: "2d";
  create(ctx: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; viewport: Viewport }): SceneInstance;
}

export interface SceneGLDef extends SceneMeta {
  kind: "webgl";
  create(ctx: { canvas: HTMLCanvasElement; renderer: THREE.WebGLRenderer; viewport: Viewport }): SceneInstance;
}

export type SceneDef = Scene2DDef | SceneGLDef;

export function defaultParams(def: SceneDef): ParamValues {
  const out: ParamValues = {};
  for (const p of def.params) out[p.key] = p.default;
  return out;
}
