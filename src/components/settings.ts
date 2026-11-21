import { defaultParams, SCENES, type ParamValues } from "@/scenes";

export type Quality = "low" | "normal" | "high";

export const QUALITY_DPR: Record<Quality, number> = { low: 0.75, normal: 1.25, high: 2 };

export interface Settings {
  sceneId: string;
  params: Record<string, ParamValues>;
  sensitivity: number;
  autoCycle: boolean;
  cycleSeconds: number;
  quality: Quality;
}

const KEY = "discome:settings:v1";

export function defaultSettings(): Settings {
  return {
    sceneId: SCENES[0].id,
    params: Object.fromEntries(SCENES.map((s) => [s.id, defaultParams(s)])),
    sensitivity: 1,
    autoCycle: false,
    cycleSeconds: 20,
    quality: "normal",
  };
}

/** Saved settings merged over defaults, so new scenes/params added later get sane values. */
export function loadSettings(): Settings {
  const base = defaultSettings();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<Settings>;
    const params = { ...base.params };
    for (const id of Object.keys(params)) params[id] = { ...params[id], ...(saved.params?.[id] ?? {}) };
    return {
      ...base,
      ...saved,
      sceneId: SCENES.some((s) => s.id === saved.sceneId) ? saved.sceneId! : base.sceneId,
      params,
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
