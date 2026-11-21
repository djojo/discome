import { defaultParams, SCENES, type ParamValues } from "@/scenes";
import { BLEND_MODES, TRANSITIONS, type LayerSettings, type TransitionId } from "@/engine/transitions";
import { DIRECTOR_MODES, type DirectorMode } from "@/engine/Director";
import { NEUTRAL_FX, type FxSettings } from "@/engine/fx";
import { LOOKS, lookFx, lookScenes, type Look } from "@/looks";

export type Quality = "auto" | "low" | "normal" | "high";

/** Max device-pixel-ratio per quality level ("auto" starts at "normal" and adapts to the frame rate). */
export const QUALITY_DPR: Record<Quality, number> = { auto: 1.25, low: 0.75, normal: 1.25, high: 2 };

export interface Settings {
  sceneId: string;
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
}

const KEY = "discome:settings:v1";

export function defaultSettings(): Settings {
  return {
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
    lookId: "free",
    fx: { ...NEUTRAL_FX },
    safeFlash: false,
    strobeWarned: false,
    customLooks: [],
  };
}

export const allLooks = (s: Settings): Look[] => [...LOOKS, ...s.customLooks];

export const findLook = (s: Settings, id = s.lookId): Look => allLooks(s).find((l) => l.id === id) ?? LOOKS[0];

/** Switch look: its effects, its palettes on its scenes, its pacing; stay on the current scene if it belongs to it. */
export function applyLook(s: Settings, look: Look): Settings {
  const params = { ...s.params };
  const pool = lookScenes(look);
  for (const entry of pool) {
    const p = { ...params[entry.id], ...(entry.params ?? {}) };
    if (look.palettes.length && !look.palettes.includes(String(p.palette))) p.palette = look.palettes[0];
    params[entry.id] = p;
  }
  const sceneId = pool.some((e) => e.id === s.sceneId) ? s.sceneId : (pool[0]?.id ?? s.sceneId);
  return { ...s, lookId: look.id, fx: lookFx(look), params, sceneId, director: look.director ?? s.director };
}

/** Save the current effects (on top of the current look's scenes and palettes) as a new look. */
export function saveCurrentLook(s: Settings): Settings {
  const base = findLook(s);
  const look: Look = {
    ...base,
    id: `custom-${Date.now()}`,
    name: `Mon look ${s.customLooks.length + 1}`,
    description: `Basé sur ${base.name}`,
    fx: { ...s.fx },
    director: s.director,
    custom: true,
  };
  return { ...s, customLooks: [...s.customLooks, look], lookId: look.id };
}

const sceneExists = (id: unknown): id is string => SCENES.some((s) => s.id === id);

/** Saved settings merged over defaults, so new scenes/params added later get sane values. */
export function loadSettings(): Settings {
  const base = defaultSettings();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<Settings>;
    const params = { ...base.params };
    for (const id of Object.keys(params)) params[id] = { ...params[id], ...(saved.params?.[id] ?? {}) };
    const layer = { ...base.layer, ...(saved.layer ?? {}) };
    if (!sceneExists(layer.sceneId)) layer.sceneId = null;
    if (!BLEND_MODES.some((b) => b.id === layer.mode)) layer.mode = base.layer.mode;
    return {
      ...base,
      ...saved,
      sceneId: sceneExists(saved.sceneId) ? saved.sceneId : base.sceneId,
      transition: TRANSITIONS.some((t) => t.id === saved.transition) ? saved.transition! : base.transition,
      quality: saved.quality && saved.quality in QUALITY_DPR ? saved.quality : base.quality,
      director: DIRECTOR_MODES.some((m) => m.id === saved.director) ? saved.director! : base.director,
      fx: { ...NEUTRAL_FX, ...(saved.fx ?? {}) },
      customLooks: Array.isArray(saved.customLooks) ? saved.customLooks : [],
      lookId: [...LOOKS, ...(saved.customLooks ?? [])].some((l) => l.id === saved.lookId) ? saved.lookId! : base.lookId,
      params,
      layer,
    };
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
