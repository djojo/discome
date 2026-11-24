import * as THREE from "three";
import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB, MARCH } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";

const FRAMINGS: Framing[] = [
  // the hero shot: three-quarters, a little above, the pyramid of bars and its reflection in the bath
  { az: 0.75, el: 0.22, dist: 2.1, target: [0, 0.12, 0], focal: 2.2, weight: 3 },
  // low, from the ends of the bars: the stepped silhouette against the black
  { az: 1.45, el: 0.08, dist: 1.9, target: [0, 0.13, 0], focal: 2.3, weight: 2 },
  // close on the waterline, where the gold dissolves into the mercury
  { az: -0.5, el: 0.1, dist: 1.35, target: [0.05, 0.03, 0.45], focal: 2.4, weight: 2 },
  // the coins, close
  { az: 0.35, el: 0.2, dist: 1.25, target: [0.42, 0.08, 0.3], focal: 2.4, weight: 1 },
  // from above: the slick of gold spreading in the bath (also the drop's framings)
  { az: 0.4, el: 0.6, dist: 2.7, target: [0, 0.04, 0.05], focal: 2, weight: 1, tag: "open" },
  { az: -0.9, el: 0.38, dist: 2.8, target: [0, 0.08, 0], focal: 2, weight: 1, tag: "open" },
];

const smooth = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

/** Height the kick's drop falls from (it lands on the next beat). */
const FALL = 1.9;

/**
 * La Fonte: a pile of gold bars and coins in a black product-photography studio, shot like a luxury advert, standing
 * in a bath of mercury that slowly dissolves it from its foot up: the edges soften, runs of gold slide down, the pile
 * sinks, a halo of amalgam swirls out into the mercury. The money never moves to the music: on each kick a drop of gold
 * falls into the bath (it lands on the beat) and rings spread; through the build the melt speeds up and the foot of the
 * pile glows; on the drop the whole pile slumps into one incandescent pour that spreads over the mercury and mixes into
 * it. Long after, a new pile rises out of the bath, coated in mercury.
 */
