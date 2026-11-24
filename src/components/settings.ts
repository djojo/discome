import { defaultParams, SCENES, type ParamValues } from "@/scenes";
import { BLEND_MODES, TRANSITIONS, type LayerSettings, type TransitionId } from "@/engine/transitions";
import { DIRECTOR_MODES, type DirectorMode } from "@/engine/Director";
import { NEUTRAL_FX, type FxSettings } from "@/engine/fx";
import { DEFAULT_BRAND, loadBrand, type Brand } from "@/brand/brand";
import {
  findPlan,
  LOOKS,
  lookBackgrounds,
  lookFx,
  lookPlans,
  pickShot,
  planDefaults,
  PLAN_SIGNATURE,
  ROTATION,
  sceneForKey,
  WORLD_LAYER_IDS,
  type Look,
} from "@/looks";

export interface BackgroundSettings {
  /** The director picks and changes the background from the world's list. */
  auto: boolean;
  sceneId: string | null;
  /** 0..1, the world's default when entering it in auto mode. */
  opacity: number;
  /** Recolour into the world's palette. */
  tint: boolean;
  /** 0..1 extra softness. */
  blur: number;
}

/** When worlds take turns: at each breakdown (with a safety change every 8 phrases), or every N phrases. */
export type WorldRule = "breakdown" | "phrases4" | "phrases8";

export const WORLD_RULES: { id: WorldRule; label: string }[] = [
  { id: "breakdown", label: "À chaque breakdown" },
  { id: "phrases4", label: "Toutes les 4 phrases (32 mesures)" },
  { id: "phrases8", label: "Toutes les 8 phrases (64 mesures)" },
];

export type Quality = "auto" | "low" | "normal" | "high" | "ultra";

/**
 * Max device-pixel-ratio per quality level ("auto" starts at "normal" and adapts to the frame rate, up to the screen's
 * own density; "ultra" is the screen's density with every scene at full resolution).
 */
export const QUALITY_DPR: Record<Quality, number> = { auto: 1.25, low: 0.75, normal: 1.25, high: 2, ultra: 3 };

export interface Settings {
  /** What is on screen: a world plan "world:plan", or a plain scene id picked from the catalogue. */
  sceneId: string;
  /** Settings per plan key (each world plan keeps its own), per scene id for the catalogue and backgrounds. */
  params: Record<string, ParamValues>;
  sensitivity: number;
  /** Auto VJ mode. */
  director: DirectorMode;
  /** Director varies palette and settings on each cut. */
  vary: boolean;
  /** Director keeps the current scene. */
  locked: boolean;
  quality: Quality;
  transition: TransitionId;
  /** Seconds. */
  transitionTime: number;
  layer: LayerSettings;
  /** Active look ("esthétique"). */
  lookId: string;
  fx: FxSettings;
  /** Photosensitivity: tamer strobe and flashes. */
  safeFlash: boolean;
  /** The strobe warning has been shown once. */
  strobeWarned: boolean;
  customLooks: Look[];
  /** Worlds take turns automatically. */
  worldCycle: { enabled: boolean; rule: WorldRule };
  /** Worlds left out of the rotation (the ones left out, so a world added later is in). */
  offWorlds: string[];
  /** The night's title or logo, shown by every world in its style. */
  brand: Brand;
  background: BackgroundSettings;
  /**
   * The night's drift: over this many minutes from the start of the source, the worlds slowly degrade
   * (the river dries up, the cameras multiply…). 0 = off.
   */
  drift: number;
}

/** Choices for the night's drift. */
export const DRIFT_OPTIONS = [
  { minutes: 0, label: "Désactivée" },
  { minutes: 30, label: "Sur 30 min" },
  { minutes: 60, label: "Sur 1 h" },
  { minutes: 90, label: "Sur 1 h 30" },
];

// v2: the art-directed worlds replaced the first looks; start fresh rather than inherit vivid settings.
const KEY = "discome:settings:v2";

export function defaultSettings(): Settings {
  const base: Settings = {
    sceneId: SCENES[0].id,
    params: Object.fromEntries(SCENES.map((s) => [s.id, defaultParams(s)])),
    sensitivity: 1,
    director: "club",
    vary: true,
    locked: false,
    quality: "auto",
    transition: "fade",
    transitionTime: 1.2,
    layer: { sceneId: null, mode: "screen", opacity: 0.7, pulse: false },
    lookId: LOOKS[0].id,
    fx: { ...NEUTRAL_FX },
    safeFlash: false,
    strobeWarned: false,
    customLooks: [],
    worldCycle: { enabled: true, rule: "breakdown" },
    offWorlds: [],
    brand: { ...DEFAULT_BRAND },
    background: { auto: true, sceneId: null, opacity: 0.4, tint: true, blur: 0.4 },
    drift: 60,
  };
  return applyLook(base, LOOKS[0]);
}

