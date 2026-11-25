import * as THREE from "three";
import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";

/** The vignettes come out of the dark this high, and are lost in the mist below YBOT. */
const YTOP = 24;
const YBOT = -40;
/** After a drop, the new flow's front starts this high (just above the frames) and comes down. */
const FRONT0 = 14;

const FRAMINGS: Framing[] = [
  // from afar, in front: the whole curtain, the spire and its figure on the left
  { az: 0.08, el: 0.04, dist: 24, target: [0, -2, 0], focal: 1.45, weight: 3 },
  // behind the small figure on its spire, facing the falls
  { az: 0.3, el: -0.02, dist: 17, target: [-3.2, -1, 5], focal: 1.9, weight: 2 },
  // low, at the edge of the abyss, looking up: the vignettes fall toward us
  { az: 0.3, el: -0.5, dist: 6, target: [0, 3, 0], focal: 1.3, weight: 2 },
  // from the curtain's edge, close: the pictures go by, spinning
  { az: 1.25, el: 0.05, dist: 4.5, target: [8, 0, 0], focal: 2.2, weight: 2 },
  // plunging after them into the void
  { az: 0.3, el: 1.2, dist: 11, target: [0, -8, 0], focal: 1.5, weight: 2 },
];

/**
 * The torrent: an endless waterfall of small luminous vignettes (a one-pixel frame, a halftone picture inside, never a
 * word) falls from a black sky into an abyss whose bottom is only a pale mist. They spin slowly as they fall. A wave of
 * light runs down the falls on every kick, the hats light a few of them white like notifications; the build speeds it
 * up until they stretch into streaks; on the drop everything freezes in mid-air, then the vignettes crumble into dust
 * and a new flow comes down from the top. In the breakdown it thins to a trickle; over the night it runs faster and
 * thicker.
 */
