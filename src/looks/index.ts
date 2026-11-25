import { NEUTRAL_FX, type FxSettings } from "@/engine/fx";
import type { DirectorMode } from "@/engine/Director";
import type { BlendModeId, TransitionId } from "@/engine/transitions";
import { defaultParams, SCENES, sceneById, type Energy, type ParamValues, type SceneDef } from "@/scenes";

/**
 * A world ("monde") is a complete art direction: which shots the director uses (a shot = a scene from
 * the catalogue + its settings for this world), palettes, post-effects, transitions and pacing.
 * The same scene shows up in several worlds with different settings (a red or a white Cathedral…).
 */
/**
 * What a plan is for: the director takes calm plans in calm passages and drop plans on drops. "after" is the
 * aftermath (ruins, silence): kept for the breakdowns.
 */
export type Role = "calm" | "build" | "drop" | "after";

/**
 * A plan ("shot"): a scene of the catalogue with its settings for this world. The same scene may appear
 * several times in a world under different keys (Porcelaine « Coquille » and « Éclats »).
 */
export interface Shot {
  /** Scene id. */
  id: string;
  /** Unique within the world (defaults to the scene id). */
  key?: string;
  /** Shown after the scene name: « Porcelaine · Éclats ». */
  label?: string;
  weight?: number;
  params?: ParamValues;
  /** Overrides the scene's own energy for the director. */
  role?: Role;
  /**
   * Bounds of the director's variation for this plan: palettes, slider ranges, and choices for select params
   * (`{ head: ["tigre", "loup"] }`: another head on every return).
   */
  vary?: { palettes?: string[]; ranges?: Record<string, [number, number]>; choices?: Record<string, string[]> };
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
  /**
   * The world's leading colours: the colour of the moment glides to the next one on every drop (and on its own every
   * few minutes); every scene of the world follows it (frame.tint, uTint in the shaders).
   */
  tints?: string[];
  /**
   * The plan that shows the night's title or logo in this world's style (a head scene with head "titre", its
   * typeface and relief in titleFont / titleRelief / titleDepth). Only on screen when a title is set; the director
   * has its own rule for it.
   */
  title?: Shot;
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
      { id: "porcelain", key: "coquille", label: "Coquille", weight: 3, role: "calm", params: { style: "shell" } },
      { id: "porcelain", key: "eclats", label: "Éclats", weight: 2, role: "drop", params: { style: "shards" } },
      { id: "porcelain", key: "selfie", label: "Selfie", weight: 2, role: "build", params: { style: "shell", frame: "selfie" } },
      { id: "profile-head", weight: 2, role: "calm", params: { palette: "porcelain" } },
      { id: "halftone-head", weight: 1, role: "drop", params: { palette: "porcelain" } },
      { id: "topo-head", label: "Os", weight: 1, role: "build", params: { palette: "bone" } },
    ],
    backgrounds: [
      { id: "nebula", weight: 2, params: { palette: "bone", trail: 0.92, amount: 0.6, speed: 0.6 } },
      { id: "echoes", weight: 1, params: { palette: "bone", shape: "circle", zoom: 0.5, spin: 0.3 } },
    ],
    bgOpacity: 0.35,
    title: {
      id: "porcelain",
      key: "titre",
      label: "Titre",
      role: "calm",
      params: { head: "titre", titleFont: "didone", titleRelief: "puffy", style: "shards", kintsugi: 0.6 },
    },
    fx: { grain: 0.18, vignette: 0.45, saturation: 0.9, contrast: 1.05, bloom: 0.3 },
    transitions: { calm: ["fade", "luma", "dive", "screen"], drop: ["flash", "fade"] },
    director: "chill",
  },
  {
    id: "signal",
    name: "Signal",
    description: "Noir et blanc purs, données, lignes d'un pixel. Coupes sèches.",
    swatch: ["#000000", "#FFFFFF", "#9A9A9A"],
    palettes: ["mono"],
    scenes: [
      { id: "signal", key: "dense", label: "Dense", weight: 3, role: "drop", params: { density: 0.75, readouts: true } },
      { id: "signal", key: "epure", label: "Épuré", weight: 2, role: "calm", params: { density: 0.25, readouts: true } },
      { id: "topo-head", key: "reconnaissance", label: "Reconnaissance", weight: 2, role: "calm", params: { palette: "mono", recog: true } },
      { id: "torrent", weight: 2, role: "build", params: { palette: "mono" } },
      { id: "downpour", weight: 2, role: "after", params: { palette: "mono" } },
      { id: "halftone-head", label: "Fine", weight: 2, role: "drop", params: { palette: "mono", cells: 90 } },
      { id: "race", weight: 2, role: "build", params: { palette: "mono" } },
    ],
    // only backgrounds in lines: a grey, blurred one would muddy the pure black and white
    backgrounds: [
      { id: "terrain", weight: 1, params: { palette: "mono", sun: false, bloom: 0 } },
      { id: "echoes", weight: 1, params: { palette: "mono", shape: "line" } },
      { id: "tunnel", weight: 1, params: { palette: "mono", segments: 16 } },
    ],
    bgOpacity: 0.5,
    title: {
      id: "topo-head",
      key: "titre",
      label: "Titre",
      role: "calm",
      params: { palette: "mono", recog: true, head: "titre", titleFont: "mono", titleRelief: "puffy", density: 34 },
    },
    fx: { vignette: 0, contrast: 1.2, saturation: 0, strobe: "invert" },
    transitions: { calm: ["cut", "glitch", "screen"], drop: ["cut", "flash"] },
    director: "rave",
  },
  {
    id: "mercure",
    name: "Mercure",
    description: "Métal liquide dans un studio : billes, ondes, volutes, coulées. Une couleur de métal mène le monde et change à chaque drop.",
    swatch: ["#07080B", "#C9CDD3", "#2F5BFF"],
    palettes: ["mercury", "cobalt"],
    // cobalt, gold, copper, anodised titanium: the coloured metal of the moment
    tints: ["#2F5BFF", "#E8B04A", "#D9774A", "#8A6BFF"],
    scenes: [
      { id: "mercury", key: "houle", label: "Houle", weight: 3, role: "drop", params: { swell: 1.2 } },
      { id: "mercury-beads", weight: 3, role: "build", params: { palette: "mercury" } },
      { id: "mercury-wave", weight: 2, role: "calm", params: { palette: "mercury", variant: "waves" } },
      { id: "mercury-wave", key: "pics", label: "Pics", weight: 2, role: "drop", params: { palette: "mercury", variant: "spikes" } },
      { id: "mercury-blend", weight: 2, role: "calm", params: { palette: "mercury" } },
      { id: "mercury-flow", weight: 2, role: "after", params: { palette: "mercury" } },
      { id: "mercury-melt", weight: 2, role: "drop", params: { palette: "mercury" } },
    ],
    backgrounds: [
      { id: "orb", weight: 2, params: { palette: "mercury", wire: false, bloom: 0.2, amp: 0.7, scale: 1.1 } },
      { id: "particle-body", weight: 1, params: { palette: "cobalt", bloom: 0.6 } },
    ],
    bgOpacity: 0.4,
    title: {
      id: "mercury",
      key: "titre",
      label: "Titre",
      role: "calm",
      params: { palette: "mercury", head: "titre", titleFont: "liquid", titleRelief: "puffy", swell: 1 },
    },
    fx: { grain: 0.1, vignette: 0.5, chroma: 0.12, bloom: 0.4 },
    transitions: { calm: ["fade", "luma", "screen"], drop: ["punch", "flash"] },
    director: "club",
  },
  {
    id: "cathedrale",
    name: "Cathédrale",
    description: "Architecture de lumière d'une seule couleur, brume, sol miroir. Le drop allume tout.",
    swatch: ["#050404", "#FF2B1C", "#FFE9E0"],
    palettes: ["signalRed", "whiteLight"],
    scenes: [
      { id: "cathedral", key: "rouge", label: "Rouge", weight: 3, role: "drop", params: { palette: "signalRed" }, vary: { palettes: ["signalRed"] } },
      {
        id: "cathedral",
        key: "blanche",
        label: "Blanche",
        weight: 2,
        role: "calm",
        params: { palette: "whiteLight", haze: 1.6, speed: 0.7 },
        vary: { palettes: ["whiteLight"] },
      },
      { id: "profile-head", label: "Rouge", weight: 1, role: "calm", params: { palette: "signalRed", head: "lion" } },
      { id: "topo-head", label: "Rouge", weight: 1, role: "build", params: { palette: "signalRed", density: 30 } },
      { id: "faithful", weight: 2, role: "calm", params: { palette: "whiteLight" } },
      { id: "faithful", key: "fideles-apres", label: "Après", weight: 2, role: "after", params: { palette: "signalRed", crowd: 0.45 } },
    ],
    // no background: a single light, haze and a mirror floor (a web of lines behind would muddy it)
    title: {
      id: "cathedral",
      key: "titre",
      label: "Titre",
      role: "calm",
      params: { palette: "signalRed", end: "titre", titleFont: "gothic", titleRelief: "cut", haze: 1.2, speed: 0.7 },
      vary: { palettes: ["signalRed", "whiteLight"] },
    },
    fx: { vignette: 0.5, grain: 0.1, strobe: "flash", speedBlur: 0.8, bloom: 0.5 },
    transitions: { calm: ["fade", "iris", "screen"], drop: ["flash", "cut"] },
    director: "club",
  },
  {
    id: "monolithe",
    name: "Monolithe",
    description: "Béton brut, un seul soleil, ombres dures, poussière. Lent et monumental.",
    swatch: ["#1B1D22", "#8E8A83", "#F2C48D"],
    palettes: ["concrete", "sodium"],
    scenes: [
      {
        id: "monolith",
        key: "soleil",
        label: "Soleil rasant",
        weight: 3,
        role: "drop",
        params: { palette: "concrete", dynamics: 1.3 },
        vary: { palettes: ["concrete"] },
      },
      {
        id: "monolith",
        key: "sodium",
        label: "Nuit sodium",
        weight: 2,
        role: "calm",
        params: { palette: "sodium", sun: 0.07, dust: 1.6, dynamics: 1.3, night: true },
        vary: { palettes: ["sodium"] },
      },
      {
        id: "monolith",
        key: "colosse",
        label: "Colosse",
        weight: 2,
        role: "after",
        params: { palette: "concrete", monument: "head", head: "moai", sun: 0.12, dynamics: 1.3 },
        vary: { palettes: ["concrete", "sodium"], choices: { head: ["moai", "nefertiti", "lion", "patron"] } },
      },
      { id: "collective", weight: 2, role: "drop", params: { palette: "concrete" } },
      { id: "panopticon", weight: 2, role: "calm", params: { palette: "concrete" } },
      { id: "warehouse", weight: 2, role: "build", params: { palette: "sodium", variant: "boxes" } },
      { id: "warehouse", key: "serveurs", label: "Serveurs", weight: 1, role: "calm", params: { palette: "concrete", variant: "servers" } },
      { id: "profile-head", label: "Béton", weight: 1, role: "calm", params: { palette: "concrete" } },
    ],
    backgrounds: [
      { id: "terrain", weight: 2, params: { palette: "concrete", bloom: 0.3, sun: false } },
      { id: "nebula", weight: 1, params: { palette: "sodium", trail: 0.9, amount: 0.5 } },
      { id: "echoes", weight: 1, params: { palette: "concrete", shape: "circle" } },
    ],
    bgOpacity: 0.35,
    title: {
      id: "monolith",
      key: "titre",
      label: "Titre",
      role: "calm",
      params: {
        palette: "concrete",
        monument: "head",
        head: "titre",
        titleFont: "monument",
        titleRelief: "cut",
        titleDepth: 0.16,
        sun: 0.14,
        dynamics: 0.5,
      },
      vary: { palettes: ["concrete", "sodium"] },
    },
    fx: { grain: 0.08, vignette: 0.45, saturation: 0.85, speedBlur: 0.5, bloom: 0.3 },
    transitions: { calm: ["luma", "fade", "screen"], drop: ["flash", "fade"] },
    director: "chill",
  },
  {
    id: "canyon",
    name: "Canyon",
    description: "La nuit chamanique du désert : le cactus sacré, les esprits animaux, les visions, les canyons aux pétroglyphes ; tout est dessiné en fils de couleur.",
    swatch: ["#060A20", "#3FD9C8", "#FF8A1F"],
    palettes: ["peyote", "desert", "huichol"],
    scenes: [
      { id: "canyon-cactus", weight: 3, role: "calm", params: { palette: "peyote", variant: "column" } },
      { id: "canyon-cactus", key: "bouton", label: "Bouton", weight: 2, role: "build", params: { palette: "huichol", variant: "button" } },
      { id: "canyon-spirit", weight: 2, role: "drop", params: { palette: "peyote" } },
      { id: "canyon-vision", weight: 3, role: "after", params: { palette: "huichol" } },
      { id: "canyon-gorge", label: "Gorge de nuit", weight: 2, role: "drop", params: { palette: "peyote", moment: "night" } },
      { id: "canyon-mesas", label: "Mesas de nuit", weight: 2, role: "build", params: { palette: "desert", moment: "night" } },
    ],
    // no background: every scene draws its own night sky (the spiral of stars)
    title: {
      id: "canyon-spirit",
      key: "titre",
      label: "Titre",
      role: "calm",
      params: { palette: "peyote", spirit: "titre", titleFont: "brush", titleRelief: "puffy" },
    },
    fx: { chroma: 0.15, saturation: 1.15, trails: 0.2, grain: 0.12, vignette: 0.4, speedBlur: 0.7, bloom: 0.45 },
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
      { id: "arcane-architect", weight: 2 },
      { id: "arcane-architect", key: "horus", label: "Horus", weight: 2, params: { head: "faucon" } },
      { id: "arcane-architect", key: "relique", label: "Relique", weight: 1, params: { relic: "slab" } },
      { id: "arcane-nomad", weight: 2, params: { palette: "mars" } },
      { id: "arcane-prism", weight: 2 },
      { id: "arcane-portal", weight: 2 },
      { id: "arcane-road", weight: 2, params: { palette: "cosmos", ground: "cosmos" } },
      { id: "arcane-road", key: "desert", label: "Désert", weight: 1, params: { palette: "mars", ground: "desert" } },
      {
        id: "topo-head",
        weight: 1,
        params: { palette: "cosmos", density: 30, head: "faucon" },
        vary: { choices: { head: ["faucon", "belier"] } },
      },
    ],
    backgrounds: [
      { id: "nebula", weight: 2, params: { palette: "cosmos", trail: 0.9, amount: 0.6 } },
      { id: "kaleido", weight: 1, params: { palette: "cosmos", segments: 6 } },
      { id: "echoes", weight: 1, params: { palette: "cosmos", shape: "circle" } },
    ],
    bgOpacity: 0.35,
    title: {
      id: "arcane-architect",
      key: "titre",
      label: "Titre",
      params: { palette: "cosmos", relic: "titre", titleFont: "pixel", titleRelief: "cut", titleDepth: 0.07 },
    },
    layer: { id: "grimoire", mode: "screen", opacity: 0.6 },
    fx: { scanlines: 0.3, chroma: 0.2, grain: 0.2, vhs: 0.1, pixel: 0.15, retroOnHits: true, vignette: 0.45, bloom: 0.55 },
    transitions: { calm: ["fade", "luma", "dive"], drop: ["flash", "glitch", "dive"] },
    director: "club",
  },
  {
    id: "chair",
    name: "Chair",
    description: "Formes vivantes à symétrie rayonnante, chair translucide et nacre, qui se transforment lentement. Intime et dérangeant.",
    swatch: ["#140808", "#E8DCD2", "#8E1420"],
    palettes: ["flesh", "cobalt"],
    scenes: [
      { id: "flesh", key: "nacre", label: "Nacre", weight: 3, role: "calm", params: { palette: "flesh" }, vary: { palettes: ["flesh"] } },
      {
        id: "flesh",
        key: "abysses",
        label: "Abysses",
        weight: 2,
        role: "after",
        params: { palette: "cobalt", variant: "abyss" },
        vary: { palettes: ["cobalt"] },
      },
      { id: "flesh-morph", weight: 3, role: "drop", params: { palette: "flesh" } },
      { id: "flesh-radiolaria", weight: 2, role: "calm", params: { palette: "flesh" } },
      { id: "flesh-jelly", weight: 2, role: "build", params: { palette: "flesh" } },
      { id: "flesh-skin", weight: 2, role: "build", params: { palette: "flesh", head: "humain" } },
    ],
    backgrounds: [
      { id: "halo", weight: 3, params: { palette: "flesh", symmetry: 8, trail: 0.8, spin: 0.2, hueSpeed: 0.2 } },
      { id: "kaleido", weight: 1, params: { palette: "flesh", complexity: 3, segments: 6 } },
      { id: "nebula", weight: 1, params: { palette: "flesh", trail: 0.9 } },
    ],
    bgOpacity: 0.4,
    title: {
      id: "flesh-skin",
      key: "titre",
      label: "Titre",
      role: "calm",
      params: { palette: "flesh", head: "titre", titleFont: "soft", titleRelief: "puffy" },
    },
    fx: { grain: 0.2, trails: 0.3, vignette: 0.5, bloom: 0.45 },
    transitions: { calm: ["fade", "luma"], drop: ["fade", "punch"] },
    director: "chill",
  },
  {
    id: "bestiaire",
    name: "Bestiaire",
    description: "Bustes de musée qui se métamorphosent : tigre, loup, faucon, lion. Marbre, obsidienne et or.",
    swatch: ["#0B0806", "#EFE6D6", "#F0A93B"],
    palettes: ["fauve", "bone", "sodium"],
    scenes: [
      {
        id: "metamorphosis",
        key: "marbre",
        label: "Marbre",
        weight: 3,
        role: "calm",
        params: { palette: "fauve", matter: "marble", cycle: "bestiaire" },
        vary: { palettes: ["fauve", "bone"] },
      },
      {
        id: "metamorphosis",
        key: "obsidienne",
        label: "Obsidienne",
        weight: 2,
        role: "build",
        params: { palette: "fauve", matter: "obsidian", cycle: "egypte", hold: 6, pace: 4 },
        vary: { palettes: ["fauve", "sodium"] },
      },
      { id: "museum", weight: 2, role: "drop", params: { palette: "fauve" }, vary: { palettes: ["fauve", "bone"] } },
      {
        id: "metamorphosis",
        key: "extinction",
        label: "Extinction",
        weight: 2,
        role: "drop",
        params: { palette: "bone", matter: "marble", cycle: "extinction" },
      },
      { id: "topo-head", label: "Fauve", weight: 1, role: "build", params: { palette: "fauve", density: 30, head: "tigre" } },
      { id: "halftone-head", label: "Hibou", weight: 1, role: "drop", params: { palette: "fauve", head: "hibou", gain: 0.5 } },
      { id: "profile-head", label: "Faucon", weight: 1, role: "calm", params: { palette: "sodium", head: "faucon" } },
    ],
    backgrounds: [
      { id: "nebula", weight: 2, params: { palette: "fauve", trail: 0.92, amount: 0.5, speed: 0.5 } },
      { id: "echoes", weight: 1, params: { palette: "bone", shape: "circle", zoom: 0.5, spin: 0.2 } },
    ],
    bgOpacity: 0.3,
    title: {
      id: "metamorphosis",
      key: "titre",
      label: "Titre",
      role: "calm",
      params: { palette: "fauve", matter: "marble", cycle: "titre", titleFont: "roman", titleRelief: "cut", titleDepth: 0.09, hold: 10 },
      vary: { palettes: ["fauve", "bone"], choices: { matter: ["marble", "obsidian"] } },
    },
    fx: { grain: 0.2, vignette: 0.5, saturation: 0.9, contrast: 1.05, bloom: 0.3 },
    transitions: { calm: ["fade", "luma", "dive"], drop: ["flash", "fade"] },
    director: "chill",
  },
  {
    id: "classique",
    name: "Classique",
    description: "Les premières scènes et leurs couleurs vives, hors rotation des mondes.",
    swatch: ["#ff3cac", "#a855f7", "#22d3ee"],
    palettes: ["acid", "neon", "sunset", "ocean", "ice", "fire", "chrome", "vhs"],
    scenes: SCENES.filter((s) => !["porcelain", "metamorphosis", "faithful", "torrent", "panopticon", "collective", "warehouse", "downpour", "race", "mercury-beads", "mercury-wave", "mercury-blend", "mercury-flow", "mercury-melt", "flesh-morph", "flesh-radiolaria", "flesh-jelly", "canyon-cactus", "canyon-spirit", "canyon-vision", "topo-head", "profile-head", "halftone-head", "mercury", "cathedral", "monolith", "canyon-gorge", "canyon-mesas", "arcane-architect", "arcane-nomad", "arcane-prism", "arcane-portal", "arcane-road", "grimoire", "flesh", "flesh-skin", "signal", "museum"].includes(s.id)).map((s) => ({ id: s.id, weight: 1 })),
    fx: {},
    classic: true,
  },
];

