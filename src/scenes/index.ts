import type { SceneDef } from "./types";
import { halo } from "./2d/halo";
import { swirl } from "./2d/swirl";
import { galaxy } from "./3d/galaxy";
import { echoes } from "./2d/echoes";
import { tunnel } from "./shader/tunnel";
import { kaleido } from "./shader/kaleido";
import { orb } from "./3d/orb";
import { terrain } from "./3d/terrain";
import { dancer } from "./3d/humanoid/dancer";
import { android } from "./art/android";
import { particleBody } from "./3d/humanoid/particleBody";
import { porcelain } from "./art/porcelain";
import { metamorphosis } from "./art/metamorphosis";
import { museum } from "./art/museum";
import { faithful } from "./art/faithful";
import { torrent } from "./art/torrent";
import { rose } from "./art/rose";
import { organ } from "./art/organ";
import { kintsugi } from "./art/kintsugi";
import { series } from "./art/series";
import { wheel } from "./art/wheel";
import { panopticon } from "./art/panopticon";
import { collective } from "./art/collective";
import { warehouse } from "./art/warehouse";
import { downpour } from "./art/downpour";
import { pilgrimage } from "./art/pilgrimage";
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
import { flow } from "./art/flow";
import { melt } from "./art/melt";
import { morphose } from "./art/morphose";
import { radiolaria } from "./art/radiolaria";
import { jellyfish } from "./art/jellyfish";
import { cactus } from "./art/cactus";
import { spirit } from "./art/spirit";
import { vision } from "./art/vision";
import { grimoire } from "./art/grimoire";
import { flesh } from "./art/flesh";
import { skin } from "./art/skin";
import { signal } from "./art/signal";
import { forest } from "./art/forest";
import { giants } from "./art/giants";
import { maze } from "./art/maze";
import { fall } from "./art/fall";
import { grotto } from "./art/grotto";
import { mirror } from "./art/mirror";
import { den } from "./art/den";
import { visions } from "./art/visions";
import { race } from "./art/race";
import { grid } from "./art/grid";
import { tube } from "./art/tube";
import { city } from "./art/city";
import { trails } from "./art/trails";

/**
 * The scene library. To add a scene: create a file exporting a SceneDef
 * (2D canvas, fullscreen shader via defineShaderScene, or three.js) and list it here.
 */
export const SCENES: SceneDef[] = [
  // Art direction (worlds)
  porcelain,
  metamorphosis,
  museum,
  topoHead,
  profileHead,
  halftoneHead,
  mercury,
  warehouse,
  cathedral,
  faithful,
  monolith,
  panopticon,
  collective,
  downpour,
  pilgrimage,
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
  flow,
  melt,
  morphose,
  radiolaria,
  jellyfish,
  cactus,
  spirit,
  vision,
  grimoire,
  flesh,
  skin,
  signal,
  torrent,
  rose,
  organ,
  kintsugi,
  series,
  wheel,
  // Mycélium
  forest,
  giants,
  maze,
  fall,
  grotto,
  mirror,
  den,
  visions,
  // Circuit
  race,
  grid,
  tube,
  city,
  trails,
  // Classics, recoloured by the worlds' palettes
  halo,
  kaleido,
  orb,
  tunnel,
  galaxy,
  terrain,
  echoes,
  dancer,
  android,
  particleBody,
  // Only a background now (Monolithe, Arcanes, Bestiaire)
  swirl,
];

export const sceneById = (id: string) => SCENES.find((s) => s.id === id) ?? SCENES[0];

export * from "./types";