export const melt = defineShaderScene({
  id: "mercury-melt",
  name: "La Fonte",
  energy: "medium",
  hdr: true,
  renderScale: 0.85,
  // a closed black studio: the world's background never shows through it
  mask: true,
  camera: { framings: FRAMINGS, glideBars: 3 },
  description:
    "Une pile de lingots et de pièces d'or dans un studio noir de photo produit, filmée comme une publicité de luxe, qui fond lentement dans un bain de mercure ; une goutte d'or tombe à chaque kick ; la fonte s'accélère pendant la montée ; au drop, toute la pile s'effondre en une coulée qui se mêle au mercure.",
  params: [paletteParam("mercury")],
  uniforms: () => ({
    uMelt: { value: 0.2 },
    uDripT: { value: 0 },
    uHeat: { value: 0 },
    uCollapse: { value: 0 },
    uPour: { value: 99 },
    uRise: { value: 1 },
    uRings: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 99, 0)) },
    uFall: { value: new THREE.Vector4(0, FALL, 0.8, 0) },
    uSweep: { value: 9 },
    // CPU side only
    uLast: { value: -99 },
    uColAge: { value: 99 },
    uRiseAge: { value: -1 },
    uRate: { value: 0.004 },
    uKickLive: { value: 0 },
  }),
  update(u, f, _p, dt, ctx) {
    const bar = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;
    const rings = u.uRings.value as THREE.Vector4[];
    const fall = u.uFall.value as THREE.Vector4;
    // Back on screen: a new pile, already sweating a little
    const fresh = f.time - (u.uLast.value as number) > 1.5;
    u.uLast.value = f.time;
    if (fresh) {
      u.uMelt.value = 0.08 + 0.25 * Math.random();
      u.uColAge.value = 99;
      u.uRiseAge.value = -1;
      u.uPour.value = 99;
      u.uHeat.value = 0;
      u.uSweep.value = 9;
      u.uRate.value = 0.004;
      for (const r of rings) r.set(0, 0, 99, 0);
      fall.w = 0;
    }
    let colAge = u.uColAge.value as number;
    let riseAge = u.uRiseAge.value as number;

    // The drop (or cut to on it): the pile slumps into one pour, the light sweeps the studio
    if (f.drop || (fresh && f.section === "drop" && f.dropPulse > 0.6)) {
      u.uSweep.value = 0;
      u.uHeat.value = 1;
      if (colAge > 90 || riseAge >= 0) {
        colAge = 0;
        u.uPour.value = 0;
        ctx.camera?.request("open");
      }
    } else u.uSweep.value = Math.min(9, (u.uSweep.value as number) + dt / bar);
    if (colAge < 90) colAge += dt;
    u.uCollapse.value = colAge < 90 ? smooth(colAge / (1.5 * bar)) : 0;
    const pour = u.uPour.value as number;
    u.uPour.value = pour < 90 ? (pour + dt > 45 ? 99 : pour + dt) : 99;
    // Long after the pour, a new pile rises out of the bath (fresh bars, coated in mercury)
    if (colAge < 90 && colAge > Math.max(16, 8 * bar) && riseAge < 0) {
      riseAge = 0;
      colAge = 99;
      u.uCollapse.value = 0;
      u.uMelt.value = 0;
    }
    if (riseAge >= 0) {
      riseAge += dt;
      if (riseAge > 4 * bar) riseAge = -1;
    }
    u.uRise.value = riseAge >= 0 ? smooth(riseAge / (4 * bar)) : 1;
    u.uColAge.value = colAge;
    u.uRiseAge.value = riseAge;

    // The melt at its own slow pace, faster and faster through the build (it never goes back: only a new pile does)
    const build = f.section === "build";
    const bp = build ? f.buildProgress : 0;
    const rateT = build ? 0.004 + 0.05 * bp * bp : f.section === "breakdown" ? 0.0015 : 0.004;
    const rate = (u.uRate.value as number) + (rateT - (u.uRate.value as number)) * (1 - Math.exp(-dt * 0.7));
    u.uRate.value = rate;
    const cap = build ? 0.6 + 0.4 * bp : 0.6;
    const m = u.uMelt.value as number;
    if (m < cap) u.uMelt.value = Math.min(cap, m + dt * rate);
    u.uDripT.value = (u.uDripT.value as number) + dt * (0.04 + 2.5 * rate);
    // The heat: the foot of the pile glows through the build; the drop sets it all alight, then it cools
    const heatT = build ? 0.6 * Math.pow(bp, 1.5) : 0;
    const h = u.uHeat.value as number;
    u.uHeat.value = h + (heatT - h) * (1 - Math.exp(-dt / (h > heatT ? 2.5 : 1.2)));

    // The kick's drop of gold: it falls through the beat and lands on the next one, where its rings start
    for (const r of rings) r.z += dt;
    const live = f.beat ? 1 : (u.uKickLive.value as number) * Math.exp(-dt / (bar * 0.5));
    u.uKickLive.value = live;
    const spawn = (x: number, z: number) => {
      for (let i = 3; i > 0; i--) rings[i].copy(rings[i - 1]);
      rings[0].set(x, z, 0, 1);
    };
    // in the bath beside the pile, on our side of it, so we see it land (never right under the lens: up close it
    // would fall past the camera as a huge blob)
    const pick = (): [number, number] => {
      const cam = ctx.camera;
      const az = cam ? Math.atan2(cam.pos.x, cam.pos.z) : 0.75;
      let best: [number, number] = [0, 0.8];
      let far = -1;
      for (let i = 0; i < 6; i++) {
        const a = az + (Math.random() < 0.5 ? -1 : 1) * (0.45 + 0.9 * Math.random());
        const r = 0.6 + 0.3 * Math.random();
        const x = Math.sin(a) * r, z = Math.cos(a) * r;
        const d = cam ? Math.hypot(cam.pos.x - x, cam.pos.z - z) : 2;
        if (d > far) [best, far] = [[x, z], d];
        if (d > 1.1) break;
      }
      return best;
    };
    if (f.bpm > 0) {
      if (f.tick) {
        if (fall.w > 0.5) spawn(fall.x, fall.z);
        const [x, z] = pick();
        fall.set(x, FALL, z, live > 0.3 ? 1 : 0);
      }
      fall.y = FALL * (1 - f.beatPhase * f.beatPhase);
    } else {
      fall.w = 0;
      if (f.beat) spawn(...pick());
    }
  },
  fragment: /* glsl */ `
uniform float uMelt;      // 0..1: how far the bath has dissolved the pile (from its foot up)
uniform float uDripT;     // the runs' clock: they slide faster as the melt speeds up
uniform float uHeat;      // 0..1: the molten metal glowing (through the build, flaring on the drop)
uniform float uCollapse;  // 0..1: the drop's collapse (1: the pile is gone, poured into the bath)
uniform float uPour;      // seconds since the pour began (99: none)
uniform float uRise;      // 0..1: a new pile rising out of the bath (1: standing)
uniform vec4 uRings[4];   // the kicks' drops landing: x, z, age (s), strength
uniform vec4 uFall;       // the drop falling now: x, height of its tip, z, shown
uniform float uSweep;     // the drop's blade of light (bars since the drop)
${ART_LIB}
${CAMERA_GLSL}

// A bar: half length and half width at its base and top, half height; rows of bars side by side
const float BL = .28, BLT = .25, BW = .11, BT = .08, BH = .05, ROW = .24;
// coins: radius, thickness
const float RC = .075, TH = .014;
const vec3 GOLD = vec3(1., .74, .33);
// the region where the gold stands (marched); the bath beyond it is a plane
const vec3 BMIN = vec3(-.92, -.06, -.78), BMAX = vec3(.92, .5, .92);
const vec3 S1 = vec3(.47, .32, 11.), S2 = vec3(.6, -.12, 6.), S3 = vec3(-.5, .4, 14.), S4 = vec3(.04, .64, 7.);

// the camera's frame (horizontal), the key lights, the fillet where gold meets mercury: set in main.
// gT: below it a bound is not good enough, the true distance is needed (smin with the bath would build a fillet on it)
vec3 gFwd, gSide, gKey, gTop;
float gK, gT;
// 1 while shading metal standing up (the drop's blade sweeps it, not the bath, where it would stand as a pillar)
float gBlade;

/** Height of the pile's foot: a little under the surface, deeper as it dissolves, still under the bath while rising. */
float lift() { return -.02 - .13 * uMelt - (1. - uRise) * .62; }

/** The local melt: the bath eats the pile from its foot up, unevenly. */
float meltAt(float y, float h) { return clamp(uMelt * 1.6 - y * 1.4 + (h - .5) * .3 + uCollapse * 2., 0., 1.); }

/** Runs of molten gold sliding down a face. */
float runs(vec3 b, float h) {
  return smoothstep(.6, .9, vnoise(vec3(b.x * 30. + h * 31., b.y * 3.5 + uDripT, b.z * 30.)));
}

/** A bullion bar: a truncated pyramid with edges rounded by r. */
float sdBar(vec3 p, float r) {
  const float kx = (BL - BLT) / (2. * BH), kz = (BW - BT) / (2. * BH);
  float y = p.y + BH;
  vec3 q = vec3((abs(p.x) - BL + r + kx * y) * inversesqrt(1. + kx * kx),
                abs(p.y) - BH + r,
                (abs(p.z) - BW + r + kz * y) * inversesqrt(1. + kz * kz));
  return length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.) - r;
}

/** The pyramid of bars: 4, 3, 2, 1, each layer in the grooves of the one below; it settles as it melts. */
float pile(vec3 q) {
  float d = 1e3;
  float sag = 1. - .18 * uMelt;
  for (int i = 0; i < 4; i++) {
    float fi = float(i), n = 4. - fi;
    float yc = (fi * 2. + 1.) * BH * sag;
    float slab = abs(q.y - yc) - BH - .035;
    if (slab > gT) { d = min(d, slab); continue; }
    float j = clamp(floor(q.z / ROW + (n - 1.) * .5 + .5), 0., n - 1.);
    float h = hash12(vec2(fi * 7.1, j + 1.3));
    vec3 b = q - vec3((h - .5) * .04, yc, (j - (n - 1.) * .5) * ROW);
    b.xz *= rot((h - .5) * .06);
    float m = meltAt(q.y, h);
    float bd = sdBar(b, .008 + .026 * m) - .012 * m * m;
    if (m > .02 && bd < .03) bd -= .009 * m * runs(b, h);
    d = min(d, bd);
  }
  return d;
}

/** A stack of coins (s: x, z, count), each a little off the one below. */
float stack(vec3 q, vec3 s) {
  vec3 c = q - vec3(s.x, 0., s.y);
  float H = s.z * TH;
  float bound = max(length(c.xz) - RC, abs(c.y - H * .5) - H * .5) - .03;
  if (bound > gT) return bound;
  float k = clamp(floor(c.y / TH), 0., s.z - 1.);
  vec2 xz = c.xz - (vec2(hash12(vec2(k, s.x * 9.)), hash12(vec2(s.y * 7., k))) - .5) * .014;
  float m = meltAt(c.y, fract(s.x * 3.7));
  float r = .003 + .012 * m;
  vec2 w = vec2(length(xz) - RC + r, abs(c.y - H * .5) - H * .5 + r);
  float d = min(max(w.x, w.y), 0.) + length(max(w, 0.)) - r;
  // the seams between the coins, and the raised rim of the top one
  float e = abs(fract(c.y / TH) - .5) * 2.;
  d += .0022 * smoothstep(.7, 1., e) * step(c.y, H - TH * .5) * (1. - m);
  d -= .0012 * smoothstep(RC * .8, RC * .88, length(xz)) * step(H - TH * .5, c.y) * (1. - m);
  d -= .01 * m * m;
  if (m > .02 && d < .03) d -= .01 * m * runs(c, s.x);
  return d;
}

/** Everything made of gold. On the drop it slumps, spreads and turns into a mound that flattens into the bath. */
float solids(vec3 p) {
  if (uCollapse > .999) return 1e3;
  vec3 q = p - vec3(0., lift(), 0.);
  float c = uCollapse;
  float sq = 1. - .8 * c, sp = 1. + .3 * c;
  vec3 s = vec3(q.x / sp, q.y / sq, q.z / sp);
  float d = sdBox(s - vec3(0., .2, .07), vec3(.72, .26, .72));
  if (d < gT + .02) d = min(pile(s), min(min(stack(s, S1), stack(s, S2)), min(stack(s, S3), stack(s, S4))));
  d *= sq;
  if (c > .45) d = mix(d, (q.y - .3 * (1. - c) * exp(-dot(q.xz, q.xz) * 4.)) * .9, smoothstep(.45, 1., c));
  return d;
}

/** The bath (flat: its ripples live in its normals) and the gold standing in it, joined by a fillet of melt. */
float map(vec3 p) { return smin(p.y, solids(p), gK); }
${MARCH}

float angDiff(float a, float b) { return abs(mod(a - b + PI, 2. * PI) - PI); }
/** Azimuth of a direction around the subject: 0 toward the camera, ±PI behind the subject. */
float azOf(vec3 r) {
  float x = dot(r, gFwd), y = dot(r, gSide);
  return atan(y, abs(x) + abs(y) < 1e-6 ? 1. : x);
}

/** The black seamless behind the subject, a soft spot of light on it. */
vec3 backdrop(vec3 r) {
  float back = PI - abs(azOf(r));
  return uBase * .35 + mix(uInk, uTint, .3) * .16 * exp(-back * back * 2.5 - (r.y - .12) * (r.y - .12) * 10.);
}

/**
 * The product studio, what the metal reflects (out of frame, all of it): a dim room in front and on the sides, a
 * graded strip box behind the camera, two big softboxes on the sides, a top box, two strips behind the subject that
 * draw its edges. Behind the subject it stays black, so the bath stays a dark mirror.
 */
vec3 env(vec3 r) {
  vec3 c = backdrop(r);
  float az = azOf(r), ka = abs(az);
  float front = 1. - smoothstep(1.9, 2.6, ka);
  c += vec3(.9, .88, .85) * (.06 + .16 * smoothstep(-.1, .8, r.y)) * front;
  // the key: a long strip box behind the camera, graded (it models the faces turned to us)
  float ke = (r.y - .32) / .17;
  c += vec3(1., .95, .88) * 3.2 * exp(-ke * ke) * (1. - smoothstep(.5, .9, ka)) * (.5 + .5 * smoothstep(.15, .55, r.y));
  // two big softboxes on the sides, brighter at the top; the right one leans to the world's colour
  float sides = smoothstep(-.12, .1, r.y) * (1. - smoothstep(.5, .7, r.y)) * (.45 + .55 * smoothstep(0., .5, r.y));
  c += vec3(1., .96, .9) * 2. * (1. - smoothstep(.3, .5, angDiff(az, 1.5))) * sides;
  c += mix(vec3(1.), uTint, .35) * 1.7 * (1. - smoothstep(.3, .5, angDiff(az, -1.5))) * sides;
  // a top box right over the subject, and a big dim scrim behind it, up high (the tops of the bars, the bath far off)
  c += vec3(1.) * 2.5 * smoothstep(.88, .96, dot(r, gTop));
  c += vec3(.88, .88, .92) * .32 * smoothstep(.1, .4, r.y) * (1. - smoothstep(.85, .98, r.y)) * smoothstep(1.8, 2.5, ka);
  // the strips stand behind the subject, left and right; one of them in the world's colour, breathing with the bass
  float drift = .12 * sin(uTime * .05);
  float band = smoothstep(-.1, .05, r.y) * (1. - smoothstep(.55, .75, r.y));
  c += vec3(1., .98, .95) * 2.2 * (1. - smoothstep(.07, .18, angDiff(az, PI - .8 + drift))) * band;
  c += uTint * 2.8 * (.8 + .4 * uBass) * (1. - smoothstep(.07, .18, angDiff(az, .8 - PI + drift))) * band;
  // the drop: a blade of light sweeping once round the studio
  if (uSweep < 1.3) c += vec3(1.) * 3. * gBlade * (1. - smoothstep(.03, .1, angDiff(az, uSweep * 2. * PI - PI))) * (1. - uSweep * .7) * smoothstep(-.2, .1, r.y);
  return c;
}

/** Molten metal: dull red, orange, then a white-gold. */
vec3 heatCol(float x) {
  vec3 c = vec3(1., .16, .02) * .7;
  c = mix(c, vec3(1., .42, .07) * 1.8, smoothstep(.3, .7, x));
  c = mix(c, vec3(1., .74, .4) * 2.8, smoothstep(.75, 1.2, x));
  return c * smoothstep(.08, .35, x);
}

/** The gold, lit by the studio; where it meets the mercury it turns to a pale amalgam. */
vec3 shadeGold(vec3 p, vec3 rd, vec3 n, float wS, bool full) {
  gBlade = 1.;
  float y = p.y - lift();
  vec3 r = reflect(rd, n);
  // below, the bath: a dark mirror of the studio
  vec3 e = r.y > 0. ? env(r) : env(vec3(r.x, -r.y, r.z)) * uInk * .5;
  float fre = pow(1. - clamp(dot(n, -rd), 0., 1.), 5.);
  float am = .6 * (1. - smoothstep(.5, .95, wS)) + .35 * (1. - smoothstep(0., .015 + .08 * uMelt, p.y));
  // a pile rising out of the bath comes out wet with mercury
  float coat = (1. - smoothstep(.85, 1., uRise)) * (1. - smoothstep(.06, .22, p.y));
  vec3 F0 = mix(GOLD, uInk * .85, clamp(max(am, coat), 0., 1.));
  vec3 col = e * mix(F0, vec3(1.), fre);
  if (full) col *= .25 + .75 * calcAO(p, n);
  float rn = smoothstep(.45, .8, vnoise(vec3(p.x * 30., y * 3.5 + uDripT, p.z * 30.)));
  // the heat climbs from the waterline as it grows; on the drop the whole slumping mass glows
  float above = max(p.y, 0.);
  col += heatCol(uHeat * (1.2 * exp(-above / (.025 + .22 * uHeat * uHeat)) + .6 * uCollapse) * (.6 + .5 * rn));
  return col;
}

vec2 boxHit(vec3 ro, vec3 rd) {
  vec3 inv = (step(0., rd) * 2. - 1.) / max(abs(rd), vec3(1e-6));
  vec3 t0 = (BMIN - ro) * inv, t1 = (BMAX - ro) * inv;
  vec3 a = min(t0, t1), b = max(t0, t1);
  return vec2(max(max(a.x, a.y), a.z), min(min(b.x, b.y), b.z));
}

/** The gold seen in the bath. */
float marchSolids(vec3 ro, vec3 rd) {
  if (uCollapse > .999) return -1.;
  vec2 bx = boxHit(ro, rd);
  if (bx.x > bx.y || bx.y < 0.) return -1.;
  float t = max(bx.x, 0.);
  for (int i = 0; i < 64; i++) {
    float d = solids(ro + rd * t);
    if (d < .0015) return t;
    t += d * .85;
    if (t > bx.y) break;
  }
  return -1.;
}

/** How far the pour has run in the direction of xz: fast at first, then slower, its front in fingers. */
float pourFront(vec2 xz, float pt) {
  float a = atan(xz.y, xz.x + 1e-5);
  float fingers = .1 * sin(5. * a + 1.3) + .07 * sin(9. * a - 2.1 + pt * .05) + .04 * sin(14. * a + 4.);
  return (.3 + 1.1 * (1. - exp(-pt * .35))) * (1. + fingers);
}

/** The bath's ripples: a slow breath, the rings of the kicks' drops, the wave of the pour and its rim. */
float bathH(vec2 xz) {
  float h = .0016 * sin(xz.x * 2.1 + uTime * .3) * sin(xz.y * 1.7 - uTime * .23);
  for (int i = 0; i < 4; i++) {
    vec4 k = uRings[i];
    if (k.z > 3.5) continue;
    float x = length(xz - k.xy) - k.z * .5;
    h += k.w * .007 * sin(x * 45.) * exp(-x * x * 120. - k.z * 1.6);
  }
  if (uPour < 12.) {
    float x = length(xz) - .4 - uPour * .5;
    h += .01 * sin(x * 16.) * exp(-x * x * 25. - uPour * .35);
  }
  if (uPour < 40.) {
    // the thick rim of the molten sheet, and the sheet itself standing a little proud of the mercury
    float x = length(xz) - pourFront(xz, uPour);
    h += (.006 * exp(-x * x * 700.) + .003 * (1. - smoothstep(-.02, .02, x))) * (1. - smoothstep(15., 40., uPour));
  }
  return h;
}
vec2 bathGrad(vec2 xz) {
  const float e = .003;
  float h0 = bathH(xz);
  return vec2(bathH(xz + vec2(e, 0.)) - h0, bathH(xz + vec2(0., e)) - h0) / e;
}

/**
 * How much gold the mercury holds at xz (0..1): a halo of amalgam creeping out from the pile's foot, and the pour,
 * a sheet of molten gold spreading in fingers that folds into the mercury in finer and finer swirls until it is gone.
 * hot: how much of it still glows.
 */
float amalgam(vec2 xz, out float hot) {
  hot = 0.;
  float r = length(xz);
  float standing = (1. - step(.999, uCollapse)) * smoothstep(.5, 1., uRise);
  vec2 fp = abs(xz - vec2(0., .07)) - vec2(.3, .5);
  float dp = length(max(fp, 0.)) + min(max(fp.x, fp.y), 0.);
  float haloR = .04 + .45 * uMelt;
  float pt = uPour < 90. ? uPour : 99.;
  float Rf = pourFront(xz, pt);
  bool inHalo = standing > 0. && dp < haloR + .15;
  bool inPour = pt < 45. && r < Rf + .1;
  if (!inHalo && !inPour) return 0.;
  // The gold floats on the mercury in rings, like marbled ink (suminagashi): around the pile's foot as it melts,
  // around the centre of the pour; the slow currents fold the rings more and more, the gold ones thin out and go.
  float th = .12 + .8 * smoothstep(1., 20., pt);
  vec2 s = xz * 2.2;
  float tm = uTime * .02;
  vec2 w = vec2(fbm3(vec3(s, tm)), fbm3(vec3(s + 4.1, 2. - tm))) - .5;
  float g = 0.;
  if (inHalo) {
    float rings = .5 + .5 * sin((dp + w.x * .22) * 34. - uDripT * 2.);
    g = (1. - smoothstep(0., haloR, dp + .1 * w.y)) * smoothstep(.3, .6, rings) * (.35 + .65 * uMelt) * standing;
  }
  if (inPour) {
    float front = Rf;
    float inside = 1. - smoothstep(front - .06, front + .03, r);
    // the rings of the pour, twisted and folded more and more by the currents: broad bands of gold at first,
    // thinner and thinner threads as the mercury takes it back
    vec2 q = rot(w.x * (2.5 + 8. * th)) * xz + w * (.35 + 1.2 * th);
    float stripes = .5 + .5 * sin(length(q) * 22. + w.y * 12.);
    float pg = inside * smoothstep(th - .15, th + .15, stripes) * (1. - .7 * th * smoothstep(.5, 1., r / front)) * (1. - smoothstep(25., 45., pt));
    g = max(g, pg);
    // the pour glows as it spreads, its front last
    hot = inside * exp(-pt / 2.6) * (.55 + .45 * smoothstep(front - .4, front, r)) * (.6 + .4 * stripes);
  }
  return g;
}

/** The bath of mercury: a dark mirror holding the studio, the gold and the swirls of what it has dissolved. */
vec3 shadeBath(vec3 p, vec3 rd, vec3 nGeo, float wS, float t) {
  vec2 g = bathGrad(p.xz);
  vec3 n = normalize(nGeo + vec3(-g.x, 0., -g.y) * (1. - 2. * wS) * exp(-t * .12));
  float hot;
  float gl = max(amalgam(p.xz, hot), 2. * wS);
  vec3 r = reflect(rd, n);
  vec3 c;
  float t2 = marchSolids(p + n * .004, r);
  if (t2 > 0.) {
    vec3 q = p + n * .004 + r * t2;
    c = shadeGold(q, r, calcNormal(q), 1., false);
  } else {
    gBlade = 0.;
    c = env(r);
  }
  float fre = pow(1. - clamp(dot(n, -rd), 0., 1.), 5.);
  vec3 F0 = mix(uInk * .8, GOLD, gl);
  c *= mix(F0, vec3(1.), fre);
  // the gold in the mercury is not quite a mirror: it holds a soft sheen of the studio (gold leaf on black)
  c += GOLD * gl * (.04 + .12 * smoothstep(-.2, 1., dot(n, gKey)));
  c += heatCol(hot * 1.1) * .8;
  // where the kick's drop just hit: a splash of light, and a ring of light running out with the ripples
  vec4 k = uRings[0];
  vec2 dk = p.xz - k.xy;
  c += mix(GOLD, vec3(1.), .4) * 3. * k.w * exp(-dot(dk, dk) * 900. - k.z * 8.);
  if (k.z < 1.2) {
    float x = length(dk) - k.z * .5 - .02;
    c += mix(GOLD, vec3(1.), .5) * .9 * k.w * exp(-x * x * 1500. - k.z * 3.5);
  }
  return c;
}

float hitEllipsoid(vec3 ro, vec3 rd, vec3 c, vec3 r) {
  vec3 o = (ro - c) / r, d = rd / r;
  float a = dot(d, d), b = dot(o, d), h = b * b - a * (dot(o, o) - 1.);
  if (h < 0.) return -1.;
  return (-b - sqrt(h)) / a;
}

/** A falling drop of gold, or the droplet a landing throws up. */
vec3 shadeDrop(vec3 p, vec3 rd, vec3 n) {
  gBlade = 1.;
  vec3 r = reflect(rd, n);
  vec3 e = r.y > 0. ? env(r) : env(vec3(r.x, -r.y, r.z)) * uInk * .5;
  float fre = pow(1. - clamp(dot(n, -rd), 0., 1.), 5.);
  return e * mix(GOLD, vec3(1.), fre) + heatCol(uHeat * .9);
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 ro = uCamPos;
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));
  vec2 fh = normalize((uCamPos - uCamTarget).xz + vec2(1e-5, 0.));
  gFwd = vec3(fh.x, 0., fh.y);
  gSide = vec3(-fh.y, 0., fh.x);
  gKey = normalize(gFwd * .75 + vec3(0., .8, 0.));
  gTop = normalize(vec3(0., 1., 0.) - gFwd * .35);
  gK = .012 + .07 * uMelt + .05 * uCollapse;
  gT = gK + .02;

  vec3 bg = backdrop(rd);
  vec3 col = bg;
  float tb = rd.y < -1e-4 ? -ro.y / rd.y : 1e9;
  float tHit = 1e9;
  vec2 bx = boxHit(ro, rd);
  float t = -1.;
  if (bx.x < bx.y && bx.y > 0.) {
    float t1 = min(bx.y, tb + .01);
    float tt = max(bx.x, .02);
    for (int i = 0; i < 110; i++) {
      float d = map(ro + rd * tt);
      if (d < .0005 * tt) { t = tt; break; }
      tt += d * .9;
      if (tt > t1) break;
    }
  }
  if (t > 0.) {
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);
    float wS = clamp(.5 + .5 * (p.y - solids(p)) / gK, 0., 1.);
    col = wS > .5 ? shadeGold(p, rd, n, wS, true) : shadeBath(p, rd, n, wS, t);
    tHit = t;
  } else if (tb < 80.) {
    col = shadeBath(ro + rd * tb, rd, vec3(0., 1., 0.), 0., tb);
    tHit = tb;
  }
  if (tHit < 1e8) col = mix(col, bg, smoothstep(3.5, 11., tHit));

  // the kick's drop, falling (stretched by its speed), and the droplet its landing throws up
  if (uFall.w > .5) {
    float s = 1. + 2.5 * sqrt(clamp(1. - uFall.y / ${FALL.toFixed(2)}, 0., 1.));
    vec3 c = vec3(uFall.x, uFall.y + .026 * s, uFall.z);
    vec3 rr = vec3(.026, .026 * s, .026);
    float td = hitEllipsoid(ro, rd, c, rr);
    if (td > 0. && td < tHit) {
      vec3 p = ro + rd * td;
      col = shadeDrop(p, rd, normalize((p - c) / (rr * rr)));
      tHit = td;
    }
  }
  vec4 k = uRings[0];
  if (k.z < .4 && k.w > 0.) {
    float a = k.z / .4;
    vec3 c = vec3(k.x, .1 * 4. * a * (1. - a), k.y);
    float rj = .011 * (1. - .4 * a);
    float td = hitEllipsoid(ro, rd, c, vec3(rj));
    if (td > 0. && td < tHit) {
      vec3 p = ro + rd * td;
      col = shadeDrop(p, rd, normalize(p - c));
    }
  }
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
