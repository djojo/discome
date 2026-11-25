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
  /**
   * "after": the aftermath, kept for the breakdowns. "arc": a build plan whose drop is its own reveal (a fall that
   * ends in a cavern, a maze left from above): held through the drop, no cut.
   */
  role?: string;
}
import { paletteOptions } from "@/scenes/palettes";
import type { BrandFrequency } from "@/brand/brand";
import { TRANSITION_ACCENT, type TransitionId, type TransitionSpec } from "./transitions";

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

/** Bars a drop plan is held after the drop, so its own story plays out (its camera cuts carry the rhythm). */
export const dropHoldBars = (mode: DirectorMode) => (mode === "chill" ? 8 : mode === "rave" ? 2 : 4);

/** Transition length in beats for the short, burst-style transitions. */
const SNAP_BEATS: Partial<Record<TransitionId, number>> = { cut: 0, glitch: 0.5, flash: 0.75, punch: 1 };

/** The night's title: bars on screen before anything automatic may cut it (time to read it). */
const TITLE_HOLD_BARS = 8;

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
  /** The Classique world: its sliders may vary freely (elsewhere only within the plans' declared ranges). */
  freeVary?: boolean;
  params: Record<string, ParamValues>;
  /** Worlds take turns: at breakdowns, or every N phrases. */
  worldCycle?: { enabled: boolean; rule: "breakdown" | "phrases4" | "phrases8" };
  /** Background managed by the director (the world's background shots). */
  background?: { auto: boolean; currentId: string | null; shots: { id: string; weight?: number }[] };
  /** The night's title in this world: its plan (kept out of `plans`), when there is one and it is ready. */
  title?: { key: string; frequency: BrandFrequency } | null;
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

/** A transition started at its hit: for the cuts decided on the beat itself (a drop, a burst), the hit is on it. */
const onHit = (type: TransitionId, duration: number): TransitionSpec => ({ type, duration, from: TRANSITION_ACCENT[type] ?? 0 });

