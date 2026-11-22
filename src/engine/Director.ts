import type { AudioFrame } from "@/lib/audio/AudioEngine";
import type { Energy, ParamValues, SceneDef } from "@/scenes";

/** A plan the director may cut to: its key, scene, energy, odds and variation bounds. */
export interface DirectorPlan {
  key: string;
  scene: SceneDef;
  energy: Energy;
  weight: number;
  /** The plan's own settings: variations stay around them instead of drifting away. */
  defaults: ParamValues;
  vary?: { palettes?: string[]; ranges?: Record<string, [number, number]>; choices?: Record<string, string[]> };
  /** "after": the aftermath, kept for the breakdowns. */
  role?: string;
}
import { paletteOptions } from "@/scenes/palettes";
import type { TransitionId, TransitionSpec } from "./transitions";

export const DIRECTOR_MODES = [
  { id: "manual", label: "Manuel", hint: "Tu choisis les scènes (Espace déclenche quand même un drop)." },
  { id: "chill", label: "Chill", hint: "Longs plans, fondus lents, rafale douce au drop." },
  { id: "club", label: "Club", hint: "Change toutes les 16 mesures, rafale d'1 mesure au drop." },
  { id: "rave", label: "Rave", hint: "Coupes rapides, rafale sur chaque temps au drop." },
] as const;

export type DirectorMode = (typeof DIRECTOR_MODES)[number]["id"];

interface Pacing {
  /** Bars between cuts outside of bursts (cuts land on half-phrase boundaries). */
  calmBars: number;
  calmTransitions: TransitionId[];
  calmBeats: number;
  breakdownBeats: number;
  dropTransitions: TransitionId[];
  /** Length of the cut burst that follows a drop. */
  burstBars: number;
  /** Beats between cuts during the burst. */
  burstEvery: number;
  /** Cut on every beat during the first bar of the burst. */
  burstFrenzy: boolean;
  burstTransitions: TransitionId[];
  /** Bars between cuts for the rest of the drop, once the burst is over. */
  dropBars: number;
}

const PACING: Record<Exclude<DirectorMode, "manual">, Pacing> = {
  chill: {
    calmBars: 32,
    calmTransitions: ["fade", "luma", "iris"],
    calmBeats: 8,
    breakdownBeats: 8,
    dropTransitions: ["flash", "punch"],
    burstBars: 4,
    burstEvery: 8,
    burstFrenzy: false,
    burstTransitions: ["fade", "luma"],
    dropBars: 8,
  },
  club: {
    calmBars: 16,
    calmTransitions: ["fade", "luma", "iris", "glitch"],
    calmBeats: 4,
    breakdownBeats: 8,
    dropTransitions: ["punch", "flash", "glitch"],
    burstBars: 8,
    burstEvery: 4,
    burstFrenzy: false,
    burstTransitions: ["cut", "glitch", "flash", "punch"],
    dropBars: 4,
  },
  rave: {
    calmBars: 8,
    calmTransitions: ["glitch", "luma", "iris", "punch"],
    calmBeats: 2,
    breakdownBeats: 4,
    dropTransitions: ["flash", "punch"],
    burstBars: 8,
    burstEvery: 2,
    burstFrenzy: true,
    burstTransitions: ["cut", "glitch", "flash"],
    dropBars: 2,
  },
};

/** Transition length in beats for the short, burst-style transitions. */
const SNAP_BEATS: Partial<Record<TransitionId, number>> = { cut: 0, glitch: 0.5, flash: 0.75, punch: 1 };

export interface DirectorContext {
  mode: DirectorMode;
  locked: boolean;
  vary: boolean;
  /** Plan key on screen. */
  currentId: string | null;
  /** Scene id of the layer (never cut to a plan of that scene). */
  layerId: string | null;
  inTransition: boolean;
  /** Plans the director may use (the active world's). */
  plans: DirectorPlan[];
  /** Palettes allowed by the look. */
  palettes?: string[];
  /** Look-specific transition sets. */
  transitions?: { calm?: TransitionId[]; drop?: TransitionId[] };
  params: Record<string, ParamValues>;
  /** Worlds take turns: at breakdowns, or every N phrases. */
  worldCycle?: { enabled: boolean; rule: "breakdown" | "phrases4" | "phrases8" };
  /** Background managed by the director (the world's background shots). */
  background?: { auto: boolean; currentId: string | null; shots: { id: string; weight?: number }[] };
}