export const lookFx = (look: Look): FxSettings => ({ ...NEUTRAL_FX, ...look.fx });

/** Shots of a world whose scene still exists (a saved world may reference a scene removed since). */
export const lookScenes = (look: Look) => look.scenes.filter((s) => SCENES.some((d) => d.id === s.id));

export const lookBackgrounds = (look: Look) => (look.backgrounds ?? []).filter((s) => SCENES.some((d) => d.id === s.id));

/** A world's plan, resolved: its key ("world:plan"), its scene, its name and its energy for the director. */
export interface Plan {
  key: string;
  shot: Shot;
  look: Look;
  scene: SceneDef;
  label: string;
  energy: Energy;
  /** The night's title (shown only when one is set, by the director's own rule). */
  title?: boolean;
}

const ROLE_ENERGY: Record<Role, Energy> = { calm: "calm", build: "medium", drop: "intense", after: "calm" };

export const shotKey = (s: Shot) => s.key ?? s.id;

export const planKey = (look: Look, s: Shot) => `${look.id}:${shotKey(s)}`;

/** Every plan of a world, its title plan included (see shownPlans for the ones on offer). */
export function lookPlans(look: Look): Plan[] {
  const title = look.title && SCENES.some((d) => d.id === look.title!.id) ? [look.title] : [];
  return [...lookScenes(look), ...title].map((shot) => {
    const scene = sceneById(shot.id);
    return {
      key: planKey(look, shot),
      shot,
      look,
      scene,
      label: shot.label ? `${scene.name} · ${shot.label}` : scene.name,
      energy: shot.role ? ROLE_ENERGY[shot.role] : scene.energy,
      ...(shot === look.title ? { title: true } : {}),
    };
  });
}

