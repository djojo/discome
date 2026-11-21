import { NEUTRAL_FX, type FxSettings } from "@/engine/fx";
import type { DirectorMode } from "@/engine/Director";
import type { TransitionId } from "@/engine/transitions";
import { PALETTES } from "@/scenes/palettes";
import { SCENES, type ParamValues } from "@/scenes";

/**
 * A look ("esthétique") restyles the whole show in one click: which scenes the director
 * uses (and how often), allowed palettes, post-effects, transitions and pacing.
 */
export interface Look {
  id: string;
  name: string;
  description: string;
  /** CSS colours for the card preview. */
  swatch: string[];
  palettes: string[];
  scenes: { id: string; weight?: number; params?: ParamValues }[];
  fx: Partial<FxSettings>;
  transitions?: { calm?: TransitionId[]; drop?: TransitionId[] };
  director?: DirectorMode;
  custom?: boolean;
}

const all = (weight = 1) => SCENES.map((s) => ({ id: s.id, weight }));

export const LOOKS: Look[] = [
  {
    id: "free",
    name: "Libre",
    description: "Toutes les scènes, toutes les palettes, aucun effet global.",
    swatch: ["#ff3cac", "#a855f7", "#22d3ee"],
    palettes: Object.keys(PALETTES),
    scenes: all(),
    fx: {},
  },
  {
    id: "synthwave",
    name: "Synthwave 84",
    description: "Néon et couchant, scanlines, horizon rétro.",
    swatch: ["#ff2a6d", "#d300c5", "#05d9e8"],
    palettes: ["neon", "sunset"],
    scenes: [
      { id: "terrain", weight: 3 },
      { id: "tunnel", weight: 2 },
      { id: "orb", weight: 2 },
      { id: "halo", weight: 1 },
      { id: "dancer", weight: 1, params: { look: "wire" } },
    ],
    fx: { scanlines: 0.35, chroma: 0.35, crt: 0.25, vignette: 0.5, saturation: 1.15 },
    transitions: { calm: ["fade", "iris"], drop: ["punch", "flash"] },
    director: "club",
  },
  {
    id: "acid",
    name: "Acid Rave",
    description: "Couleurs acides, traînées, kaléidoscopes, strobo au drop.",
    swatch: ["#b6ff00", "#ff00e1", "#00f0ff"],
    palettes: ["acid", "neon"],
    scenes: [
      { id: "kaleido", weight: 3 },
      { id: "echoes", weight: 2 },
      { id: "tunnel", weight: 2 },
      { id: "halo", weight: 2 },
      { id: "nebula", weight: 1 },
      { id: "dancer", weight: 1, params: { look: "psyche", formation: "circle" } },
      { id: "particle-body", weight: 2 },
    ],
    fx: { trails: 0.6, chroma: 0.5, saturation: 1.4, contrast: 1.1, strobe: "flash" },
    transitions: { calm: ["glitch", "luma"], drop: ["flash", "glitch"] },
    director: "rave",
  },
  {
    id: "noir",
    name: "Techno Noir",
    description: "Noir et blanc, grain, fort contraste, strobo inversé.",
    swatch: ["#000000", "#6b6b6b", "#ffffff"],
    palettes: ["mono"],
    scenes: [
      { id: "halo", weight: 2 },
      { id: "echoes", weight: 2 },
      { id: "tunnel", weight: 2 },
      { id: "terrain", weight: 1 },
      { id: "orb", weight: 1 },
    ],
    fx: { saturation: 0, contrast: 1.5, grain: 0.5, vignette: 0.6, strobe: "invert" },
    transitions: { calm: ["cut", "luma"], drop: ["flash", "cut"] },
    director: "club",
  },
  {
    id: "chrome",
    name: "Chrome Future",
    description: "Argent et cyan, glitch numérique, robots.",
    swatch: ["#d9e2ec", "#7dd3fc", "#334155"],
    palettes: ["chrome", "ice"],
    scenes: [
      { id: "android", weight: 3 },
      { id: "dancer", weight: 2, params: { look: "chrome", formation: "duo" } },
      { id: "orb", weight: 2 },
      { id: "particle-body", weight: 1 },
      { id: "terrain", weight: 1 },
      { id: "tunnel", weight: 1 },
    ],
    fx: { chroma: 0.2, contrast: 1.15, saturation: 0.7, vignette: 0.4, grain: 0.15 },
    transitions: { calm: ["glitch", "fade"], drop: ["glitch", "punch"] },
    director: "club",
  },
  {
    id: "cosmos",
    name: "Cosmos",
    description: "Bleus profonds, lent et flottant, sans strobo.",
    swatch: ["#0b1d51", "#3a86ff", "#c8f7ff"],
    palettes: ["ocean", "ice"],
    scenes: [
      { id: "nebula", weight: 3 },
      { id: "orb", weight: 2 },
      { id: "particle-body", weight: 2 },
      { id: "dancer", weight: 1, params: { look: "hologram" } },
      { id: "halo", weight: 1 },
      { id: "echoes", weight: 1 },
    ],
    fx: { trails: 0.5, vignette: 0.5, saturation: 1.1 },
    transitions: { calm: ["fade", "luma"], drop: ["punch", "fade"] },
    director: "chill",
  },
  {
    id: "vhs",
    name: "VHS Glitch",
    description: "Cassette usée : bruit de piste, couleurs délavées, coupes glitch.",
    swatch: ["#f4a6c0", "#7ec4cf", "#3d3a4b"],
    palettes: ["vhs", "sunset"],
    scenes: [
      { id: "echoes", weight: 2 },
      { id: "halo", weight: 2 },
      { id: "kaleido", weight: 1 },
      { id: "terrain", weight: 1 },
      { id: "tunnel", weight: 1 },
    ],
    fx: { vhs: 0.7, scanlines: 0.5, grain: 0.35, chroma: 0.6, saturation: 0.75, crt: 0.4 },
    transitions: { calm: ["glitch", "luma"], drop: ["glitch", "flash"] },
    director: "club",
  },
];

export const lookFx = (look: Look): FxSettings => ({ ...NEUTRAL_FX, ...look.fx });

/** Scenes of a look that actually exist (a saved look may reference a scene removed since). */
export const lookScenes = (look: Look) => look.scenes.filter((s) => SCENES.some((d) => d.id === s.id));
