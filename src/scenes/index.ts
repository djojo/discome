import type { SceneDef } from "./types";
import { halo } from "./2d/halo";
import { nebula } from "./2d/nebula";
import { echoes } from "./2d/echoes";
import { tunnel } from "./shader/tunnel";
import { kaleido } from "./shader/kaleido";
import { orb } from "./3d/orb";
import { terrain } from "./3d/terrain";
import { dancer } from "./3d/humanoid/dancer";
import { android } from "./3d/humanoid/android";
import { particleBody } from "./3d/humanoid/particleBody";
import { porcelain } from "./art/porcelain";
import { metamorphosis } from "./art/metamorphosis";
import { faithful } from "./art/faithful";
import { flux } from "./art/flux";
import { panopticon } from "./art/panopticon";
import { warehouse } from "./art/warehouse";
import { downpour } from "./art/downpour";
import { race } from "./art/race";
import { topoHead, profileHead, halftoneHead } from "./art/faces";
import { mercury } from "./art/mercury";
import { cathedral } from "./art/cathedral";
import { monolith } from "./art/monolith";
import { canyonGorge, canyonMesas } from "./art/canyon";
import { arcaneArchitect } from "./art/architect";
import { arcaneNomad } from "./art/nomad";
import { arcanePrism } from "./art/prism";
import { arcanePortal } from "./art/portal";
import { arcaneRoad } from "./art/road";
import { beads } from "./art/beads";
import { wave } from "./art/wave";
import { blend } from "./art/blend";
import { morphose } from "./art/morphose";
import { radiolaria } from "./art/radiolaria";
import { grimoire } from "./art/grimoire";
import { flesh } from "./art/flesh";
import { signal } from "./art/signal";

/**
 * The scene library. To add a scene: create a file exporting a SceneDef
 * (2D canvas, fullscreen shader via defineShaderScene, or three.js) and list it here.
 */
export const SCENES: SceneDef[] = [
  // Art direction (worlds)
  porcelain,
  metamorphosis,
  topoHead,
  profileHead,
  halftoneHead,
  mercury,
  warehouse,
  cathedral,
  faithful,
  monolith,
  panopticon,
  downpour,
  race,
  canyonGorge,
  canyonMesas,
  arcaneArchitect,
  arcaneNomad,
  arcanePrism,
  arcanePortal,
  arcaneRoad,
  beads,
  wave,
  blend,
  morphose,
  radiolaria,
  grimoire,
  flesh,
  signal,
  flux,
  // Classics, recoloured by the worlds' palettes
  halo,
  kaleido,
  orb,
  tunnel,
  nebula,
  terrain,
  echoes,
  dancer,
  android,
  particleBody,
];

export const sceneById = (id: string) => SCENES.find((s) => s.id === id) ?? SCENES[0];

export * from "./types";