export interface Decision {
  /** Plan key to cut to. */
  sceneId?: string;
  transition?: TransitionSpec;
  /** New params for the target scene (colour / setting variation). */
  params?: ParamValues;
  /** Scene to build ahead of time. */
  preload?: string;
  /** Time to move on to the next world. */
  changeWorld?: boolean;
  /** New background scene, with its cross-fade length in seconds. */
  background?: string;
  bgFade?: number;
}

const pickOne = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

/**
 * Automatic VJ: decides when to cut and to what, from the musical structure.
 * Calm → cuts on phrase boundaries; breakdown → slow fade to a calm scene;
 * build → tension (read by the compositor); drop → impact transition + a burst of fast cuts.
 */
export class Director {
  /** 0..1, rises during a build-up. The compositor turns it into zoom/brightness. */
  tension = 0;
  private beats = 0;
  private lastCutBeat = 0;
  private burstStart = -1;
  private burstUntil = -1;
  private burstPacing: Pacing = PACING.club;
  private lastSection: AudioFrame["section"] = "calm";
  /** Section of the current frame (the aftermath plans are kept for breakdowns). */
  private section: AudioFrame["section"] = "calm";
  private history: string[] = [];
  private plannedDrop: string | null = null;
  private plannedNext: string | null = null;
  private lastCutTime = 0;
  private now = 0;
  private phrasesInWorld = 0;
  private bgPhrases = 0;
  /** Background presence multiplier: fuller in breakdowns, pulsing during bursts. */
  bgLevel = 1;

  /** The show just entered a new world. */
  noteWorldChange(id: string) {
    this.phrasesInWorld = 0;
    this.bgPhrases = 0;
    this.burstUntil = -1;
    this.plannedNext = null;
    this.plannedDrop = null;
    this.noteManualCut(id);
  }

  /** A scene change that didn't come from the director (click, keyboard). */
  noteManualCut(id: string) {
    this.lastCutBeat = this.beats;
    this.remember(id);
  }

  update(f: AudioFrame, ctx: DirectorContext): Decision | null {
    this.section = f.section;
    const dt = Math.max(0, Math.min(0.1, f.time - this.now));
    const fg = this.decide(f, ctx);
    const bg = this.decideBackground(f, ctx, dt);
    return fg || bg ? { ...(fg ?? {}), ...(bg ?? {}) } : null;
  }

  /** The background changes slowly: every 3 phrases, or with a short fade on the drop. */
  private decideBackground(f: AudioFrame, ctx: DirectorContext, dt: number): Decision | null {
    const burst = this.beats < this.burstUntil;
    const target =
      f.section === "breakdown" ? 1.4 : f.section === "build" ? 0.8 + 0.4 * f.buildProgress : burst ? 0.6 + 0.6 * f.beatPulse : 1;
    this.bgLevel += (target - this.bgLevel) * (1 - Math.exp(-dt * 2));

    if (f.downbeat && f.phraseBar === 0) this.bgPhrases++;
    const bg = ctx.background;
    if (!bg?.auto || ctx.locked || !f.active || bg.shots.length < 2) return null;
    const beat = f.bpm > 0 ? 60 / f.bpm : 0.5;
    const pick = () => {
      const onScreen = ctx.plans.find((p) => p.key === ctx.currentId)?.scene.id;
      const pool = bg.shots.filter((s) => s.id !== bg.currentId && s.id !== onScreen);
      let r = Math.random() * pool.reduce((sum, s) => sum + (s.weight ?? 1), 0);
      return pool.find((s) => (r -= s.weight ?? 1) <= 0)?.id ?? pool[0]?.id;
    };
    if (f.drop) {
      this.bgPhrases = 0;
      const id = pick();
      return id ? { background: id, bgFade: 2 * beat } : null;
    }
    if (this.bgPhrases >= 3 && f.downbeat && f.phraseBar === 0) {
      this.bgPhrases = 0;
      const id = pick();
      return id ? { background: id, bgFade: 16 * beat } : null;
    }
    return null;
  }