/** The plans on offer (panel, arrows, digits): the title plan only when the night has a title. */
export const shownPlans = (look: Look, withTitle: boolean) => lookPlans(look).filter((p) => withTitle || !p.title);

/** The world's title plan, if it has one. */
export const titlePlan = (look: Look) => lookPlans(look).find((p) => p.title) ?? null;

/** The world plan behind a key "world:plan" (null for a plain scene id or an unknown plan). */
export function findPlan(key: string, looks: Look[]): Plan | null {
  const i = key.indexOf(":");
  if (i < 0) return null;
  const look = looks.find((l) => l.id === key.slice(0, i));
  return look ? (lookPlans(look).find((p) => p.key === key) ?? null) : null;
}

/** Scene behind a key: a world plan or a plain scene id of the catalogue. */
export function sceneForKey(key: string, looks: Look[]): SceneDef | null {
  return findPlan(key, looks)?.scene ?? SCENES.find((s) => s.id === key) ?? null;
}

/** Signature of a plan's definition: when a world changes a plan, saved tweaks of that plan are dropped. */
export const PLAN_SIGNATURE = "__plan";

/** A plan's starting settings: the scene's defaults, the world's settings for it, a palette of the world. */
export function planDefaults(plan: Plan): ParamValues {
  const p: ParamValues = { ...defaultParams(plan.scene), ...(plan.shot.params ?? {}) };
  const palettes = plan.look.palettes;
  if (palettes.length && !palettes.includes(String(p.palette))) p.palette = palettes[0];
  p[PLAN_SIGNATURE] = JSON.stringify(plan.shot.params ?? {});
  // the title plan knows its world's name: the title by default
  if (plan.title) p.titleWorld = plan.look.name;
  return p;
}

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
/** The rotation alternates nature and machine: the cut between two worlds says something on its own. */
const ROTATION_ORDER = ["porcelaine", "canyon", "monolithe", "chair", "signal", "bestiaire", "mercure", "arcanes", "cathedrale"];
export const ROTATION = [
  ...ROTATION_ORDER.filter((id) => LOOKS.some((l) => l.id === id && !l.classic)),
  ...LOOKS.filter((l) => !l.classic && !ROTATION_ORDER.includes(l.id)).map((l) => l.id),
];
