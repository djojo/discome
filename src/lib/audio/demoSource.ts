/**
 * Synthesised techno track (pure Web Audio, no assets) with a real song structure,
 * so the auto director can be tried without a microphone or a file.
 * 32-bar loop at 126 BPM:
 *   bars  0–7   groove     kick, hats, bass, arp
 *   bars  8–11  breakdown  no kick/bass: pad + arp
 *   bars 12–15  build      snare roll speeding up, noise riser, last beat silent
 *   bars 16–31  drop       everything + clap + pad stabs
 */
export function createDemoSource(ctx: AudioContext) {
  const output = ctx.createGain();
  output.gain.value = 0.55;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  comp.connect(output);
  const bus = ctx.createGain();
  bus.connect(comp);

  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  const BPM = 126;
  const STEP = 60 / BPM / 4; // 16th note
  const BAR = STEP * 16;

  // A minor progression: Am – F – C – G (2 bars each)
  const roots = [55, 43.65, 65.41, 49];
  const chords = [
    [220, 261.63, 329.63],
    [174.61, 220, 261.63],
    [261.63, 329.63, 392],
    [196, 246.94, 293.66],
  ];

  const env = (g: GainNode, t: number, peak: number, decay: number, attack = 0.004) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  };

  const kick = (t: number, level = 1) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    env(g, t, level, 0.38);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + 0.42);
  };

  const noiseHit = (t: number, type: BiquadFilterType, freq: number, peak: number, decay: number) => {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    env(g, t, peak, decay);
    s.connect(f).connect(g).connect(bus);
    s.start(t, Math.random() * 1.5);
    s.stop(t + decay + 0.02);
  };

  const bass = (t: number, freq: number, level: number) => {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.Q.value = 9;
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(140, t + 0.16);
    const g = ctx.createGain();
    env(g, t, level, 0.2);
    o.connect(f).connect(g).connect(bus);
    o.start(t);
    o.stop(t + 0.24);
  };

  const arp = (t: number, freq: number, bright: number, level = 0.06) => {
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 600 + bright * 4600;
    const g = ctx.createGain();
    env(g, t, level, 0.14);
    o.connect(f).connect(g).connect(bus);
    o.start(t);
    o.stop(t + 0.16);
  };

  /** Detuned saw chord, slow attack: fills the breakdown without any low end. */
  const pad = (t: number, notes: number[], length: number, level: number) => {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.4);
    g.gain.setValueAtTime(level, t + length - 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    f.connect(g).connect(bus);
    for (const n of notes) {
      for (const detune of [-8, 8]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = n;
        o.detune.value = detune;
        o.connect(f);
        o.start(t);
        o.stop(t + length + 0.05);
      }
    }
  };

  /** Noise sweep rising over the whole build. */
  const riser = (t: number, length: number) => {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 2;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(9000, t + length);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + length);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length + 0.05);
    s.connect(f).connect(g).connect(bus);
    s.start(t);
    s.stop(t + length + 0.1);
  };

  let step = 0;
  let next = ctx.currentTime + 0.08;

  const schedule = (i: number, t: number) => {
    const s16 = i % 16;
    const bar = Math.floor(i / 16) % 32;
    const chord = Math.floor(bar / 2) % 4;
    const notes = chords[chord];
    const groove = bar < 8;
    const breakdown = bar >= 8 && bar < 12;
    const build = bar >= 12 && bar < 16;
    const drop = bar >= 16;
    const bright = 0.5 + 0.5 * Math.sin((i / 64) * Math.PI);

    if (groove || drop) {
      if (s16 % 4 === 0) kick(t, drop ? 1 : 0.9);
      if (s16 % 4 === 2) noiseHit(t, "highpass", 7500, 0.22, 0.12);
      else if (s16 % 2 === 1) noiseHit(t, "highpass", 9000, 0.07, 0.035);
      if (s16 % 4 === 2 || s16 % 4 === 3) bass(t, roots[chord] * (s16 % 8 === 7 ? 2 : 1), drop ? 0.36 : 0.3);
      arp(t, notes[(i * 2) % 3] * (s16 % 8 < 4 ? 2 : 1), bright);
    }
    if (drop) {
      if (s16 === 4 || s16 === 12) noiseHit(t, "bandpass", 1600, 0.45, 0.16);
      if (s16 === 0 && bar % 2 === 0) pad(t, notes.map((n) => n * 2), BAR * 2, 0.025);
      if (s16 === 6 || s16 === 14) arp(t, notes[2] * 2, 1, 0.05);
    }

    if (breakdown || build) {
      if (s16 === 0 && bar % 2 === 0) pad(t, notes, BAR * 2 - (bar === 14 ? STEP * 4 : 0), 0.05);
      if (s16 % 2 === 0) arp(t, notes[(i / 2) % 3] * 2, build ? 0.3 + ((bar - 12) / 4) * 0.7 : 0.25, 0.05);
    }

    if (build) {
      if (bar === 12 && s16 === 0) riser(t, BAR * 4 - STEP * 4);
      const lastBeatGap = bar === 15 && s16 >= 12; // silence right before the drop
      const every = bar === 12 ? 4 : bar === 13 ? 2 : 1;
      if (!lastBeatGap && s16 % every === 0) {
        const ramp = (bar - 12 + s16 / 16) / 4;
        noiseHit(t, "bandpass", 1800 + ramp * 1500, 0.12 + ramp * 0.35, 0.09);
      }
    }
  };

  const timer = window.setInterval(() => {
    while (next < ctx.currentTime + 0.12) {
      schedule(step, next);
      next += STEP;
      step++;
    }
  }, 25);

  return {
    output,
    stop() {
      window.clearInterval(timer);
      output.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      window.setTimeout(() => output.disconnect(), 120);
    },
  };
}
