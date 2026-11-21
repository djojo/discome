import { defaultParams, SCENES, type ParamValues } from "@/scenes";
import { BLEND_MODES, TRANSITIONS, type LayerSettings, type TransitionId } from "@/engine/transitions";

export type Quality = "auto" | "low" | "normal" | "high";

/** Max device-pixel-ratio per quality level ("auto" starts at "normal" and adapts to the frame rate). */
export const QUALITY_DPR: Record<Quality, number> = { auto: 1.25, low: 0.75, normal: 1.25, high: 2 };

export interface Settings {
  sceneId: string;
  params: Record<string, ParamValues>;
  sensitivity: number;
  autoCycle: boolean;
  cycleSeconds: number;
  quality: Quality;
  transition: TransitionId;
  /** Seconds. */
  transitionTime: number;
  layer: LayerSettings;
}

const KEY = "discome:settings:v1";

export function defaultSettings(): Settings {
  return {
    sceneId: SCENES[0].id,
    params: Object.fromEntries(SCENES.map((s) => [s.id, defaultParams(s)])),
    sensitivity: 1,
    autoCycle: false,
    cycleSeconds: 20,
    quality: "auto",
    transition: "fade",
    transitionTime: 1.2,
    layer: { sceneId: null, mode: "screen", opacity: 0.7, pulse: false },
  };
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
