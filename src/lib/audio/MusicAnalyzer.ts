/**
 * Musical structure on top of the raw analysis:
 *  - tempo (BPM) from the detected kicks, and a phase-locked beat clock that keeps
 *    ticking through breakdowns (bars, 8-bar phrases, predicted downbeats);
 *  - song sections: calm → breakdown → build → drop, from bass/treble energy at several time scales.
 * Heuristic by design: tuned for structured electronic music, with manual overrides (tap, drop).
 */

export type Section = "calm" | "breakdown" | "build" | "drop";

export interface MusicState {
  /** 0 until a tempo is found. */
  bpm: number;
  /** 0..1 position inside the current beat. */
  beatPhase: number;
  /** 0..3 */
  beatInBar: number;
  bar: number;
  /** 0..7 inside an 8-bar phrase. */
  phraseBar: number;
  /** True on the frame the clock crosses a beat (predicted, so it lands on time). */
  tick: boolean;
  /** Tick on beat 1 of a bar. */
  downbeat: boolean;
  section: Section;
  /** Seconds since the section started. */
  sectionTime: number;
  /** True on the frame a drop happens (detected or triggered by hand). */
  drop: boolean;
  dropManual: boolean;
  /** 0..1 while building up (stretched over 16 then 32 bars when the build goes on, never going back). */
  buildProgress: number;
  /** True while the music falls silent in a build: the gap right before the drop. */
  gap: boolean;
  /** 0..1, how full the music is now against the loudest of the track (smoothed over a few bars). */
  intensity: number;
}

/** Linear amplitudes (not auto-gained): structure detection needs the real dynamics. */
export interface StructureLevels {
  bass: number;
  mid: number;
  treble: number;
}

const BPM_MIN = 85;
const BPM_MAX = 170;
const HIST_RES = 2; // bins per BPM

const ema = (cur: number, x: number, dt: number, tau: number) => cur + (x - cur) * (1 - Math.exp(-dt / tau));

export function emptyMusicState(): MusicState {
  return {
    bpm: 0,
    beatPhase: 0,
    beatInBar: 0,
    bar: 0,
    phraseBar: 0,
    tick: false,
    downbeat: false,
    section: "calm",
    sectionTime: 0,
    drop: false,
    dropManual: false,
    buildProgress: 0,
    gap: false,
    intensity: 0,
  };
}

/**
 * How far a build has come after `bars` bars: most of the way over its first 8 bars (.9), then a little more over
 * the next 8 and the 16 after, for the builds that go on. It never goes back.
 */
export function buildProgressAt(bars: number) {
  if (bars <= 8) return 0.9 * (bars / 8);
  if (bars <= 16) return 0.9 + 0.07 * ((bars - 8) / 8);
  return Math.min(1, 0.97 + 0.03 * ((bars - 16) / 16));
}

export class MusicAnalyzer {
  // ---- tempo
  private beatTimes: number[] = [];
  private hist = new Float32Array((BPM_MAX - BPM_MIN) * HIST_RES);
  private bpm = 0;
  private period = 0.5;
  private phase = 0;
  private beatInBar = 0;
  private bar = 0;
  private phraseBar = 0;
  private misses = 0;
  private candidate = 0;
  private candidateVotes = 0;
  private holdUntil = 0;
  private taps: number[] = [];

  // ---- sections
  private section: Section = "calm";
  private sectionStart = 0;
  private bassS = 0;
  private bassM = 0;
  private bassRef = 0;
  private shareS = 0;
  private shareM = 0;
  private trebM = 0;
  private trebL = 0;
  private onsetRate = 0;
  private onsetRateL = 0;
  private lowTime = 0;
  private highTime = 0;
  private buildTime = 0;
  private breakBass = Infinity;
  private manualDrop = false;
  // the drop's fast followers (the bass coming back is read within a few hundredths of a second)
  private bassF = 0;
  private shareF = 0;
  // the gap: the build's own level, and how long the music has been silent
  private buildLevel = 0;
  private quiet = 0;
  private gap = false;
  // the intensity: loudness against the loudest of the track
  private loud = 0;
  private loudRef = 1e-6;
  private intensity = 0;

  reset() {
    Object.assign(this, new MusicAnalyzer());
  }

  get barSeconds() {
    return (this.bpm > 0 ? this.period : 0.5) * 4;
  }

  /** Tap tempo: the first tap of a series is beat 1. */
  tap(time: number) {
    const last = this.taps[this.taps.length - 1];
    if (last !== undefined && time - last > 2) this.taps = [];
    this.taps.push(time);
    if (this.taps.length > 8) this.taps.shift();
    if (this.taps.length < 3) return;
    const intervals = this.taps.slice(1).map((t, i) => t - this.taps[i]).sort((a, b) => a - b);
    const median = intervals[Math.floor(intervals.length / 2)];
    this.bpm = Math.min(200, Math.max(60, 60 / median));
    this.period = 60 / this.bpm;
    this.phase = 0;
    this.beatInBar = (this.taps.length - 1) % 4;
    this.holdUntil = time + 45; // trust the human for a while
  }

