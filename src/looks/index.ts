import { NEUTRAL_FX, type FxSettings } from "@/engine/fx";
import type { DirectorMode } from "@/engine/Director";
import type { BlendModeId, TransitionId } from "@/engine/transitions";
import { SCENES, type ParamValues } from "@/scenes";

/**
 * A world ("monde") is a complete art direction: which shots the director uses (a shot = a scene from
 * the catalogue + its settings for this world), palettes, post-effects, transitions and pacing.
 * The same scene shows up in several worlds with different settings (a red or a white Cathedral…).
 */
/** A shot: a scene of the catalogue with its settings for this world. */
export interface Shot {
  id: string;
  weight?: number;
  params?: ParamValues;
  /** Backgrounds only: recolour into the world's palette (default true). */
  tint?: boolean;
}

export interface Look {
  id: string;
  name: string;
  description: string;
  /** CSS colours for the card preview. */
  swatch: string[];
  palettes: string[];
  /** Foreground shots: what the director cuts between. */
  scenes: Shot[];
  /** Background shots: soft, recoloured, behind the foreground (the first scenes live here). */
  backgrounds?: Shot[];
  /** Default background presence for this world, 0..1. */
  bgOpacity?: number;
  /** A layer (calque) laid over every shot while in this world, removed when leaving it. */
  layer?: { id: string; mode?: BlendModeId; opacity?: number; params?: ParamValues };
  fx: Partial<FxSettings>;
  transitions?: { calm?: TransitionId[]; drop?: TransitionId[] };
  director?: DirectorMode;
  /** Legacy look, outside the art-directed rotation. */
  classic?: boolean;
  custom?: boolean;
}

