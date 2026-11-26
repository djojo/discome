import * as THREE from "three";
import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { CAMERA_GLSL, type Cadrage, type Framing } from "./camera";
import { HEAD_GLSL, HEAD_SLOTS, headSlotGLSL, headsOf, headUniforms, preloadHeads, setHead, type HeadId } from "./heads";
import { Casting, pick } from "./casting";
import { DETAIL_GLSL } from "./detail.glsl";

/** The gallery: pairs of cases along an aisle running down -z, and the human head alone at its end. */
const CELLS = 7;
const SP = 2.6;
const Z0 = -2;
const XC = 1.7;
const ZH = Z0 - CELLS * SP;
/** Animal cases (two per pair); case N is the human head. */
const N = CELLS * 2;
/** The cases: plinths YP high, glass cases 2·CW wide on top; the busts at scale S, cut at CUT, on a block SOC high. */
const YP = 1;
const CW = 0.33;
const S = 0.27;
const CUT = -0.82;
const SOC = 0.06;
const YB = YP + SOC - CUT * S;
/** Grains of the crumbling bust, falling inside its glass. */
const DUST = 36;
/** What is left of a lamp that has gone out. */
const REMNANT = 0.12;
/**
 * The animals of the library that make a bust from every side (not the Bélier: a wall relief, flat behind) and fit
 * under the glass (not the stag: its antlers would touch it).
 */
const ANIMALS: HeadId[] = ["tigre", "loup", "faucon", "lion", "hibou", "panthere", "ours", "elephant", "cobra"];
/**
 * The other collection, the antiques: the portraits of Rome and Greece and their archetypes, four of them on each
 * passage; the first four load with the world and stand in while the next ones load.
 */
const ANTIQUES: HeadId[] = [...headsOf("visage"), ...headsOf("archetype")].filter((h) => h !== "humain" && h !== "patron");
const FIRST_ANTIQUES: HeadId[] = ["hera", "marcaurele", "socrate", "dame"];
const antiques = new Casting(FIRST_ANTIQUES, () => pick(ANTIQUES, 4));

const caseX = (j: number) => (j >= N ? 0 : j % 2 === 0 ? -XC : XC);
const caseZ = (j: number) => (j >= N ? ZH : Z0 - Math.floor(j / 2) * SP);

/** A framing on some cases of the gallery: drawn only while one of them still holds its bust. */
interface CaseFraming extends Framing {
  cases?: number[];
}

const FRAMINGS: CaseFraming[] = [
  // down the aisle, the human head at the far end
  { az: 0, el: -0.02, dist: 5.5, target: [0, 1.65, -6.5], focal: 1.7, weight: 3, tag: "aisle" },
  // low along the left row, over the floor's reflections
  { az: 0.12, el: 0, dist: 5.5, target: [-0.7, 1.1, -8], focal: 1.9, weight: 2, tag: "aisle" },
  // three-quarters on one case, the row receding behind it
  { az: 0.75, el: 0.1, dist: 2.4, target: [-XC, 1.3, caseZ(4)], focal: 1.9, weight: 2, cases: [4] },
  { az: -0.75, el: 0.1, dist: 2.4, target: [XC, 1.3, caseZ(7)], focal: 1.9, weight: 2, cases: [7] },
  // close on a bust, through the glass
  { az: 1.0, el: 0.04, dist: 1.1, target: [-XC + 0.06, 1.32, caseZ(2) + 0.03], focal: 2.3, weight: 2, cases: [2] },
  { az: -1.0, el: 0.04, dist: 1.1, target: [XC - 0.06, 1.32, caseZ(9) + 0.03], focal: 2.3, weight: 1, cases: [9] },
  // across the aisle, two cases of the far row side by side
  { az: -1.45, el: 0.05, dist: 2.9, target: [XC, 1.25, (caseZ(7) + caseZ(9)) / 2], focal: 1.7, weight: 1, cases: [7, 9] },
  // high, looking down the rows (while there is still something lit to see from up there)
  { az: 0.3, el: 0.5, dist: 7.5, target: [0, 0.5, -8.5], focal: 1.8, weight: 2, tag: "high" },
  // the human head, at the end of the aisle
  { az: 0, el: 0.06, dist: 3.2, target: [0, 1.32, ZH + 0.03], focal: 2.1, weight: 1, tag: "end" },
];

/**
 * The night of the gallery, shared by every instance of the scene (it survives the scene leaving the screen): the
 * seconds since each case's light went out (-1: still lit), the drops waiting for a case to put out.
 */
const night = { dead: new Array<number>(N).fill(-1), queue: 0, wait: 0, peak: 0 };

interface View {
  seed: number;
  collection: string;
  /** The four busts of the cases, repeated along the aisle. */
  busts: readonly HeadId[];
  /** Seconds since the last drop. */
  sinceDrop: number;
  haze: number;
}
const views = new WeakMap<object, View>();