  /** Force a drop now (also re-aligns bar 1 on this beat). */
  triggerDrop() {
    this.manualDrop = true;
  }

  update(f: MusicState & { time: number; beat: boolean; onset: boolean }, dt: number, levels: StructureLevels | null) {
    const t = f.time;
    f.tick = false;
    f.downbeat = false;
    f.drop = false;
    f.dropManual = false;

    // Only trust "beats" while the low end is really there: in breakdowns, snare rolls and risers
    // would otherwise be taken for kicks and drag the tempo (e.g. 126 → 168 BPM on a roll).
    const kickPresent = !levels || this.bassS > 0.35 * this.bassRef;
    if (f.beat && kickPresent && this.section !== "breakdown" && this.section !== "build") this.onBeat(t);
    if (this.bpm > 0) {
      this.phase += dt / this.period;
      while (this.phase >= 1) {
        this.phase -= 1;
        this.beatInBar = (this.beatInBar + 1) % 4;
        f.tick = true;
        if (this.beatInBar === 0) {
          this.bar++;
          this.phraseBar = (this.phraseBar + 1) % 8;
          f.downbeat = true;
        }
      }
    }

    if (levels) this.updateSections(f, t, dt, levels);
    if (this.manualDrop) {
      this.manualDrop = false;
      this.enterDrop(f, t, true);
    }

    f.bpm = this.bpm;
    f.beatPhase = ((this.phase % 1) + 1) % 1;
    f.beatInBar = this.beatInBar;
    f.bar = this.bar;
    f.phraseBar = this.phraseBar;
    f.section = this.section;
    f.sectionTime = t - this.sectionStart;
    f.buildProgress = this.section === "build" ? buildProgressAt(f.sectionTime / this.barSeconds) : 0;
    f.gap = this.gap;
    f.intensity = this.intensity;
  }

  // ------------------------------------------------------------------ tempo

  private onBeat(t: number) {
    this.beatTimes.push(t);
    while (this.beatTimes.length && this.beatTimes[0] < t - 12) this.beatTimes.shift();
    this.estimateTempo(t);
    if (this.bpm <= 0) return;

    // Phase-locked loop: nudge the clock toward the detected kick, snap if we've lost it.
    const err = this.phase < 0.5 ? this.phase : this.phase - 1; // in beats; > 0 = kick after the predicted beat
    if (Math.abs(err) < 0.2) {
      this.phase -= err * 0.25;
      this.misses = 0;
    } else if (++this.misses >= 4) {
      this.phase = 0;
      this.misses = 0;
    }
  }

  private estimateTempo(now: number) {
    if (now < this.holdUntil) return;
    const bt = this.beatTimes;
    if (bt.length < 6) return;
    const hist = this.hist;
    hist.fill(0);
    for (let i = 0; i < bt.length; i++) {
      for (let j = i + 1; j < Math.min(bt.length, i + 5); j++) {
        const d = bt[j] - bt[i];
        if (d < 0.3 || d > 3) continue;
        let b = 60 / d;
        while (b < BPM_MIN) b *= 2;
        while (b >= BPM_MAX) b /= 2;
        const w = Math.exp(-(now - bt[j]) / 6);
        const c = (b - BPM_MIN) * HIST_RES;
        for (let k = Math.max(0, Math.floor(c - 4)); k <= Math.min(hist.length - 1, Math.ceil(c + 4)); k++) {
          hist[k] += w * Math.exp(-((k - c) ** 2) / 8);
        }
      }
    }
    let best = 0;
    for (let k = 1; k < hist.length; k++) if (hist[k] > hist[best]) best = k;
    if (hist[best] <= 0) return;
    // Parabolic refinement around the peak
    const l = hist[Math.max(0, best - 1)];
    const r = hist[Math.min(hist.length - 1, best + 1)];
    const denom = l - 2 * hist[best] + r;
    const offset = denom !== 0 ? (0.5 * (l - r)) / denom : 0;
    const cand = BPM_MIN + (best + offset) / HIST_RES;

    if (this.bpm === 0) {
      this.bpm = cand;
    } else if (Math.abs(cand - this.bpm) < 1.5) {
      this.bpm += (cand - this.bpm) * 0.2;
      this.candidateVotes = 0;
    } else {
      // A different tempo must win several times in a row before we switch (no flip-flopping).
      if (Math.abs(cand - this.candidate) < 1.5) this.candidateVotes++;
      else this.candidateVotes = 1;
      this.candidate = cand;
      if (this.candidateVotes >= 4) {
        this.bpm = cand;
        this.candidateVotes = 0;
      }
    }
    this.period = 60 / this.bpm;
  }

  // ------------------------------------------------------------------ sections

  private setSection(s: Section, t: number) {
    this.section = s;
    this.sectionStart = t;
    this.gap = false;
  }