export const torrent = defineShaderScene({
  id: "torrent",
  name: "Le Torrent",
  energy: "medium",
  hdr: true,
  mask: true,
  camera: { framings: FRAMINGS, glideBars: 3 },
  description:
    "Une cascade sans fin de petites vignettes lumineuses tombe d'un ciel noir dans un gouffre ; une vague de lumière la parcourt à chaque kick, la montée l'étire en traits, au drop elle se fige puis s'effrite en poussière.",
  params: [paletteParam("mono")],
  uniforms: () => ({
    uFall: { value: 0 },
    uDensity: { value: 0.45 },
    uStretch: { value: 0 },
    uKick: { value: new THREE.Vector4(-99, -99, -99, -99) },
    uHatT: { value: -99 },
    uHatN: { value: 0 },
    uShatter: { value: -1 },
    uFront: { value: FRONT0 },
    uHold: { value: 0 },
    uDim: { value: 0 },
    // state kept on the CPU side only
    uSpeed: { value: 2.4 },
    uDropT: { value: 99 },
    uFallS: { value: 0 },
    uLast: { value: -99 },
  }),
  update(u, f, _p, dt) {
    const kick = u.uKick.value as THREE.Vector4;
    const base = 2.4 * (1 + 1.2 * f.drift);
    // Back on screen: a fresh flow
    if (f.time - (u.uLast.value as number) > 1.5) {
      u.uFall.value = 0;
      u.uSpeed.value = base;
      u.uShatter.value = -1;
      u.uDropT.value = 99;
      u.uHold.value = 0;
      kick.set(-99, -99, -99, -99);
      u.uDensity.value = 0.45 + 0.2 * f.drift;
    }
    u.uLast.value = f.time;

    // Its own pace: faster through the build (until the vignettes stretch), slower in the breakdown, and faster
    // over the night
    const mult =
      f.section === "build" ? 1 + 3.5 * f.buildProgress * f.buildProgress : f.section === "drop" ? 1.4 : f.section === "breakdown" ? 0.3 : 1;
    let speed = u.uSpeed.value as number;
    speed += (base * mult - speed) * (1 - Math.exp(-dt * 1.5));

    // The drop: everything freezes in mid-air for half a bar, then crumbles while a new flow comes from the top
    if (f.drop) {
      u.uDropT.value = 0;
      u.uShatter.value = -1;
    }
    const bar = f.bpm > 0 ? 240 / f.bpm : 2;
    const was = u.uDropT.value as number;
    const dropT = was + dt;
    u.uDropT.value = dropT;
    const hold = bar * 0.5;
    if (dropT < hold) speed = 0;
    else if (was < hold) {
      // the new flow bursts in
      u.uShatter.value = 0;
      u.uFallS.value = u.uFall.value;
      speed = base * 4;
    }
    u.uHold.value = dropT < hold ? 1 : Math.max(0, (u.uHold.value as number) - dt * 1.5);
    u.uSpeed.value = speed;
    u.uFall.value = (u.uFall.value as number) + speed * dt;

    if ((u.uShatter.value as number) >= 0) {
      u.uShatter.value = (u.uShatter.value as number) + dt;
      u.uFront.value = FRONT0 - ((u.uFall.value as number) - (u.uFallS.value as number));
      if ((u.uFront.value as number) < YBOT) u.uShatter.value = -1;
    }

    // A trickle in the breakdown, thicker over the night; the streaks come with the speed
    const dens = (0.45 + 0.2 * f.drift) * (f.section === "breakdown" ? 0.3 : 1);
    u.uDensity.value = (u.uDensity.value as number) + (dens - (u.uDensity.value as number)) * (1 - Math.exp(-dt * 0.5));
    u.uStretch.value = Math.min(1, Math.max(0, (speed - 5) / 6));
    const dim = f.section === "breakdown" ? 1 : 0;
    u.uDim.value = (u.uDim.value as number) + (dim - (u.uDim.value as number)) * (1 - Math.exp(-dt * 0.7));

    // Effects carry the rhythm: a wave of light per kick, a few white vignettes per hat
    if (f.beat) kick.set(f.time, kick.x, kick.y, kick.z);
    if (f.onset && f.time - (u.uHatT.value as number) > 0.12) {
      u.uHatT.value = f.time;
      u.uHatN.value = ((u.uHatN.value as number) + 1) % 1000;
    }
  },
  fragment: /* glsl */ `
uniform float uFall;     // how far the flow has fallen (m): the vignettes sit still in a frame falling with it
uniform float uDensity;  // share of the places holding a vignette
uniform float uStretch;  // 0..1: the speed stretches them into streaks
uniform vec4 uKick;      // the last four kicks (time)
uniform float uHatT;     // the last hat (time), and how many so far
uniform float uHatN;
uniform float uShatter;  // seconds since the drop's crumbling began (< 0: none)
uniform float uFront;    // height of the new flow's front, coming down after a drop
uniform float uHold;     // 0..1: the freeze of the drop
uniform float uDim;      // 0..1: the breakdown
${ART_LIB}
${CAMERA_GLSL}
// The flow is made of columns on a lattice turned in the ground plane (no rows, no files seen from anywhere); down
// each column the vignettes are spaced GY apart from an offset of its own.
const float C = .8;
const float GY = 1.2;
const mat2 LAT = mat2(.8916, -.4529, .4529, .8916);   // world xz -> lattice; v * LAT goes back
const float HW = 9.;                // the curtain's half width (its edges fray)
const float HD = 1.6;               // its half thickness
const float YTOP = ${YTOP.toFixed(1)}, YBOT = ${YBOT.toFixed(1)}, FRONT0 = ${FRONT0.toFixed(1)};
const vec2 TS = vec2(.2, .25);      // a vignette's half size, at rest
const vec3 PC = vec3(-3.2, -2., 5.6);   // the top of the rock spire rising from the abyss
const vec3 FP = vec3(-3.2, -2., 5.);    // the figure's feet on it

/** A vignette's picture: never a word, only light and shapes. 0..1. */
float picture(vec2 uv, vec3 id) {
  float k = hash13(id + 21.7);
  vec2 o1 = vec2(hash13(id + 23.1), hash13(id + 29.3));
  float v;
  if (k < .4) {
    // a photograph at night: lights out of focus on the dark
    vec2 o2 = vec2(hash13(id + 31.7), hash13(id + 37.9));
    v = .06 + .1 * uv.y + .95 * exp(-dot(uv - o1, uv - o1) * 18.) + .6 * exp(-dot(uv - o2, uv - o2) * 30.);
  } else if (k < .72) {
    // a horizon and a sun
    float hz = .25 + .3 * o1.y;
    v = uv.y > hz ? .35 + .65 * (uv.y - hz) / (1. - hz) : .05 + .1 * uv.y;
    v = max(v, 1. - smoothstep(.08, .11, length(uv - vec2(.2 + .6 * o1.x, hz + .12))));
  } else {
    // a skyline against a pale sky
    float b = .15 + .45 * hash13(id + vec3(floor(uv.x * 7.), 3.3, 0.));
    v = uv.y < b ? .05 : .45 + .5 * uv.y;
  }
  return clamp(v, 0., 1.);
}

/** Halftone: the picture as dots, fading to its mean where the dots get smaller than a few pixels. pix: a pixel. */
float halftone(vec2 l, vec2 hs, vec3 id, float pix) {
  float cs = 2. * hs.x / 13.;
  vec2 g = l / cs;
  vec2 cell = floor(g);
  vec2 uv = ((cell + .5) * cs + hs) / (2. * hs);
  float lum = picture(clamp(uv, 0., 1.), id);
  float r = .5 * sqrt(lum);
  float a = .7 * pix / cs;
  float dotv = 1. - smoothstep(r - a, r + a, length(fract(g) - .5));
  float mean = .78 * picture((l + hs) / (2. * hs), id);
  return mix(mean, dotv, smoothstep(1.8, 4., cs / pix));
}

/** The black sky, and the pale mist of the abyss below. */
vec3 sky(vec3 rd) {
  float down = smoothstep(.05, -.75, rd.y);
  vec2 m = rd.xz / max(.12, -rd.y);
  float n = .6 + .4 * vnoise(vec3(m * .5, uTime * .04));
  return uInk * (.003 + .085 * down * n);
}

/** The small figure standing on its spire, facing the falls (-z). */
float figure(vec3 p) {
  vec3 q = vec3(abs(p.x), p.y, p.z);
  float d = sdEllipsoid(p - vec3(0., 1.32, 0.), vec3(.2, .19, .12));
  d = smin(d, sdEllipsoid(p - vec3(0., 1.04, 0.), vec3(.15, .19, .1)), .08);
  d = smin(d, sdEllipsoid(p - vec3(0., .9, 0.), vec3(.18, .12, .11)), .06);
  d = smin(d, sdCapsule(q, vec3(.2, 1.42, 0.), vec3(.24, 1.1, .01), .048), .04);
  d = smin(d, sdCapsule(q, vec3(.24, 1.1, .01), vec3(.25, .82, -.02), .038), .03);
  d = smin(d, sdCapsule(q, vec3(.09, .9, 0.), vec3(.1, .48, 0.), .072), .05);
  d = smin(d, sdCapsule(q, vec3(.1, .48, 0.), vec3(.1, .06, 0.), .048), .03);
  d = smin(d, sdCapsule(p, vec3(0., 1.46, 0.), vec3(0., 1.58, 0.), .05), .03);
  return smin(d, sdEllipsoid(p - vec3(0., 1.69, 0.), vec3(.09, .115, .1)), .03);
}

/** A spire of rock rising from the mist, widening as it goes down, its top a small flat ledge. */
float spire(vec3 p) {
  vec3 q = p - PC;
  float w = .8 + .06 * max(-q.y, 0.) + .35 * (vnoise(vec3(0., q.y * .45, 3.7)) - .5);
  float d = sdBox(q - vec3(0., -24., 0.), vec3(w * .9, 24., w * .8) - .2) - .2;
  // rough flanks, a flat ledge on top for the figure
  return d + .5 * (fbm3(p * vec3(.9, .3, .9)) - .5) * (.25 + .75 * smoothstep(-.2, -2.5, q.y));
}

float shore(vec3 p) { return min(spire(p), figure(p - FP)); }

vec3 shoreN(vec3 p) {
  const vec2 k = vec2(1, -1);
  const float h = .002;
  return normalize(k.xyy * shore(p + k.xyy * h) + k.yyx * shore(p + k.yyx * h) + k.yxy * shore(p + k.yxy * h) + k.xxx * shore(p + k.xxx * h));
}

/** The spire and its figure: black cut-outs against the falls. Hit distance, or -1. */
float marchShore(vec3 ro, vec3 rd) {
  vec3 bc = vec3(-3.2, -22.5, 5.6), bh = vec3(3.5, 22.5, 3.3);
  vec3 m = 1. / rd;
  vec3 n = m * (ro - bc);
  vec3 k = abs(m) * bh;
  vec3 t1 = -n - k, t2 = -n + k;
  float tn = max(max(t1.x, t1.y), t1.z), tf = min(min(t2.x, t2.y), t2.z);
  if (tn > tf || tf < 0.) return -1.;
  float t = max(tn, .02);
  for (int i = 0; i < 80; i++) {
    float d = shore(ro + rd * t);
    if (d < .0008 * t) return t;
    t += d * .75;
    if (t > tf) break;
  }
  return -1.;
}

/** The kicks: waves of light running down the falls. h: a height. */
float waves(float h) {
  float w = 0.;
  for (int i = 0; i < 4; i++) {
    float age = uTime - uKick[i];
    float y = YTOP * .6 - age * 16.;
    w += exp(-age * .8) * exp(-(h - y) * (h - y) * .12);
  }
  return w;
}

/** Vignette k of a column: its centre in the falling frame (xyz), from the column's lattice centre cc and offset. */
vec3 tileCentre(vec3 id, vec2 cc, float off) {
  vec2 j = vec2(hash13(id + 3.1), hash13(id + 9.2)) - .5;
  return vec3((cc + j * .12) * LAT, id.z * GY + off + (hash13(id + 5.7) - .5) * .28).xzy;
}

/**
 * Dust of the crumbled vignettes of a column, near the heights y0..y1 of the ray. Each crumbled vignette leaves a few
 * grains that fall under their own weight, slower at first than the new flow, then faster.
 */
float dust(vec3 rof, vec3 rd, vec2 cell, vec2 cc, float off, float dens, float y0, float y1, float pa) {
  float s = uShatter;
  float F = FRONT0 - uFront;      // how far the new flow has come since
  float drop = 4.9 * s * s;       // the grains' fall
  float k0 = floor((y0 - 1. + drop * .8 - F - off) / GY), k1 = floor((y1 + 1. + drop * 1.2 - F - off) / GY);
  float acc = 0.;
  for (int k = 0; k < 6; k++) {
    float kk = k0 + float(k);
    if (kk > k1) break;
    vec3 id = vec3(cell, kk);
    float h = hash13(id + uSeed * 1.7);
    if (h >= dens) continue;
    vec3 c = tileCentre(id, cc, off);
    if (c.y - uFall + F > FRONT0) continue;  // part of the new flow
    for (int g = 0; g < 4; g++) {
      vec3 r = vec3(hash13(id + float(g) * 3.7), hash13(id + float(g) * 5.3 + 1.), hash13(id + float(g) * 7.9 + 2.)) - .5;
      vec3 p = c + r * vec3(.3, .4, .3) * (1. + .8 * s) - vec3(0., drop * (1. + .4 * r.y) - F, 0.);
      vec3 w = p - rof;
      float tp = dot(w, rd);
      if (tp < .1) continue;
      float d2 = dot(w, w) - tp * tp;
      float W = max(.022, tp * pa * 1.2);
      acc += exp(-d2 / (W * W)) * (.022 / W) * (.022 / W) * 2.;
    }
  }
  return acc * max(0., 1. - s / 3.5);
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 ro = uCamPos;
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));
  float pa = 1. / (uRes.y * uFocal);   // a pixel, in radians
  vec3 bg = sky(rd);
  vec3 col = bg;

  float ts = marchShore(ro, rd);
  float tEnd = ts > 0. ? ts : 1e4;

  // The curtain's slab, walked column by column in the frame falling with the flow
  vec3 rof = ro + vec3(0., uFall, 0.);
  vec3 bmin = vec3(-HW - 1., YBOT, -HD - .5), bmax = vec3(HW + 1., YTOP + 4., HD + .5);
  vec3 m = 1. / (abs(rd) + 1e-6) * sign(rd + 1e-9);
  vec3 ta = (bmin - ro) * m, tb = (bmax - ro) * m;
  vec3 t1 = min(ta, tb), t2 = max(ta, tb);
  float tn = max(max(t1.x, t1.y), max(t1.z, 0.)), tf = min(min(t2.x, t2.y), min(t2.z, tEnd));
  float glow = 0.;
  float tBest = 1e9;
  vec3 hId, hN, hEx, hEy, hC;
  vec2 hL, hHs;
  if (tn < tf) {
    vec2 o2 = LAT * ro.xz, d2 = LAT * rd.xz;
    float t = tn + 1e-3;
    vec2 cell = floor((o2 + d2 * t) / C);
    vec2 st = vec2(d2.x < 0. ? -1. : 1., d2.y < 0. ? -1. : 1.);
    vec2 inv = 1. / max(abs(d2), vec2(1e-6));
    vec2 tM = ((cell + max(st, 0.)) * C - o2) * st * inv;
    vec2 tD = C * inv;
    for (int i = 0; i < 64; i++) {
      float tx = min(min(tM.x, tM.y), tf);
      vec2 cc = (cell + .5) * C;
      vec2 cw = cc * LAT;
      // denser jets, drifting slowly across the falls
      float jets = .4 + .85 * smoothstep(.3, .75, vnoise(vec3(cw.x * .32, cw.y * .4, uTime * .03 + uSeed)));
      float dens = uDensity * jets * smoothstep(HW + .8, HW - 3.5, abs(cw.x)) * step(abs(cw.y), HD);
      if (dens > 0.) {
        float off = hash12(cell + uSeed) * GY;
        float ya = rof.y + rd.y * t, yb = rof.y + rd.y * tx;
        float y0 = min(ya, yb), y1 = max(ya, yb);
        if (uShatter >= 0.) glow += dust(rof, rd, cell, cc, off, dens, y0, y1, pa);
        float k0 = floor((y0 - off) / GY - .9), k1 = floor((y1 - off) / GY + .9);
        for (int k = 0; k < 10; k++) {
          float kk = k0 + float(k);
          if (kk > k1) break;
          vec3 id = vec3(cell, kk);
          float h = hash13(id + uSeed * 1.7);
          if (h >= dens) continue;
          vec3 c = tileCentre(id, cc, off);
          float cy = c.y - uFall;                    // its height in the world
          // most face out and sway; a third tumble
          float a = hash13(id + 43.1) > .68
            ? hash13(id + 13.9) * 6.283 + (hash13(id + 11.3) - .5) * 1.6 * uTime
            : (hash13(id + 13.9) - .5) * 1.1 + .35 * sin(uTime * (.3 + .3 * hash13(id + 11.3)) + h * 50.);
          float b = .3 * (1. - .8 * uStretch) * sin(uTime * (.25 + .4 * hash13(id + 17.1)) + h * 40.);
          vec3 n = vec3(sin(a) * cos(b), sin(b), cos(a) * cos(b));
          vec3 ex = vec3(cos(a), 0., -sin(a));
          vec3 ey = cross(n, ex);
          float den = dot(rd, n);
          if (abs(den) < 1e-4) continue;
          float tt = dot(c - rof, n) / den;
          if (tt <= 0. || tt >= tBest || tt >= tEnd) continue;
          vec2 hs = TS * (.8 + .4 * hash13(id + 19.3)) * vec2(1. - .55 * uStretch, 1. + 2. * uStretch);
          vec3 q = rof + rd * tt - c;
          vec2 l = vec2(dot(q, ex), dot(q, ey));
          if (abs(l.x) > hs.x || abs(l.y) > hs.y) continue;
          if (uShatter >= 0. && cy < uFront) {
            // left from before the drop: it crumbles in small pieces, then is gone
            vec2 fr = floor((l + hs) / (2. * hs) * vec2(5., 6.));
            float e = clamp((uShatter - .35 * hash13(id + 41.)) / .9, 0., 1.);
            if (hash13(vec3(fr, h * 91.) + id) < e) continue;
          }
          tBest = tt; hId = id; hN = n; hEx = ex; hEy = ey; hC = c; hL = l; hHs = hs;
        }
      }
      if (tBest < 1e8 || tx >= tf) break;
      t = tx;
      if (tM.x < tM.y) { cell.x += st.x; tM.x += tD.x; }
      else { cell.y += st.y; tM.y += tD.y; }
    }
  }

  // backlit spray behind the spire, so that the small figure always stands out
  vec3 hb = vec3(PC.x, -.5, 0.) - ro;
  float dh2 = dot(hb, hb) - dot(hb, rd) * dot(hb, rd);
  col += uInk * .08 * exp(-dh2 / 6.) * (1. - .3 * uDim);

  // The veil: the falls' own light, a haze in the slab behind and between the vignettes (a few samples along the ray)
  float tv = min(min(tf, tBest), tn + 16.);
  if (tn < tv) {
    float sum = 0., dt = (tv - tn) / 6.;
    for (int i = 0; i < 6; i++) {
      vec3 q = ro + rd * (tn + dt * (float(i) + .5));
      float jets = .65 + .8 * smoothstep(.3, .75, vnoise(vec3(q.x * .32, q.z * .4, uTime * .03 + uSeed)));
      // spray: a texture falling with the flow
      float spray = .55 + .45 * vnoise(vec3(q.x * .9, (q.y + uFall) * .35, q.z * .9 + uSeed));
      // a spray rising from below: the sky above the falls stays black
      float body = smoothstep(16., -3., q.y) * smoothstep(HW + 1., HW - 3.5, abs(q.x)) * smoothstep(HD + .5, HD - .6, abs(q.z));
      sum += jets * spray * body * (1. + 1.3 * waves(q.y)) * (1. - .7 * smoothstep(-8., -34., q.y)) * dt;
    }
    // seen along the curtain the path is long: keep it a haze, never a grey wall
    float veil = .26 * mix(.4, 1., abs(rd.z)) * (1. - exp(-sum * (uDensity / .45) * .45)) * (1. + .6 * uHold) * (1. - .3 * uDim);
    col += uInk * veil * exp(-tn * .015);
  }

  if (tBest < 1e8) {
    float h = hash13(hId + uSeed * 1.7);
    float cy = hC.y - uFall;
    float den = dot(rd, hN);
    float pix = tBest * pa / max(abs(den), .08);
    vec2 dE = hHs - abs(hL);
    float frame = 1. - smoothstep(pix * .5, pix * 1.5, min(dE.x, dE.y));
    float e = (.5 + .5 * hash13(hId + 27.3)) * smoothstep(YTOP, YTOP - 12., cy);
    e *= (1. + 2.2 * waves(cy)) * (1. + .9 * uStretch) * (1. + .6 * uHold) * (1. - .35 * uDim);
    // its screen, on both faces (mirrored behind): the picture, a glint of the sky light on the glass
    vec2 lm = den < 0. ? hL : vec2(-hL.x, hL.y);
    vec3 c2 = uInk * (halftone(lm, hHs, hId, pix) * e * (den < 0. ? 1.15 : .8) + frame * 1.3 * e);
    vec3 rr = reflect(rd, hN);
    c2 += uInk * .5 * pow(max(rr.y, 0.), 24.) * (1. - uDim * .5);
    // a notification: a few vignettes light up white on the hats
    float flash = step(hash13(hId + uHatN * 7.31), .03) * exp(-(uTime - uHatT) * 4.);
    c2 = mix(c2, uInk * 2.4, flash);
    // far below, the mist swallows them; far away, the night
    c2 = mix(c2, uInk * .085, smoothstep(-6., -32., cy));
    col = mix(c2, col, 1. - exp(-tBest * .018));
  } else if (ts > 0.) {
    // the spire and the figure: black cut-outs, a hair of light on their edge
    vec3 p = ro + rd * ts;
    vec3 n = shoreN(p);
    col = uInk * .15 * pow(1. - abs(dot(n, rd)), 3.) * (1. - .5 * uDim);
  }
  col += uInk * glow * 1.6;
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
