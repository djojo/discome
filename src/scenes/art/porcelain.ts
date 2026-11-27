import * as THREE from "three";
import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { num } from "../utils";
import { ART_LIB, MARCH } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";
import { HEAD_GLSL, headGrid, headParam, headsOf, headUniforms, setHead, TITLE_HEAD, type HeadId } from "./heads";
import { DETAIL_GLSL } from "./detail.glsl";
import { SKY_GLSL } from "./sky.glsl";
import { wantCloudNoise } from "./cloudnoise";
import { Casting, pick } from "./casting";
import type { ParamDef } from "../types";

/** Framings round the bust (world space: the head's centre near y = 0, the sea of clouds far below). */
const FRAMINGS: Framing[] = [
  { az: 0.5, el: 0.06, dist: 4.4, target: [0, -0.15, 0], focal: 1.95, weight: 3 },
  { az: 1.45, el: 0.03, dist: 4.2, target: [0, -0.12, 0], focal: 2.1, weight: 2 },
  { az: 0.32, el: 0.05, dist: 2.3, target: [0.1, -0.06, 0.32], focal: 2.2, weight: 2 },
  // low, the bust high above the sea of clouds, the white sky behind it
  { az: -0.4, el: -0.12, dist: 6.5, target: [0, -0.5, 0], focal: 1.75, weight: 2 },
  // face to face, close: the canon's lines on the face
  { az: 0, el: 0.02, dist: 3, target: [0, 0, 0.1], focal: 2.1, weight: 2 },
  // (pulled back: the halves and the shards spread wide)
  { az: 0.15, el: 0.62, dist: 4.2, target: [0, 0.02, 0.05], focal: 1.9, weight: 3, tag: "open" },
  { az: 0.02, el: 0.1, dist: 4.6, target: [0, -0.05, 0], focal: 1.95, weight: 2, tag: "open" },
  { az: -0.7, el: 0.3, dist: 4, target: [0, 0, 0], focal: 1.9, weight: 2, tag: "open" },
  // The night's title: from the front, so that it always reads (its centre sits at y = -.07)
  { az: 0, el: 0.05, dist: 4.1, target: [0, -0.07, 0], focal: 1.95, weight: 3, tag: "title" },
  { az: 0.24, el: 0.12, dist: 4.4, target: [0.05, -0.07, 0], focal: 1.95, weight: 2, tag: "title" },
  { az: -0.26, el: -0.02, dist: 4, target: [-0.05, -0.07, 0], focal: 1.95, weight: 2, tag: "title" },
  { az: 0.4, el: 0.26, dist: 4.9, target: [0, -0.07, -0.15], focal: 1.9, weight: 2, tag: "title-open" },
  { az: -0.36, el: 0.16, dist: 4.7, target: [0, -0.07, -0.15], focal: 1.9, weight: 2, tag: "title-open" },
];

/**
 * "A bust of Antiquity, another one on each return": the portraits of Rome and Greece and their archetypes, drawn by
 * the scene itself (its plans share the draw: one never shows the bust another has just shown, nor one of the last
 * few). Only the first loads with the world; the next one loads while a bust plays.
 */
const ANTIQUE = "antique";
const BUSTS: HeadId[] = [...headsOf("visage"), ...headsOf("archetype")].filter((h) => h !== "humain" && h !== "patron");
// (portraits the Assembly's gods already load: the world downloads nothing more for them)
const FIRST: HeadId[] = ["hera"];
const recent: HeadId[] = [];
const busts = new Casting(FIRST, (avoid) => pick(BUSTS, 1, [...avoid, ...recent]), 1);
/** Each instance's passage: its seed (redrawn when it comes back on screen), its bust. */
const passes = new WeakMap<object, { seed: number; head: HeadId }>();
const head = headParam();
const headChoice: ParamDef =
  head.type === "select"
    ? { ...head, options: [{ value: ANTIQUE, label: "Buste antique (un autre à chaque retour)" }, ...head.options], default: ANTIQUE }
    : head;

