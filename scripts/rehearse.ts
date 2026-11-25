/**
 * Rehearsal: the real director plays a scripted track in every world (intro, groove, breakdown, build with a gap,
 * drop, groove, breakdown, long build with a gap, long drop, outro), prints its montage sheet, then checks the rules:
 * cuts on the beat, build plans through the builds, drop plans held for their story, no plan twice in a row, a
 * second drop edited tighter than the first.
 *
 *   node --experimental-transform-types --no-warnings --import ./scripts/ts-register.mjs scripts/rehearse.ts [world] [-v]
 */
import { Director, dropHoldBars, type DirectorContext, type DirectorMode } from "@/engine/Director";
import { TRANSITION_ACCENT, type TransitionId } from "@/engine/transitions";
import type { AudioFrame } from "@/lib/audio/AudioEngine";
import { buildProgressAt } from "@/lib/audio/MusicAnalyzer";
import { directorPlans, LOOKS } from "@/looks";
import { Cadrage, type Framing } from "@/scenes/art/camera";

type Sec = AudioFrame["section"];
const TRACK: { section: Sec; bars: number; gap?: boolean }[] = [
  { section: "calm", bars: 16 },
  { section: "calm", bars: 16 },
  { section: "breakdown", bars: 8 },
  { section: "build", bars: 8, gap: true },
  { section: "drop", bars: 16 },
  { section: "calm", bars: 16 },
  { section: "breakdown", bars: 8 },
  { section: "build", bars: 16, gap: true },
  { section: "drop", bars: 32 },
  { section: "calm", bars: 8 },
];
const BPM = 125;
const DT = 1 / 60;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;

const args = process.argv.slice(2);
const verbose = args.includes("-v");
const only = args.find((a) => !a.startsWith("-"));

interface Cut {
  t: number;
  bar: number;
  beat: number;
  phase: number;
  section: Sec;
  from: string;
  to: string;
  type: string;
  dur: number;
  dropIndex: number;
  /** When its hit is on screen (its accent, or its start for a fade). */
  hit: number;
}

function frameAt(t: number, prevBeat: number, f: AudioFrame): AudioFrame {
  const beats = t / BEAT;
  const beatIndex = Math.floor(beats);
  const tick = beatIndex !== prevBeat;
  const bar = Math.floor(beatIndex / 4);
  let start = 0;
  let seg = TRACK[TRACK.length - 1];
  for (const s of TRACK) {
    if (bar < start + s.bars) {
      seg = s;
      break;
    }
    start += s.bars;
  }
  const sectionTime = t - start * BAR;
  const kick = seg.section === "calm" || seg.section === "drop";
  // the gap: the build's last beat falls silent
  const gap = !!seg.gap && bar === start + seg.bars - 1 && beatIndex % 4 === 3;
  f.time = t;
  f.bpm = BPM;
  f.beatPhase = beats - beatIndex;
  f.beatInBar = beatIndex % 4;
  f.bar = bar;
  f.phraseBar = bar % 8;
  f.tick = tick;
  f.downbeat = tick && beatIndex % 4 === 0;
  f.section = seg.section;
  f.sectionTime = sectionTime;
  f.drop = seg.section === "drop" && tick && bar === start && beatIndex % 4 === 0;
  f.dropManual = false;
  f.buildProgress = seg.section === "build" ? buildProgressAt(sectionTime / BAR) : 0;
  f.beat = tick && kick && !gap;
  f.onset = Math.floor(beats * 2) !== Math.floor((t - DT) / BEAT * 2) && !gap;
  f.beatPulse = f.beat ? 1 : f.beatPulse * Math.exp(-DT * 8);
  f.onsetPulse = f.onset ? 1 : f.onsetPulse * Math.exp(-DT * 14);
  f.dropPulse = f.drop ? 1 : f.dropPulse * Math.exp(-DT * 0.5);
  f.bass = gap ? 0 : kick ? 0.8 : 0.2;
  f.volume = gap ? 0.02 : seg.section === "breakdown" ? 0.35 : 0.75;
  f.active = true;
  f.gap = gap;
  // the intro is quiet, the grooves full
  f.intensity = bar < 16 ? 0.3 : seg.section === "breakdown" ? 0.35 : seg.section === "build" ? 0.6 : 0.9;
  return f;
}