  /**
   * A breakdown or a build is noticed a while after it began (`late` seconds, the time its detection took). It most
   * likely began on the downbeat of a phrase: the section's start moves back to the downbeat nearest that moment,
   * and the phrase counter is set from it, so the director's phrase cuts and the build's progress follow the music.
   */
  private startBack(t: number, late: number) {
    if (this.bpm <= 0) return;
    const bar = this.barSeconds;
    // the downbeat of the bar we are in, and how many bars back the section began
    const thisBar = t - (this.beatInBar + this.phase) * this.period;
    const back = Math.max(0, Math.round((thisBar - (t - late)) / bar));
    this.sectionStart = thisBar - back * bar;
    this.phraseBar = back % 8;
  }

  private enterDrop(f: { drop: boolean; dropManual: boolean }, t: number, manual: boolean) {
    this.setSection("drop", t);
    f.drop = true;
    f.dropManual = manual;
    // The drop is beat 1 of a bar and of a phrase: re-align the counters on it.
    if (this.phase < 0.5) {
      this.beatInBar = 0;
      this.phraseBar = 0;
    } else {
      this.beatInBar = 3;
      this.phraseBar = 7;
    }
    this.lowTime = 0;
    this.buildTime = 0;
    this.breakBass = Infinity;
  }

  private updateSections(f: { onset: boolean; drop: boolean; dropManual: boolean }, t: number, dt: number, lv: StructureLevels) {
    const share = lv.bass / (lv.bass + lv.mid + lv.treble + 1e-6);
    this.bassS = ema(this.bassS, lv.bass, dt, 0.2);
    this.bassM = ema(this.bassM, lv.bass, dt, 1);
    this.bassRef = Math.max(this.bassM, this.bassRef * Math.exp(-dt / 40));
    this.shareS = ema(this.shareS, share, dt, 0.2);
    this.shareM = ema(this.shareM, share, dt, 1.5);
    // (fast, not instant: a stray kick in a build must not pass for the drop)
    this.bassF = ema(this.bassF, lv.bass, dt, 0.08);
    this.shareF = ema(this.shareF, share, dt, 0.1);
    this.trebM = ema(this.trebM, lv.treble, dt, 1);
    // the intensity: the music's level against the loudest stretch of the track (slowly forgotten)
    const level = lv.bass + lv.mid + lv.treble;
    this.loud = ema(this.loud, level, dt, 0.5);
    this.loudRef = Math.max(this.loud, this.loudRef * Math.exp(-dt / 90));
    this.intensity = ema(this.intensity, Math.min(1, this.loud / this.loudRef), dt, 2 * this.barSeconds);
    this.trebL = ema(this.trebL, lv.treble, dt, 8);
    const rate = f.onset ? 1 / Math.max(dt, 1e-3) : 0;
    this.onsetRate = ema(this.onsetRate, rate, dt, 1.5);
    this.onsetRateL = ema(this.onsetRateL, rate, dt, 8);

    const bar = this.barSeconds;
    const bassLow = this.bassM < 0.3 * this.bassRef || this.shareM < 0.12;
    this.lowTime = bassLow ? this.lowTime + dt : 0;
    this.highTime = bassLow ? 0 : this.highTime + dt;

    if (this.section === "calm" || this.section === "drop") {
      if (this.lowTime > bar) {
        this.setSection("breakdown", t);
        // (the bass had been fading for a second before it counted as low)
        this.startBack(t, this.lowTime + 1.2);
        this.breakBass = this.bassM;
        this.buildTime = 0;
        // New baselines: a build is "rising" relative to the breakdown, not to the groove's hi-hats.
        this.trebL = this.trebM;
        this.onsetRateL = this.onsetRate;
      } else if (this.section === "drop" && t - this.sectionStart > 16 * bar) {
        this.setSection("calm", t);
      }
      return;
    }

    // breakdown / build
    this.breakBass = Math.min(this.breakBass, this.bassM);
    const rising = this.trebM > 1.3 * this.trebL || this.onsetRate > 1.4 * Math.max(this.onsetRateL, 0.5);
    this.buildTime = rising ? this.buildTime + dt : Math.max(0, this.buildTime - dt * 0.5);
    if (this.section === "breakdown" && this.buildTime > 0.75 * bar) {
      this.setSection("build", t);
      // (the rise had been building for about a second before it counted)
      this.startBack(t, this.buildTime + 1.1);
      this.buildLevel = level;
    }
    // the gap: late in a build, the music suddenly falls silent (most often the beat right before the drop); the
    // short breaths between the hits of a snare roll don't count
    if (this.section === "build") {
      this.buildLevel = Math.max(level, this.buildLevel * Math.exp(-dt / 2));
      const late = t - this.sectionStart > 3 * bar;
      this.quiet = late && level < 0.15 * this.buildLevel ? this.quiet + dt : 0;
      if (this.quiet > 0.1) this.gap = true;
      else if (level > 0.45 * this.buildLevel) this.gap = false;
    }

    const longEnough = t - this.sectionStart > (this.section === "build" ? 0 : 2 * bar);
    // (read on the fast followers: the drop lands as soon as the bass is back, not a fifth of a second later)
    const bassBack = this.bassF > Math.max(3 * this.breakBass, 0.4 * this.bassRef) && this.shareF > 0.2;
    if (longEnough && bassBack) this.enterDrop(f, t, false);
    else if (this.highTime > 2 * bar) this.setSection("calm", t); // bass crept back without a real drop
  }
}