export const LOOKS: Look[] = [
  {
    id: "porcelaine",
    name: "Porcelaine",
    description: "Céramique blanche, lumière de studio, une fente vermillon. Calme et sculptural.",
    swatch: ["#121110", "#ECE7DF", "#E5482D"],
    palettes: ["porcelain", "bone"],
    scenes: [
      { id: "porcelain", weight: 3 },
      { id: "profile-head", weight: 2, params: { palette: "porcelain" } },
      { id: "halftone-head", weight: 2, params: { palette: "porcelain" } },
      { id: "topo-head", weight: 1, params: { palette: "bone" } },
      { id: "signal", weight: 1, params: { palette: "porcelain", density: 0.3, readouts: false } },
    ],
    backgrounds: [
      { id: "nebula", weight: 2, params: { palette: "bone", trail: 0.92, amount: 0.6, speed: 0.6 } },
      { id: "echoes", weight: 1, params: { palette: "bone", shape: "circle", zoom: 0.5, spin: 0.3 } },
    ],
    bgOpacity: 0.35,
    fx: { grain: 0.18, vignette: 0.45, saturation: 0.9, contrast: 1.05 },
    transitions: { calm: ["fade", "luma"], drop: ["flash", "fade"] },
    director: "chill",
  },
  {
    id: "signal",
    name: "Signal",
    description: "Noir et blanc purs, données, lignes d'un pixel. Coupes sèches.",
    swatch: ["#000000", "#FFFFFF", "#9A9A9A"],
    palettes: ["mono"],
    scenes: [
      { id: "signal", weight: 3 },
      { id: "topo-head", weight: 2, params: { palette: "mono" } },
      { id: "halftone-head", weight: 2, params: { palette: "mono", cells: 80 } },
    ],
    backgrounds: [
      { id: "halo", weight: 2, params: { palette: "mono", trail: 0.3, symmetry: 2 } },
      { id: "terrain", weight: 1, params: { palette: "mono", sun: false, bloom: 0 } },
      { id: "echoes", weight: 1, params: { palette: "mono", shape: "line" } },
      { id: "tunnel", weight: 1, params: { palette: "mono", segments: 16 } },
    ],
    bgOpacity: 0.5,
    fx: { vignette: 0, contrast: 1.2, saturation: 0, strobe: "invert" },
    transitions: { calm: ["cut", "glitch"], drop: ["cut", "flash"] },
    director: "rave",
  },
  {
    id: "mercure",
    name: "Mercure",
    description: "Chrome noir et métal liquide ; la couleur n'existe que dans les reflets.",
    swatch: ["#07080B", "#C9CDD3", "#FF8A3D"],
    palettes: ["mercury", "cobalt"],
    scenes: [
      { id: "mercury", weight: 3 },
      { id: "profile-head", weight: 1, params: { palette: "mercury" } },
      { id: "dancer", weight: 1, params: { palette: "mercury", look: "chrome", formation: "solo" } },
    ],
    backgrounds: [
      { id: "orb", weight: 2, params: { palette: "mercury", wire: false, bloom: 0.2, amp: 0.7, scale: 1.1 } },
      { id: "particle-body", weight: 1, params: { palette: "cobalt", bloom: 0.6 } },
    ],
    bgOpacity: 0.4,
    fx: { grain: 0.1, vignette: 0.5, chroma: 0.12 },
    transitions: { calm: ["fade", "luma"], drop: ["punch", "flash"] },
    director: "club",
  },
  {
    id: "cathedrale",
    name: "Cathédrale",
    description: "Architecture de lumière d'une seule couleur, brume, sol miroir. Le drop allume tout.",
    swatch: ["#050404", "#FF2B1C", "#FFE9E0"],
    palettes: ["signalRed", "whiteLight"],
    scenes: [
      { id: "cathedral", weight: 3 },
      { id: "profile-head", weight: 1, params: { palette: "signalRed" } },
      { id: "signal", weight: 1, params: { palette: "signalRed" } },
    ],
    backgrounds: [
      { id: "tunnel", weight: 2, params: { palette: "signalRed", segments: 12 } },
      { id: "halo", weight: 1, params: { palette: "signalRed", symmetry: 2, trail: 0.4 } },
      { id: "particle-body", weight: 1, params: { palette: "signalRed", bloom: 0.6 } },
    ],
    bgOpacity: 0.45,
    fx: { vignette: 0.5, grain: 0.1, strobe: "flash", speedBlur: 0.8 },
    transitions: { calm: ["fade", "iris"], drop: ["flash", "cut"] },
    director: "club",
  },
  {
    id: "monolithe",
    name: "Monolithe",
    description: "Béton brut, un seul soleil, ombres dures, poussière. Lent et monumental.",
    swatch: ["#1B1D22", "#8E8A83", "#F2C48D"],
    palettes: ["concrete", "sodium"],
    scenes: [
      { id: "monolith", weight: 3 },
      { id: "porcelain", weight: 1, params: { palette: "concrete" } },
    ],
    backgrounds: [
      { id: "terrain", weight: 2, params: { palette: "concrete", bloom: 0.3, sun: false } },
      { id: "nebula", weight: 1, params: { palette: "sodium", trail: 0.9, amount: 0.5 } },
      { id: "echoes", weight: 1, params: { palette: "concrete", shape: "circle" } },
    ],
    bgOpacity: 0.35,
    fx: { grain: 0.25, vignette: 0.45, saturation: 0.85, speedBlur: 0.5 },
    transitions: { calm: ["luma", "fade"], drop: ["flash", "fade"] },
    director: "chill",
  },
  {
    id: "canyon",
    name: "Canyon",
    description: "Vol dans un canyon aux strates psychédéliques, rivière miroir, soleil en anneau. On rase, on accélère, on décolle.",
    swatch: ["#140A22", "#E9A86C", "#FF3D8B"],
    palettes: ["desert", "peyote"],
    scenes: [
      { id: "canyon-gorge", weight: 3 },
      { id: "canyon-mesas", weight: 2 },
      { id: "topo-head", weight: 1, params: { palette: "desert", density: 34 } },
    ],
    backgrounds: [
      { id: "terrain", weight: 2, params: { palette: "desert", bloom: 0.4 } },
      { id: "kaleido", weight: 1, params: { palette: "peyote", segments: 6 } },
      { id: "nebula", weight: 1, params: { palette: "desert", trail: 0.9, amount: 0.5 } },
    ],
    bgOpacity: 0.35,
    fx: { chroma: 0.15, saturation: 1.15, trails: 0.2, grain: 0.12, vignette: 0.4, speedBlur: 0.7 },
    transitions: { calm: ["fade", "luma"], drop: ["punch", "flash"] },
    director: "club",
  },
  {
    id: "arcanes",
    name: "Arcanes",
    description: "Mages sans visage en robes de lignes et d'étoiles, prismes, orbes et portails arc-en-ciel, sous un HUD de jeu ésotérique.",
    swatch: ["#04030C", "#5B7CFF", "#FFD34E"],
    palettes: ["cosmos", "mars", "mousse"],
    scenes: [
      { id: "arcane-architect", weight: 3 },
      { id: "arcane-nomad", weight: 2, params: { palette: "mars" } },
      { id: "arcane-prism", weight: 2 },
      { id: "arcane-portal", weight: 2 },
      { id: "canyon-mesas", weight: 1, params: { palette: "mars", psy: 0.6 } },
      { id: "topo-head", weight: 1, params: { palette: "cosmos", density: 30 } },
    ],
    backgrounds: [
      { id: "nebula", weight: 2, params: { palette: "cosmos", trail: 0.9, amount: 0.6 } },
      { id: "kaleido", weight: 1, params: { palette: "cosmos", segments: 6 } },
      { id: "echoes", weight: 1, params: { palette: "cosmos", shape: "circle" } },
    ],
    bgOpacity: 0.35,
    layer: { id: "grimoire", mode: "screen", opacity: 0.6 },
    fx: { scanlines: 0.3, chroma: 0.2, grain: 0.2, vhs: 0.1, pixel: 0.15, vignette: 0.45 },
    transitions: { calm: ["fade", "luma"], drop: ["flash", "glitch"] },
    director: "club",
  },
  {
    id: "chair",
    name: "Chair",
    description: "Matière organique, translucide et nacrée. Lent, intime, dérangeant.",
    swatch: ["#140808", "#E8DCD2", "#8E1420"],
    palettes: ["flesh"],
    scenes: [
      { id: "flesh", weight: 3 },
      { id: "porcelain", weight: 1, params: { palette: "flesh" } },
      { id: "dancer", weight: 1, params: { palette: "flesh", look: "psyche", formation: "solo" } },
    ],
    backgrounds: [
      { id: "kaleido", weight: 2, params: { palette: "flesh", complexity: 3, segments: 6 } },
      { id: "nebula", weight: 1, params: { palette: "flesh", trail: 0.9 } },
    ],
    bgOpacity: 0.4,
    fx: { grain: 0.2, trails: 0.3, vignette: 0.5 },
    transitions: { calm: ["fade", "luma"], drop: ["fade", "punch"] },
    director: "chill",
  },
  {
    id: "classique",
    name: "Classique",
    description: "Les premières scènes et leurs couleurs vives, hors rotation des mondes.",
    swatch: ["#ff3cac", "#a855f7", "#22d3ee"],
    palettes: ["acid", "neon", "sunset", "ocean", "ice", "fire", "chrome", "vhs"],
    scenes: SCENES.filter((s) => !["porcelain", "topo-head", "profile-head", "halftone-head", "mercury", "cathedral", "monolith", "canyon-gorge", "canyon-mesas", "arcane-architect", "arcane-nomad", "arcane-prism", "arcane-portal", "grimoire", "flesh", "signal"].includes(s.id)).map((s) => ({ id: s.id, weight: 1 })),
    fx: {},
    classic: true,
  },
];