/** What a cut is for: a moment of the track (see Director.cast). */
type Casting = "calm" | "build" | "drop" | "dropAfter" | "breakdown";

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
  /** The transition of the next regular cut, picked ahead: a short one starts before the downbeat. */
  private plannedType: TransitionId | null = null;
  private lastCutTime = 0;
  private now = 0;
  /** No scene cut before this beat: the drop plan's story plays out (its camera montage carries the rhythm). */
  private holdUntil = -1;
  /** Drops in the current track (a drop within 96 bars of the previous one belongs to the same track). */
  private dropNo = 0;
  private lastDropBeat = -1e9;
  /** The first downbeat at or after the drop (a drop noticed on the 4th beat counts from the 1 that follows). */
  private dropOrigin = -1e9;
  /** A build began: cast a build plan on its next downbeat. */
  private buildPending = false;
  private plannedBuild: string | null = null;
  /** 1 on a track's first drop, 2 on the next ones: edited tighter (camera montage, accents). */
  dropLevel = 1;
  /** The scene cameras cut to another framing on this frame (read by the Cadrage through AudioFrame.camCut). */
  camCut = false;
  private phrasesInWorld = 0;
  private bgPhrases = 0;
  // The night's title: once per visit to a world (or every other world), and again after a long stay in one
  private titleShownHere = false;
  private worldsSinceTitle = 99;
  private phrasesSinceTitle = 99;
  /** While the title is on screen, nothing automatic cuts it before it has been read (beats). Then it lasts like
   * any plan: until the next regular cut, or a drop. */
  private titleHoldUntil = -1;
  /** Background presence multiplier: fuller in breakdowns, pulsing during bursts. */
  bgLevel = 1;

  /** The show just entered a new world (`titled`: it opens on the night's title). */
  noteWorldChange(id: string, titled = false) {
    this.phrasesInWorld = 0;
    this.bgPhrases = 0;
    this.burstUntil = -1;
    this.holdUntil = -1;
    this.plannedNext = null;
    this.plannedDrop = null;
    this.plannedBuild = null;
    this.buildPending = false;
    this.dropNo = 0;
    this.worldsSinceTitle++;
    this.titleShownHere = false;
    this.noteManualCut(id);
    if (titled) this.noteTitle();
  }

  /** Entering a world: open it on the night's title? Half of the times it is due (otherwise its first drop shows it). */
  titleOnEntry(frequency: BrandFrequency): boolean {
    const due = frequency !== "half" || this.worldsSinceTitle + 1 >= 2;
    return due && Math.random() < 0.5;
  }

  /** The title went on screen (by the director, on entering a world, or by hand). */
  noteTitle() {
    this.titleShownHere = true;
    this.worldsSinceTitle = 0;
    this.phrasesSinceTitle = 0;
    this.burstUntil = -1;
    this.titleHoldUntil = this.beats + TITLE_HOLD_BARS * 4;
    this.lastCutBeat = this.beats;
  }

  private titleDue(ctx: DirectorContext): boolean {
    const t = ctx.title;
    if (!t || ctx.currentId === t.key) return false;
    // a long stay in one world (no rotation): again after a while
    if (this.phrasesSinceTitle >= (t.frequency === "often" ? 8 : t.frequency === "world" ? 16 : 32)) return true;
    if (this.titleShownHere) return false;
    return t.frequency !== "half" || this.worldsSinceTitle >= 2;
  }

  /** A scene change that didn't come from the director (click, keyboard). */
  noteManualCut(id: string) {
    this.lastCutBeat = this.beats;
    this.remember(id);
  }

  update(f: AudioFrame, ctx: DirectorContext): Decision | null {
    this.section = f.section;
    const dt = Math.max(0, Math.min(0.1, f.time - this.now));
    if (f.tick) this.beats++;
    if (f.drop) {
      // a second drop of the same track (within 96 bars of the previous one) is edited tighter
      this.dropNo = this.beats - this.lastDropBeat < 96 * 4 ? this.dropNo + 1 : 1;
      this.dropLevel = Math.min(2, this.dropNo);
      this.lastDropBeat = this.beats;
      this.dropOrigin = this.beats + (f.beatInBar === 0 ? 0 : 4 - f.beatInBar);
    }
    const fg = this.decide(f, ctx);
    this.camCut = this.cameraCut(f, ctx);
    const bg = this.decideBackground(f, ctx, dt);
    return fg || bg ? { ...(fg ?? {}), ...(bg ?? {}) } : null;
  }

  /**
   * The montage inside the scene: hard cuts of its camera on the beat. On the drop, then all through it (every 4 bars
   * in Chill, 2 in Club, 1 in Rave; twice as often on a second drop); in a groove, one phrase in three starts on a
   * cut instead of a glide. The builds and the breakdowns keep their slow camera.
   */
  private cameraCut(f: AudioFrame, ctx: DirectorContext): boolean {
    if (!f.active || ctx.mode === "manual") return false;
    if (f.drop) return true;
    if (!f.tick) return false;
    if (f.section === "drop") {
      const bars = (ctx.mode === "chill" ? 4 : ctx.mode === "rave" ? 1 : 2) / (this.dropLevel >= 2 ? 2 : 1);
      const since = this.beats - this.dropOrigin;
      return since > 0 && since % Math.max(1, Math.round(bars * 4)) === 0;
    }
    return f.section === "calm" && f.downbeat && f.phraseBar === 0 && Math.random() < 1 / 3;
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
    if (f.downbeat && f.phraseBar === 0) this.phrasesSinceTitle++;

    // ---- The night's title on screen: no automatic cut before it has been read (the effects carry the drops).
    // A drop by hand (Espace) always goes through: the DJ decides.
    if (auto && ctx.title && ctx.currentId === ctx.title.key && this.beats < this.titleHoldUntil && !f.dropManual) {
      this.lastSection = f.section;
      if (f.downbeat && f.phraseBar === 0) this.phrasesInWorld++;
      return null;
    }

    // ---- Drop: impact, then a burst of cuts (or the night's title, when it is due: only on a drop of the music,
    // never on one by hand). A plan whose drop is its own reveal stays on: the title waits for the next cut.
    const arc = this.roleOf(ctx, ctx.currentId) === "arc";
    if (f.drop && !f.dropManual && auto && ctx.title && !arc) {
      const often = ctx.title.frequency === "often" && this.phrasesSinceTitle >= 4 && Math.random() < 1 / 3;
      if (this.titleDue(ctx) || (often && ctx.currentId !== ctx.title.key)) {
        this.plannedDrop = null;
        const type = pickOne(pacing.dropTransitions);
        const d = this.cut(ctx, ctx.title.key, onHit(type, (SNAP_BEATS[type] ?? 1) * beat));
        this.noteTitle();
        return d;
      }
    }
    if (f.drop && (auto || f.dropManual)) {
      // the drop plan is held while its story plays out; only the Rave cuts from scene to scene after that
      const hold = dropHoldBars(ctx.mode === "manual" ? "club" : ctx.mode);
      // (counted from the 1 the drop lands on)
      this.holdUntil = this.dropOrigin + hold * 4;
      this.burstPacing = pacing;
      this.burstStart = this.dropOrigin + hold * 4;
      this.burstUntil = auto && ctx.mode === "rave" ? this.dropOrigin + pacing.burstBars * 4 : -1;
      this.buildPending = false;
      this.plannedBuild = null;
      this.plannedNext = null;
      this.lastSection = f.section;
      if (arc) {
        // the plan reveals itself: no cut, its drop is the impact (held and counted as a cut on the drop)
        this.plannedDrop = null;
        this.lastCutBeat = this.beats;
        this.lastCutTime = this.now;
        return null;
      }
      const id = this.plannedDrop && this.plannedDrop !== ctx.currentId ? this.plannedDrop : this.cast(ctx, "drop");
      this.plannedDrop = null;
      const type = pickOne(pacing.dropTransitions);
      return this.cut(ctx, id, onHit(type, (SNAP_BEATS[type] ?? 1) * beat));
    }
    if (!auto) return null;
    if (f.downbeat && f.phraseBar === 0) this.phrasesInWorld++;
    const cycle = ctx.worldCycle?.enabled ? ctx.worldCycle.rule : null;

    // ---- Section changes (a plan picked ahead for the previous section is no longer the right one)
    if (f.section !== this.lastSection) {
      this.lastSection = f.section;
      this.plannedNext = null;
      this.plannedType = null;
      // A breakdown is the natural moment to change worlds (not too often though)
      if (f.section === "breakdown" && cycle === "breakdown" && this.phrasesInWorld >= 2) {
        return { changeWorld: true };
      }
      if (f.section === "breakdown") {
        this.burstUntil = -1;
        this.holdUntil = -1;
        return this.cut(ctx, this.cast(ctx, "breakdown"), { type: "fade", duration: pacing.breakdownBeats * beat });
      }
      if (f.section === "build") {
        // The build's plan first (the one on screen if it is one): a build plan comes on the next downbeat, and the
        // drop scene gets ready while the tension rises, unless the build's plan reveals itself on the drop
        const kept = this.isBuildRole(this.roleOf(ctx, ctx.currentId));
        if (!kept && !(this.plannedBuild && this.plannedBuild !== ctx.currentId)) this.plannedBuild = this.cast(ctx, "build");
        const next = kept ? ctx.currentId : this.plannedBuild;
        this.buildPending = true;
        if (this.roleOf(ctx, next) === "arc") {
          this.plannedDrop = null;
          return kept || !next ? null : { preload: next };
        }
        this.plannedDrop = this.cast(ctx, "drop");
        return { preload: this.plannedDrop };
      }
    }
    if (ctx.inTransition) return null;

    // ---- The drop plan is held while its story plays out
    if (this.beats < this.holdUntil) return null;

    // ---- Rave: a burst of cuts after the hold
    if (this.beats < this.burstUntil) {
      if (!f.tick) return null;
      const p = this.burstPacing;
      const every = p.burstFrenzy && this.beats - this.burstStart < 4 ? 1 : p.burstEvery;
      if (this.beats - this.lastCutBeat >= every) {
        const type = pickOne(p.burstTransitions);
        return this.cut(ctx, this.cast(ctx, "dropAfter"), onHit(type, (SNAP_BEATS[type] ?? 0.5) * beat));
      }
      return null;
    }

    // ---- The build: a build plan on its first downbeat (unless one is on screen), then hold it, the tension rises
    if (f.section === "build") {
      if (!this.buildPending || !f.downbeat) return null;
      this.buildPending = false;
      if (this.isBuildRole(this.roleOf(ctx, ctx.currentId))) return null;
      const id = this.plannedBuild && this.plannedBuild !== ctx.currentId ? this.plannedBuild : this.cast(ctx, "build");
      this.plannedBuild = null;
      if (!this.isBuildRole(this.roleOf(ctx, id))) return null;
      const type = pickOne(pacing.calmTransitions);
      return this.cut(ctx, id, onHit(type, Math.min(4, pacing.calmBeats) * beat));
    }
    // ---- The breakdown: get a build plan ready
    if (f.section === "breakdown" && !this.plannedBuild && f.downbeat) {
      const id = this.cast(ctx, "build");
      if (this.isBuildRole(this.roleOf(ctx, id))) {
        this.plannedBuild = id;
        return { preload: id };
      }
    }

    // ---- World rotation on phrase boundaries
    if (cycle && f.downbeat && f.phraseBar === 0) {
      const every = cycle === "phrases4" ? 4 : 8; // "breakdown" also changes after 8 phrases without one
      if (this.phrasesInWorld >= every) return { changeWorld: true };
    }

    // ---- Regular cuts, on (half) phrase boundaries. Each is looked at for the coming downbeat: a short transition
    // starts ahead of it, so its hit lands on the 1; a long one starts on the 1.
    if (f.bpm > 0) {
      const inDrop = f.section === "drop";
      const kind: Casting = f.section === "breakdown" ? "breakdown" : inDrop ? "dropAfter" : "calm";
      // a quiet stretch (an intro) holds its plans twice as long; a breakdown holds its plan (a build comes next)
      const every = inDrop
        ? pacing.dropBars
        : f.section === "breakdown"
          ? Math.max(16, pacing.calmBars)
          : pacing.calmBars * (f.section === "calm" && f.intensity < 0.45 ? 2 : 1);
      // whole phrases in Chill, half phrases otherwise
      const align = inDrop ? 1 : ctx.mode === "chill" ? 8 : 4;
      const ahead = f.downbeat ? 0 : 4 - f.beatInBar;
      const beatsAt = this.beats + ahead;
      const bars = (beatsAt - this.lastCutBeat) / 4;
      const phraseAt = f.downbeat ? f.phraseBar : (f.phraseBar + 1) % 8;
      const toNext = f.downbeat ? 0 : (ahead - f.beatPhase) * beat;
      if (bars >= every && phraseAt % align === 0) {
        // No drop came to show the title: the next regular cut does, once the world has settled
        if (ctx.title && this.titleDue(ctx) && this.phrasesInWorld >= 4 && !inDrop) {
          if (!f.downbeat) return null;
          this.plannedNext = null;
          this.plannedType = null;
          const type = pickOne(pacing.calmTransitions);
          const d = this.cut(ctx, ctx.title.key, onHit(type, pacing.calmBeats * beat));
          this.noteTitle();
          return d;
        }
        const type = this.plannedType ?? pickOne(inDrop ? pacing.burstTransitions : pacing.calmTransitions);
        const dur = (inDrop ? (SNAP_BEATS[type] ?? 1) : pacing.calmBeats) * beat;
        const lead = (TRANSITION_ACCENT[type] ?? 0) * dur;
        // a long transition on the downbeat; a short one as soon as it is within its lead of it (on the downbeat
        // itself, had it been missed, it starts at its hit)
        if (f.downbeat || (lead > 0 && toNext <= lead)) {
          const id = this.plannedNext && this.plannedNext !== ctx.currentId ? this.plannedNext : this.cast(ctx, kind);
          this.plannedNext = null;
          this.plannedType = null;
          const d = this.cut(ctx, id, f.downbeat ? onHit(type, dur) : { type, duration: dur });
          // (counted from the downbeat it lands on)
          this.lastCutBeat = beatsAt;
          return d;
        }
        if (!this.plannedType) this.plannedType = type;
        return null;
      }
      if (bars >= every - 2 && !this.plannedNext) {
        this.plannedNext = this.cast(ctx, kind);
        this.plannedType = pickOne(inDrop ? pacing.burstTransitions : pacing.calmTransitions);
        return { preload: this.plannedNext };
      }
      return null;
    }

    // ---- No tempo yet: fall back to time
    if (f.time - this.lastCutTime > pacing.calmBars * 2 && f.beat) {
      return this.cut(ctx, this.cast(ctx, "calm"), { type: pickOne(pacing.calmTransitions), duration: 2 });
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
    const params = ctx.vary && plan ? mutate(plan, ctx.params[id], ctx.palettes, !!ctx.freeVary) : undefined;
    return { sceneId: id, transition, params };
  }

  private remember(id: string) {
    this.history.push(id);
    if (this.history.length > 6) this.history.shift();
  }

  private roleOf(ctx: DirectorContext, id: string | null) {
    return ctx.plans.find((p) => p.key === id)?.role;
  }

  /** A plan for the builds: a build plan, or one that carries on through the drop. */
  private isBuildRole(role: string | undefined) {
    return role === "build" || role === "arc";
  }

  /**
   * The plan for a moment of the track, by the worlds' roles: calm plans in the grooves (now and then a build plan),
   * a build plan through the builds, a drop plan on the drop (then drop or build plans), the aftermath in the
   * breakdowns. A world without roles (Classique) casts by energy.
   */
  private cast(ctx: DirectorContext, kind: Casting): string {
    const roles: Record<Casting, string[][]> = {
      calm: Math.random() < 0.25 ? [["calm", "build", "arc"]] : [["calm"], ["build", "arc"]],
      build: [["build", "arc"]],
      drop: [["drop"]],
      dropAfter: [["drop"], ["build"]],
      breakdown: [["after"], ["calm"]],
    };
    const energies: Record<Casting, Energy[]> = {
      calm: ["calm", "medium"],
      build: ["medium"],
      drop: ["intense"],
      dropAfter: ["intense", "medium"],
      breakdown: ["calm"],
    };
    if (ctx.plans.some((p) => p.role)) {
      const free = ctx.plans.filter((p) => p.key !== ctx.currentId && p.scene.id !== ctx.layerId);
      const recent = this.history.slice(-3);
      for (const want of roles[kind]) {
        const fit = free.filter((p) => p.role && want.includes(p.role));
        const fresh = fit.filter((p) => !recent.includes(p.key));
        const pool = fresh.length ? fresh : fit;
        if (pool.length) {
          let r = Math.random() * pool.reduce((sum, p) => sum + p.weight, 0);
          for (const p of pool) if ((r -= p.weight) <= 0) return p.key;
          return pool[pool.length - 1].key;
        }
      }
    }
    return this.pick(ctx, energies[kind]);
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
 * (another head…), and a couple of sliders moved within the ranges the plan declares. Only the Classique world's
 * sliders move freely, close to the plan's own value (they never drift away over time): the art-directed plans
 * were tuned, a random slider would take them off their style.
 */
function mutate(plan: DirectorPlan, current: ParamValues | undefined, palettes: string[] | undefined, free: boolean): ParamValues {
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
  const declared = plan.vary?.ranges ?? {};
  const ranges = def.params.filter(
    (p) => p.type === "range" && p.key !== "speed" && p.key !== "dynamics" && (free || p.key in declared),
  );
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