export const allLooks = (s: Settings): Look[] => [...LOOKS, ...s.customLooks];

export const findLook = (s: Settings, id = s.lookId): Look => allLooks(s).find((l) => l.id === id) ?? LOOKS[0];

/** Settings of a world plan, as saved: tweaks are kept unless the world redefined the plan since. */
function planParams(s: Settings, key: string, looks: Look[]) {
  const plan = findPlan(key, looks);
  if (!plan) return s.params[key];
  const fresh = planDefaults(plan);
  const saved = s.params[key];
  return saved && saved[PLAN_SIGNATURE] === fresh[PLAN_SIGNATURE] ? { ...fresh, ...saved } : fresh;
}

/** Back to the world's settings for this plan (or the scene's defaults for a catalogue scene). */
export function resetPlan(s: Settings, key: string): Settings {
  const plan = findPlan(key, allLooks(s));
  const scene = sceneForKey(key, allLooks(s));
  if (!scene) return s;
  return { ...s, params: { ...s.params, [key]: plan ? planDefaults(plan) : defaultParams(scene) } };
}

/**
 * Switch world: its effects, its pacing, and its plans. Each plan keeps its own settings (your tweaks
 * included); backgrounds start from the world's settings. Stays on the current plan if it belongs to it.
 */
export function applyLook(s: Settings, look: Look): Settings {
  const params = { ...s.params };
  const looks = [look, ...LOOKS, ...s.customLooks];
  const plans = lookPlans(look);
  for (const plan of plans) params[plan.key] = planParams(s, plan.key, looks)!;
  const backgrounds = lookBackgrounds(look);
  for (const entry of backgrounds) {
    const def = SCENES.find((d) => d.id === entry.id)!;
    const p = { ...defaultParams(def), ...(entry.params ?? {}) };
    if (look.palettes.length && !look.palettes.includes(String(p.palette))) p.palette = look.palettes[0];
    params[entry.id] = p;
  }
  const sceneId = plans.some((p) => p.key === s.sceneId) ? s.sceneId : (plans.find((p) => !p.title)?.key ?? s.sceneId);
  // The world's own layer comes in with it; another world's layer leaves (a layer picked by hand stays)
  let layer = s.layer;
  const worldLayer = look.layer && SCENES.some((d) => d.id === look.layer!.id) ? look.layer : null;
  if (worldLayer) {
    const def = SCENES.find((d) => d.id === worldLayer.id)!;
    params[worldLayer.id] = { ...defaultParams(def), ...(worldLayer.params ?? {}) };
    layer = { ...layer, sceneId: worldLayer.id, mode: worldLayer.mode ?? layer.mode, opacity: worldLayer.opacity ?? layer.opacity, pulse: false };
  } else if (layer.sceneId && WORLD_LAYER_IDS.has(layer.sceneId)) {
    layer = { ...layer, sceneId: null };
  }
  let background = s.background;
  if (background.auto) {
    const shot = pickShot(backgrounds, [sceneForKey(sceneId, looks)?.id ?? null, s.layer.sceneId]);
    background = { ...background, sceneId: shot?.id ?? null, opacity: look.bgOpacity ?? 0.4, tint: shot?.tint ?? true };
  }
  return { ...s, lookId: look.id, fx: lookFx(look), params, sceneId, background, layer, director: look.director ?? s.director };
}

/** Enter a world and cut to one of its plans (weighted draw, avoiding what is on screen). */
export function enterWorld(s: Settings, worldId: string): Settings {
  const look = findLook(s, worldId);
  const next = applyLook(s, look);
  const pool = lookPlans(look).filter((p) => !p.title && p.key !== s.sceneId && p.scene.id !== s.layer.sceneId);
  if (!pool.length) return next;
  let r = Math.random() * pool.reduce((sum, p) => sum + (p.shot.weight ?? 1), 0);
  const pick = pool.find((p) => (r -= p.shot.weight ?? 1) <= 0) ?? pool[0];
  return { ...next, sceneId: pick.key };
}

/** The worlds that take turns, in order (custom worlds join the rotation too). */
export const rotationOrder = (s: Settings): string[] => [...ROTATION, ...s.customLooks.map((l) => l.id)];

/** The worlds of the rotation still in it. */
export const activeWorlds = (s: Settings): string[] => rotationOrder(s).filter((id) => !s.offWorlds.includes(id));

/** The world after the current one in the rotation, skipping the worlds left out. */
export function nextWorldId(s: Settings): string {
  const order = rotationOrder(s);
  const i = order.indexOf(s.lookId);
  for (let k = 1; k <= order.length; k++) {
    const id = order[(i + k + order.length) % order.length];
    if (!s.offWorlds.includes(id)) return id;
  }
  return s.lookId;
}

