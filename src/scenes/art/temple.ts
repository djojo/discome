import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";
import { SKY_GLSL } from "./sky.glsl";
import { TEMPLE_GLSL } from "./temple.glsl";
import { flockStep, olympeUniforms, olympeWarp } from "./olympe";

/** The temple: 6 by 11 Doric columns, s apart, H high, R in radius; its front faces +z. */
const NX = 6;
const NZ = 11;
const S = 2.4;
const H = 7;
const R = 0.62;
const HX = ((NX - 1) / 2) * S;
const HZ = ((NZ - 1) / 2) * S;

const FRAMINGS: Framing[] = [
  // the front, from afar, the clouds under it
  { az: 0, el: 0.05, dist: 38, target: [0, 4.5, 0], focal: 1.8, weight: 3 },
  // three-quarters
  { az: 0.62, el: 0.07, dist: 34, target: [0, 4.5, 0], focal: 1.9, weight: 3 },
  // low under a corner, looking up at the entablature
  { az: 0.32, el: -0.04, dist: 19, target: [HX * 0.4, 5.5, HZ * 0.6], focal: 1.7, weight: 2 },
  // along the side colonnade
  { az: 1.38, el: 0.04, dist: 24, target: [HX, 4, 3], focal: 1.9, weight: 2 },
  // close on the capitals
  { az: 0.18, el: 0.22, dist: 11, target: [-HX * 0.5, 6.6, HZ], focal: 1.8, weight: 1 },
];

/**
 * Le Temple: a Doric temple floats above the clouds, its back to a low sun whose light streams between its columns.
 * Through the build it is only an architect's drawing in the air, in graphite: its outlines, and the construction
 * lines of its front (the axes of the columns, the levels, golden rectangles), stroke after stroke, a point of light at
 * the pencil's lead, then three arcs of the compass measuring it; on the drop the marble fills the drawing from one
 * side to the other behind a front of pale gold that leaves a trail of gold dust falling; through the breakdown it
 * turns back into a drawing. The temple never moves: the camera glides round it, the light and the clouds carry the rhythm.
 */