function shuffled<T>(list: T[], seed: number): T[] {
  const out = [...list];
  let s = Math.floor(seed * 1e4) || 1;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const ease = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/**
 * The grains of case j's bust, crumbled by c over `len` seconds: each comes loose where the front passes, falls (fast,
 * then at the slow pace of dust) and settles on the block. Written into `out` (xyz, brightness; 0: not in the air).
 */
function dustGrains(out: THREE.Vector4[], j: number, c: number, len: number, hat: number) {
  for (let m = 0; m < DUST; m++) {
    const g = out[m];
    const b = hash(m * 4.1 + 0.3) * 0.95;
    const age = (c - b) * len;
    const y = YB + S * (0.9 + (CUT - 0.8) * b) - 0.28 * (age - 0.35 * (1 - Math.exp(-age / 0.35)));
    if (c < b || age > 3.5 || y < YP + SOC + 0.005) {
      g.w = 0;
      continue;
    }
    const a = hash(m * 4.1 + 1.7) * Math.PI * 2;
    const rad = (0.13 + 0.1 * hash(m * 4.1 + 2.9)) * (1 - b * 0.3) + 0.03 * age;
    g.set(
      caseX(j) + clamp(Math.cos(a) * rad, -CW + 0.01, CW - 0.01),
      y,
      caseZ(j) + clamp(Math.sin(a) * rad, -CW + 0.01, CW - 0.01),
      (1 - ease((age - 2) / 1.5)) * (0.6 + 2 * hash(m * 4.1 + 3.3) * hat),
    );
  }
}

/** The slow glide of the wide views along the aisle (the shader adds it to the camera). */
const dolly = (cam: Cadrage, time: number, seed: number) =>
  1.6 * Math.sin(time * 0.03 + seed) * ease((cam.pos.distanceTo(cam.target) - 3.5) / 2.5);

const vFwd = new THREE.Vector3();
const vRight = new THREE.Vector3();
const vUp = new THREE.Vector3();
const vPos = new THREE.Vector3();
const vC = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** The lit case nearest the middle of the picture (-1 if none is on screen). */
function caseInView(cam: Cadrage, dz: number, aspect: number): number {
  vPos.copy(cam.pos);
  vPos.z += dz;
  vFwd.copy(cam.target).sub(cam.pos).normalize();
  vRight.crossVectors(vFwd, UP).normalize();
  vUp.crossVectors(vRight, vFwd);
  let best = -1;
  let score = Infinity;
  for (let j = 0; j < N; j++) {
    if (night.dead[j] >= 0) continue;
    vC.set(caseX(j), 1.3, caseZ(j)).sub(vPos);
    const depth = vC.dot(vFwd);
    if (depth < 0.4) continue;
    const sx = (vC.dot(vRight) / depth) * cam.focal;
    const sy = (vC.dot(vUp) / depth) * cam.focal;
    if (Math.abs(sx) > aspect * 0.42 || Math.abs(sy) > 0.4) continue;
    const s = sx * sx + sy * sy + depth * 0.004;
    if (s < score) {
      score = s;
      best = j;
    }
  }
  return best;
}

const f3 = (x: number) => x.toFixed(3);

/**
 * A natural history gallery at night: on each side of an aisle, glass cases on plinths, each holding the marble bust
 * of an animal (or, in the other collection, a portrait of Rome or Greece) under its own round of light; the human
 * head alone at the end of the aisle. The subject is the
 * gallery itself: the camera glides along it, the busts never move. On each drop one light flickers and goes out, and
 * its bust crumbles to dust inside its case, which stays empty under a faint remnant of light; as the night drifts
 * the gallery empties, until only the human head is lit. The kick breathes the lights, the hats make the dust glint
 * in the beams.
 */
export const museum = defineShaderScene({
  id: "museum",
  heads: (p) => (p.collection === "antiques" ? FIRST_ANTIQUES : ANIMALS),
  name: "Le Muséum",
  tag: "Visage",
  energy: "calm",
  hdr: true,
  renderScale: 0.75,
  mask: true,
  camera: { framings: FRAMINGS, glideBars: 3 },
  description:
    "Une galerie de musée la nuit : des bustes en marbre sous vitrine (des animaux, ou des portraits antiques), chacun sous son rond de lumière ; à chaque drop une lumière s'éteint et son buste tombe en poussière, jusqu'à ce que seule la tête humaine reste éclairée au bout de l'allée.",
  params: [
    paletteParam("fauve"),
    {
      type: "select",
      key: "collection",
      label: "Collection",
      options: [
        { value: "bestiaire", label: "Le bestiaire" },
        { value: "antiques", label: "Les antiques" },
      ],
      default: "bestiaire",
    },
  ],
  uniforms: () => ({
    ...headUniforms(),
    ...headUniforms("B"),
    ...headUniforms("C"),
    ...headUniforms("D"),
    uLife: { value: new Array<number>(N + 1).fill(1) },
    uCrumble: { value: new Array<number>(N + 1).fill(0) },
    uDie: { value: -1 },
    uDieC: { value: 0 },
    uDust: { value: Array.from({ length: DUST }, () => new THREE.Vector4()) },
    uWave: { value: 9 },
    uDip: { value: 0 },
    uStir: { value: 0 },
    uHaze: { value: 1 },
    uShift: { value: 0 },
    uSafe: { value: 0 },
    uDolly: { value: 0 },
  }),
  update(u, f, p, dt, ctx) {
    const seed = u.uSeed.value as number;
    const bar = f.bpm > 0 ? 240 / f.bpm : 2;
    let v = views.get(u);
    // back on screen (the seed is redrawn): four busts of the collection, repeated along the aisle
    const collection = p.collection === "antiques" ? "antiques" : "bestiaire";
    const fresh = !v || v.seed !== seed || v.collection !== collection;
    if (!v || fresh) {
      const busts = collection === "antiques" ? antiques.pass() : shuffled(ANIMALS, seed).slice(0, 4);
      v = { seed, collection, busts, sinceDrop: 99, haze: v?.haze ?? 1 };
      preloadHeads(v.busts);
      views.set(u, v);
    }
    v.busts.forEach((id, i) => setHead(u, id, HEAD_SLOTS[i], p));
    u.uShift.value = Math.floor(seed * 7) % 4;

    // The night: a new one starts when the drift falls back
    if (f.drift < night.peak - 0.25) {
      night.dead.fill(-1);
      night.queue = 0;
      night.peak = 0;
    }
    night.peak = Math.max(night.peak, f.drift);
    const gone = () => night.dead.filter((d) => d >= 0).length;
    // as the night drifts the gallery empties: this many cases are out whatever the drops did…
    const least = Math.min(N, Math.floor(Math.pow(f.drift, 1.15) * (N + 0.999)));
    // …and the drops put out a few more, never far ahead of the night
    const most = Math.min(N, least + 3);
    if (fresh) {
      // while we were away: what was dying is gone, and the night has caught up, out of sight
      for (let j = 0; j < N; j++) if (night.dead[j] >= 0) night.dead[j] = 1e6;
      night.queue = 0;
      const alive = shuffled(
        Array.from({ length: N }, (_, j) => j).filter((j) => night.dead[j] < 0),
        seed + 1,
      );
      while (gone() < least && alive.length) night.dead[alive.pop()!] = 1e6;
    }

    const dieLen = 4.5 * bar + 1;
    for (let j = 0; j < N; j++) if (night.dead[j] >= 0 && night.dead[j] < 1e5) night.dead[j] += dt;
    const dying = night.dead.findIndex((d) => d >= 0 && d < dieLen);
    // The camera leaves a case once its dust has settled (it stays while it crumbles), and no longer looks down on a
    // gallery gone dark
    const lit = (j: number) => night.dead[j] < dieLen;
    const litCount = night.dead.filter((d) => d < dieLen).length;
    if (ctx.camera)
      ctx.camera.allow = (fr: CaseFraming) => (fr.cases ? fr.cases.some(lit) : fr.tag !== "high" || litCount >= 4);

    if (f.drop) {
      v.sinceDrop = 0;
      if (gone() + night.queue < most) {
        if (night.queue === 0) night.wait = 0.35;
        night.queue++;
      }
    } else v.sinceDrop += dt;

    // one case at a time: the one the camera is looking at (the camera finds the gallery if it sees none)
    if (dying < 0 && night.queue > 0) {
      night.wait -= dt;
      if (night.wait <= 0) {
        const cam = ctx.camera;
        const aspect = (u.uRes.value as THREE.Vector2).x / Math.max(1, (u.uRes.value as THREE.Vector2).y);
        let pick = cam ? caseInView(cam, u.uDolly.value as number, aspect) : -1;
        if (pick < 0) {
          const alive = night.dead.map((d, j) => (d < 0 ? j : -1)).filter((j) => j >= 0);
          pick = alive.length ? alive[Math.floor(Math.random() * alive.length)] : -1;
          if (pick >= 0) cam?.request("aisle");
        }
        if (pick >= 0) night.dead[pick] = 0;
        night.queue = pick >= 0 ? night.queue - 1 : 0;
        night.wait = bar * 0.5;
      }
    }

    // Each case: its lamp and its bust. A dying lamp flickers (unless flashes are limited), the bust crumbles from
    // the top of the head down, then the lamp dies down to its remnant.
    const life = u.uLife.value as number[];
    const crumble = u.uCrumble.value as number[];
    let die = -1;
    let dieC = 0;
    for (let j = 0; j < N; j++) {
      const d = night.dead[j];
      if (d < 0) {
        life[j] = 1;
        crumble[j] = 0;
        continue;
      }
      const c = ease((d - 0.8) / (3 * bar));
      crumble[j] = c;
      let l = 1 + (REMNANT - 1) * ease((d - 2.2 * bar) / (2.3 * bar));
      if (!f.safeFlash && d < 1.4) l *= hash(Math.floor(d * 11) + j * 31) > 0.45 ? 1 : 0.15;
      life[j] = l;
      if (c > 0 && c < 1) {
        die = j;
        dieC = c;
      }
    }
    life[N] = 1;
    crumble[N] = 0;
    u.uDie.value = die;
    u.uDieC.value = dieC;
    if (die >= 0) dustGrains(u.uDust.value as THREE.Vector4[], die, dieC, 3 * bar, f.onsetPulse);

    u.uWave.value = f.beat ? 0 : (u.uWave.value as number) + dt;
    // the drop: every lamp dips (a soft dimming, never a flash) and the dust is stirred up
    const t = v.sinceDrop;
    u.uDip.value = (1 - Math.exp(-t * (f.safeFlash ? 3 : 6))) * Math.exp(-t / (1.5 * bar));
    u.uStir.value = (1 - Math.exp(-t * 3)) * Math.exp(-t / (4 * bar));
    // the build thickens the dust in the beams, and so does the night
    const haze = 1 + 0.6 * (f.section === "build" ? f.buildProgress : 0) + 0.4 * f.drift;
    v.haze += (haze - v.haze) * (1 - Math.exp(-dt / bar));
    u.uHaze.value = v.haze;
    u.uSafe.value = f.safeFlash ? 1 : 0;
    u.uDolly.value = ctx.camera ? dolly(ctx.camera, f.time, seed) : 0;
  },
  fragment: /* glsl */ `
uniform float uLife[${N + 1}];    // each case's lamp, 0..1 (the last one: the human head)
uniform float uCrumble[${N + 1}]; // 0 the bust is whole .. 1 nothing left but a little heap of dust
uniform float uDie;     // the case crumbling now (-1: none)
uniform float uDieC;    // how far it has crumbled
uniform vec4 uDust[${DUST}];  // its grains in the air: position, brightness
uniform float uWave;    // seconds since the kick
uniform float uDip;     // the drop dims every lamp a little
uniform float uStir;    // the drop stirs up the dust
uniform float uHaze;    // dust in the air (the build, the night)
uniform float uShift;   // which bust each case holds
uniform float uSafe;    // limited flashes
uniform float uDolly;   // the wide views glide along the aisle
${ART_LIB}
${HEAD_GLSL}
${headSlotGLSL("B")}
${headSlotGLSL("C")}
${headSlotGLSL("D")}
${CAMERA_GLSL}
${DETAIL_GLSL}
const float SP = ${f3(SP)};
const float Z0 = ${f3(Z0)};
const float XC = ${f3(XC)};
const float ZH = ${f3(ZH)};
const int NJ = ${N + 1};
const int NA = ${N};
const float HC = 3.7;            // height of the lamps
const float YP = ${f3(YP)};            // top of the plinths
const float CW = ${f3(CW)};           // half width of a glass case, and of its plinth
const float YT = YP + 2. * CW;   // top of the glass
const float S = ${f3(S)};            // scale of the busts
const float CUT = ${f3(CUT)};         // the busts are cut flat under the neck (head frame)
const float SOC = ${f3(SOC)};           // the little block each bust stands on
const float YB = YP + SOC - CUT * S;
const float SH = SOC / S * .5;   // half height of the block, head frame
const vec3 HB_C = vec3(0., (1. + CUT - 2. * SH) * .5, 0.);      // the bust's box, head frame
const vec3 HB_B = vec3(.8, (1. - CUT + 2. * SH) * .5, .88);
const float LAMP = 6.;
const float R0 = .05;            // radius of a beam at its lamp…
const float TB = .2;             // …and how it widens
const float WX = 3.9;            // the side walls
const float ZB = ZH - 2.6;       // the back wall, behind the human head
const float ZF = Z0 + 6.;        // the entrance
const vec3 GAL_C = vec3(0., YT * .5, (Z0 + ZH) * .5);           // the box round all the cases
const vec3 GAL_B = vec3(XC + CW + .02, YT * .5 + .01, (Z0 - ZH) * .5 + CW + .02);

float gBreath;   // the lamps' breath (kick) and dip (drop)
vec3 gLamp;      // colour of their light
float gPk;       // size of a pixel per unit of distance
float gMat;      // what the bust's field hit: 0 marble, 1 its block, 2 the heap of dust
float gSeedC;
float gK = .25;  // how much the crumbling front's field is shrunk: a safe step for the march, 1 for shading

vec2 caseXZ(int j) { return j >= NA ? vec2(0., ZH) : vec2(j % 2 == 0 ? -XC : XC, Z0 - float(j / 2) * SP); }
/** The busts face the aisle, turned a little toward the entrance. */
float caseYaw(int j) { return j >= NA ? 0. : (j % 2 == 0 ? 1.13 : -1.13) + (hash12(vec2(float(j) * 7.3, uSeed)) - .5) * .35; }
int caseAnimal(int j) { return j >= NA ? 4 : (j / 2 + 2 * (j % 2) + int(uShift)) % 4; }
/** Each lamp hangs over the aisle side of its case, in front of the bust, and aims at it. */
vec3 lampPos(int j) {
  vec2 c = caseXZ(j);
  return j >= NA ? vec3(0., HC, c.y + .9) : vec3(c.x + (j % 2 == 0 ? .7 : -.7), HC, c.y + .35);
}
vec3 beamDir(int j) { vec2 c = caseXZ(j); return normalize(vec3(c.x, YP + .3, c.y) - lampPos(j)); }
float lampI(int j) { return uLife[j] * gBreath; }
int cellOf(float z) { return clamp(int(floor((Z0 + SP * .5 - z) / SP)), 0, 7); }

vec3 safeInv(vec3 d) { return 1. / mix(d, vec3(1e-5), step(abs(d), vec3(1e-5))); }
vec2 boxT(vec3 ro, vec3 ird, vec3 c, vec3 b) {
  vec3 t0 = (c - b - ro) * ird, t1 = (c + b - ro) * ird;
  vec3 mn = min(t0, t1), mx = max(t0, t1);
  return vec2(max(max(mn.x, mn.y), mn.z), min(min(mx.x, mx.y), mx.z));
}
vec3 boxNormal(vec3 q, vec3 b) {
  vec3 a = abs(q) / b;
  return a.x > a.y && a.x > a.z ? vec3(sign(q.x), 0., 0.) : a.y > a.z ? vec3(0., sign(q.y), 0.) : vec3(0., 0., sign(q.z));
}

/** The light of lamp j at P (its round of light, falling off with distance) and the way to the lamp. */
float lampE(int j, vec3 P, out vec3 l) {
  vec3 v = P - lampPos(j);
  float d2 = dot(v, v);
  l = -v * inversesqrt(d2);
  float s = dot(v, beamDir(j));
  if (s <= 0.) return 0.;
  float r = R0 + s * TB;
  float p2 = (d2 - s * s) / (r * r);
  // the round of light, and the softer spill around it that reaches the floor and the plinths
  return lampI(j) * LAMP * (exp(-p2) + .3 * exp(-p2 * .14)) / d2;
}

/** The light the lit cases nearby bounce around (their pale tops, their busts): a soft glow round each. */
float bounce(vec3 p) {
  int i = cellOf(p.z);
  float b = 0.;
  for (int q = 0; q < 2; q++) {
    if (i == 7 && q == 1) break;
    int j = i == 7 ? NA : 2 * i + q;
    vec2 cc = caseXZ(j);
    vec3 d = p - vec3(cc.x, YP, cc.y);
    b += lampI(j) / (1. + dot(d, d) * 2.5);
  }
  return b * .12;
}

vec3 toCase(int j, vec3 p) {
  vec2 c = caseXZ(j);
  vec3 h = vec3(p.x - c.x, p.y - YB, p.z - c.y);
  h.xz *= rot(caseYaw(j));
  return h / S;
}

/** Where the bust has already turned to dust: above this height (head frame), within .24 of its mean height. */
float crumbleBase(float c) { return mix(1.1, CUT - .12, c); }
float crumbleFront(vec3 h, float c) {
  return crumbleBase(c) + (vnoise(h * 2.6 + gSeedC) - .5) * .32 + (vnoise(h * 9. + gSeedC) - .5) * .16;
}

/** A bust of the gallery in its own frame: bust k (4: the human head), crumbled by c, on its little block. */
float bust(vec3 h, int k, float c) {
  float d;
  if (k == 0) d = headD(h);
  else if (k == 1) d = headDB(h);
  else if (k == 2) d = headDC(h);
  else if (k == 3) d = headDD(h);
  else d = sdHead(h);
  d = max(d, CUT - h.y);
  if (c > 0.) {
    // the front's noise is steep: shrunk so that the march never overshoots, but only within its band (outside it,
    // the distance to the band is enough, and the march keeps its long steps through what has gone)
    float y = h.y - crumbleBase(c);
    d = max(d, abs(y) > .26 ? y - sign(y) * .24 : (h.y - crumbleFront(h, c)) * gK);
  }
  gMat = 0.;
  float soc = sdBox(h - vec3(0., CUT - SH, 0.), vec3(.45, SH, .45));
  if (soc < d) { d = soc; gMat = 1.; }
  if (c > .03) {
    float heap = sdEllipsoid(h - vec3(0., CUT, .04), vec3(.66, .2, .6) * sqrt(c));
    if (heap < .05) heap += .02 * vnoise(h * 14.);
    if (heap < d) { d = heap; gMat = 2.; }
  }
  return d;
}

float marchBust(vec3 ro, vec3 rd, vec2 span, int k, float c) {
  float t = span.x;
  for (int i = 0; i < 64; i++) {
    float d = bust(ro + rd * t, k, c);
    if (d < max(.0005, t * gPk * .4)) return t;
    t += d * .9;
    if (t > span.y) break;
  }
  return -1.;
}

vec3 shadeBust(int j, vec3 ro, vec3 rd, float th) {
  int k = caseAnimal(j);
  float c = uCrumble[j];
  float yaw = caseYaw(j);
  gSeedC = float(j) * 3.7 + uSeed;
  vec3 rdh = rd;
  rdh.xz *= rot(yaw);
  vec3 h = toCase(j, ro) + rdh * th;
  float pix = th * gPk;
  float e = clamp(pix * .8, .0012, .01);
  const vec2 kk = vec2(1, -1);
  vec3 n = normalize(kk.xyy * bust(h + kk.xyy * e, k, c) + kk.yyx * bust(h + kk.yyx * e, k, c) +
                     kk.yxy * bust(h + kk.yxy * e, k, c) + kk.xxx * bust(h + kk.xxx * e, k, c));
  bust(h, k, c);
  float mat = gMat;
  gK = 1.;
  float ao = 0., sca = 1.;
  for (int i = 0; i < 4; i++) {
    float hh = .03 + .1 * float(i);
    ao += (hh - bust(h + n * hh, k, c)) * sca;
    sca *= .8;
  }
  ao = clamp(1. - 2. * ao, 0., 1.);
  vec3 nw = n;
  nw.xz *= rot(-yaw);
  vec3 p = ro + rd * th * S;
  vec3 l;
  float E = lampE(j, p, l);
  // the lamp is high and in front: the brow shades the eyes, the muzzle the chest
  vec3 lh = l;
  lh.xz *= rot(yaw);
  float sh = 1.;
  if (E > .003) {
    float t = .04;
    for (int i = 0; i < 12; i++) {
      float d = bust(h + n * .01 + lh * t, k, c);
      sh = min(sh, 8. * d / t);
      t += clamp(d, .04, .3);
      if (sh < .02 || t > 2.2) break;
    }
    sh = clamp(sh, 0., 1.);
  }
  float dif = max(dot(nw, l), 0.);
  vec3 gold = mix(vec3(1., .74, .32), uAccent, .3);
  vec3 spec = gLamp * E * sh * pow(max(dot(reflect(rd, nw), l), 0.), 24.);
  vec3 col;
  if (mat > 1.5) {
    // the heap of dust: grey stone powder, no shine
    vec3 base = uInk * vec3(.6, .58, .55) * (.75 + .5 * vnoise(h * 40.));
    col = base * (gLamp * E * (.3 + .7 * dif) * sh + .02) * ao;
  } else if (mat > .5) {
    vec3 base = uBase * 1.4 + vec3(.018, .016, .014);
    col = base * (gLamp * E * dif * sh + .02) * ao + spec * .12;
  } else {
    // Marble: a stone whose tint drifts slightly, veins of colour, a key light that wraps a little (marble lets
    // some light through), cool shadows
    float v = fbm3(h * 2.2 + gSeedC);
    float s = abs(sin(h.x * 3. + h.y * 2. + v * 7.));
    float vein = 1. - smoothstep(0., .1 + fwidth(s), s);
    vec3 tint = uInk * mix(vec3(1., .96, .9), vec3(.95, .93, 1.), vnoise(h * 1.3 + 3.));
    vec3 base = mix(tint, mix(gold, uAccent, .4) * .85, vein * .4);
    base *= 1. + (vnoise(h * 110.) - .5) * .08 * resolved(.009, pix);
    float wrap = max((dot(nw, l) + .25) / 1.25, 0.);
    col = base * (gLamp * E * mix(wrap, dif, .6) * sh + vec3(.5, .6, .85) * .025 * (.6 + .4 * nw.y) + gLamp * .008) * ao;
    col += spec * .18;
    // the stone turning to dust: grey and cracked just under the front
    if (c > 0.) {
      float fr = crumbleFront(h, c);
      float old = smoothstep(fr - .5, fr - .02, h.y);
      float cv = abs(vnoise(h * 9. + gSeedC) - .5);
      float crack = (1. - smoothstep(0., .01 + fwidth(cv) * 1.5, cv)) * smoothstep(.45, .7, vnoise(h * 3. + gSeedC + 4.));
      float lum = dot(col, vec3(.3, .59, .11));
      col = mix(col, vec3(lum) * vec3(.92, .9, .88) * .75, old * .8);
      col *= 1. - crack * old * .6;
      // the grain of the stone coming apart
      col *= 1. - .35 * old * vnoise(h * 60.) * resolved(.02, pix);
    }
  }
  // a faint rim from the gallery's light, so that the silhouette parts from the dark
  col += gLamp * .02 * pow(1. - abs(dot(nw, rd)), 3.) * ao * (.3 + lampI(j));
  return col;
}

vec3 shadePlinth(int j, vec3 p, vec3 rd, float t) {
  vec2 cc = caseXZ(j);
  vec3 n = boxNormal(p - vec3(cc.x, YP * .5, cc.y), vec3(CW, YP * .5, CW));
  vec3 l;
  float E = lampE(j, p, l);
  float dif = max(dot(n, l), 0.);
  // dark grey stone, darker toward the floor; a paler top under the glass
  vec3 base = n.y > .5 ? uInk * .32 : mix(uBase * 2., uInk, .12);
  vec3 col = base * (gLamp * (E * dif + bounce(p)) + .02) * mix(.35, 1., smoothstep(0., .4, p.y));
  col += gLamp * E * pow(max(dot(reflect(rd, n), l), 0.), 50.) * .2;
  // the top edge catches the light: a thin line
  float pw = t * gPk;
  float line = clamp((.003 + pw * .5 - (YP - p.y)) / pw, 0., 1.) * min(1., .006 / pw);
  col += gLamp * E * line * .5 * (1. - abs(n.y));
  return col;
}

/** One face of a glass case: what it reflects (a streak of its lamp), its edges catching the light. */
void glassFace(int j, vec3 ro, vec3 rd, float t, inout vec3 gT, inout vec3 gAdd) {
  vec2 cc = caseXZ(j);
  vec3 p = ro + rd * t;
  vec3 q = p - vec3(cc.x, YP + CW, cc.y);
  vec3 n = boxNormal(q, vec3(CW));
  float fre = .04 + .96 * pow(1. - abs(dot(n, rd)), 5.);
  vec3 r = reflect(rd, n);
  vec3 l;
  float E = lampE(j, p, l);
  float lampDir = max(dot(r, normalize(lampPos(j) - p)), 0.);
  vec3 refl = uBase * .25 + gLamp * lampI(j) * (pow(lampDir, 300.) * 6. + pow(lampDir, 8.) * .05);
  // the edges: the distance to the nearest edge of this face is the second smallest margin
  vec3 m = CW - abs(q);
  float edge = m.x + m.y + m.z - min(m.x, min(m.y, m.z)) - max(m.x, max(m.y, m.z));
  float pw = t * gPk;
  float line = clamp((.002 + pw * .5 - edge) / pw, 0., 1.) * min(1., .004 / pw);
  gAdd += gT * (refl * fre + gLamp * line * (E * .22 + .01));
  gT *= .93;
}

float erfa(float x) { return tanh(clamp(x * 1.2, -8., 8.)); }

/**
 * Beam j seen along a ray up to tEnd: the light the dust scatters toward the eye (the Gaussian beam integrated in
 * closed form), the small spot of its lamp, and (motes) the specks of dust drifting in it, which glint on the hats.
 */
float beam(int j, vec3 ro, vec3 rd, float tEnd, bool motes) {
  float I = lampI(j);
  if (I < .002) return 0.;
  vec3 L = lampPos(j), D = beamDir(j);
  float sLen = (L.y - YP) / -D.y;
  vec3 w = ro - L;
  float b = dot(rd, D), e = dot(D, w);
  float den = max(1. - b * b, 1e-3);
  float tc = (b * e - dot(rd, w)) / den;
  float sc = e + b * tc;
  float r = R0 + clamp(sc, 0., sLen) * TB;
  vec3 q = w + rd * tc - D * sc;
  float dm2 = dot(q, q);
  float acc = 0.;
  float tl = -dot(w, rd);
  if (tl > 0. && tl < tEnd) acc += exp(-(dot(w, w) - tl * tl) / .0012) * (.15 + 3. * pow(max(-b, 0.), 12.));
  if (dm2 > r * r * 6.) return I * acc;
  float ta = 0., tb = tEnd;
  if (abs(b) > 1e-4) {
    float t0 = -e / b, t1 = (sLen - e) / b;
    ta = max(ta, min(t0, t1));
    tb = min(tb, max(t0, t1));
  } else if (e < 0. || e > sLen) tb = -1.;
  if (tb > ta) {
    float sig = r * inversesqrt(den);
    float g = .886 * sig * (erfa((tb - tc) / sig) - erfa((ta - tc) / sig));
    acc += exp(-dm2 / (r * r)) * g / (r * r + .06) * .04 * uHaze;
  }
  if (motes) {
    vec3 U = normalize(cross(D, vec3(0., 0., 1.)));
    vec3 V = cross(D, U);
    float sTop = .3, sBot = (L.y - YT - .03) / -D.y;
    float stir = clamp(uStir * 1.5 + (uHaze - 1.) * 1.2, 0., 1.);
    float sum = 0.;
    for (int m = 0; m < 16; m++) {
      float vis = m < 9 ? 1. : clamp(stir * 3. - float(m - 9) * .4, 0., 1.);
      if (vis <= 0.) break;
      float fm = float(m + 16 * j);
      vec4 hh = fract(hash12(vec2(fm, 3.7)) * vec4(1., 13.37, 71.9, 191.3) + vec4(0., .31, .57, .83));
      float life = fract(hh.x + uTime * (.004 + .01 * hh.w) * (1. + 2. * uStir));
      float s = mix(sTop, sBot, life);
      float rs = R0 + s * TB;
      float a = hh.y * 6.2832 + uTime * (hh.w - .5) * .25 * (1. + 3. * uStir);
      float rr = sqrt(hh.z) * .85;
      vec3 M = L + D * s + (U * cos(a) + V * sin(a)) * rr * rs;
      vec3 v = M - ro;
      float t = dot(v, rd);
      if (t < .05 || t > tEnd) continue;
      float d2 = dot(v, v) - t * t;
      float rad = max(.0011, t * gPk * .7);
      float k = .0011 / rad;
      float glint = step(.7, fract(hh.w * 31.7 + floor(uTime * 7.) * .618)) * uHat * (1. - .5 * uSafe);
      sum += exp(-d2 / (rad * rad)) * k * k * exp(-rr * rr) * sin(3.1416 * life) * (.5 + 4. * glint) * vis / (rs * rs + .06);
    }
    acc += sum * .5;
  }
  return I * acc;
}

/** The grains of the crumbling bust (placed by the CPU): specks in the light of its case. */
float crumbleDust(vec3 ro, vec3 rd, float tEnd) {
  float sum = 0.;
  for (int m = 0; m < ${DUST}; m++) {
    vec4 g = uDust[m];
    if (g.w <= 0.) continue;
    vec3 v = g.xyz - ro;
    float t = dot(v, rd);
    if (t < .05 || t > tEnd) continue;
    float d2 = dot(v, v) - t * t;
    float r = max(.0016, t * gPk * .7);
    float k = .0016 / r;
    sum += exp(-d2 / (r * r)) * k * k * g.w;
  }
  return sum;
}

/** What the polished floor reflects: the plinths and the beams. */
vec3 reflected(vec3 ro, vec3 rd) {
  vec3 ird = safeInv(rd);
  float tEnd = 40.;
  vec3 c = vec3(0.);
  vec2 g = boxT(ro, ird, GAL_C, GAL_B);
  if (g.y > max(g.x, 0.)) {
    int ia = cellOf(ro.z + rd.z * max(g.x, 0.)), ib = cellOf(ro.z + rd.z * g.y);
    int dir = ib >= ia ? 1 : -1;
    for (int n = 0; n < 8; n++) {
      int i = ia + n * dir;
      float best = tEnd;
      int bj = -1;
      for (int q = 0; q < 2; q++) {
        if (i == 7 && q == 1) break;
        int j = i == 7 ? NA : 2 * i + q;
        vec2 cc = caseXZ(j);
        vec2 tp = boxT(ro, ird, vec3(cc.x, YP * .5, cc.y), vec3(CW, YP * .5, CW));
        if (tp.x < tp.y && tp.x > 0. && tp.x < best) { best = tp.x; bj = j; }
      }
      if (bj >= 0) {
        tEnd = best;
        c += shadePlinth(bj, ro + rd * best, rd, best);
        break;
      }
      if (i == ib) break;
    }
  }
  float hz = 0.;
  for (int j = 0; j < NJ; j++) hz += beam(j, ro, rd, tEnd, false);
  return c + gLamp * hz * 1.6;
}

vec3 shadeFloor(vec3 p, vec3 rd, float t) {
  int i = cellOf(p.z);
  int i2 = clamp(p.z < Z0 - float(i) * SP ? i + 1 : i - 1, 0, 7);
  float E = 0., ao = 1.;
  for (int q = 0; q < 4; q++) {
    int ci = q < 2 ? i : i2;
    if (q >= 2 && i2 == i) break;
    if (ci == 7 && (q & 1) == 1) continue;
    int j = ci == 7 ? NA : 2 * ci + (q & 1);
    vec3 l;
    float e = lampE(j, p, l) * max(l.y, 0.);
    // the plinth's shadow: where the way to the lamp crosses the top of the plinth
    vec3 L = lampPos(j);
    vec2 cc = caseXZ(j);
    vec2 dq = abs(p.xz + (L.xz - p.xz) * (YP / L.y) - cc) - CW;
    e *= smoothstep(-.01, .05, length(max(dq, 0.)) + min(max(dq.x, dq.y), 0.));
    E += e;
    vec2 dp = abs(p.xz - cc) - CW;
    ao = min(ao, mix(.3, 1., smoothstep(0., .35, length(max(dp, 0.)) + min(max(dp.x, dp.y), 0.))));
  }
  // polished dark stone in big slabs
  vec2 tile = p.xz / 1.2;
  vec2 fw = fwidth(tile);
  vec2 gq = abs(fract(tile) - .5);
  float seam = max(smoothstep(.494 - fw.x, .494 + fw.x, gq.x), smoothstep(.494 - fw.y, .494 + fw.y, gq.y)) * (1. - smoothstep(.05, .2, max(fw.x, fw.y)));
  vec3 alb = (uBase * 1.5 + uInk * .035) * (.85 + .3 * vnoise(vec3(p.xz * .7, 2.))) * (1. - .4 * seam);
  vec3 col = alb * (gLamp * (E + bounce(p)) + .01) * ao;
  // the wax is not quite flat: soft, wavering reflections
  vec3 n = normalize(vec3((vnoise(vec3(p.xz * 1.7, 1.)) - .5) * .05, 1., (vnoise(vec3(p.xz * 1.7, 7.)) - .5) * .05));
  vec3 r = reflect(rd, n);
  float fre = .03 + .97 * pow(1. - max(-rd.y, 0.), 5.);
  col += reflected(p + vec3(0., .001, 0.), r) * fre * .9 * (1. - .5 * seam) * ao;
  return col;
}

/** The walls: dark panelling, and the faint glow the nearest pools of light throw on them. */
vec3 shadeWall(vec3 p, int side) {
  float E = 0.;
  if (side == 2) {
    float d = length(p - vec3(0., 1., ZH));
    E = lampI(NA) * .6 / (1. + d * d);
  } else {
    int i = cellOf(p.z);
    for (int q = 0; q < 3; q++) {
      int ci = clamp(i - 1 + q, 0, 7);
      int j = ci == 7 ? NA : 2 * ci + (p.x > 0. ? 1 : 0);
      vec2 cc = caseXZ(j);
      vec3 dv = p - vec3(cc.x, 1., cc.y);
      E += lampI(j) * .3 / (1. + dot(dv, dv) * 1.2);
    }
  }
  float u = side == 2 ? p.x : p.z;
  float fw = fwidth(u / 1.3);
  float groove = smoothstep(.48 - fw, .48 + fw, abs(fract(u / 1.3) - .5)) * (1. - smoothstep(.05, .2, fw));
  vec3 base = (uBase * .9 + vec3(.004, .0035, .003)) * (1. - .5 * groove);
  return base * (gLamp * E + .003) * mix(.6, 1., smoothstep(0., 1.5, p.y));
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  gPk = 1. / (uRes.y * uFocal);
  // the wide views glide along the aisle; never inside a row
  vec3 ro = uCamPos, ta = uCamTarget;
  ro.z += uDolly;
  ta.z += uDolly;
  ro.x = mix(1.1 * tanh(ro.x / 1.1), ro.x, smoothstep(1.9, 2.4, ro.y));
  vec3 rd = lookAt(ro, ta) * normalize(vec3(uv, uFocal));
  vec3 ird = safeInv(rd);
  float w = uWave;
  gBreath = (1. + .07 * (1. - exp(-w * 25.)) * exp(-w * 3.5) * (1. - .5 * uSafe)) * (1. - .3 * uDip);
  gLamp = mix(vec3(1., .86, .66), uAccent, .25);

  // The room: floor, side walls, back wall and entrance
  float tF = rd.y < 0. ? -ro.y / rd.y : 1e4;
  float tW = abs(rd.x) > 1e-5 ? (sign(rd.x) * WX - ro.x) / rd.x : 1e4;
  float tZ = rd.z < 0. ? (ZB - ro.z) / rd.z : (ZF - ro.z) / max(rd.z, 1e-5);
  float tBest = min(tF, min(tW, tZ));
  int room = tF <= min(tW, tZ) ? 0 : tW < tZ ? 1 : 2;
  int hitJ = -1, hitKind = 0;   // 1 a plinth, 2 a bust
  float tHead = 0.;
  vec3 gT = vec3(1.), gAdd = vec3(0.);

  // The cases, cell by cell in the order the ray meets them: only the busts whose glass the ray enters are marched
  vec2 g = boxT(ro, ird, GAL_C, GAL_B);
  if (g.y > max(g.x, 0.) && g.x < tBest) {
    int ia = cellOf(ro.z + rd.z * max(g.x, 0.)), ib = cellOf(ro.z + rd.z * min(g.y, tBest));
    int dir = ib >= ia ? 1 : -1;
    for (int n = 0; n < 8; n++) {
      int i = ia + n * dir;
      vec2 tg0 = vec2(1e4, -1e4), tg1 = vec2(1e4, -1e4);
      for (int q = 0; q < 2; q++) {
        if (i == 7 && q == 1) break;
        int j = i == 7 ? NA : 2 * i + q;
        vec2 cc = caseXZ(j);
        vec2 tp = boxT(ro, ird, vec3(cc.x, YP * .5, cc.y), vec3(CW, YP * .5, CW));
        if (tp.x < tp.y && tp.y > 0. && tp.x < tBest) { tBest = max(tp.x, 0.); hitJ = j; hitKind = 1; }
        vec2 tg = boxT(ro, ird, vec3(cc.x, YP + CW, cc.y), vec3(CW));
        if (q == 0) tg0 = tg; else tg1 = tg;
        if (tg.x < tg.y && tg.y > 0. && tg.x < tBest) {
          vec3 rdh = rd;
          rdh.xz *= rot(caseYaw(j));
          vec3 roh = toCase(j, ro);
          vec2 th = boxT(roh, safeInv(rdh), HB_C, HB_B);
          th.x = max(th.x, 0.);
          th.y = min(th.y, tBest / S);
          if (th.y > th.x) {
            float t = marchBust(roh, rdh, th, caseAnimal(j), uCrumble[j]);
            if (t > 0.) { tBest = t * S; tHead = t; hitJ = j; hitKind = 2; }
          }
        }
      }
      // the glass of this cell, in front of what the ray hit
      for (int q = 0; q < 2; q++) {
        if (i == 7 && q == 1) break;
        int j = i == 7 ? NA : 2 * i + q;
        vec2 tg = q == 0 ? tg0 : tg1;
        if (tg.x < tg.y && tg.y > 0.) {
          if (tg.x > 0. && tg.x < tBest) glassFace(j, ro, rd, tg.x, gT, gAdd);
          if (tg.y < tBest) glassFace(j, ro, rd, tg.y, gT, gAdd);
        }
      }
      if (hitJ >= 0 || i == ib) break;
    }
  }

  vec3 p = ro + rd * tBest;
  vec3 col;
  if (hitKind == 2) col = shadeBust(hitJ, ro, rd, tHead);
  else if (hitKind == 1) col = shadePlinth(hitJ, p, rd, tBest);
  else if (tBest < 1e3) col = room == 0 ? shadeFloor(p, rd, tBest) : shadeWall(p, room);
  else col = uBase * .25;
  col = col * gT + gAdd;
  // the depth of the gallery
  col = mix(uBase * .25 + gLamp * .003 * uHaze, col, exp(-tBest * .02));

  // the beams and the dust in them
  float hz = 0.;
  for (int j = 0; j < NJ; j++) hz += beam(j, ro, rd, tBest, true);
  col += gLamp * hz;

  // the bust crumbling: its grains falling, a haze of dust in its glass
  if (uDie >= 0.) {
    int j = int(uDie + .5);
    vec2 cc = caseXZ(j);
    vec2 tg = boxT(ro, ird, vec3(cc.x, YP + CW, cc.y), vec3(CW));
    if (tg.x < tg.y && tg.y > 0. && tg.x < tBest) {
      float I = lampI(j) * .8 + .05;
      col += gLamp * I * crumbleDust(ro, rd, tBest) * 1.2;
      float chord = min(tg.y, tBest) - max(tg.x, 0.);
      col += gLamp * I * chord * sin(3.1416 * uDieC) * .15;
    }
  }

  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