/** Put a world in or out of the rotation; the last world in it stays. */
export function toggleWorld(s: Settings, id: string): Settings {
  if (s.offWorlds.includes(id)) return { ...s, offWorlds: s.offWorlds.filter((w) => w !== id) };
  const active = activeWorlds(s);
  if (!active.includes(id) || active.length <= 1) return s;
  return { ...s, offWorlds: [...s.offWorlds, id] };
}

/** Save the current effects (on top of the current look's scenes and palettes) as a new look. */
export function saveCurrentLook(s: Settings): Settings {
  const base = findLook(s);
  const look: Look = {
    ...base,
    id: `custom-${Date.now()}`,
    name: `Mon monde ${s.customLooks.length + 1}`,
    description: `Basé sur ${base.name}`,
    fx: { ...s.fx },
    director: s.director,
    custom: true,
  };
  return applyLook({ ...s, customLooks: [...s.customLooks, look] }, look);
}

const sceneExists = (id: unknown): id is string => SCENES.some((s) => s.id === id);

/** Saved settings merged over defaults, so new scenes/params added later get sane values. */
export function loadSettings(): Settings {
  const base = defaultSettings();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<Settings>;
    const looks = [...LOOKS, ...(Array.isArray(saved.customLooks) ? saved.customLooks : [])];
    // Scene settings merged over the defaults; world plans' settings kept as saved (checked when entering the world)
    const params = { ...base.params };
    for (const [key, value] of Object.entries(saved.params ?? {})) params[key] = { ...(params[key] ?? {}), ...value };
    // Older saves showed a plain scene id: point to that scene's plan in the current world when there is one
    const lookId = looks.some((l) => l.id === saved.lookId) ? saved.lookId! : base.lookId;
    let sceneId = typeof saved.sceneId === "string" && sceneForKey(saved.sceneId, looks) ? saved.sceneId : base.sceneId;
    if (!sceneId.includes(":")) {
      const look = looks.find((l) => l.id === lookId);
      const plan = look && lookPlans(look).find((p) => p.scene.id === sceneId);
      if (plan) sceneId = plan.key;
    }
    const layer = { ...base.layer, ...(saved.layer ?? {}) };
    if (!sceneExists(layer.sceneId)) layer.sceneId = null;
    if (!BLEND_MODES.some((b) => b.id === layer.mode)) layer.mode = base.layer.mode;
    const loaded: Settings = {
      ...base,
      ...saved,
      sceneId,
      transition: TRANSITIONS.some((t) => t.id === saved.transition) ? saved.transition! : base.transition,
      quality: saved.quality && saved.quality in QUALITY_DPR ? saved.quality : base.quality,
      director: DIRECTOR_MODES.some((m) => m.id === saved.director) ? saved.director! : base.director,
      // effects added since the save take the world's value
      fx: { ...lookFx(looks.find((l) => l.id === lookId) ?? LOOKS[0]), ...(saved.fx ?? {}) },
      customLooks: Array.isArray(saved.customLooks) ? saved.customLooks : [],
      lookId,
      params,
      layer,
      drift: DRIFT_OPTIONS.some((o) => o.minutes === saved.drift) ? saved.drift! : base.drift,
      worldCycle: {
        enabled: saved.worldCycle?.enabled ?? base.worldCycle.enabled,
        rule: WORLD_RULES.some((r) => r.id === saved.worldCycle?.rule) ? saved.worldCycle!.rule : base.worldCycle.rule,
      },
      offWorlds: Array.isArray(saved.offWorlds) ? saved.offWorlds.filter((id) => looks.some((l) => l.id === id)) : [],
      brand: loadBrand(saved.brand),
      background: {
        ...base.background,
        ...(saved.background ?? {}),
        sceneId: sceneExists(saved.background?.sceneId) ? saved.background!.sceneId : base.background.sceneId,
      },
    };
    // Every world left out: none is (the rotation needs one)
    if (!activeWorlds(loaded).length) loaded.offWorlds = [];
    // A world left out of the rotation: the night starts in the first one still in it
    if (loaded.offWorlds.includes(loaded.lookId)) return applyLook(loaded, findLook(loaded, activeWorlds(loaded)[0]));
    // The current world's plans get their settings (kept tweaks, or the world's)
    for (const plan of lookPlans(findLook(loaded))) loaded.params[plan.key] = planParams(loaded, plan.key, allLooks(loaded))!;
    return loaded;
  } catch {
    return base;
  }
}

export function saveSettings(s: Settings) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode / quota: settings just won't persist */
  }
}