function emptyFrame(): AudioFrame {
  return {
    spectrum: new Float32Array(0),
    bands: new Float32Array(64),
    waveform: new Float32Array(0),
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
    active: true,
    drift: 0,
    tint: null,
    safeFlash: false,
    shot: null,
    camCut: false,
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

const fmt = (bar: number, beat: number) => `${String(bar + 1).padStart(3)}.${beat + 1}`;
let failures = 0;

for (const look of LOOKS) {
  if (only && look.id !== only) continue;
  const plans = directorPlans(look);
  const role = new Map(plans.map((p) => [p.key, p.role ?? "-"]));
  const mode: DirectorMode = look.director ?? "club";
  const director = new Director();
  const f = emptyFrame();
  let current = plans.find((p) => p.role === "calm")?.key ?? plans[0].key;
  let transEnd = 0;
  let prevBeat = -1;
  let drops = 0;
  const cuts: Cut[] = [];
  const camCuts: { bar: number; beat: number; phase: number; dropIndex: number; t: number }[] = [];
  // per build: the plans seen on screen from its second bar to the drop
  const buildShots: { dropIndex: number; shots: Set<string> }[] = [];
  // a scene's camera, following the director's cuts: does it cut exactly on them, hold through the builds?
  const FR: Framing[] = [0, 1, 2, 3, 4].map((i) => ({ az: i, el: 0.1 * i, dist: 3 + i, target: [0, 0, 0], focal: 2 }));
  const cam = new Cadrage(FR, 2);
  let camTo = "";
  let camBad = 0;
  let buildMoves = 0;
  const total = TRACK.reduce((s, x) => s + x.bars, 0) * BAR;
  for (let t = 0; t < total; t += DT) {
    frameAt(t, prevBeat, f);
    prevBeat = Math.floor(t / BEAT);
    if (f.drop) drops++;
    const ctx: DirectorContext = {
      mode,
      locked: false,
      vary: true,
      currentId: current,
      layerId: null,
      inTransition: t < transEnd,
      plans,
      palettes: look.palettes,
      transitions: look.transitions,
      params: {},
    };
    const d = director.update(f, ctx);
    if (d?.sceneId && d.transition) {
      cuts.push({
        t,
        bar: f.bar,
        beat: f.beatInBar,
        phase: f.beatPhase,
        section: f.section,
        from: current,
        to: d.sceneId,
        type: d.transition.type,
        dur: d.transition.duration / BEAT,
        dropIndex: drops,
        hit: t + Math.max(0, (TRANSITION_ACCENT[d.transition.type as TransitionId] ?? 0) - (d.transition.from ?? 0)) * d.transition.duration,
      });
      current = d.sceneId;
      transEnd = t + d.transition.duration;
    }
    f.camCut = director.camCut;
    const before = cam.pos.clone();
    cam.update(f, DT);
    const to = `${cam.pos.x.toFixed(2)},${cam.pos.z.toFixed(2)}`;
    // a cut jumps; between cuts the camera only drifts (its slow orbit)
    const jump = cam.pos.distanceTo(before) > 0.3;
    if (jump && !f.camCut && f.section === "drop") camBad++;
    if (f.camCut && !jump && t > 1) camBad++;
    if (f.section === "build" && to !== camTo && cam.pos.distanceTo(before) > 0.05) buildMoves++;
    camTo = to;
    if (director.camCut) camCuts.push({ bar: f.bar, beat: f.beatInBar, phase: f.beatPhase, dropIndex: drops, t });
    if (f.section === "build" && f.sectionTime > BAR) {
      let b = buildShots.find((x) => x.dropIndex === drops);
      if (!b) buildShots.push((b = { dropIndex: drops, shots: new Set() }));
      b.shots.add(current);
    }
  }

  // ---- the sheet
  const hasBuild = plans.some((p) => p.role === "build");
  console.log(`\n${look.name} (${mode}) — ${cuts.length} coupes, ${camCuts.length} coupes de caméra`);
  if (verbose) {
    for (const c of cuts) {
      const short = c.to.split(":")[1];
      const hb = Math.round(c.hit / BEAT);
      console.log(`  ${fmt(Math.floor(hb / 4), hb % 4)} ${c.section.padEnd(9)} → ${short.padEnd(16)} [${role.get(c.to)}] ${c.type} ${c.dur.toFixed(2)} t.${c.hit > c.t + 1e-3 ? ` (lancée ${((c.hit - c.t) / BEAT).toFixed(2)} t. avant)` : ""}`);
    }
  }

  // ---- the rules
  const problems: string[] = [];
  // every cut hits on the beat (its accent, for the short transitions started ahead of the 1)
  const offBeat = cuts.filter((c) => {
    const b = c.hit / BEAT;
    return Math.abs(b - Math.round(b)) > (1.5 * DT) / BEAT;
  });
  if (offBeat.length) problems.push(`${offBeat.length} coupe(s) qui ne frappent pas sur le temps`);
  // plans held as long as their story: no cut of the scene in the first bars after a drop
  const hold = dropHoldBars(mode);
  for (const c of cuts.filter((x) => x.section === "drop" && x.type !== "fade")) {
    const dropCut = cuts.find((x) => x.dropIndex === c.dropIndex && x.section === "drop");
    if (dropCut && c !== dropCut && c.hit - dropCut.hit < hold * BAR - 1e-3) {
      problems.push(`drop ${c.dropIndex} : coupé après ${((c.hit - dropCut.hit) / BAR).toFixed(1)} mes. (tenue ${hold})`);
      break;
    }
  }
  // the builds show build plans
  if (hasBuild) {
    for (const b of buildShots) {
      const off = [...b.shots].filter((k) => role.get(k) !== "build");
      if (off.length) problems.push(`montée ${b.dropIndex + 1} : ${off.map((k) => k.split(":")[1]).join(", ")} au lieu d'un plan de montée`);
    }
  }
  // never the same plan twice in a row
  const repeats = cuts.filter((c) => c.from === c.to);
  if (repeats.length) problems.push(`${repeats.length} plan(s) répété(s)`);
  if (camBad) problems.push(`${camBad} écart(s) entre les coupes de caméra et la caméra de la scène`);
  if (buildMoves) problems.push(`la caméra change de cadrage pendant une montée (${buildMoves} images)`);
  // camera cuts on the beat too
  const camOff = camCuts.filter((c) => c.phase > DT / BEAT + 1e-6);
  if (camOff.length) problems.push(`${camOff.length} coupe(s) de caméra hors du temps`);
  // the second drop edited tighter than the first (more camera cuts while its plan is held)
  const inHold = (k: number) => {
    const d = cuts.find((c) => c.dropIndex === k && c.section === "drop");
    return d ? camCuts.filter((c) => c.dropIndex === k && c.t >= d.t && c.t < d.t + hold * BAR).length : 0;
  };
  const cam1 = inHold(1);
  const cam2 = inHold(2);
  if (mode !== "manual" && cam2 <= cam1) problems.push(`second drop pas plus serré (${cam1} → ${cam2} coupes de caméra pendant la tenue)`);
  if (verbose) console.log(`  coupes de caméra pendant la tenue : drop 1 ${cam1}, drop 2 ${cam2}`);

  if (problems.length) {
    failures += problems.length;
    for (const p of problems) console.log(`  ✗ ${p}`);
  } else console.log("  ✓ toutes les règles");
}
console.log(failures ? `\n${failures} problème(s)` : "\nRépétition sans faute");
process.exitCode = failures ? 1 : 0;
