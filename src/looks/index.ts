import { NEUTRAL_FX, type FxSettings } from "@/engine/fx";
import type { DirectorMode } from "@/engine/Director";
import type { TransitionId } from "@/engine/transitions";
import { SCENES, type ParamValues } from "@/scenes";

/**
 * A world ("monde") is a complete art direction: which shots the director uses (a shot = a scene from
 * the catalogue + its settings for this world), palettes, post-effects, transitions and pacing.
 * The same scene shows up in several worlds with different settings (a red or a white Cathedral…).
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
      { id: "nebula", weight: 1, params: { palette: "bone", trail: 0.9, amount: 0.6 } },
    ],
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
      { id: "halo", weight: 1, params: { palette: "mono", trail: 0.2, symmetry: 2 } },
      { id: "echoes", weight: 1, params: { palette: "mono", shape: "line" } },
      { id: "tunnel", weight: 1, params: { palette: "mono", segments: 16 } },
    ],
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
      { id: "orb", weight: 2, params: { palette: "mercury", wire: false, bloom: 0.2, amp: 0.7, scale: 1.1 } },
      { id: "profile-head", weight: 1, params: { palette: "mercury" } },
      { id: "dancer", weight: 1, params: { palette: "mercury", look: "chrome", formation: "solo" } },
      { id: "particle-body", weight: 1, params: { palette: "cobalt", bloom: 0.8 } },
    ],
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
      { id: "tunnel", weight: 2, params: { palette: "signalRed", segments: 12 } },
      { id: "profile-head", weight: 1, params: { palette: "signalRed" } },
      { id: "signal", weight: 1, params: { palette: "signalRed" } },
      { id: "particle-body", weight: 1, params: { palette: "signalRed", bloom: 0.9 } },
      { id: "halo", weight: 1, params: { palette: "signalRed", symmetry: 2, trail: 0.4 } },
    ],
    fx: { vignette: 0.5, grain: 0.1, strobe: "flash" },
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
      { id: "terrain", weight: 1, params: { palette: "concrete", bloom: 0.4, sun: false } },
      { id: "nebula", weight: 1, params: { palette: "sodium", trail: 0.9, amount: 0.5 } },
      { id: "echoes", weight: 1, params: { palette: "concrete", shape: "circle" } },
    ],
    fx: { grain: 0.25, vignette: 0.45, saturation: 0.85 },
    transitions: { calm: ["luma", "fade"], drop: ["flash", "fade"] },
    director: "chill",
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
      { id: "kaleido", weight: 1, params: { palette: "flesh", complexity: 3, segments: 6 } },
      { id: "dancer", weight: 1, params: { palette: "flesh", look: "psyche", formation: "solo" } },
      { id: "nebula", weight: 1, params: { palette: "flesh", trail: 0.9 } },
    ],
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
    scenes: SCENES.filter((s) => !["porcelain", "topo-head", "profile-head", "halftone-head", "mercury", "cathedral", "monolith", "flesh", "signal"].includes(s.id)).map((s) => ({ id: s.id, weight: 1 })),
    fx: {},
    classic: true,
  },
];

export const lookFx = (look: Look): FxSettings => ({ ...NEUTRAL_FX, ...look.fx });

/** Shots of a world whose scene still exists (a saved world may reference a scene removed since). */
export const lookScenes = (look: Look) => look.scenes.filter((s) => SCENES.some((d) => d.id === s.id));

/** The art-directed worlds that take turns when "Enchaîner les mondes" is on. */
export const ROTATION = LOOKS.filter((l) => !l.classic).map((l) => l.id);
