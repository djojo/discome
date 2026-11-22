import { createDemoSource } from "./demoSource";
import { emptyMusicState, MusicAnalyzer, type MusicState, type StructureLevels } from "./MusicAnalyzer";

export type SourceKind = "mic" | "tab" | "file" | "demo";

/**
 * Snapshot of the analysed audio, refreshed every animation frame.
 * The same object is mutated in place to avoid allocations in the render loop.
 * All levels are normalised to 0..1 (auto-gain), so scenes don't care about input volume.
 */
export interface AudioFrame extends MusicState {
  /** Raw FFT magnitudes, 0..1, linear bins (length = fftSize / 2). */
  spectrum: Float32Array;
  /** Log-spaced, smoothed, auto-gained bands (32 Hz → 16 kHz), 0..1. Best for bars. */
  bands: Float32Array;
  /** Time-domain signal, -1..1. */
  waveform: Float32Array;
  bass: number;
  mid: number;
  treble: number;
  volume: number;
  /** True only on the frame where a beat (kick) is detected. */
  beat: boolean;
  /** True on the frame of any sharp attack (hats, snares, claps…). */
  onset: boolean;
  /** 1 right after a beat, decays to 0. Handy for flashes and kicks. */
  beatPulse: number;
  /** 1 right after a sharp attack (hats, snares), decays fast. */
  onsetPulse: number;
  /** 1 at a drop, decays over a few seconds: the big moments of a scene. */
  dropPulse: number;
  beatCount: number;
  /** Wall-clock seconds since the engine started. */
  time: number;
  /** "Musical time": advances faster when the music is loud. Drive motion with it. */
  energy: number;
  /** False while no source is connected. */
  active: boolean;
  /** 0..1: how far the night has drifted since the source started (set by the visualizer, see Settings.drift). */
  drift: number;
}

export const BAND_COUNT = 64;
const FFT_SIZE = 2048;
const FLUX_HISTORY = 45;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Asymmetric envelope follower: fast attack, slower release. Frame-rate independent. */
function follow(current: number, target: number, dt: number, attack = 30, release = 7) {
  const k = 1 - Math.exp(-dt * (target > current ? attack : release));
  return current + (target - current) * k;
}

export class AudioEngine {
  readonly frame: AudioFrame;
  sensitivity = 1;
  kind: SourceKind | null = null;
  /** Called when the source stops on its own (e.g. tab sharing ended). */
  onEnded: (() => void) | null = null;

  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private monitor: GainNode | null = null;
  private cleanup: (() => void) | null = null;
  private mediaEl: HTMLAudioElement | null = null;

  private byteFreq = new Uint8Array(FFT_SIZE / 2);
  private floatWave = new Float32Array(FFT_SIZE);
  private prevSpectrum = new Float32Array(FFT_SIZE / 2);
  private bandEdges: Float32Array = new Float32Array(BAND_COUNT + 1);
  private binRanges: Record<"bass" | "mid" | "treble" | "kick" | "onset", [number, number]> = {
    bass: [1, 6],
    mid: [7, 85],
    treble: [86, 512],
    kick: [1, 7],
    onset: [7, 340],
  };

  private peaks = { bands: 0.4, bass: 0.4, mid: 0.4, treble: 0.4, volume: 0.1 };
  private fluxHist = new Float32Array(FLUX_HISTORY);
  private fluxIdx = 0;
  private lastBeat = -1;
  private onsetHist = new Float32Array(FLUX_HISTORY);
  private onsetIdx = 0;
  private lastOnset = -1;
  private music = new MusicAnalyzer();
  private levels: StructureLevels | null = null;

  constructor() {
    this.frame = {
      spectrum: new Float32Array(FFT_SIZE / 2),
      bands: new Float32Array(BAND_COUNT),
      waveform: new Float32Array(FFT_SIZE),
      bass: 0,
      mid: 0,
      treble: 0,
      volume: 0,
      beat: false,
      onset: false,
      beatPulse: 0,
      onsetPulse: 0,
      dropPulse: 0,
      beatCount: 0,
      time: 0,
      energy: 0,
      active: false,
      drift: 0,
      ...emptyMusicState(),
    };
  }

