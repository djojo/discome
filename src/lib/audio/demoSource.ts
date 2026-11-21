/**
 * Tiny synthesised techno loop (kick, hats, clap, bass, arp) so the visualizer
 * can be tried without a microphone or a file. Pure Web Audio, no assets.
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

  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  const BPM = 126;
  const STEP = 60 / BPM / 4; // 16th note

  // A minor progression: Am – F – C – G
  const roots = [55, 43.65, 65.41, 49];
  const chords = [
    [220, 261.63, 329.63],
    [174.61, 220, 261.63],
    [261.63, 329.63, 392],
    [196, 246.94, 293.66],
  ];

  const env = (g: GainNode, t: number, peak: number, decay: number) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  };

  const kick = (t: number) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    env(g, t, 1, 0.38);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + 0.4);
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
    s.start(t, Math.random() * 0.5);
    s.stop(t + decay + 0.02);
  };

  const bass = (t: number, freq: number) => {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.Q.value = 9;
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(140, t + 0.16);
    const g = ctx.createGain();
    env(g, t, 0.32, 0.2);
    o.connect(f).connect(g).connect(bus);
    o.start(t);
    o.stop(t + 0.22);
  };

  const arp = (t: number, freq: number, bright: number) => {
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 800 + bright * 4200;
    const g = ctx.createGain();
    env(g, t, 0.06, 0.14);
    o.connect(f).connect(g).connect(bus);
    o.start(t);
    o.stop(t + 0.16);
  };

  let step = 0;
  let next = ctx.currentTime + 0.08;

  const schedule = (i: number, t: number) => {
    const s16 = i % 16;
    const bar = Math.floor(i / 16);
    const chord = Math.floor(bar / 2) % 4;
    const phrase = bar % 8;
    const breakdown = phrase === 7 && s16 >= 8; // little break every 8 bars

    if (s16 % 4 === 0 && !breakdown) kick(t);
    if (s16 === 4 || s16 === 12) noiseHit(t, "bandpass", 1600, 0.45, 0.16);
    if (s16 % 4 === 2) noiseHit(t, "highpass", 7500, 0.22, 0.12);
    else if (s16 % 2 === 1) noiseHit(t, "highpass", 9000, 0.07, 0.035);
    if (s16 % 4 === 2 || s16 % 4 === 3) bass(t, roots[chord] * (s16 % 8 === 7 ? 2 : 1));

    const notes = chords[chord];
    const bright = 0.5 + 0.5 * Math.sin((i / 64) * Math.PI);
    if (!breakdown || s16 % 2 === 0) arp(t, notes[(i * 2) % 3] * (s16 % 8 < 4 ? 2 : 1), bright);
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
