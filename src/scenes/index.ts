import type { SceneDef } from "./types";
import { halo } from "./2d/halo";
import { nebula } from "./2d/nebula";
import { echoes } from "./2d/echoes";
import { tunnel } from "./shader/tunnel";
import { kaleido } from "./shader/kaleido";
import { orb } from "./3d/orb";
import { terrain } from "./3d/terrain";

/**
 * The scene library. To add a scene: create a file exporting a SceneDef
 * (2D canvas, fullscreen shader via defineShaderScene, or three.js) and list it here.
 */
export const SCENES: SceneDef[] = [halo, kaleido, orb, tunnel, nebula, terrain, echoes];

export const sceneById = (id: string) => SCENES.find((s) => s.id === id) ?? SCENES[0];

export * from "./types";
