import * as THREE from "three";
import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Files on each side of the middle one. */
const FILES = 4;
/** Walkers who turn back on the drop. */
const REV = 6;

// Every framing looks toward the light, or down on the plain it lights: the walkers are always against it.
const FRAMINGS: Framing[] = [
  // low, a long lens toward the monolith: the files running off to the light
  { az: 0.05, el: 0.025, dist: 34, target: [3.5, 1.6, -24], focal: 2.6, weight: 3 },
  // high above: black lines across the white plain, their shadows
  { az: 0.25, el: 1.15, dist: 46, target: [0, 0, -12], focal: 1.6, weight: 2 },
  // in profile, low: the nearest file crossing the frame, the others behind it toward the glow
  { az: 1.3, el: 0.03, dist: 26, target: [0, 1.1, -8], focal: 2.3, weight: 2 },
  // a few walkers going by in the water, their reflections
  { az: 0.55, el: 0.06, dist: 9, target: [1.2, 1, -3], focal: 2, weight: 2 },
  // behind the procession, a little above: the whole pilgrimage toward the light
  { az: -0.12, el: 0.17, dist: 30, target: [0, 1, -30], focal: 2.1, weight: 2 },
];

/**
 * The pilgrimage: on an endless salt flat at dusk, files of small black figures walk toward a monolith of light
 * standing on the horizon, a giant screen nobody ever reaches. The files run off to the light from all over the
 * plain; the walkers are all different (coats, backpacks, sizes), their long shadows stretch back toward us, the
 * thin water on the salt mirrors them. The monolith pulses on the kick; through the build the walk turns into a run;
 * on the drop the monolith flares, the files stop dead, and a few walkers turn round and walk back against the flow.
 * As the night drifts, the files fill up.
 */
