import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { num } from "../utils";
import { ART_LIB, MARCH } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";
import { HEAD_GLSL, headParam, headUniforms, setHead } from "./heads";

/** Framings around the head (world space: the head centre sits near y = 0). "open" ones need the head open. */
const FRAMINGS: Framing[] = [
  { az: 0.5, el: 0.06, dist: 4.4, target: [0, -0.15, 0], focal: 1.95, weight: 3 },
  { az: 1.45, el: 0.03, dist: 4.2, target: [0, -0.12, 0], focal: 2.1, weight: 2 },
  { az: 0.32, el: 0.05, dist: 2.3, target: [0.1, -0.06, 0.32], focal: 2.2, weight: 2 },
  { az: -0.5, el: 0.12, dist: 6.2, target: [0, -0.35, 0], focal: 1.8, weight: 1 },
  { az: 0.15, el: 0.62, dist: 3.4, target: [0, 0.02, 0.05], focal: 1.9, weight: 3, tag: "open" },
  { az: 0.02, el: 0.1, dist: 3.8, target: [0, -0.05, 0], focal: 1.95, weight: 2, tag: "open" },
  { az: -0.7, el: 0.3, dist: 3.2, target: [0, 0, 0], focal: 1.9, weight: 2, tag: "open" },
];

/**
 * Porcelain: a ceramic head that stays still while the story happens to it. Gold kintsugi cracks spread over
 * minutes; the build pries the seam open and light leaks out; on the drop the two halves swing open like a
 * shell (hinged at the back of the skull) onto a geode lining and a kaleidoscopic fractal core; it closes again
 * through the breakdown. The beat only drives light: the seam, a wave through the core, glints on the shards.
 */
