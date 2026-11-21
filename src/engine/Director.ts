import type { AudioFrame } from "@/lib/audio/AudioEngine";
import type { Energy, ParamValues, SceneDef } from "@/scenes";
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
  currentId: string | null;
  layerId: string | null;
  inTransition: boolean;
  scenes: SceneDef[];
  params: Record<string, ParamValues>;
}

export interface Decision {
  sceneId?: string;
  transition?: TransitionSpec;
  /** New params for the target scene (colour / setting variation). */
  params?: ParamValues;
  /** Scene to build ahead of time. */
  preload?: string;
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
  private history: string[] = [];
  private plannedDrop: string | null = null;
  private plannedNext: string | null = null;
  private lastCutTime = 0;
  private now = 0;

  /** A scene change that didn't come from the director (click, keyboard). */
  noteManualCut(id: string) {
    this.lastCutBeat = this.beats;
    this.remember(id);
  }

  update(f: AudioFrame, ctx: DirectorContext): Decision | null {
    this.now = f.time;
    if (f.tick) this.beats++;
    const target = f.section === "build" ? f.buildProgress : 0;
    this.tension += (target - this.tension) * (target > this.tension ? 0.05 : 0.15);

    if (ctx.locked || !f.active) return null;
    const auto = ctx.mode !== "manual";
    const pacing = PACING[ctx.mode === "manual" ? "club" : ctx.mode];
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

    // ---- Section changes
    if (f.section !== this.lastSection) {
      this.lastSection = f.section;
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
    const def = ctx.scenes.find((s) => s.id === id);
    const params = ctx.vary && def ? mutate(def, ctx.params[id]) : undefined;
    return { sceneId: id, transition, params };
  }

  private remember(id: string) {
    this.history.push(id);
    if (this.history.length > 6) this.history.shift();
  }

  /** Random scene of the wanted energy, avoiding what's on screen and the last few shots. */
  private pick(ctx: DirectorContext, energies: Energy[]): string {
    const free = ctx.scenes.filter((s) => s.id !== ctx.currentId && s.id !== ctx.layerId);
    const recent = this.history.slice(-3);
    const tiers = [
      free.filter((s) => energies.includes(s.energy) && !recent.includes(s.id)),
      free.filter((s) => energies.includes(s.energy)),
      free.filter((s) => !recent.includes(s.id)),
      free,
    ];
    const pool = tiers.find((t) => t.length > 0) ?? ctx.scenes;
    return pickOne(pool).id;
  }
}

/** Fresh palette + small nudges on a couple of sliders, so a returning scene never looks identical. */
function mutate(def: SceneDef, current: ParamValues | undefined): ParamValues {
  const out: ParamValues = { ...(current ?? {}) };
  const ranges = def.params.filter((p) => p.type === "range");
  for (const p of def.params) {
    if (p.type === "select" && p.key === "palette") {
      const others = paletteOptions.filter((o) => o.value !== out.palette);
      out.palette = pickOne(others).value;
    }
  }
  for (let n = 0; n < 2 && ranges.length; n++) {
    const p = pickOne(ranges);
    if (p.type !== "range") continue;
    const cur = typeof out[p.key] === "number" ? (out[p.key] as number) : p.default;
    const span = p.max - p.min;
    let v = cur + (Math.random() * 2 - 1) * 0.2 * span;
    v = Math.min(p.max, Math.max(p.min, v));
    const step = p.step ?? 0.01;
    out[p.key] = Math.round(v / step) * step;
  }
  return out;
}