export const pilgrimage = defineShaderScene({
  id: "pilgrimage",
  name: "Le Pèlerinage",
  energy: "medium",
  hdr: true,
  // the whole frame is the scene: its light reaches every pixel, the world's background stays behind it
  mask: true,
  renderScale: 0.75,
  camera: { framings: FRAMINGS, glideBars: 3 },
  description:
    "Sur un désert de sel au crépuscule, des files de petites silhouettes noires marchent vers un monolithe de lumière dressé à l'horizon, un écran géant qu'on n'atteint jamais ; leurs longues ombres s'étirent vers nous. Le monolithe pulse au kick, la marche devient course à la montée ; au drop il s'embrase, les files s'arrêtent net et quelques-uns rebroussent chemin.",
  params: [paletteParam("mono")],
  uniforms: () => ({
    uWalk: { value: 0 },
    uRun: { value: 0 },
    uGait: { value: 0 },
    uStand: { value: 0 },
    uPulse: { value: 0 },
    uEcho: { value: 9 },
    uGlow: { value: 0.6 },
    uBurst: { value: 99 },
    uSafe: { value: 0 },
    uDens: { value: 0.7 },
    // the walkers who turned back: x, z, stride phase, on
    uRev: { value: Array.from({ length: REV }, () => new THREE.Vector4()) },
    // state kept on the CPU side only
    uCad: { value: 0.9 },
    uLast: { value: -99 },
  }),
  update(u, f, _p, dt) {
    const rev = u.uRev.value as THREE.Vector4[];
    const bar = f.bpm > 0 ? 240 / f.bpm : 2;
    // Back on screen: nobody walking back yet
    if (f.time - (u.uLast.value as number) > 1.5) {
      for (const r of rev) r.set(0, 0, 0, 0);
      u.uBurst.value = 99;
    }
    u.uLast.value = f.time;
    u.uSafe.value = f.safeFlash ? 1 : 0;
    u.uDens.value = Math.min(0.97, 0.66 + 0.3 * f.drift);

    // The drop: the files stop dead for two bars; a few walkers step out and turn back
    if (f.drop) {
      u.uBurst.value = 0;
      const files = Array.from({ length: FILES * 2 + 1 }, (_, i) => i - FILES).sort(() => Math.random() - 0.5);
      rev.forEach((r, i) => {
        const fi = files[i % files.length];
        r.set(fi * 7 + (Math.random() < 0.5 ? -1 : 1) * (0.9 + 0.4 * Math.random()), -4 - Math.random() * 26, Math.random() * 6.3, 1);
      });
    } else u.uBurst.value = (u.uBurst.value as number) + dt;
    const burst = u.uBurst.value as number;
    const stand = burst < 99 ? smooth(0, 0.25, burst) * (1 - smooth(bar * 2, bar * 3, burst)) : 0;
    u.uStand.value = stand;

    // The gait: a walk, turning into a run late in the build
    const push = f.section === "build" ? f.buildProgress : 0;
    const gait = smooth(0.35, 0.95, push);
    u.uGait.value = (u.uGait.value as number) + (gait - (u.uGait.value as number)) * (1 - Math.exp(-dt * 1.5));
    const g = u.uGait.value as number;
    // cycles a second, and the ground a planted foot covers: the walkers move exactly as fast as their feet carry them
    const cadTarget = (0.9 + 0.5 * g) * (1 + 0.08 * f.drift);
    const cad = (u.uCad.value as number) + (cadTarget - (u.uCad.value as number)) * (1 - Math.exp(-dt * 1.2));
    u.uCad.value = cad;
    const stance = 0.62 + (0.38 - 0.62) * g;
    const travel = 0.62 + 0.1 * g;
    const go = 1 - stand;
    u.uRun.value = (u.uRun.value as number) + dt * Math.PI * 2 * cad * go;
    u.uWalk.value = (u.uWalk.value as number) + dt * (travel * cad) / stance * go;
    // the ones who turned back walk toward us, at a walk, once the others move again (x, z, stride phase, on)
    const back = stand < 0.5 ? 1 : 0;
    for (const r of rev) {
      if (r.w < 0.5) continue;
      r.y += dt * 0.9 * back;
      r.z += dt * Math.PI * 2 * 0.9 * back;
      if (r.y > 45) r.w = 0;
    }

    // The monolith: a pulse on the kick; its light rises through the build
    u.uPulse.value = f.beat ? 1 : (u.uPulse.value as number) * Math.exp(-dt * 6);
    u.uEcho.value = f.beat ? 0 : (u.uEcho.value as number) + dt;
    const glow = 0.55 + 0.6 * push + 0.3 * f.drift;
    u.uGlow.value = (u.uGlow.value as number) + (glow - (u.uGlow.value as number)) * (1 - Math.exp(-dt * 2));
  },
  fragment: /* glsl */ `
uniform float uWalk;     // how far the files have walked
uniform float uRun;      // the stride's phase
uniform float uGait;     // 0 a walk, 1 a run
uniform float uStand;    // the drop: 1 standing still
uniform float uPulse;    // the kick's pulse
uniform float uEcho;     // seconds since the kick: an outline spreads from the monolith
uniform float uGlow;     // the light's level, rising through the build
uniform float uBurst;    // seconds since the drop
uniform float uSafe;     // 1: flashes tamed (one soft ramp, never a pop)
uniform float uDens;     // how full the files are
uniform vec4 uRev[${REV}];  // the walkers who turned back: x, z, stride phase, on
${ART_LIB}
${CAMERA_GLSL}
const float NF = ${FILES}.;
const float FX = 7.;      // between the files
const float S = 1.75;     // between two walkers of a file
const float ZM = -286., HY = 22., MW = 20., MH = 44.;  // the monolith: far ahead, standing on the horizon
const float K = 13.;      // the light is low, straight ahead: a shadow is 13 times as long as its caster is high
const float SA = .0767;   // sine of the light's elevation, 1 / sqrt(1 + K²)
const float ZEND = -200.; // the files end here, lost in the glow before the monolith
const float THR = .75;    // a figure is hit within this many pixels; its edge fades over the next 1.2
const float TMAX = 200.;

float gObj;               // distance to the figures alone (no cell bounds): what the hit and the edges read
float gPose = -1e5;       // which figure the joints below hold
vec3 gHd;                 // toward the monolith, from the camera
float gLight;             // the light's level now
float gFlare;             // the drop's flare of the monolith

// the figure being posed: its joints, feet at y = 0, walking toward -z
vec3 jPel, jUp, jFw;
vec3 jHip[2], jKnee[2], jAnk[2], jToe[2], jSh[2], jEl[2], jHand[2];

/**
 * A walker at stride phase ph; gait 0 a walk (a long stance, the foot barely lifted, arms swinging low), 1 a run
 * (a short stance, a flight, the heel kicking up, elbows bent); stand: standing still, feet together, arms down.
 * The planted foot moves back exactly as fast as the walker goes, so it stays put on the ground. Not full: only the
 * hips and the ankles (a far shadow).
 */
void pose(float ph, float gait, float stand, bool full) {
  float u0 = fract(ph * .15915);
  float st = mix(.62, .38, gait);
  float lean = mix(.04, .13, gait);
  jUp = vec3(0., cos(lean), -sin(lean));
  jFw = vec3(0., -sin(lean), -cos(lean));
  float bob = mix(.018 * cos(12.566 * (u0 - .31)), -.03 * cos(12.566 * (u0 - .19)), gait);
  jPel = vec3(0., mix(.93, .925, gait) + bob * (1. - stand), 0.);
  float travel = mix(.62, .72, gait);
  for (int k = 0; k < 2; k++) {
    float sd = k == 0 ? 1. : -1.;
    float u = fract(u0 + .5 * float(k));
    vec2 f;
    float front = -travel * .45, back = travel * .55;
    if (u < st) {
      float s = u / st;
      f = vec2(mix(front, back, s), .085 + mix(.0, .08, gait) * smoothstep(.55, 1., s));
    } else {
      float s = (u - st) / (1. - st);
      float lift = mix(.12, .38, gait);
      f = vec2(mix(back, front - .04, smoothstep(.1, .9, s)), mix(mix(.11, .165, gait), .085, s) + lift * sin(3.1416 * pow(s, mix(1., .7, gait))) * (1. - .4 * s));
    }
    // standing: feet side by side, flat
    f = mix(f, vec2(0., .085), stand);
    vec3 hip = jPel + vec3(sd * .088, -.04, 0.);
    vec3 v = vec3(sd * .1, f.y, f.x) - hip;
    float l = length(v);
    vec3 dir = v / l;
    l = min(l, .905);
    jHip[k] = hip;
    jAnk[k] = hip + dir * l;
    if (!full) continue;
    float ca = (.2116 + l * l - .2025) / (.92 * l);
    vec3 n = normalize(vec3(0., -dir.z, dir.y));
    vec3 knee = hip + .46 * (dir * ca + n * sqrt(max(1. - ca * ca, 0.)));
    vec3 ank = hip + dir * l;
    vec3 sh = (ank - knee) / .45;
    vec3 swing = normalize(vec3(0., -sh.z - .3, sh.y));
    vec3 flatF = normalize(vec3(0., .03 - ank.y, -max(.18 - ank.y, .03)));
    float w = 1. - smoothstep(st, st + .1, u) + smoothstep(.93, 1., u);
    w = mix(w, 1., stand);
    jKnee[k] = knee;
    jToe[k] = ank + .17 * normalize(mix(swing, flatF, w));
    // the arm swings against the leg on its side: low and loose in a walk, bent in a run, hanging still standing
    float pa = u < st ? .5 * u / st : .5 + .5 * (u - st) / (1. - st);
    float th = (mix(.02, .05, gait) - mix(.28, .5, gait) * cos(6.2832 * pa)) * (1. - stand);
    float eb = th * .4 + mix(.25, 1.5, gait) * (1. - stand) + .12 * stand;
    vec3 s = jPel + jUp * .45 + vec3(sd * .18, 0., 0.);
    vec3 e = s + .27 * vec3(sd * .1, -cos(th), -sin(th));
    jSh[k] = s;
    jEl[k] = e;
    jHand[k] = e + .24 * vec3(-sd * .12, -cos(eb), -sin(eb));
  }
}

/** A limb from a to b, tapering from ra to rb. */
float sdTaper(vec3 p, vec3 a, vec3 b, float ra, float rb) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.);
  return length(pa - ba * h) - mix(ra, rb, h);
}

/**
 * A walker, only its outline will show: an ordinary person, each one different (h: its own random numbers) — a long
 * coat over the thighs or not, a backpack, a bun. lod: far away (no hands, feet nor shoulders).
 */
float walker(vec3 q, vec4 h, bool lod) {
  vec3 pel = jPel, up = jUp;
  float d;
  if (q.y > .6) {
    d = sdEllipsoid(q - pel - up * .03, vec3(.14, .11, .105));
    d = smin(d, sdCapsule(q, pel + up * .08, pel + up * .26, .115), .07);
    d = smin(d, sdEllipsoid(q - pel - up * .36, vec3(.165, .16, .11)), .08);
    if (!lod) {
      vec3 nb = pel + up * .52;
      d = smin(d, sdCapsule(q, nb, jSh[0], .05), .06);
      d = smin(d, sdCapsule(q, nb, jSh[1], .05), .06);
      d = smin(d, sdCapsule(q, nb, pel + up * .6 + vec3(0., 0., -.02), .054), .04);
    }
    d = smin(d, sdEllipsoid(q - pel - up * .69 - vec3(0., 0., -.02), vec3(.085, .105, .098)), lod ? .07 : .035);
    // a bun at the back of the head
    if (h.z > .78 && !lod) d = smin(d, length(q - pel - up * .74 - vec3(0., 0., .08)) - .05, .03);
    // a backpack
    if (h.w > .7) d = lod ? min(d, sdBox(q - pel - up * .32 - vec3(0., 0., .15), vec3(.16, .2, .1))) : smin(d, sdBox(q - pel - up * .32 - vec3(0., 0., .15), vec3(.13, .17, .07)) - .03, .03);
    for (int k = 0; k < 2; k++) {
      d = smin(d, sdTaper(q, jSh[k], jEl[k], .05, .04), .04);
      d = smin(d, sdTaper(q, jEl[k], jHand[k], .04, .03), .025);
      if (!lod) d = smin(d, length(q - jHand[k]) - .042, .02);
    }
  } else d = .78 - q.y;
  if (q.y < 1.12) {
    for (int k = 0; k < 2; k++) {
      d = smin(d, sdTaper(q, jHip[k], jKnee[k], .08, .055), .06);
      d = smin(d, sdTaper(q, jKnee[k], jAnk[k], .055, .036), .025);
      if (!lod) d = smin(d, sdTaper(q, jAnk[k] + vec3(0., -.04, .03), jToe[k], .04, .025), .03);
    }
  }
  // a long coat, from the shoulders to the knees, flaring a little; it swings with the hips
  if (h.y > .55) {
    vec3 c = q - pel;
    float y = dot(c, up);
    float r = mix(.2, .25, smoothstep(.4, -.45, y));
    float coat = max(length((c - up * y).xz * vec2(1., 1.25)) - r, abs(y + .02) - .48);
    d = smin(d, coat, .04);
  }
  return d;
}

/** The walker of a file's cell: its random numbers (x: occupied when under uDens). */
vec4 walkerHash(float fi, float ci) { return vec4(hash12(vec2(fi, ci) + .37), hash12(vec2(ci, fi) * 1.7 + 3.1), hash12(vec2(fi * 3.1, ci) + 7.7), hash12(vec2(ci * .7, fi) + 1.9)); }
/** A file's x, snaking a little across the plain. */
float fileX(float fi, float z) { return fi * FX + 1.2 * sin(z * .045 + fi * 2.1) + .6 * sin(z * .11 + fi * 5.3); }

float map(vec3 p) {
  gObj = 1e3;
  float outside = max(max(max(abs(p.x) - (NF + .5) * FX, p.y - 2.1), -p.y), ZEND - p.z);
  if (outside > 0.) return outside + .05;
  float fi = clamp(floor(p.x / FX + .5), -NF, NF);
  float o = p.x - fileX(fi, p.z);
  // the next file's walkers are at least this far (its snaking, their width)
  float bound = FX - abs(p.x - fi * FX) - 2.4;
  float d = 1e3;
  if (abs(o) < 1.2) {
    // the walker of this cell, and its neighbour's edge
    float zz = p.z + mod(uWalk, S);
    float ci = floor(zz / S + .5);
    vec4 h = walkerHash(fi, ci + floor(uWalk / S));
    float cz = zz - ci * S;
    if (h.x < uDens) {
      float sc = .88 + .17 * h.z;
      vec3 q = vec3(o - .3 * (h.w - .5), p.y, cz - .25 * (h.y - .5)) / sc;
      float b = sdBox(q - vec3(0., .95, 0.), vec3(.45, .98, .55)) * sc;
      if (b < .3) {
        float key = fi * 1000. + ci;
        if (gPose != key) { pose(uRun + h.y * 6.28, uGait, uStand, true); gPose = key; }
        b = walker(q, h, length(p - uCamPos) > 18.) * sc;
      }
      d = b;
    }
    // the walkers of the next cells are at least this far (their boxes reach .75 from their cells' centres), unless
    // the ray is clear beside the file
    bound = min(bound, max(max(S - .75 - abs(cz), .06), abs(o) - .7));
  } else bound = min(bound, abs(o) - .7);
  // the ones walking back against the flow
  for (int i = 0; i < ${REV}; i++) {
    vec4 R = uRev[i];
    if (R.w < .5) continue;
    vec3 q = vec3(-(p.x - R.x), p.y, -(p.z - R.y));
    float b = sdBox(q - vec3(0., .95, 0.), vec3(.45, .98, .55));
    if (b < .3) {
      gPose = -1e5;
      pose(R.z, 0., 0., true);
      b = walker(q, vec4(.5, .3, .2, .9), false);
    }
    d = min(d, b);
  }
  gObj = d;
  return min(d, bound);
}

/** The shadow of segment a-b (radius r) cast on the ground, at ground point p (in light space): distance / penumbra. */
float shadowSeg(vec2 p, vec3 a, vec3 b, float r, float w0) {
  vec2 A = vec2(a.x, (a.z + a.y * K) * SA), B = vec2(b.x, (b.z + b.y * K) * SA);
  vec2 pa = p - A, ba = B - A;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0., 1.);
  return (length(pa - ba * h) - r) / (w0 + .03 * mix(a.y, b.y, h));
}
/** The posed figure's shadow at ground point q (its own frame): < -1 in full shadow, > 1 in the light. */
float figShadow(vec2 q, bool lod, float w0) {
  vec2 p = vec2(q.x, q.y * SA);
  float s = shadowSeg(p, jPel, jPel + jUp * .5, .16, w0);
  s = min(s, shadowSeg(p, jPel + jUp * .62, jPel + jUp * .74, .085, w0));
  for (int k = 0; k < 2; k++) {
    if (lod) { s = min(s, shadowSeg(p, jHip[k], jAnk[k], .065, w0)); continue; }
    s = min(s, shadowSeg(p, jHip[k], jKnee[k], .075, w0));
    s = min(s, shadowSeg(p, jKnee[k], jAnk[k], .045, w0));
    s = min(s, shadowSeg(p, jSh[k], jEl[k], .045, w0));
    s = min(s, shadowSeg(p, jEl[k], jHand[k], .035, w0));
  }
  return s;
}
/** How much of the monolith's light the walkers hold off ground point g (x, z): 0..1. */
float fileShadow(vec2 g) {
  gPose = -1e5;
  float fi = clamp(floor(g.x / FX + .5), -NF, NF);
  float o = g.x - fileX(fi, g.y);
  if (abs(o) > .9) return 0.;
  float zz = g.y + mod(uWalk, S);
  float c0 = floor(zz / S + .5);
  float s = 1e3;
  // the walkers ahead whose shadows reach back this far (the nearest posed, the others as trunks)
  for (int j = 0; j < 14; j++) {
    float ci = c0 - float(j);
    vec4 h = walkerHash(fi, ci + floor(uWalk / S));
    if (h.x >= uDens) continue;
    float sc = .88 + .17 * h.z;
    vec2 q = vec2(o - .3 * (h.w - .5), zz - ci * S - .25 * (h.y - .5)) / sc;
    // walkers further ahead cast no shadow this far back
    if (q.y > 1.85 * K + 1.) break;
    if (q.y < -.9) continue;
    if (j < 3) {
      pose(uRun + h.y * 6.28, uGait, uStand, false);
      s = min(s, figShadow(q, true, .006 / sc));
    } else {
      vec2 p = vec2(q.x, q.y * SA);
      const vec3 P0 = vec3(0., .93, 0.), U0 = vec3(0., .999, -.04);
      s = min(s, shadowSeg(p, P0, P0 + U0 * .5, .17, .006 / sc));
      s = min(s, shadowSeg(p, P0 + U0 * .62, P0 + U0 * .74, .085, .006 / sc));
    }
  }
  return 1. - smoothstep(-1., 1., s);
}

/** The monolith seen at mp (on its plane, centred); fp: a pixel there. A white slab with rounded corners, its halo. */
float monolith(vec2 mp, float fp) {
  vec2 hs = vec2(MW, MH) * .5 * (1. + .015 * uPulse);
  vec2 q = abs(mp) - hs + 4.;
  float d = length(max(q, 0.)) + min(max(q.x, q.y), 0.) - 4.;
  float w = max(fp, .05);
  float fill = 1. - smoothstep(-w, w, d);
  float dd = max(d, 0.);
  float halo = exp(-dd * .12) * .5 + exp(-dd * .025) * .2;
  float echo = (1. - smoothstep(0., w * 2., abs(d - uEcho * 30.))) * exp(-uEcho * 2.5) * 1.2;
  float beat = 1. + .45 * uPulse * (1. - .4 * uSafe);
  return mix(halo * gLight * beat * (1. + 2. * gFlare), 7. * beat * (1. + gFlare), fill) + echo * (1. - fill);
}

/** The sky's light in direction rd: dusk, dark above, the horizon lit, brighter toward the monolith. */
float sky(vec3 rd) {
  float c = max(dot(rd, gHd), 0.);
  float hz = exp(-max(rd.y, 0.) * 5.);
  float c2 = c * c, c8 = c2 * c2;
  c8 *= c8;
  return gLight * (.09 + hz * (.38 + .3 * c2 + .25 * c8) + .05 * smoothstep(.2, .9, rd.y));
}
float haze(vec3 rd) { return sky(vec3(rd.x, min(rd.y, 0.), rd.z)); }
/** The haze between a figure t away and us: never enough to grey it out against the light. */
float figHaze(float hz, float t) { return min(hz, .55) * (1. - exp(-t * .006)); }

/** The salt crust: polygons with raised rims (distance to the nearest rim, and the cell's own number). */
vec2 salt(vec2 x) {
  vec2 g = x / 1.6;
  vec2 i0 = floor(g);
  float d1 = 9., d2 = 9., id = 0.;
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 c = i0 + vec2(i, j);
      vec2 o = vec2(hash12(c), hash12(c + 5.3));
      float d = length(g - c - o);
      if (d < d1) { d2 = d1; d1 = d; id = hash12(c + 9.1); }
      else if (d < d2) d2 = d;
    }
  return vec2((d2 - d1) * 1.6 * .5, id);
}
/** Thin water lying on the salt, in broad patches. */
float wetness(vec2 x) {
  float n = vnoise(vec3(x * .035, 1.3)) * .65 + vnoise(vec3(x * .09, 7.1)) * .35;
  return smoothstep(.56, .6, n);
}

/** The drop's flood of white from the monolith: it runs out over the frame and ebbs; tamed, one soft swell of light. */
float flood(vec3 rd) {
  if (uBurst > 6.) return 0.;
  if (uSafe > .5) return .6 * smoothstep(0., 1.4, uBurst) * (1. - smoothstep(1.6, 5.5, uBurst));
  float ang = acos(clamp(dot(rd, gHd), -1., 1.));
  float tp = uBurst - ang / 1.5;
  return 2.2 * smoothstep(-.1, .2, tp) * exp(-max(tp, 0.) * 1.2);
}

/** March the figures from ro along rd up to tf: the hit (-1: none), the nearest miss in pixels, where it was. */
vec3 marchFigures(vec3 ro, vec3 rd, float tf, float pa, int steps) {
  float tt = -1., m = 1e3, tm = 0.;
  // only where the ray crosses the procession's slab
  vec3 bc = vec3(0., 1.05, 0.), bh = vec3((NF + .5) * FX, 1.1, 1e4);
  vec3 im = 1. / rd, n = im * (ro - bc), k = abs(im) * bh;
  vec3 t1 = -n - k, t2 = -n + k;
  float tn = max(max(t1.x, t1.y), t1.z);
  tf = min(min(min(t2.x, t2.y), t2.z), tf);
  if (tn < tf && tf > 0.) {
    float t = max(tn, .05);
    for (int i = 0; i < 140; i++) {
      if (i >= steps) break;
      float d = map(ro + rd * t);
      float px = gObj / (t * pa);
      if (px < m) { m = px; tm = t; }
      if (px < THR) { tt = t; break; }
      t += d * .9;
      if (t > tf) break;
    }
  }
  return vec3(tt, m, tm);
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 ro = uCamPos;
  mat3 cam = lookAt(ro, uCamTarget);
  vec3 rd = cam * normalize(vec3(uv, uFocal));
  float pa = 1. / (uRes.y * uFocal);
  gHd = normalize(vec3(0., HY, ZM) - ro);
  gFlare = uBurst < 6. ? (uSafe > .5 ? .5 * smoothstep(0., 1.2, uBurst) : 1.) * exp(-uBurst * .8) : 0.;
  gLight = (.55 + .5 * uGlow) * (1. + .14 * uPulse * (1. - .5 * uSafe));
  float tg = rd.y < -1e-4 ? -ro.y / rd.y : 1e5;
  float hzRd = haze(rd);
  vec2 gw = fwidth((ro + rd * min(tg, 1e3)).xz);

  vec3 fm = marchFigures(ro, rd, min(tg, TMAX), pa, 130);
  float tt = fm.x, m = fm.y, tm = fm.z;
  float cov = tt > 0. ? 1. : 1. - smoothstep(THR, THR + 1.2, m);

  // what is behind them: the lit salt, or the sky and the monolith
  vec3 col = vec3(0.);
  if (cov < 1.) {
    float lum;
    if (tg < 1e4) {
      vec3 p = ro + rd * tg;
      // the salt crust, its polygon rims raised (lit on their far side, a hair of shadow on the near one)
      vec2 sl = salt(p.xz);
      float rimW = max(.03, max(gw.x, gw.y) * 1.2);
      float rim = 1. - smoothstep(0., rimW, sl.x);
      float alb = (.62 + .06 * sl.y) * (1. + .35 * rim * .03 / rimW);
      float sh = p.z > -70. && p.z < 50. ? fileShadow(p.xz) : 0.;
      lum = alb * gLight * (.85 * (1. - .93 * sh) + .1);
      // the thin water: the sky and the monolith in it, and the walkers' reflections
      float wet = wetness(p.xz);
      if (wet > .01) {
        vec3 rr = vec3(rd.x, -rd.y, rd.z);
        float F = .03 + .97 * pow(1. - abs(rd.y), 5.);
        float refl = sky(rr);
        if (rr.z < -1e-3) {
          float th = (ZM - p.z) / rr.z;
          refl += monolith((p.xy + rr.xy * th - vec2(0., HY)), th * pa) * .9;
        }
        // the walkers mirrored (only near: far, a reflection is lost in the glare)
        if (tg < 45.) {
          vec3 rf = marchFigures(p + rr * .02, rr, 4., pa, 40);
          float rc = rf.x > 0. ? 1. : 1. - smoothstep(THR, THR + 1.2, rf.y);
          refl *= 1. - .9 * rc;
        }
        // the hats: rings spreading on the water
        vec2 rc = floor(p.xz / 3.);
        vec2 rcen = (rc + .2 + .6 * vec2(hash12(rc + 3.7), hash12(rc + 8.1))) * 3.;
        float age = fract(uTime * .6 + hash12(rc + 1.3));
        float ring = exp(-pow((length(p.xz - rcen) - age * 1.3) / max(.02, gw.x), 2.)) * (1. - age) * uHat;
        // (seen from above the salt shows through, a little darker; at a grazing angle the water is a mirror)
        lum = mix(lum, lum * mix(.75, .1, F) + mix(.18, .9, F) * refl * (1. - .6 * sh) + ring * .5 * gLight, wet);
      }
      lum = mix(lum, hzRd, 1. - exp(-tg * .005));
    } else {
      lum = sky(rd);
    }
    // the monolith, far ahead, above the ground
    if (rd.z < -1e-3) {
      float th = (ZM - ro.z) / rd.z;
      if (th > 0. && th < tg) lum += monolith(ro.xy + rd.xy * th - vec2(0., HY), th * pa);
    }
    // a one-pixel rim where the light wraps round the figures' edges
    float rx = (m - THR - .9) * 2.;
    float rimL = tt > 0. ? 0. : exp(-rx * rx) * .5 * (.4 + .6 * max(dot(rd, gHd), 0.));
    col = uInk * lum * (1. + rimL);
  }
  // the figures: black, only the haze between them and us
  col = mix(col, uInk * figHaze(hzRd, tt > 0. ? tt : tm), cov);
  // the drop: a flood of white from the monolith (the silhouettes hold)
  col += uInk * flood(rd) * gLight * (1. - .97 * cov);
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