export const porcelain = defineShaderScene({
  id: "porcelain",
  name: "Porcelaine",
  tag: "Visage",
  energy: "calm",
  renderScale: 0.75,
  mask: true,
  camera: { framings: FRAMINGS, glideBars: 2 },
  description:
    "Visage de céramique qui s'ouvre au drop, en coquille ou en éclats flottants, sur une géode et un cœur fractal ; des fissures d'or se propagent lentement.",
  params: [
    paletteParam("porcelain"),
    headParam(),
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
    { type: "range", key: "kintsugi", label: "Kintsugi", min: 0, max: 1, step: 0.05, default: 0.8 },
    {
      type: "select",
      key: "frame",
      label: "Cadre",
      options: [
        { value: "none", label: "Aucun" },
        { value: "selfie", label: "Viseur de téléphone" },
      ],
      default: "none",
    },
    { type: "toggle", key: "letterbox", label: "Format cinéma 2.39 (bandes noires)", default: false },
  ],
  uniforms: () => ({
    ...headUniforms(),
    uOpen: { value: 0 },
    uOpenVel: { value: 0 },
    uAmp: { value: 1 },
    uLeak: { value: 0 },
    uKin: { value: 0.18 },
    uKinMax: { value: 0.8 },
    uWave: { value: 9 },
    uShift: { value: 0 },
    uShiftTarget: { value: 0 },
    uCinema: { value: 0 },
    uSelfie: { value: 0 },
    uMode: { value: Math.random() < 0.5 ? 0 : 1 },
    uWasOpen: { value: 0 },
  }),
  update(u, f, p, dt, ctx) {
    setHead(u, p.head);
    const bar = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;
    // The story: closed, pried open by the build, swung open on the drop, closing through the breakdown
    let target = f.section === "build" ? 0.1 * f.buildProgress : f.section === "drop" ? 1 : 0;
    if (f.drop) {
      target = 1;
      ctx.camera?.request("open");
      u.uShiftTarget.value = (u.uShiftTarget.value as number) + 0.37;
    }
    const o = u.uOpen.value as number;
    // Critically damped: ~2 bars to open, ~4 bars to close
    const w = target > o ? 4 / (bar * 2) : 4 / (bar * 4);
    let v = u.uOpenVel.value as number;
    v += (-w * w * (o - target) - 2 * w * v) * dt;
    u.uOpenVel.value = v;
    u.uOpen.value = Math.max(0, o + v * dt);
    const open = u.uOpen.value as number;
    // (through the phone's viewfinder, the face is filmed from the front)
    const selfie = p.frame === "selfie";
    if (ctx.camera)
      ctx.camera.allow = (fr) => (fr.tag !== "open" || target > 0.5 || open > 0.5) && (!selfie || Math.abs(fr.az) < 0.6);
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
    // Kintsugi grows over minutes and never goes back
    u.uKinMax.value = num(p.kintsugi, 0.8);
    u.uKin.value = Math.min(1, (u.uKin.value as number) + dt / 240);
    u.uWave.value = f.beat ? 0 : (u.uWave.value as number) + dt;
    const s = u.uShift.value as number;
    u.uShift.value = s + ((u.uShiftTarget.value as number) - s) * (1 - Math.exp(-dt * 2));
    u.uAmp.value = num(p.open, 1);
    u.uCinema.value = p.letterbox === true ? 1 : 0;
    u.uSelfie.value = p.frame === "selfie" ? 1 : 0;
  },
  fragment: /* glsl */ `
uniform float uOpen;
uniform float uAmp;
uniform float uLeak;
uniform float uKin;
uniform float uKinMax;
uniform float uWave;
uniform float uShift;
uniform float uCinema;
uniform float uSelfie;  // the face seen through a phone's viewfinder
uniform float uMode;   // 0: opens like a shell, 1: breaks into floating shards
${ART_LIB}
${HEAD_GLSL}
${CAMERA_GLSL}

const float TH = .1;                    // shell thickness
const vec3 HINGE = vec3(0., 0., -.58);  // back of the skull
const vec3 CORE = vec3(0., .1, -.03);
const float CORE_R = .4;
const float NECK = -.85;                // the halves open above this cut
float gAng;
float gCoreD;

/** The head turns very slowly on its own (the hinge, shards and core turn with it). */
float gYaw = 0.;
vec3 toHead(vec3 p) { p.y += .12; p.xz *= rot(gYaw); return p; }

/** Undo the rotation of one half (s = -1 left, +1 right). */
vec3 halfFrame(vec3 h, float s) {
  vec3 q = h - HINGE;
  q.xz *= rot(s * gAng);
  return q + HINGE;
}

float shell(vec3 q) {
  // the sculpted head is costly: away from it, a simple enclosing ellipsoid is enough
  float be = headBound(q);
  if (be > .08) return be;
  float d = headD(q);
  return max(d, -(d + TH));
}

float halfD(vec3 h, float s) {
  vec3 q = halfFrame(h, s);
  float d = max(shell(q), s > 0. ? -q.x : q.x);
  return max(d, NECK - q.y);
}

float neckD(vec3 h) {
  float b = sdCapsule(h, vec3(0., NECK, -.15), vec3(0., -1.65, -.2), .3);
  if (b > .08) return b;
  // the neck below the cut stays within the column (busts widen into shoulders)
  return max(max(headD(h), h.y - NECK), b);
}

// ---- shards: the head breaks into NS segments (like an orange) that drift out and float around the core
const float NS = 9.;
const float WS = 6.2831853 / 9.;

/** Undo the drift and tilt of shard i. */
vec3 shardFrame(vec3 h, float i) {
  float a = i * WS;
  float hs = hash12(vec2(i, 3.7));
  vec3 off = vec3(sin(a), 0., cos(a)) * uOpen * (.3 + .22 * hs)
    + vec3(0., uOpen * (.12 * sin(uTime * .25 + i * 1.7) + .12 * (hs - .5)), 0.);
  vec3 q = h - off - CORE;
  q.xz *= rot(uOpen * .3 * (hs - .5));
  q.yz *= rot(uOpen * .25 * (hash12(vec2(i, 9.1)) - .5));
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
  best = 0.;
  bq = h;
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

/** Distance to the nearest gap between shards (for the light leaking out). */
float gapDist(vec3 h) {
  vec2 c = h.xz - CORE.xz;
  float a = atan(c.x, c.y) / WS + .5;
  return abs(sin((fract(a) - .5) * WS)) * length(c);
}

/**
 * Kaleidoscopic folds with a spherical inversion: a symmetrical, organic jewel filling the inside of the head.
 * It drifts very slowly (the structure morphs over minutes); it never moves to the beat. trap: orbit trap.
 */
float coreFractal(vec3 h, out float trap) {
  vec3 p = (h - CORE) / CORE_R * 1.2;
  p.xz *= rot(uTime * .025 + uSeed);
  p.xy *= rot(uTime * .017 + uSeed * .7);
  float s = 1.;
  trap = 1e3;
  for (int i = 0; i < 4; i++) {
    p = abs(p);
    if (p.x < p.y) p.xy = p.yx;
    if (p.x < p.z) p.xz = p.zx;
    if (p.y < p.z) p.yz = p.zy;
    p.xy *= rot(.25 + .08 * sin(uTime * .02 + uSeed));
    p.yz *= rot(.15 + .05 * sin(uTime * .015));
    p = p * 2. - vec3(1., .7, .45);
    s *= 2.;
    // spherical inversion: rounds everything into petals and bubbles
    float r2 = dot(p, p);
    float k = clamp(1.1 / r2, 1., 2.2);
    p *= k;
    s *= k;
    trap = min(trap, r2);
  }
  return (length(p) - .8) / s * CORE_R / 1.2;
}

float map(vec3 p) {
  vec3 h = toHead(p);
  // Cheap bound: far from the head (and its drifting shards), no need to evaluate anything
  float bound = sdCapsule(h, vec3(0., -1.5, -.1), vec3(0., .3, -.1), .85 + .3 * uHeadOn + .6 * uOpen);
  gCoreD = 1e3;
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
  if (h.y - NECK < d) d = min(d, neckD(h));
  gCoreD = 1e3;
  if (uOpen > .01) {
    float cb = length(h - CORE) - CORE_R;
    if (cb < d) {
      float tr;
      // the fractal fills the cavity of the head, like a brain made of patterns
      gCoreD = max(max(cb, headD(h) + TH + .015), coreFractal(h, tr));
      d = min(d, gCoreD);
    }
  }
  return d;
}
${MARCH}

/** 3D cells: x = distance to the nearest seed, y = to the second, z = id of the nearest. */
vec3 cells(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  float d1 = 8., d2 = 8., id = 0.;
  for (int a = -1; a <= 1; a++)
    for (int b = -1; b <= 1; b++)
      for (int c = -1; c <= 1; c++) {
        vec3 o = vec3(float(a), float(b), float(c));
        vec3 r = o + vec3(hash13(i + o), hash13(i + o + 7.1), hash13(i + o + 3.3)) - f;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; id = hash13(i + o + 1.9); }
        else if (d < d2) d2 = d;
      }
  return vec3(sqrt(d1), sqrt(d2), id);
}

vec3 iri(float t) { return .5 + .5 * cos(6.2831 * (t + vec3(0., .33, .67))); }

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  gAng = uOpen * .62 * uAmp;
  gYaw = .22 * sin(uTime * .04 + uSeed) + .06 * sin(uTime * .1 + uSeed * 2.);
  vec3 ro = uCamPos;
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));

  vec3 col = uBase * .9 + uInk * .06 * exp(-2.4 * length(uv - vec2(.3, .12)));
  // March, gathering the glow of the core along the way
  float t = .05, tt = -1., glow = 0.;
  for (int i = 0; i < 115; i++) {
    float d = map(ro + rd * t);
    if (gCoreD < .4) glow += exp(-max(gCoreD, 0.) * 45.) * .008;
    if (abs(d) < .0007 * t) { tt = t; break; }
    t += d * .9;
    if (t > 12.) break;
  }
  float coreLight = (.5 + .9 * uBass) * (1. + 2.5 * uDrop);
  float waveR = uWave * .9;

  if (tt > 0.) {
    vec3 p = ro + rd * tt;
    map(p);
    bool onCore = gCoreD < .003 && uOpen > .01; // (map sets gCoreD; normals and AO below overwrite it)
    vec3 n = calcNormal(p);
    vec3 h = toHead(p);
    float ao = calcAO(p, n);
    vec3 L = normalize(vec3(-.65, .6, .55));
    float dif = clamp(dot(n, L) * .85 + .15, 0., 1.);
    dif *= dif * (3. - 2. * dif);
    float spe = pow(clamp(dot(reflect(-L, n), -rd), 0., 1.), 48.);
    float fre = pow(1. - clamp(dot(n, -rd), 0., 1.), 5.);

    if (onCore) {
      // ---- the fractal core: iridescent, lit from within, a wave of light on every kick
      float tr;
      coreFractal(h, tr);
      float r = length(h - CORE) / CORE_R;
      float wave = exp(-pow(r - waveR, 2.) * 60.) * exp(-uWave * 1.5);
      vec3 c = mix(pal(tr * .3 + uShift), iri(r * .8 + tr * .15 + uShift), .7);
      float lit = .55 + .45 * clamp(dot(n, normalize(vec3(.3, .8, .5))), 0., 1.);
      col = c * (.25 + .75 * ao) * lit * coreLight + iri(r + uShift) * wave * 1.8;
      col += spe * .4 + fre * iri(uShift + .5) * .3;
    } else {
      // ---- which piece, and where on it
      float dn = neckD(h);
      vec3 q;
      float dPiece, cutPlane;
      if (uMode > .5) {
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
      float sd = headD(q);
      float dOut = abs(sd), dIn = abs(sd + TH);
      float dCut = dn < dPiece ? abs(q.y - NECK) : min(cutPlane, abs(q.y - NECK));
      if (dOut <= dIn && dOut <= dCut) {
        // Porcelain, with gold kintsugi cracks spreading over minutes
        col = uInk * (dif * vec3(1.1, 1.04, .96) + vec3(.06, .065, .08) * (.5 + .5 * n.y)) * ao;
        // soft fill from the camera, so every framing keeps the porcelain readable
        col += uInk * .22 * clamp(dot(n, -rd), 0., 1.) * ao;
        col += spe * .3 + fre * vec3(.22, .24, .28) * ao;
        col += pow(clamp(dot(n, normalize(vec3(.9, .25, -.5))), 0., 1.), 3.) * .15;
        vec3 cv = cells(q * 3. + uSeed);
        float edge = cv.y - cv.x;
        float fw = fwidth(edge);
        float crack = 1. - smoothstep(.012, .012 + fw * 1.2, edge);
        // cracks only along some cell edges, spreading from where the noise is lowest
        float front = vnoise(q * 1.4 + uSeed) * .8 + .1 + .5 * step(.45, hash13(floor(vec3(cv.z * 97.))));
        crack *= smoothstep(front - .06, front, uKin * uKinMax) * (1. - smoothstep(.15, .4, fw));
        vec3 gold = vec3(1., .76, .34);
        col = mix(col, gold * (.35 + dif * 1.1) + gold * spe * 2. + gold * uBeat * .5, crack);
        // The seam: a thread of light that pulses on the kick
        float seam = uMode > .5 ? gapDist(q) : abs(q.x);
        col += uAccent * exp(-seam * 120.) * ((uMode > .5 ? .12 : .3) + 1.4 * uBeat + 2. * uLeak) * step(NECK, q.y);
      } else if (dIn < dCut) {
        // Geode lining: crystal facets, iridescent, lit by the core
        vec3 cv = cells(q * 16.);
        vec3 nf = normalize(n + (vec3(hash13(vec3(cv.z, 1., 2.)), hash13(vec3(cv.z, 3., 4.)), hash13(vec3(cv.z, 5., 6.))) - .5) * 1.1);
        vec3 Lc = normalize(CORE - h);
        float lc = clamp(dot(nf, Lc), 0., 1.);
        vec3 c = mix(pal(cv.z + uShift) , iri(cv.z + dot(nf, rd) * .8 + uShift), .7);
        col = c * (.3 + lc * .9 * coreLight) * pow(ao, .3);
        // facets catch the light of the core; some glint on the attacks
        col += c * pow(clamp(dot(reflect(rd, nf), Lc), 0., 1.), 30.) * (.5 + 2.5 * uHat * step(.6, hash13(vec3(cv.z, floor(uTime * 10.), 0.))));
      } else {
        // Cut faces: agate bands from the white porcelain skin to the crystals
        float depth = clamp(-sd / TH, 0., 1.);
        float bands = depth * 5. + (vnoise(q * 9.) - .5) * .8;
        vec3 ag = mix(pal(floor(bands) * .21 + uShift), iri(bands * .2 + uShift), .6) * (.7 + .3 * sin(bands * 6.2831)) * 1.15;
        col = mix(uInk * .95, ag, smoothstep(.08, .25, depth)) * (.35 + .65 * dif) + spe * .25;
        col += ag * .3 * uLeak;
      }
    }
  }
  // The glow of the core around the fractal
  col += iri(uShift + .2) * glow * coreLight * (uOpen + .05);

  // Sheet of light escaping the seam (build, open)
  if (uLeak > .01) {
    float tEnd = tt > 0. ? tt : 9.;
    float j = hash12(fc + fract(uTime) * 37.);
    float acc = 0.;
    for (int i = 0; i < 8; i++) {
      vec3 h = toHead(ro + rd * tEnd * (float(i) + j) / 8.);
      float sd = headD(h);
      if (sd < 0.) continue;
      float g = uMode > .5 ? gapDist(h) : abs(h.x);
      float sheet = exp(-g * (40. - 25. * uOpen)) * exp(-sd * 2.2) * step(NECK, h.y);
      acc += sheet * (.55 + .45 * vnoise(vec3(h.yz * 6., uTime * .8)));
    }
    col += uAccent * acc / 8. * uLeak * (.7 + .9 * uHat) * 1.6;
  }

  // Porcelain shards floating around, glinting on the attacks
  for (int i = 0; i < 18; i++) {
    float fi = float(i);
    vec3 c = vec3(hash12(vec2(fi, 1.)), hash12(vec2(fi, 2.)), hash12(vec2(fi, 3.))) - .5;
    vec3 pp = normalize(c) * (1. + .6 * hash12(vec2(fi, 4.)));
    pp.xz *= rot(uTime * .03 + fi);
    pp.y += .1 * sin(uTime * .2 + fi) - .12;
    float s = dot(pp - ro, rd);
    if (s < 0. || (tt > 0. && s > tt)) continue;
    float d = length(pp - ro - rd * s);
    float glint = .12 + 2.5 * uHat * pow(hash12(vec2(fi, floor(uTime * 8.))), 4.) + uDrop * 1.5;
    col += vec3(1., .97, .9) * exp(-d * 380.) * glint;
  }

  col = aces(col * 1.05);
  col *= vignette(fc / uRes);
  float alpha = step(0., tt);
  if (uSelfie > .5) {
    // A phone held up to the face: a portrait screen, its grid, a focus square that follows the face,
    // the recording dot blinking on the beat. The drop is the shutter.
    vec2 fsz = vec2(.43 * 9. / 19.5, .43);
    vec2 dq = abs(uv) - fsz + .05;
    float frame = length(max(dq, 0.)) + min(max(dq.x, dq.y), 0.) - .05;
    vec3 ui = vec3(1., .96, .88);
    if (frame > 0.) {
      col = uBase * .08 + ui * .5 * (1. - smoothstep(0., .004, abs(frame - .012)));
      alpha = 1.;
    } else {
      vec2 g = abs(fract((uv + fsz) / (fsz * 2.) * 3.) - .5) * 2.;
      col += ui * .05 * step(.985, max(g.x, g.y));
      // where the head is on screen
      mat3 cam = lookAt(uCamPos, uCamTarget);
      vec3 hv = vec3(0., -.05, .1) - uCamPos;
      vec3 hc = vec3(dot(hv, cam[0]), dot(hv, cam[1]), dot(hv, cam[2]));
      vec2 hu = clamp(hc.xy / hc.z * uFocal, -fsz + .12, fsz - .12);
      float bs = .11 * (1. + .06 * exp(-uWave * 8.));
      vec2 bq = abs(uv - hu);
      float corner = step(bs - .006, max(bq.x, bq.y)) * step(max(bq.x, bq.y), bs) * step(bs * .6, min(bq.x, bq.y));
      col = mix(col, vec3(1., .85, .35), corner * .9);
      // recording dot
      col = mix(col, vec3(1., .2, .15), (1. - smoothstep(.008, .012, length(uv - vec2(0., fsz.y - .045)))) * (.35 + .65 * uBeat));
      // the shutter
      col += vec3(1.) * pow(uDrop, 3.) * .7;
      alpha = 1.;
    }
  }
  float lb = uCinema > .5 ? letterbox(fc) : 1.;
  // Letterbox bars stay opaque: the background never shows through them
  gl_FragColor = vec4(col * lb, max(alpha, 1. - lb));
}
`,
});