export const lookFx = (look: Look): FxSettings => ({ ...NEUTRAL_FX, ...look.fx });

/** Shots of a world whose scene still exists (a saved world may reference a scene removed since). */
export const lookScenes = (look: Look) => look.scenes.filter((s) => SCENES.some((d) => d.id === s.id));

export const lookBackgrounds = (look: Look) => (look.backgrounds ?? []).filter((s) => SCENES.some((d) => d.id === s.id));

/** Scenes that some world lays as its layer: they go away when leaving that world. */
export const WORLD_LAYER_IDS = new Set(LOOKS.flatMap((l) => (l.layer ? [l.layer.id] : [])));

/** Weighted random pick among shots, avoiding some ids when possible. */
export function pickShot(shots: Shot[], avoid: (string | null)[] = []): Shot | null {
  const pool = shots.filter((s) => !avoid.includes(s.id));
  const from = pool.length ? pool : shots;
  if (!from.length) return null;
  let r = Math.random() * from.reduce((sum, s) => sum + (s.weight ?? 1), 0);
  for (const s of from) {
    r -= s.weight ?? 1;
    if (r <= 0) return s;
  }
  return from[from.length - 1];
}

/** The art-directed worlds that take turns when "Enchaîner les mondes" is on. */
export const ROTATION = LOOKS.filter((l) => !l.classic).map((l) => l.id);
