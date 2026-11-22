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
    fx: { grain: 0.18, vignette: 0.45, saturation: 0.9, contrast: 1.05 },
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
      { id: "flux", weight: 2, role: "build", params: { palette: "mono" } },
      { id: "downpour", weight: 2, role: "after", params: { palette: "mono" } },
      { id: "halftone-head", label: "Fine", weight: 2, role: "drop", params: { palette: "mono", cells: 90 } },
      { id: "grimoire", weight: 1, role: "build", params: { palette: "mono" } },
    ],
    backgrounds: [
      { id: "halo", weight: 2, params: { palette: "mono", trail: 0.3, symmetry: 2 } },
      { id: "terrain", weight: 1, params: { palette: "mono", sun: false, bloom: 0 } },
      { id: "echoes", weight: 1, params: { palette: "mono", shape: "line" } },
      { id: "tunnel", weight: 1, params: { palette: "mono", segments: 16 } },
    ],
    bgOpacity: 0.5,
    fx: { vignette: 0, contrast: 1.2, saturation: 0, strobe: "invert" },
    transitions: { calm: ["cut", "glitch", "screen"], drop: ["cut", "flash"] },
    director: "rave",
  },
  {
    id: "mercure",
    name: "Mercure",
    description: "Chrome noir et métal liquide ; la couleur n'existe que dans les reflets.",
    swatch: ["#07080B", "#C9CDD3", "#FF8A3D"],
    palettes: ["mercury", "cobalt"],
    scenes: [
      { id: "mercury", key: "houle", label: "Houle", weight: 3, role: "drop", params: { swell: 1.5 } },
      { id: "mercury", key: "miroir", label: "Miroir", weight: 2, role: "after", params: { swell: 0.3 } },
      { id: "warehouse", weight: 2, role: "build", params: { palette: "mercury", variant: "boxes" } },
      { id: "warehouse", key: "serveurs", label: "Serveurs", weight: 1, role: "calm", params: { palette: "cobalt", variant: "servers" } },
      { id: "profile-head", label: "Chrome", weight: 2, role: "calm", params: { palette: "mercury" } },
      { id: "porcelain", label: "Chrome", weight: 1, role: "drop", params: { palette: "mercury", style: "shell", head: "nefertiti" } },
    ],
    backgrounds: [
      { id: "orb", weight: 2, params: { palette: "mercury", wire: false, bloom: 0.2, amp: 0.7, scale: 1.1 } },
      { id: "particle-body", weight: 1, params: { palette: "cobalt", bloom: 0.6 } },
    ],
    bgOpacity: 0.4,
    fx: { grain: 0.1, vignette: 0.5, chroma: 0.12 },
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
    backgrounds: [
      { id: "tunnel", weight: 2, params: { palette: "signalRed", segments: 12 } },
      { id: "halo", weight: 1, params: { palette: "signalRed", symmetry: 2, trail: 0.4 } },
      { id: "particle-body", weight: 1, params: { palette: "signalRed", bloom: 0.6 } },
    ],
    bgOpacity: 0.45,
    fx: { vignette: 0.5, grain: 0.1, strobe: "flash", speedBlur: 0.8 },
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
        params: { palette: "sodium", sun: 0.07, dust: 1.6, dynamics: 1.3 },
        vary: { palettes: ["sodium"] },
      },
      {
        id: "monolith",
        key: "colosse",
        label: "Colosse",
        weight: 2,
        role: "after",
        params: { palette: "concrete", monument: "head", head: "moai", sun: 0.12, dynamics: 1.3 },
        vary: { palettes: ["concrete", "sodium"], choices: { head: ["moai", "nefertiti", "lion"] } },
      },
      { id: "porcelain", label: "Statue brisée", weight: 1, role: "drop", params: { palette: "concrete", style: "shards" } },
      { id: "panopticon", weight: 2, role: "calm", params: { palette: "concrete" } },
      { id: "profile-head", label: "Béton", weight: 1, role: "calm", params: { palette: "concrete" } },
    ],
    backgrounds: [
      { id: "terrain", weight: 2, params: { palette: "concrete", bloom: 0.3, sun: false } },
      { id: "nebula", weight: 1, params: { palette: "sodium", trail: 0.9, amount: 0.5 } },
      { id: "echoes", weight: 1, params: { palette: "concrete", shape: "circle" } },
    ],
    bgOpacity: 0.35,
    fx: { grain: 0.08, vignette: 0.45, saturation: 0.85, speedBlur: 0.5 },
    transitions: { calm: ["luma", "fade", "screen"], drop: ["flash", "fade"] },
    director: "chill",
  },
  {
    id: "canyon",
    name: "Canyon",
    description: "Vol dans un canyon aux strates psychédéliques, rivière miroir, soleil en anneau. On rase, on accélère, on décolle.",
    swatch: ["#140A22", "#E9A86C", "#FF3D8B"],
    palettes: ["desert", "peyote", "mars"],
    scenes: [
      { id: "canyon-gorge", weight: 3, role: "drop", params: { palette: "desert" } },
      { id: "canyon-mesas", label: "Peyote", weight: 2, role: "drop", params: { palette: "peyote" } },
      { id: "canyon-mesas", key: "mesas-mars", label: "Mars", weight: 1, role: "after", params: { palette: "mars", width: 1.4, speed: 0.7 } },
      { id: "arcane-nomad", weight: 1, role: "calm", params: { palette: "mars" } },
      { id: "topo-head", label: "Désert", weight: 1, role: "build", params: { palette: "desert", density: 34, head: "loup" } },
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
      { id: "arcane-architect", weight: 2 },
      { id: "arcane-architect", key: "horus", label: "Horus", weight: 2, params: { head: "faucon" } },
      { id: "arcane-architect", key: "relique", label: "Relique", weight: 1, params: { relic: "slab" } },
      { id: "arcane-nomad", weight: 2, params: { palette: "mars" } },
      { id: "arcane-prism", weight: 2 },
      { id: "arcane-portal", weight: 2 },
      { id: "canyon-mesas", weight: 1, params: { palette: "mars", psy: 0.6 } },
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
    layer: { id: "grimoire", mode: "screen", opacity: 0.6 },
    fx: { scanlines: 0.3, chroma: 0.2, grain: 0.2, vhs: 0.1, pixel: 0.15, vignette: 0.45 },
    transitions: { calm: ["fade", "luma", "dive"], drop: ["flash", "glitch", "dive"] },
    director: "club",
  },
  {
    id: "chair",
    name: "Chair",
    description: "Matière organique, translucide et nacrée. Lent, intime, dérangeant.",
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
      { id: "porcelain", label: "Chair", weight: 1, role: "drop", params: { palette: "flesh", style: "shell", head: "hibou" } },
      { id: "dancer", weight: 1, role: "drop", params: { palette: "flesh", look: "psyche", formation: "solo" } },
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
      {
        id: "porcelain",
        key: "bestiaire",
        label: "Bestiaire",
        weight: 2,
        role: "drop",
        params: { palette: "fauve", style: "shards", head: "tigre" },
        vary: { palettes: ["fauve", "bone"], choices: { head: ["tigre", "loup", "faucon", "lion"] } },
      },
      {
        id: "metamorphosis",
        key: "extinction",
        label: "Extinction",
        weight: 2,
        role: "drop",
        params: { palette: "bone", matter: "marble", cycle: "extinction" },
      },
      { id: "topo-head", label: "Fauve", weight: 1, role: "build", params: { palette: "fauve", density: 30, head: "tigre" } },
      { id: "halftone-head", label: "Hibou", weight: 1, role: "drop", params: { palette: "fauve", head: "hibou" } },
      { id: "profile-head", label: "Faucon", weight: 1, role: "calm", params: { palette: "sodium", head: "faucon" } },
    ],
    backgrounds: [
      { id: "nebula", weight: 2, params: { palette: "fauve", trail: 0.92, amount: 0.5, speed: 0.5 } },
      { id: "echoes", weight: 1, params: { palette: "bone", shape: "circle", zoom: 0.5, spin: 0.2 } },
    ],
    bgOpacity: 0.3,
    fx: { grain: 0.2, vignette: 0.5, saturation: 0.9, contrast: 1.05 },
    transitions: { calm: ["fade", "luma", "dive"], drop: ["flash", "fade"] },
    director: "chill",
  },
  {
    id: "classique",
    name: "Classique",
    description: "Les premières scènes et leurs couleurs vives, hors rotation des mondes.",
    swatch: ["#ff3cac", "#a855f7", "#22d3ee"],
    palettes: ["acid", "neon", "sunset", "ocean", "ice", "fire", "chrome", "vhs"],
    scenes: SCENES.filter((s) => !["porcelain", "metamorphosis", "faithful", "flux", "panopticon", "warehouse", "downpour", "topo-head", "profile-head", "halftone-head", "mercury", "cathedral", "monolith", "canyon-gorge", "canyon-mesas", "arcane-architect", "arcane-nomad", "arcane-prism", "arcane-portal", "grimoire", "flesh", "signal"].includes(s.id)).map((s) => ({ id: s.id, weight: 1 })),
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
}

const ROLE_ENERGY: Record<Role, Energy> = { calm: "calm", build: "medium", drop: "intense", after: "calm" };

export const shotKey = (s: Shot) => s.key ?? s.id;

export const planKey = (look: Look, s: Shot) => `${look.id}:${shotKey(s)}`;

export function lookPlans(look: Look): Plan[] {
  return lookScenes(look).map((shot) => {
    const scene = sceneById(shot.id);
    return {
      key: planKey(look, shot),
      shot,
      look,
      scene,
      label: shot.label ? `${scene.name} · ${shot.label}` : scene.name,
      energy: shot.role ? ROLE_ENERGY[shot.role] : scene.energy,
    };
  });
}

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
