/** Scene-to-scene transitions, implemented in the compositor shader (index = GLSL code). */
export const TRANSITIONS = [
  { id: "cut", label: "Cut net" },
  { id: "fade", label: "Fondu" },
  { id: "punch", label: "Punch (zoom + flash)" },
  { id: "glitch", label: "Glitch" },
  { id: "luma", label: "Volet lumineux" },
  { id: "iris", label: "Iris" },
  { id: "flash", label: "Flash blanc" },
  { id: "dip", label: "Passage au noir" },
  { id: "dive", label: "Plongée dans la fissure" },
] as const;

export type TransitionId = (typeof TRANSITIONS)[number]["id"];

export const transitionCode = (id: TransitionId) => Math.max(0, TRANSITIONS.findIndex((t) => t.id === id));

/** How the layer (calque) is merged over the main scene. */
export const BLEND_MODES = [
  { id: "add", label: "Addition" },
  { id: "screen", label: "Écran" },
  { id: "difference", label: "Différence" },
  { id: "multiply", label: "Produit" },
  { id: "mask", label: "Masque lumineux" },
] as const;

export type BlendModeId = (typeof BLEND_MODES)[number]["id"];

export const blendCode = (id: BlendModeId) => Math.max(0, BLEND_MODES.findIndex((b) => b.id === id));

export interface TransitionSpec {
  type: TransitionId;
  /** Seconds. 0 = instant. */
  duration: number;
}

export interface LayerSettings {
  sceneId: string | null;
  mode: BlendModeId;
  opacity: number;
  /** Opacity follows the beat. */
  pulse: boolean;
}