  private decide(f: AudioFrame, ctx: DirectorContext): Decision | null {
    this.now = f.time;
    if (f.tick) this.beats++;
    const target = f.section === "build" ? f.buildProgress : 0;
    this.tension += (target - this.tension) * (target > this.tension ? 0.05 : 0.15);

    if (ctx.locked || !f.active) return null;
    const auto = ctx.mode !== "manual";
    const base = PACING[ctx.mode === "manual" ? "club" : ctx.mode];
    const pacing: Pacing = {
      ...base,
      calmTransitions: ctx.transitions?.calm ?? base.calmTransitions,
      dropTransitions: ctx.transitions?.drop ?? base.dropTransitions,
      burstTransitions: ctx.transitions?.drop ?? base.burstTransitions,
    };
    const beat = f.bpm > 0 ? 60 / f.bpm : 0.5;

    // ---- Drop: impact, then a burst of cuts
    if (f.drop && (auto || f.dropManual)) {
      this.burstPacing = pacing;
      this.burstStart = this.beats;
      this.burstUntil = auto ? this.beats + pacing.burstBars * 4 : -1;
      const id = this.plannedDrop && this.plannedDrop !== ctx.currentId ? this.plannedDrop : this.pick(ctx, ["intense"]);
      this.plannedDrop = null;
      const type = pickOne(pacing.dropTransitions);
      return this.cut(ctx, id, { type, duration: (SNAP_BEATS[type] ?? 1) * beat });
    }
    if (!auto) return null;
    if (f.downbeat && f.phraseBar === 0) this.phrasesInWorld++;
    const cycle = ctx.worldCycle?.enabled ? ctx.worldCycle.rule : null;

    // ---- Section changes
    if (f.section !== this.lastSection) {
      this.lastSection = f.section;
      // A breakdown is the natural moment to change worlds (not too often though)
      if (f.section === "breakdown" && cycle === "breakdown" && this.phrasesInWorld >= 2) {
        return { changeWorld: true };
      }
      if (f.section === "breakdown") {
        this.burstUntil = -1;
        return this.cut(ctx, this.pick(ctx, ["calm"]), { type: "fade", duration: pacing.breakdownBeats * beat });
      }
      if (f.section === "build") {
        // Get the drop scene ready while the tension rises.
        this.plannedDrop = this.pick(ctx, ["intense"]);
        return { preload: this.plannedDrop };
      }
    }
    if (ctx.inTransition) return null;

    // ---- Burst after a drop
    if (this.beats < this.burstUntil) {
      if (!f.tick) return null;
      const p = this.burstPacing;
      const every = p.burstFrenzy && this.beats - this.burstStart < 4 ? 1 : p.burstEvery;
      if (this.beats - this.lastCutBeat >= every) {
        const type = pickOne(p.burstTransitions);
        return this.cut(ctx, this.pick(ctx, ["intense", "medium"]), { type, duration: (SNAP_BEATS[type] ?? 0.5) * beat });
      }
      return null;
    }

    if (f.section === "build") return null; // hold the shot, let the tension do the work

    // ---- World rotation on phrase boundaries
    if (cycle && f.downbeat && f.phraseBar === 0) {
      const every = cycle === "phrases4" ? 4 : 8; // "breakdown" also changes after 8 phrases without one
      if (this.phrasesInWorld >= every) return { changeWorld: true };
    }

    // ---- Regular cuts, on half-phrase boundaries
    if (f.bpm > 0) {
      if (!f.downbeat) return null;
      const bars = (this.beats - this.lastCutBeat) / 4;
      const inDrop = f.section === "drop";
      const energies: Energy[] = f.section === "breakdown" ? ["calm"] : inDrop ? ["intense", "medium"] : ["calm", "medium"];
      const every = inDrop ? pacing.dropBars : pacing.calmBars;
      const aligned = inDrop ? true : f.phraseBar % 4 === 0;
      if (bars >= every && aligned) {
        const id = this.plannedNext && this.plannedNext !== ctx.currentId ? this.plannedNext : this.pick(ctx, energies);
        this.plannedNext = null;
        if (inDrop) {
          const type = pickOne(pacing.burstTransitions);
          return this.cut(ctx, id, { type, duration: (SNAP_BEATS[type] ?? 1) * beat });
        }
        return this.cut(ctx, id, { type: pickOne(pacing.calmTransitions), duration: pacing.calmBeats * beat });
      }
      if (bars >= every - 2 && !this.plannedNext) {
        this.plannedNext = this.pick(ctx, energies);
        return { preload: this.plannedNext };
      }
      return null;
    }

    // ---- No tempo yet: fall back to time
    if (f.time - this.lastCutTime > pacing.calmBars * 2 && f.beat) {
      return this.cut(ctx, this.pick(ctx, ["calm", "medium"]), { type: pickOne(pacing.calmTransitions), duration: 2 });
    }
    return null;
  }