/**
 * Le Ciel intérieur: a bust of Antiquity floats high above a sea of clouds, in the white sky of Olympe. Its marble
 * skin holds a sky: clouds drift slowly through the stone (a double exposure); its eyes are a statue's, empty.
 * Through the build the canon of proportions draws itself over its face in graphite, stroke after stroke; on the drop
 * it opens, in two halves like a shell or in floating shards, onto the sky it holds and the sun inside it, whose light
 * pours out through the seam; it closes again through the breakdown. The bust only turns, very slowly: the music
 * drives the light (the seam, the sun, the shafts, the gold dust).
 */
export const porcelain = defineShaderScene({
  id: "porcelain",
  name: "Le Ciel intérieur",
  tag: "Visage",
  energy: "calm",
  hdr: true,
  renderScale: 0.75,
  mask: true,
  heads: (p) => (p.head === ANTIQUE ? FIRST : []),
  camera: { framings: FRAMINGS, glideBars: 2 },
  description:
    "Un buste antique flotte au-dessus d'une mer de nuages ; des nuages passent dans sa peau de marbre. À la montée, le canon des proportions se trace sur son visage ; au drop, il s'ouvre en coquille ou en éclats sur le ciel qu'il contient et le soleil qui brille dedans.",
  params: [
    paletteParam("olympe"),
    headChoice,
    {
      type: "select",
      key: "style",
      label: "Ouverture",
      options: [
        { value: "alternate", label: "Alterner" },
        { value: "shell", label: "Coquille" },
        { value: "shards", label: "Éclats" },
      ],
      default: "alternate",
    },
    { type: "range", key: "open", label: "Amplitude", min: 0, max: 1.5, step: 0.05, default: 1 },
    { type: "range", key: "sky", label: "Ciel dans la pierre", min: 0, max: 1, step: 0.05, default: 0.85 },
    { type: "range", key: "canon", label: "Canon (lignes)", min: 0, max: 1, step: 0.05, default: 1 },
    { type: "toggle", key: "letterbox", label: "Format cinéma 2.39 (bandes noires)", default: false },
  ],
  uniforms: () => ({
    ...wantCloudNoise(),
    ...headUniforms(),
    uOpen: { value: 0 },
    uOpenVel: { value: 0 },
    uAmp: { value: 1 },
    uLeak: { value: 0 },
    uCanon: { value: 0 },
    uCanonMax: { value: 1 },
    uSky: { value: 0.85 },
    uWave: { value: 9 },
    uCinema: { value: 0 },
    uMode: { value: Math.random() < 0.5 ? 0 : 1 },
    uWasOpen: { value: 0 },
    uTitle: { value: 0 },
    // the framing's fit to a tall headdress: zoom, lift
    uFit: { value: new THREE.Vector2(1, 0) },
  }),
  update(u, f, p, dt, ctx) {
    // The night's title instead of a head: in bands about a letter wide, which drift apart on the drop
    const title = p.head === TITLE_HEAD;
    let id = p.head;
    if (id === ANTIQUE) {
      const seed = u.uSeed.value as number;
      let pass = passes.get(u);
      if (!pass || pass.seed !== seed) {
        const [h] = busts.pass();
        recent.push(h);
        if (recent.length > 5) recent.shift();
        passes.set(u, (pass = { seed, head: h }));
      }
      id = pass.head;
    }
    setHead(u, id, "", p);
    u.uTitle.value = title ? 1 : 0;
    const g = headGrid(id);
    const over = g ? Math.max(0, g.min.y + g.size.y - 1) : 0;
    (u.uFit.value as THREE.Vector2).set(1 / (1 + 0.5 * over), 0.5 * over);
    const bar = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;
    // The story: closed, pried open by the build, swung open on the drop, closing through the breakdown
    let target = f.section === "build" ? 0.1 * f.buildProgress : f.section === "drop" ? 1 : 0;
    if (f.drop) {
      target = 1;
      ctx.camera?.request(title ? "title-open" : "open");
    }
    const o = u.uOpen.value as number;
    // Critically damped: ~2 bars to open, ~4 bars to close
    const w = target > o ? 4 / (bar * 2) : 4 / (bar * 4);
    let v = u.uOpenVel.value as number;
    v += (-w * w * (o - target) - 2 * w * v) * dt;
    u.uOpenVel.value = v;
    u.uOpen.value = Math.max(0, o + v * dt);
    const open = u.uOpen.value as number;
    const opened = target > 0.5 || open > 0.5;
    if (ctx.camera)
      ctx.camera.allow = title
        ? (fr) => fr.tag === "title" || (fr.tag === "title-open" && opened)
        : (fr) => !fr.tag?.startsWith("title") && (fr.tag !== "open" || opened);
    // Shell or shards: the style only changes while the head is closed
    if (open > 0.5) u.uWasOpen.value = 1;
    if (open < 0.02) {
      if (p.style === "shell") u.uMode.value = 0;
      else if (p.style === "shards") u.uMode.value = 1;
      else if (u.uWasOpen.value === 1) u.uMode.value = 1 - (u.uMode.value as number);
      u.uWasOpen.value = 0;
    }
    const leak = Math.min(1, (f.section === "build" ? f.buildProgress : 0) + open * 0.6);
    const l = u.uLeak.value as number;
    u.uLeak.value = l + (leak - l) * (1 - Math.exp(-dt * 2));
    // The canon draws itself through the build, stroke after stroke, and fades slowly once the head has opened
    const drawn = f.section === "build" ? f.buildProgress : 0;
    const c = u.uCanon.value as number;
    u.uCanon.value = c + (drawn - c) * (1 - Math.exp(-dt * (drawn > c ? 3 : 0.12)));
    u.uCanonMax.value = num(p.canon, 1);
    u.uSky.value = num(p.sky, 0.85);
    u.uWave.value = f.beat ? 0 : (u.uWave.value as number) + dt;
    u.uAmp.value = num(p.open, 1);
    u.uCinema.value = p.letterbox === true ? 1 : 0;
  },
  fragment: /* glsl */ `
uniform float uOpen;
uniform float uAmp;
uniform float uLeak;
uniform float uCanon;
uniform float uCanonMax;
uniform float uSky;
uniform float uWave;
uniform float uCinema;
uniform float uMode;   // 0: opens like a shell, 1: breaks into floating shards
uniform float uTitle;  // the night's title instead of a head
uniform vec2 uFit;
${ART_LIB}
${HEAD_GLSL}
${CAMERA_GLSL}
${DETAIL_GLSL}
${SKY_GLSL}
const float TH = .1;                    // shell thickness
const vec3 HINGE = vec3(0., 0., -.58);  // back of the skull
const vec3 CORE = vec3(0., .1, -.03);   // the sun inside
const float SUN_R = .15;
const float NECK = -.55;                // the halves open above this line; under it, the neck's tab stays
const float TAB = .26;                  // the neck cut in a rounded tab, as in a collage
float gAng;
float gCoreD;
/** The sun inside: in the head, or behind the title. */
vec3 gCore = CORE;
float gCoreR = SUN_R;

/** The bust turns very slowly on its own and floats (the hinge, shards and sun go with it). */
float gYaw = 0.;
float gBob = 0.;
vec3 toHead(vec3 p) { p.y += .12 - gBob; p.xz *= rot(gYaw); return p; }

/**
 * The bust, cut as in a collage: the head, the neck under the chin in a rounded tab, nothing of the shoulders (the
 * title: as it is).
 */
float bustD(vec3 h) {
  float d = headD(h);
  if (uTitle > .5) return d;
  // the head, above a cut that follows the jaw down to the chin, and the tab under it
  float head = (NECK + .3 * pow(min(abs(h.x) / .42, 1.6), 2.) - h.y) * .6;
  // (as deep as a neck: a bust's chest and back do not hang under it)
  float tab = max(length(vec2(h.x, h.y - clamp(h.y, NECK - .05, NECK))) - TAB, abs(h.z + .05) - .3);
  return max(d, min(head, tab));
}

/** Undo the rotation of one half (s = -1 left, +1 right). */
vec3 halfFrame(vec3 h, float s) {
  vec3 q = h - HINGE;
  q.xz *= rot(s * gAng);
  return q + HINGE;
}

float shell(vec3 q) {
  // the bust is costly: away from it, its box is enough
  float be = headBound(q);
  if (be > .08) return be;
  float d = bustD(q);
  return max(d, -(d + TH));
}

float halfD(vec3 h, float s) {
  vec3 q = halfFrame(h, s);
  float d = max(shell(q), s > 0. ? -q.x : q.x);
  return max(d, NECK - q.y);
}

/** What stays when the bust opens: the tab of the neck under the line. */
float stubD(vec3 h) {
  float b = headBound(h);
  if (b > .08) return max(b, h.y - NECK);
  return max(bustD(h), h.y - NECK);
}

// ---- shards: the head breaks into NS segments (like an orange) that drift out and float round the sun
const float NS = 9.;
const float WS = 6.2831853 / 9.;

/** Undo the drift and tilt of shard i. */
vec3 shardFrame(vec3 h, float i) {
  float a = i * WS;
  float hs = hash12(vec2(i, 3.7));
  float o = uOpen * uAmp;
  vec3 off = vec3(sin(a), 0., cos(a)) * o * (.85 + .45 * hs)
    + vec3(0., o * (.18 * sin(uTime * .25 + i * 1.7) + .35 * (hs - .5)), 0.);
  vec3 q = h - off - CORE;
  q.xz *= rot(o * .45 * (hs - .5));
  q.yz *= rot(o * .35 * (hash12(vec2(i, 9.1)) - .5));
  return q + CORE;
}

/** Signed distance to the pie slice of shard i (negative inside). */
float wedge(vec3 q, float i) {
  vec2 c = (q - CORE).xz;
  c *= rot(i * WS);
  return abs(c.x) * cos(WS * .5) - c.y * sin(WS * .5);
}

float shardsD(vec3 h, out float best, out vec3 bq) {
  vec2 c = h.xz - CORE.xz;
  float i0 = floor(atan(c.x, c.y) / WS + .5);
  float d = 1e3;
  best = mod(i0, NS);
  bq = h;
  // closed, the shards make up the shell exactly: one evaluation instead of three
  if (uOpen * uAmp < .002) return max(shell(h), NECK - h.y);
  for (int k = -1; k <= 1; k++) {
    float i = mod(i0 + float(k), NS);
    vec3 q = shardFrame(h, i);
    float w = wedge(q, i) + .004 * uOpen;
    if (w < d) {
      float ds = max(max(shell(q), w), NECK - q.y);
      if (ds < d) { d = ds; best = i; bq = q; }
    }
  }
  return d;
}

/** Distance to the nearest gap between shards (for the light pouring out). */
float gapDist(vec3 h) {
  vec2 c = h.xz - CORE.xz;
  float a = atan(c.x, c.y) / WS + .5;
  return abs(sin((fract(a) - .5) * WS)) * length(c);
}

// ---- the night's title: it breaks into bands about a letter wide, which drift apart in depth and settle back
const float TB = .24;

/** Undo the drift and tilt of band i. */
vec3 bandFrame(vec3 h, float i) {
  float hs = hash12(vec2(i, 5.3));
  float o = uOpen * uAmp;
  float side = mod(i, 2.) < .5 ? 1. : -.7;
  vec3 q = h - vec3(0., o * (.22 * (hs - .5) + .05 * sin(uTime * .3 + i * 1.3)), o * (.3 + .45 * hs) * side);
  float c = (i + .5) * TB;
  q.x -= c;
  q.xz *= rot(o * .6 * (hash12(vec2(i, 8.1)) - .5));
  q.xy *= rot(o * .3 * (hash12(vec2(i, 2.9)) - .5));
  q.x += c;
  return q;
}

/** Distance to the side of band i (negative inside it). */
float bandSlab(vec3 q, float i) { return abs(q.x - (i + .5) * TB) - TB * .5; }

float bandsD(vec3 h, out float best, out vec3 bq) {
  float i0 = floor(h.x / TB);
  float d = 1e3;
  best = i0;
  bq = h;
  for (int k = -1; k <= 1; k++) {
    float i = i0 + float(k);
    vec3 q = bandFrame(h, i);
    float w = bandSlab(q, i) + .003 * uOpen;
    if (w < d) {
      float ds = max(shell(q), w);
      if (ds < d) { d = ds; best = i; bq = q; }
    }
  }
  return d;
}

/** Distance to the nearest line between two bands (the light pouring out). */
float bandGap(vec3 h) { return abs(fract(h.x / TB + .5) - .5) * TB; }

float map(vec3 p) {
  vec3 h = toHead(p);
  gCoreD = 1e3;
  if (uTitle > .5) {
    float bound = headBound(h) - .05 - .8 * uOpen * uAmp;
    if (bound > .3) return bound;
    float bi;
    vec3 bq;
    float d = bandsD(h, bi, bq);
    // the sun behind the title, seen through the gaps as it opens
    if (uOpen > .01) {
      gCoreD = length(h - gCore) - gCoreR;
      d = min(d, gCoreD);
    }
    return d;
  }
  // Cheap bound: far from the bust (and its drifting shards), no need to evaluate anything
  float bound = sdCapsule(h, vec3(0., -.9, -.1), vec3(0., .4, -.1), .85 + .3 * uHeadOn + (.6 + 1.1 * uAmp) * uOpen);
  if (bound > .3) return bound;
  float d;
  if (uMode > .5) {
    float si;
    vec3 sq;
    d = shardsD(h, si, sq);
  } else {
    d = halfD(h, -1.);
    // The right half is only evaluated when it can be the closest
    if (-halfFrame(h, 1.).x < d) d = min(d, halfD(h, 1.));
  }
  if (h.y - NECK < d) d = min(d, stubD(h));
  if (uOpen > .01) {
    gCoreD = length(h - CORE) - SUN_R;
    d = min(d, gCoreD);
  }
  return d;
}
${MARCH}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  gAng = uOpen * .85 * uAmp;
  gYaw = (.22 * sin(uTime * .04 + uSeed) + .06 * sin(uTime * .1 + uSeed * 2.)) * (1. - .6 * uTitle);
  gBob = .035 * sin(uTime * .19 + uSeed) * (1. - uTitle);
  // the low sun, on one side or the other from one return to the next; the key light on the same side
  float side = fract(uSeed * .37) < .5 ? -1. : 1.;
  gSun = normalize(vec3(.65 * side, .16, -1.));
  gKey = normalize(vec3(.6 * side, .62, .55));
  gSeaY = -9.;
  gCloudBase = -21.;
  gCloudThick = 13.;
  gCover = .6;
  gWind = vec2(uTime * .9 + uSeed * 50., uTime * .25);
  gCloudGlow = .35 * exp(-uWave * 1.6);
  gGlowR = uWave * 30.;
  gSeaDrift = vec2(uTime * .003, uSeed * .1);
  if (uTitle > .5) {
    gCore = vec3(0., .05, -.45);
    gCoreR = .2;
  }
  vec3 lift = vec3(0., uFit.y, 0.);
  vec3 ro = uCamPos + lift;
  vec3 rd = lookAt(ro, uCamTarget + lift) * normalize(vec3(uv, uFocal * uFit.x));

  // the white sky and the sea of clouds far below; the sun's shafts, stronger as the build lifts the light. Behind the
  // night's title the sky turns a paler grey round it, so that its marble stands out
  vec3 col = heavenV(ro, rd, 300.);
  col += uAccent * sunRays(rd, 3.) * (.3 + .5 * uLeak + .3 * uBeat);
  col *= 1. - .4 * uTitle * (1. - .35 * smoothstep(.2, .9, length(uv)));
  // March, gathering the glow of the inner sun
  float t = .05, tt = -1., glow = 0.;
  for (int i = 0; i < 115; i++) {
    float d = map(ro + rd * t);
    if (gCoreD < .5) glow += exp(-max(gCoreD, 0.) * 16.) * .02;
    if (abs(d) < .0007 * t) { tt = t; break; }
    t += d * .9;
    if (t > 14.) break;
  }
  float sunLight = (.9 + .6 * uBass) * (1. + 1.5 * uDrop);
  float waveR = uWave * .9;

  if (tt > 0.) {
    vec3 p = ro + rd * tt;
    map(p);
    bool onSun = gCoreD < .003 && uOpen > .01; // (map sets gCoreD; normals and AO below overwrite it)
    // the normal sampled over about a pixel: relief finer than the screen averages out instead of shimmering
    vec3 n = calcNormalE(p, clamp(tt / (uRes.y * uFocal) * .8, .0012, .003));
    vec3 h = toHead(p);
    float ao = calcAO(p, n);
    vec3 nh = n;
    nh.xz *= rot(gYaw);

    if (onSun) {
      // ---- the sun inside: white gold, a ring of light running out of it on every kick
      float r = length(h - gCore) / gCoreR;
      col = (uAccent * 2.4 + uInk * 1.6) * sunLight * (1. + .5 * exp(-pow(r - 1. + waveR * .1, 2.) * 20.) * exp(-uWave * 2.));
    } else {
      // ---- which piece, and where on it
      float dn = uTitle > .5 ? 1e3 : stubD(h);
      vec3 q;
      float dPiece, cutPlane;
      if (uTitle > .5) {
        float bi;
        dPiece = bandsD(h, bi, q);
        cutPlane = abs(bandSlab(q, bi));
      } else if (uMode > .5) {
        float si;
        dPiece = shardsD(h, si, q);
        cutPlane = abs(wedge(q, si));
      } else {
        float dl = halfD(h, -1.), dr = halfD(h, 1.);
        dPiece = min(dl, dr);
        q = halfFrame(h, dl < dr ? -1. : 1.);
        cutPlane = abs(q.x);
      }
      if (dn < dPiece) q = h;
      float sd = bustD(q);
      float dOut = abs(sd), dIn = abs(sd + TH);
      float dCut = dn < dPiece ? abs(q.y - NECK) : min(cutPlane, abs(q.y - NECK));
      float pix = pixelSize(tt, n, rd);
      if (dOut <= dIn && dOut <= dCut) {
        // ---- the marble skin, the sky drifting through it, the canon drawn over the face
        vec3 nm = bumpNoise(n, q, 34., .035, pix);
        // (a photograph of the sky laid over the stone: the marble's shading only tempers it, so the clouds read)
        col = lightO(marbleO(q), nm, rd, ao);
        float skin = uSky * (uTitle > .5 ? .5 : skinMask(q));
        if (skin > .01) col = mix(col, skinSky(q, 1.25) * (.55 + .32 * dot(col, vec3(.3, .5, .2))) * 1.25, skin);
        // (on the face only, fading out toward the hair)
        float front = smoothstep(.05, .35, nh.z) * step(0., q.z) * (1. - uTitle);
        front *= 1. - smoothstep(.8, 1.1, length(vec2(q.x / .5, (q.y + .02) / .78)));
        col = mix(col, uBase * .6, canonInk(q, uCanon * uCanonMax, pix) * front);
        // the seam: a thread of pale gold light, lit on the kick, pouring out as it opens
        float seam = uTitle > .5 ? bandGap(q) : uMode > .5 ? gapDist(q) : abs(q.x);
        float seamLine = exp(-seam * 140.) * step(NECK, q.y) * (uTitle > .5 ? step(.01, uOpen) : 1.);
        col += (uAccent * 1.4 + uInk * .4) * seamLine * (.02 + 1.1 * uBeat * step(.02, uLeak + uOpen) + 2.5 * uLeak);
      } else if (dIn < dCut) {
        // ---- inside: the sky the head holds, round its sun
        vec3 Lc = normalize(gCore - h);
        float lc = clamp(dot(n, Lc), 0., 1.);
        col = skinSky(q * 1.3 + 3., 2.) * (.95 + .6 * lc * sunLight) + uAccent * lc * .3 * sunLight;
      } else {
        // ---- the cut faces: the marble's own white, warmed by the light inside
        col = lightO(marbleO(q * 1.3) * .97, n, rd, ao) + uInk * .25 * uLeak;
      }
    }
  }
  // wisps of cloud drifting by at the bust's height, now and then before it (not before the night's title)
  if (uTitle < .5) {
    vec4 wv = wispsO(ro, rd, tt > 0. ? tt : 24., -1.7, 3.4, .3);
    col = col * wv.a + wv.rgb;
  }
  // the glow of the sun inside, round it
  col += (uAccent * 1.2 + uInk * .4) * glow * sunLight * (uOpen + .03);

  // Sheets of light pouring out of the seam (build, open)
  if (uLeak > .01) {
    float tEnd = tt > 0. ? tt : 9.;
    float j = hash12(fc + fract(uTime) * 37.);
    float acc = 0.;
    for (int i = 0; i < 6; i++) {
      vec3 h = toHead(ro + rd * tEnd * (float(i) + j) / 6.);
      float b = headBound(h);
      float sd = b > .1 ? b : bustD(h);
      if (sd < 0.) continue;
      float g = uTitle > .5 ? bandGap(h) : uMode > .5 ? gapDist(h) : abs(h.x);
      float sheet = exp(-g * (70. - 35. * uOpen)) * exp(-sd * 3.) * step(NECK, h.y);
      acc += sheet * (.55 + .45 * vnoise(vec3(h.yz * 6., uTime * .8)));
    }
    col += uAccent * acc / 6. * uLeak * (.7 + .9 * uHat) * 1.8;
  }

  // Gold dust floating round the bust, glinting on the attacks
  for (int i = 0; i < 22; i++) {
    float fi = float(i);
    vec3 c = vec3(hash12(vec2(fi, 1.)), hash12(vec2(fi, 2.)), hash12(vec2(fi, 3.))) - .5;
    vec3 pp = normalize(c) * (1.1 + .8 * hash12(vec2(fi, 4.)));
    pp.xz *= rot(uTime * .02 + fi);
    pp.y += .15 * sin(uTime * .15 + fi) - .1;
    float s = dot(pp - ro, rd);
    if (s < 0. || (tt > 0. && s > tt)) continue;
    float d = length(pp - ro - rd * s);
    float glint = .08 + 2.2 * uHat * pow(hash12(vec2(fi, floor(uTime * 8.))), 4.) + uDrop * 1.2;
    col += uAccent * exp(-d * 420.) * glint;
  }

  // Light shafts in the air, the bust's shadow cut out of them: rays streaming round it when the sun is behind; they
  // pulse on the kick, swell through the build and blaze on the drop (calmer behind the night's title)
  gOccC = vec3(0., -.07 + gBob, -.05);
  gOccR = uTitle > .5 ? vec3(0.) : vec3(.55, .78, .62);
  float rays = (.55 + .9 * uLeak + .5 * uBeat + 1.4 * uDrop) * (1. - .6 * uTitle);
  col = withShafts(col, ro, rd, tt > 0. ? tt : 40., rays);

  float lb = uCinema > .5 ? letterbox(fc) : 1.;
  // Letterbox bars stay opaque: the background never shows through them
  gl_FragColor = vec4(hdrOut(col) * lb, 1.);
}
`,
});