  /** Tap tempo (T key). */
  tap() {
    this.music.tap(this.frame.time);
  }

  /** Manual drop (space bar): fires the drop reaction and re-aligns bar 1. */
  triggerDrop() {
    this.music.triggerDrop();
  }

  setSensitivity(v: number) {
    this.sensitivity = v;
  }

  setOnEnded(cb: (() => void) | null) {
    this.onEnded = cb;
  }

  get isPlayingFile() {
    return this.mediaEl ? !this.mediaEl.paused : false;
  }

  toggleFilePlayback() {
    if (!this.mediaEl) return;
    if (this.mediaEl.paused) void this.mediaEl.play();
    else this.mediaEl.pause();
  }

  private async ensureContext() {
    if (!this.ctx) {
      const ctx = new AudioContext({ latencyHint: "interactive" });
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.5;
      analyser.minDecibels = -95;
      analyser.maxDecibels = -15;
      const monitor = ctx.createGain();
      monitor.connect(ctx.destination);
      this.ctx = ctx;
      this.analyser = analyser;
      this.monitor = monitor;
      this.computeRanges(ctx.sampleRate);
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
    return this.ctx;
  }

  private computeRanges(sampleRate: number) {
    const binHz = sampleRate / FFT_SIZE;
    const maxBin = FFT_SIZE / 2 - 1;
    const toBin = (hz: number) => Math.min(maxBin, Math.max(1, Math.round(hz / binHz)));
    const lo = 32;
    const hi = 16000;
    for (let i = 0; i <= BAND_COUNT; i++) {
      this.bandEdges[i] = (lo * Math.pow(hi / lo, i / BAND_COUNT)) / binHz;
    }
    this.binRanges = {
      bass: [toBin(30), toBin(150)],
      mid: [toBin(150) + 1, toBin(2000)],
      treble: [toBin(2000) + 1, toBin(12000)],
      kick: [toBin(40), toBin(180)],
      onset: [toBin(150) + 1, toBin(8000)],
    };
  }

  /** Connect a new source (stops the previous one). Must be called from a user gesture. */
  async start(kind: SourceKind, file?: File) {
    const ctx = await this.ensureContext();
    const analyser = this.analyser!;
    const monitor = this.monitor!;
    this.stopSource();

    if (kind === "mic") {
      const stream = await navigator.mediaDevices.getUserMedia({
        // Raw signal: voice processing would kill the music dynamics.
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const node = ctx.createMediaStreamSource(stream);
      node.connect(analyser); // not to the speakers: avoids feedback
      this.cleanup = () => {
        node.disconnect();
        stream.getTracks().forEach((t) => t.stop());
      };
    } else if (kind === "tab") {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error("Aucun son partagé : coche « Partager aussi l'audio de l'onglet » dans la fenêtre de partage.");
      }
      const node = ctx.createMediaStreamSource(new MediaStream(audioTracks));
      node.connect(analyser); // the shared tab already plays its own sound
      audioTracks[0].addEventListener("ended", () => {
        this.stop();
        this.onEnded?.();
      });
      this.cleanup = () => {
        node.disconnect();
        stream.getTracks().forEach((t) => t.stop());
      };
    } else if (kind === "file") {
      if (!file) throw new Error("Aucun fichier sélectionné.");
      const url = URL.createObjectURL(file);
      const el = new Audio();
      el.src = url;
      el.loop = true;
      const node = ctx.createMediaElementSource(el);
      node.connect(analyser);
      node.connect(monitor);
      await el.play();
      this.mediaEl = el;
      this.cleanup = () => {
        el.pause();
        node.disconnect();
        el.removeAttribute("src");
        el.load();
        URL.revokeObjectURL(url);
        this.mediaEl = null;
      };
    } else {
      const demo = createDemoSource(ctx);
      demo.output.connect(analyser);
      demo.output.connect(monitor);
      this.cleanup = () => demo.stop();
    }

    this.kind = kind;
    this.peaks = { bands: 0.4, bass: 0.4, mid: 0.4, treble: 0.4, volume: 0.1 };
  }

  private stopSource() {
    this.cleanup?.();
    this.cleanup = null;
    this.kind = null;
    this.levels = null;
    this.music.reset();
  }

  stop() {
    this.stopSource();
  }

  async dispose() {
    this.stopSource();
    if (this.ctx) await this.ctx.close();
    this.ctx = null;
    this.analyser = null;
    this.monitor = null;
  }

  /** Read the analyser and update `frame`. Call once per animation frame. */
  update(dt: number): AudioFrame {
    const f = this.frame;
    f.time += dt;
    f.beat = false;
    f.onset = false;
    f.beatPulse *= Math.exp(-dt * 5);
    f.onsetPulse *= Math.exp(-dt * 14);
    f.dropPulse *= Math.exp(-dt * 0.9);

    const analyser = this.analyser;
    if (!analyser || !this.kind) {
      // Idle: let everything fall back to zero, keep a slow drift so scenes stay alive.
      f.active = false;
      for (let i = 0; i < f.bands.length; i++) f.bands[i] = follow(f.bands[i], 0, dt);
      f.waveform.fill(0);
      f.bass = follow(f.bass, 0, dt);
      f.mid = follow(f.mid, 0, dt);
      f.treble = follow(f.treble, 0, dt);
      f.volume = follow(f.volume, 0, dt);
      f.energy += dt * 0.25;
      this.music.update(f, dt, null);
      if (f.drop) f.dropPulse = 1;
      return f;
    }

    f.active = true;
    f.energy += dt * (0.3 + f.volume * 1.2 + f.bass * 1.2);

    // Analyse at a fixed ~60 Hz so smoothing and beat detection behave the same on 60/120/144 Hz screens.
    this.analysisAcc += dt;
    if (this.analysisAcc >= 1 / 60 - 0.001) {
      const step = Math.min(this.analysisAcc, 0.1);
      this.analysisAcc = 0;
      this.analyse(analyser, step);
    }
    // The beat clock runs every frame so ticks land on time even at 120 Hz.
    this.music.update(f, dt, this.levels);
    if (f.onset) f.onsetPulse = 1;
    if (f.drop) f.dropPulse = 1;
    return f;
  }

  private analyse(analyser: AnalyserNode, step: number) {
    const f = this.frame;
    analyser.getByteFrequencyData(this.byteFreq);
    analyser.getFloatTimeDomainData(this.floatWave);
    f.waveform.set(this.floatWave);

    const spec = f.spectrum;
    const n = spec.length;
    for (let i = 0; i < n; i++) spec[i] = this.byteFreq[i] / 255;

    const sens = this.sensitivity;
    const peakDecay = Math.pow(0.996, step * 60);

    // ---- Log bands with global auto-gain ----
    let bandMax = 0;
    const raw = this.tmpBands;
    for (let b = 0; b < BAND_COUNT; b++) {
      const lo = this.bandEdges[b];
      const hi = this.bandEdges[b + 1];
      let v: number;
      if (hi - lo < 1) {
        // Narrower than one bin (low end): interpolate.
        const c = (lo + hi) / 2;
        const i0 = Math.floor(c);
        const t = c - i0;
        v = spec[i0] * (1 - t) + spec[Math.min(n - 1, i0 + 1)] * t;
      } else {
        v = 0;
        const end = Math.min(n - 1, Math.ceil(hi));
        for (let i = Math.floor(lo); i <= end; i++) if (spec[i] > v) v = spec[i];
      }
      // Gentle tilt: highs carry less energy, lift them a bit.
      v *= 0.9 + 0.45 * (b / BAND_COUNT);
      v = Math.max(0, v - 0.1) / 0.9;
      raw[b] = v;
      if (v > bandMax) bandMax = v;
    }
    this.peaks.bands = Math.max(bandMax, this.peaks.bands * peakDecay, 0.35);
    const bandGain = sens / this.peaks.bands;
    for (let b = 0; b < BAND_COUNT; b++) {
      const v = Math.pow(clamp01(raw[b] * bandGain), 1.6);
      f.bands[b] = follow(f.bands[b], v, step, 35, 9);
    }

    // ---- Bass / mid / treble ----
    const avg = (r: [number, number]) => {
      let s = 0;
      for (let i = r[0]; i <= r[1]; i++) s += spec[i];
      return s / (r[1] - r[0] + 1);
    };
    const level = (rawV: number, key: "bass" | "mid" | "treble") => {
      this.peaks[key] = Math.max(rawV, this.peaks[key] * peakDecay, 0.3);
      return Math.pow(clamp01((rawV * sens) / this.peaks[key]), 2.2);
    };
    f.bass = follow(f.bass, level(avg(this.binRanges.bass), "bass"), step, 40, 8);
    f.mid = follow(f.mid, level(avg(this.binRanges.mid), "mid"), step, 30, 7);
    f.treble = follow(f.treble, level(avg(this.binRanges.treble), "treble"), step, 30, 7);

    // ---- Volume (RMS) ----
    let sum = 0;
    const w = this.floatWave;
    for (let i = 0; i < w.length; i++) sum += w[i] * w[i];
    const rms = Math.sqrt(sum / w.length);
    this.peaks.volume = Math.max(rms, this.peaks.volume * peakDecay, 0.04);
    f.volume = follow(f.volume, clamp01((rms * sens) / this.peaks.volume), step, 25, 6);

    // ---- Linear (not auto-gained) levels for song-structure detection ----
    const lin = (r: [number, number]) => {
      let s = 0;
      for (let i = r[0]; i <= r[1]; i++) s += Math.pow(10, (spec[i] * 80 - 95) / 20);
      return s / (r[1] - r[0] + 1);
    };
    this.levels = { bass: lin(this.binRanges.bass), mid: lin(this.binRanges.mid), treble: lin(this.binRanges.treble) };

    // ---- Onsets: broadband spectral flux (hats, snares, claps) ----
    let oflux = 0;
    const [o0, o1] = this.binRanges.onset;
    for (let i = o0; i <= o1; i++) {
      const d = spec[i] - this.prevSpectrum[i];
      if (d > 0) oflux += d;
    }
    oflux /= o1 - o0 + 1;
    let omean = 0;
    for (let i = 0; i < FLUX_HISTORY; i++) omean += this.onsetHist[i];
    omean /= FLUX_HISTORY;
    let ovar = 0;
    for (let i = 0; i < FLUX_HISTORY; i++) ovar += (this.onsetHist[i] - omean) ** 2;
    this.onsetHist[this.onsetIdx] = oflux;
    this.onsetIdx = (this.onsetIdx + 1) % FLUX_HISTORY;
    if (oflux > omean + 1.5 * Math.sqrt(ovar / FLUX_HISTORY) + 0.006 && f.time - this.lastOnset > 0.08) {
      f.onset = true;
      this.lastOnset = f.time;
    }

    // ---- Beat detection: spectral flux on the kick range vs. its recent history ----
    let flux = 0;
    const [k0, k1] = this.binRanges.kick;
    for (let i = k0; i <= k1; i++) {
      const d = spec[i] - this.prevSpectrum[i];
      if (d > 0) flux += d;
    }
    flux /= k1 - k0 + 1;
    this.prevSpectrum.set(spec);

    let mean = 0;
    for (let i = 0; i < FLUX_HISTORY; i++) mean += this.fluxHist[i];
    mean /= FLUX_HISTORY;
    let variance = 0;
    for (let i = 0; i < FLUX_HISTORY; i++) variance += (this.fluxHist[i] - mean) ** 2;
    const std = Math.sqrt(variance / FLUX_HISTORY);
    this.fluxHist[this.fluxIdx] = flux;
    this.fluxIdx = (this.fluxIdx + 1) % FLUX_HISTORY;

    const threshold = mean + std * (1.6 / Math.sqrt(sens)) + 0.012;
    if (flux > threshold && f.time - this.lastBeat > 0.3) {
      f.beat = true;
      f.beatPulse = 1;
      f.beatCount++;
      this.lastBeat = f.time;
    }
  }

  private tmpBands = new Float32Array(BAND_COUNT);
  private analysisAcc = 0;
}