export const temple = defineShaderScene({
  id: "olympe-temple",
  name: "Le Temple",
  energy: "medium",
  hdr: true,
  timeWarp: olympeWarp,
  renderScale: 0.75,
  camera: { framings: FRAMINGS, glideBars: 4 },
  description:
    "Un temple dorique flotte au-dessus des nuages, la lumière d'un soleil bas passant entre ses colonnes. À la montée, il n'est qu'un dessin d'architecte au crayon, tracé trait après trait, la mine éclairée, puis mesuré au compas ; au drop, le marbre le remplit d'un bord à l'autre et laisse derrière lui une poussière d'or qui retombe ; pendant le break, il redevient dessin.",
  params: [paletteParam("olympe")],
  uniforms: () => ({
    ...olympeUniforms(),
    uDraw: { value: 1 },
    uBuilt: { value: 1 },
    uKickT: { value: 9 },
  }),
  update(u, f, _p, dt, ctx) {
    flockStep(u, f, ctx.dt, () => {
      const sd = Math.random() < 0.5 ? -1 : 1;
      return { a: [sd * 32, 8, 6], b: [-sd * 32, 10, -6], r: 3, size: 1, dur: 11 };
    });
    const bar = f.bpm > 0 ? 240 / f.bpm : 2;
    u.uKickT.value = f.beat ? 0 : (u.uKickT.value as number) + dt;
    // the drawing: stroke after stroke through the build, whole otherwise
    const draw = f.section === "build" ? f.buildProgress : 1;
    const d = u.uDraw.value as number;
    u.uDraw.value = d + (draw - d) * (1 - Math.exp(-dt * (draw < d ? 8 : 3)));
    // the marble: gone through the build, sweeping in over a bar from the drop, leaving over four in the breakdown
    const b = u.uBuilt.value as number;
    const goal = f.section === "build" ? 0 : f.section === "breakdown" ? 0 : 1;
    const rate = goal > b ? 1 / bar : 1 / (bar * 4);
    u.uBuilt.value = goal > b ? Math.min(goal, b + rate * dt) : Math.max(goal, b - rate * dt);
    if (f.drop) u.uBuilt.value = Math.min(b, 0.02);
    u.uBuilt.value = Math.max(0, Math.min(1, u.uBuilt.value as number));
  },
  fragment: /* glsl */ `
uniform float uDraw;
uniform float uBuilt;
uniform float uKickT;
${ART_LIB}
${CAMERA_GLSL}
const float NX = ${NX.toFixed(1)};
const float NZ = ${NZ.toFixed(1)};
const float S = ${S.toFixed(2)};
const float H = ${H.toFixed(2)};
const float R = ${R.toFixed(3)};
const float HX = ${HX.toFixed(3)};
const float HZ = ${HZ.toFixed(3)};
/**
 * Whether the way from p toward the sun crosses a column of the peristyle or the entablature (the light streaming
 * between the columns): where it crosses the planes of the four rows.
 */
float templeOcc(vec3 p, vec3 sun) {
  for (int k = 0; k < 4; k++) {
    bool zRow = k < 2;
    float sg = k == 0 || k == 2 ? 1. : -1.;
    float comp = zRow ? sun.z : sun.x;
    if (abs(comp) < 1e-3) continue;
    float t = ((zRow ? HZ : HX) * sg - (zRow ? p.z : p.x)) / comp;
    if (t <= 0.) continue;
    vec3 q = p + sun * t;
    float along = zRow ? q.x : q.z;
    float hw = zRow ? HX : HZ;
    if (abs(along) > hw + R || q.y < 0.) continue;
    if (q.y > H) { if (q.y < H + 2.6 * R + HX * .3) return 1.; continue; }
    float c = zRow ? (clamp(floor(along / S) + .5, -2.5, 2.5)) * S : clamp(floor(along / S + .5), -5., 5.) * S;
    if (abs(along - c) < R * .92) return 1.;
  }
  return 0.;
}
#define SHAFT_OCCLUDER(p) templeOcc(p, gSun)
${SKY_GLSL}
${TEMPLE_GLSL}

float map(vec3 p) { return templeD(p, NX, NZ, S, H, R, 0.); }

// ---- the drawing's instruments
/** The pencil's lead: its point of light (the nearest, in pixels) and its halo (in the plane's units). */
float gTip = 0.;
float gTipHalo = 0.;
void tipAt(vec2 q, vec2 t, float f, float px) {
  if (f <= 0. || f >= 1.) return;
  float d = length(q - t);
  gTip = max(gTip, exp(-d * d / (px * px * 40.)));
  gTipHalo = max(gTipHalo, exp(-d * 1.1));
}
/** A stroke of the pencil (strokeSeg), its lead lit at its end while it is drawn. */
float segT(vec2 q, vec2 a, vec2 b, float f, float px) {
  tipAt(q, mix(a, b, f), f, px);
  return strokeSeg(q, a, b, f);
}
/**
 * An arc of the compass round c, of radius r, from angle a0 toward a1 (from the top, clockwise), drawn as far as f;
 * while it is drawn, the compass itself in fine lines (legs: the distance to them), its pencil lit.
 */
float compassArc(vec2 q, vec2 c, float r, float a0, float a1, float f, float px, inout float legs) {
  if (f <= 0.) return 1e3;
  float af = mix(a0, a1, f);
  vec2 dq = q - c;
  float a = atan(dq.x, dq.y);
  float lo = min(a0, af), hi = max(a0, af);
  vec2 e0 = c + r * vec2(sin(a0), cos(a0)), e = c + r * vec2(sin(af), cos(af));
  float d = a >= lo && a <= hi ? abs(length(dq) - r) : min(length(q - e0), length(q - e));
  if (f < 1.) {
    // the compass: its point on c, its hinge above, its pencil at e
    vec2 m = (c + e) * .5, ce = e - c;
    float L = r * .72;
    vec2 hinge = m + normalize(vec2(-ce.y, ce.x)) * sign(ce.x + 1e-4) * sqrt(max(L * L - dot(ce, ce) * .25, 0.));
    legs = min(legs, min(strokeSeg(q, c, hinge, 1.), strokeSeg(q, hinge, e, 1.)));
    legs = min(legs, length(q - hinge) - px * 1.5);
    tipAt(q, e, f, px);
  }
  return d;
}

/**
 * The gold dust behind the marble's front (at x = front): motes left in the air as it passes, falling slowly. Its
 * gold (rgb) and how much of the pixel it covers (a): on the white, light added would stay white.
 */
vec4 goldDustO(vec3 ro, vec3 rd, float tEnd, float front) {
  // (only where the ray crosses the slice of air it falls through)
  vec3 bmin = vec3(front - 3.8, -3.8, -HZ - 1.8), bmax = vec3(front + .3, H + 2.8, HZ + 2.8);
  vec3 ir = 1. / rd, t0 = (bmin - ro) * ir, t1 = (bmax - ro) * ir;
  vec3 tn = min(t0, t1), tx = max(t0, t1);
  if (max(max(tn.x, tn.y), tn.z) > min(min(min(tx.x, tx.y), tx.z), tEnd) || min(min(tx.x, tx.y), tx.z) < 0.) return vec4(0.);
  float acc = 0.;
  // (most of it along the front and the back, where it shows)
  for (int i = 0; i < 72; i++) {
    float fi = float(i);
    vec3 h = vec3(hash12(vec2(fi, 2.3)), hash12(vec2(fi, 6.1)), hash12(vec2(fi, 8.7)));
    float age = fract(uTime * .4 + h.x);
    float hz = hash12(vec2(fi, 4.4));
    float z = hz < .7 ? HZ + mix(-1., 2.5, hz / .7) : mix(-HZ - 1.5, HZ, (hz - .7) / .3);
    vec3 P = vec3(front - age * (1. + 2.5 * h.y), mix(-.5, H + 2.5, h.z) - age * age * 3., z);
    vec3 v = P - ro;
    float tb = dot(v, rd);
    if (tb <= .1 || tb > tEnd) continue;
    float d2 = max(dot(v, v) - tb * tb, 0.);
    float px = tb / (uRes.y * uFocal);
    float s2 = .012 + px * px * 2.;
    acc += exp(-d2 / s2) * min(1., .012 / s2 * 1.5) * (1. - age) * min(age * 10., 1.) * (.7 + .6 * h.y);
  }
  return vec4(uAccent * 1.05, clamp(acc, 0., 1.));
}
vec3 calcN(vec3 p, float e) {
  const vec2 k = vec2(1, -1);
  return normalize(k.xyy * map(p + k.xyy * e) + k.yyx * map(p + k.yyx * e) + k.yxy * map(p + k.yxy * e) + k.xxx * map(p + k.xxx * e));
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  float side = fract(uSeed * .37) < .5 ? -1. : 1.;
  gSun = normalize(vec3(.35 * side, sunY(), -1.));
  gKey = normalize(vec3(.5 * side, .7, .45));
  gSeaY = -14.;
  gCloudBase = -16.;
  gCloudThick = 13.5;
  gCover = .55;
  gWind = vec2(uTime * .9 + uSeed * 30., uTime * .3);
  gCloudGlow = .3 * exp(-uKickT * 2.);
  gGlowR = -1.;
  vec3 ro = uCamPos;
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));

  // the fluting only where it is larger than a pixel
  gFlute = 1.;
  float t = .1, tt = -1.;
  for (int i = 0; i < 120; i++) {
    vec3 p = ro + rd * t;
    float d = map(p);
    if (d < .0008 * t) { tt = t; break; }
    t += d;
    if (t > 120.) break;
  }
  vec3 sky = heavenV(ro, rd, 400.);
  vec3 col = sky;
  float hit = tt > 0. ? 1. : 0.;
  float depth = tt > 0. ? tt : 400.;
  vec3 p = ro + rd * depth;
  // (the normal and the depth everywhere, outside any branch: their screen derivatives draw the drawing's edges)
  gFlute = clamp(1.5 - depth * .03, 0., 1.) * clamp(uBuilt * 4., 0., 1.);
  vec3 n = calcN(p, .002 * depth);
  float edge = clamp(length(fwidth(n)) * 2.2 * hit + fwidth(hit) + fwidth(depth) * .08 * hit, 0., 1.);
  // the sweep of the marble, from one side to the other (and the drawing beyond it)
  float front = mix(-HX - 6., HX + 6., uBuilt);
  float marble = hit * step(p.x, front);
  if (tt > 0.) {
    map(p);
    float part = gPart;
    float ao = 1.;
    for (int i = 0; i < 4; i++) {
      float hd = .05 + .2 * float(i);
      ao -= max(hd - map(p + n * hd), 0.) * (.6 / (hd + .4));
    }
    ao = clamp(ao, 0., 1.);
    // the sun's shadows of the columns on the steps and the walls
    float sh = 1., ts = .08;
    for (int i = 0; i < 24; i++) {
      float d = map(p + gSun * ts);
      sh = min(sh, 9. * d / ts);
      if (sh < .02) break;
      ts += clamp(d, .05, 1.5);
      if (ts > 25.) break;
    }
    sh = clamp(sh, 0., 1.);
    vec3 a = marbleO(p * .25);
    // the joints of the drums, fine lines on the shafts
    if (part < .5) a *= 1. - .25 * (1. - smoothstep(.0, .025, abs(fract(p.y / (H / 6.)) - .5) - .47)) * gFlute;
    vec3 lit = lightO(a, n, rd, ao);
    lit = mix(lit * vec3(.82, .84, .9), lit, .35 + .65 * sh);
    lit = mix(lit, sky, 1. - exp(-tt * .006));
    col = mix(col, lit, marble);
    // the front of the marble: a band of pale gold
    col += uAccent * 1.6 * exp(-pow((p.x - front) * 1.4, 2.)) * hit * step(.01, uBuilt) * step(uBuilt, .99);
  }
  // ---- the drawing: the temple's edges in graphite where the marble has not come yet
  float drawn = 1. - marble;
  if (drawn > .5) {
    // the drawing appears from the ground up as it is drawn
    float reach = smoothstep(uDraw * (H + 4.) - 1.5, uDraw * (H + 4.), p.y + 1.);
    col = mix(col, uBase * .55, edge * (1. - reach) * .85);
  }
  // ---- the construction lines of the front, in its plane, stroke after stroke: a point of light at the pencil's lead
  // runs along the stroke being drawn; then three arcs of the compass measure it, the compass drawn in fine lines
  float zf = HZ + R * 1.45;
  if (abs(rd.z) > 1e-3) {
    float tf = (zf - ro.z) / rd.z;
    if (tf > 0. && (tt < 0. || tf < tt + 2.)) {
      vec2 q = (ro + rd * tf).xy;
      float px = tf / (uRes.y * uFocal) * 1.3;
      float k = uDraw * 16.5, d = 1e3;
      float top = H + 1.32 * R + (HX + R * 1.45) * .27;
      d = min(d, segT(q, vec2(-HX - 4., 0.), vec2(HX + 4., 0.), clamp(k, 0., 1.), px));
      d = min(d, segT(q, vec2(HX + 4., H), vec2(-HX - 4., H), clamp(k - 1., 0., 1.), px));
      for (int i = 0; i < 6; i++) {
        float x = (float(i) - 2.5) * S;
        d = min(d, segT(q, vec2(x, -1.5), vec2(x, top + 1.5), clamp(k - 2. - float(i) * .5, 0., 1.), px));
      }
      d = min(d, segT(q, vec2(-HX - 1.5, H + 1.32 * R), vec2(0., top), clamp(k - 5.5, 0., 1.), px));
      d = min(d, segT(q, vec2(0., top), vec2(HX + 1.5, H + 1.32 * R), clamp(k - 6.5, 0., 1.), px));
      float gw = top / 1.618;
      d = min(d, segT(q, vec2(-gw, 0.), vec2(-gw, top), clamp(k - 7.5, 0., 1.), px));
      d = min(d, segT(q, vec2(gw, 0.), vec2(gw, top), clamp(k - 8., 0., 1.), px));
      d = min(d, segT(q, vec2(-HX - 1.5, 0.), vec2(HX + 1.5, top), clamp(k - 9., 0., 1.), px));
      d = min(d, segT(q, vec2(HX + 1.5, 0.), vec2(-HX - 1.5, top), clamp(k - 10., 0., 1.), px));
      float fc = clamp(k - 11., 0., 1.);
      d = min(d, strokeArc(q, vec2(0., top * .5), top * .62, fc));
      tipAt(q, vec2(0., top * .5) + top * .62 * vec2(sin(fc * 6.2831853), cos(fc * 6.2831853)), fc, px);
      d = min(d, segT(q, vec2(0., -2.), vec2(0., top + 2.), clamp(k - 12.5, 0., 1.), px));
      // the compass: from the foot of a corner column two intercolumniations along; from the other; the height
      float legs = 1e3;
      d = min(d, compassArc(q, vec2(-HX, 0.), 2. * S, .45, 1.75, clamp(k - 13.5, 0., 1.), px, legs));
      d = min(d, compassArc(q, vec2(HX, 0.), 2. * S, -.45, -1.75, clamp(k - 14.5, 0., 1.), px, legs));
      d = min(d, compassArc(q, vec2(0., 0.), top, -.95, .95, clamp(k - 15.5, 0., 1.), px, legs));
      float line = 1. - smoothstep(px * .6, px * 1.6, d);
      // (they stay while it is a drawing, and fade once the marble has come)
      float shown = (1. - .85 * uBuilt) * smoothstep(0., .05, uDraw);
      col = mix(col, uBase * .6, line * .55 * shown);
      col = mix(col, uBase * .7, (1. - smoothstep(px * .5, px * 1.6, legs)) * .7 * shown);
      // the lead's light: a point of gold, a warm halo round it
      float lead = clamp(gTip * 1.3 + gTipHalo * .75, 0., 1.) * (1. - uBuilt);
      col = mix(col, uAccent * vec3(1.1, .95, .72), lead);
      col += uAccent * gTip * 1.5 * (1. - uBuilt);
    }
  }
  // ---- the gold dust the marble's front leaves behind it, falling slowly
  if (uBuilt > .003 && uBuilt < .997) {
    vec4 gd = goldDustO(ro, rd, tt > 0. ? tt : 1e4, mix(-HX - 6., HX + 6., uBuilt));
    col = mix(col, gd.rgb, gd.a);
  }
  // the clouds before it, and the light streaming between the columns (pulsing on the kick, blazing on the drop)
  vec4 wv = wispsO(ro, rd, tt > 0. ? tt : 60., -3.5, 3., .3);
  col = col * wv.a + wv.rgb;
  vec4 dv = dovesO(ro, rd, tt > 0. ? tt : 1e4);
  col = mix(col, dv.rgb, dv.a);
  col = withShafts(col, ro, rd, tt > 0. ? tt : 60., .7 + .5 * exp(-uKickT * 3.) + 1.2 * uDrop);
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