  /** One-line state for the debug overlay. */
  describe(f: AudioFrame, mode: DirectorMode): string {
    const dots = [0, 1, 2, 3].map((i) => (i === f.beatInBar ? "●" : "○")).join("");
    const burst = this.beats < this.burstUntil ? ` · rafale ${Math.ceil((this.burstUntil - this.beats) / 4)} mes.` : "";
    return (
      `${f.bpm > 0 ? f.bpm.toFixed(1) : "—"} BPM ${dots} · mesure ${f.bar} · phrase ${f.phraseBar + 1}/8\n` +
      `section ${f.section} (${f.sectionTime.toFixed(0)} s) · tension ${this.tension.toFixed(2)}${burst}\n` +
      `réalisateur ${mode}${this.plannedDrop ? ` · drop prêt : ${this.plannedDrop}` : ""}`
    );
  }

  // ------------------------------------------------------------------ internals

  private cut(ctx: DirectorContext, id: string, transition: TransitionSpec): Decision {
    this.lastCutBeat = this.beats;
    this.lastCutTime = this.now;
    this.remember(id);
    const plan = ctx.plans.find((p) => p.key === id);
    const params = ctx.vary && plan ? mutate(plan, ctx.params[id], ctx.palettes) : undefined;
    return { sceneId: id, transition, params };
  }

  private remember(id: string) {
    this.history.push(id);
    if (this.history.length > 6) this.history.shift();
  }

  /** Random plan of the wanted energy, avoiding what's on screen and the last few plans. */
  private pick(ctx: DirectorContext, energies: Energy[]): string {
    const free = ctx.plans.filter((p) => p.key !== ctx.currentId && p.scene.id !== ctx.layerId);
    const recent = this.history.slice(-3);
    // The aftermath plans belong to the breakdowns; elsewhere they only fill in when nothing else fits
    const fits = (p: DirectorPlan) => (this.section === "breakdown") === (p.role === "after");
    const tiers = [
      free.filter((p) => fits(p) && energies.includes(p.energy) && !recent.includes(p.key)),
      free.filter((p) => fits(p) && energies.includes(p.energy)),
      free.filter((p) => fits(p) && !recent.includes(p.key)),
      free.filter(fits),
      free.filter((p) => energies.includes(p.energy) && !recent.includes(p.key)),
      free.filter((p) => energies.includes(p.energy)),
      free.filter((p) => !recent.includes(p.key)),
      free,
    ];
    const pool = tiers.find((t) => t.length > 0) ?? ctx.plans;
    // Weighted draw: a world can favour some plans
    let r = Math.random() * pool.reduce((sum, p) => sum + p.weight, 0);
    for (const p of pool) {
      r -= p.weight;
      if (r <= 0) return p.key;
    }
    return pool[pool.length - 1].key;
  }
}

/**
 * A variation that stays in the plan's style: a palette among the plan's (or the world's), the plan's choices
 * (another head…), and a couple of sliders moved within the plan's ranges, or close to the plan's own value
 * (it never drifts away over time).
 */
function mutate(plan: DirectorPlan, current: ParamValues | undefined, palettes?: string[]): ParamValues {
  const out: ParamValues = { ...(current ?? plan.defaults) };
  const def = plan.scene;
  const allowed = plan.vary?.palettes ?? (palettes?.length ? palettes : paletteOptions.map((o) => o.value));
  if (def.params.some((p) => p.key === "palette") && allowed.length > 1) {
    const others = allowed.filter((v) => v !== out.palette);
    out.palette = others.length ? pickOne(others) : allowed[0];
  }
  // Choices (a head among a few…): a different one on every return
  for (const [key, options] of Object.entries(plan.vary?.choices ?? {})) {
    const others = options.filter((v) => v !== out[key]);
    if (others.length) out[key] = pickOne(others);
  }
  const ranges = def.params.filter((p) => p.type === "range" && p.key !== "speed" && p.key !== "dynamics");
  for (let n = 0; n < 2 && ranges.length; n++) {
    const p = pickOne(ranges);
    if (p.type !== "range") continue;
    const own = plan.vary?.ranges?.[p.key];
    const base = typeof plan.defaults[p.key] === "number" ? (plan.defaults[p.key] as number) : p.default;
    const span = p.max - p.min;
    let v = own ? own[0] + Math.random() * (own[1] - own[0]) : base + (Math.random() * 2 - 1) * 0.12 * span;
    v = Math.min(p.max, Math.max(p.min, v));
    const step = p.step ?? 0.01;
    out[p.key] = Math.round(v / step) * step;
  }
  return out;
}
