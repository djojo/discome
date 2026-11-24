import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";
import { NIGHT_GLSL } from "./night.glsl";

/** Bars the flowering lasts, from the drop. */
const BLOOM_END = 8;

const FRAMINGS: Framing[] = [
  // from low down, the cactus against the turning sky
  { az: 0.3, el: -0.05, dist: 7.5, target: [0, 2.4, 0], focal: 1.6, weight: 3 },
  { az: -0.8, el: 0.25, dist: 10, target: [0, 2.3, 0], focal: 1.7, weight: 2, tag: "open" },
  // from above: the ground's mandala around it, and the flowers (the drop asks for it)
  { az: 0.5, el: 1.15, dist: 12, target: [0, 0.6, 0], focal: 1.7, weight: 2, tag: "high" },
  // close on the ribs
  { az: 1.4, el: 0.1, dist: 3.2, target: [0, 2.2, 0], focal: 2, weight: 2 },
  // Bouton: the round cactus from three-quarters above (its dome reads), the mandala round it
  { az: 0, el: 0.75, dist: 7, target: [0, 0.2, 0], focal: 1.8, weight: 3, tag: "button" },
  { az: 0.7, el: 0.95, dist: 6.5, target: [0, 0.2, 0], focal: 1.9, weight: 2, tag: "button" },
  { az: -0.5, el: 0.55, dist: 6, target: [0, 0.3, 0], focal: 1.8, weight: 2, tag: "button" },
  { az: 0.3, el: 1.3, dist: 9, target: [0, 0, 0], focal: 1.8, weight: 1, tag: "button" },
];

/**
 * The sacred cactus, at night in the desert. Everything is drawn in threads of colour, like yarn paintings: each rib
 * a bundle of parallel threads following its curve, a dark thread between the ribs; the ground breathing in rings
 * around it; other cacti standing as silhouettes on the horizon under a crescent moon; the stars turning in a spiral
 * overhead (more and more through the build). On the kick a pulse climbs the ribs; on the drop it flowers: magenta
 * and yellow flowers of threads open at its tips, pollen rises, the camera rises and the ground becomes a mandala.
 * Variant « Bouton »: the round cactus (a peyote) from three-quarters above: a low dome of rounded ribs that wind a
 * little, with tufts of white wool in rows, on a mandala of yarn (rings of zigzags, beads and petals turning in
 * alternate directions). It swells through the build; on the drop its pink flower opens at its heart.
 */
export const cactus = defineShaderScene({
  id: "canyon-cactus",
  name: "Le Cactus",
  energy: "calm",
  hdr: true,
  renderScale: 0.75,
  mask: true,
  camera: { framings: FRAMINGS, glideBars: 2 },
  description:
    "Le cactus sacré dans la nuit du désert, dessiné en fils de couleur comme une peinture huichol : la lumière monte dans ses côtes, le sol respire en cercles, le ciel tourne en spirale ; au drop il fleurit et le sol devient mandala. Variante Bouton : un peyotl en relief sur un mandala de fils, qui gonfle pendant la montée et ouvre sa fleur au drop.",
  params: [
    paletteParam("peyote"),
    {
      type: "select",
      key: "variant",
      label: "Variante",
      options: [
        { value: "column", label: "Colonne" },
        { value: "button", label: "Bouton" },
      ],
      default: "column",
    },
  ],
  uniforms: () => ({
    uButton: { value: 0 },
    uPulseT: { value: 9 },
    uBloom: { value: 0 },
    uTwist: { value: 0 },
    uBreath: { value: 0 },
    uSwell: { value: 0 },
  }),
  update(u, f, p, dt, ctx) {
    const button = p.variant === "button";
    u.uButton.value = button ? 1 : 0;
    if (ctx.camera) ctx.camera.allow = (fr) => (fr.tag === "button") === button;
    u.uPulseT.value = f.beat ? 0 : (u.uPulseT.value as number) + dt;
    const bar = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;
    // the drop: it flowers (over a bar), the bloom stays a while then fades
    // (it opens over a bar, stays open some six bars, closes over two)
    const b = u.uBloom.value as number;
    u.uBloom.value = f.drop ? Math.max(b, 0.01) : b > 0 ? Math.min(BLOOM_END, b + dt / bar) : 0;
    if ((u.uBloom.value as number) >= BLOOM_END) u.uBloom.value = 0;
    if (f.drop) ctx.camera?.request(button ? "button" : "high");
    // the sky winds into a spiral through the build, unwinds slowly after
    const tw = f.section === "build" ? 0.3 + 2.2 * f.buildProgress : f.section === "drop" ? 2.5 : 0.3;
    const t = u.uTwist.value as number;
    u.uTwist.value = t + (tw - t) * (1 - Math.exp(-dt * 0.6));
    u.uBreath.value = (u.uBreath.value as number) + dt * 0.28;
    // the button swells through the build, settles after the drop
    const sw = f.section === "build" ? f.buildProgress : f.section === "drop" ? 0.6 : 0;
    const w = u.uSwell.value as number;
    u.uSwell.value = w + (sw - w) * (1 - Math.exp(-dt * 0.8));
  },
  fragment: /* glsl */ `
uniform float uButton;
uniform float uPulseT;   // seconds since the kick
uniform float uBloom;    // the drop's flowering (bars since the drop, 0..8)
uniform float uTwist;    // the sky's spiral
uniform float uBreath;   // the ground's slow breath
uniform float uSwell;    // the button swelling through the build
${ART_LIB}
${CAMERA_GLSL}
${NIGHT_GLSL}
const float NR = 14.;    // ribs
float gU;                // where on the cactus: height along the trunk or arm
float gTheta;            // angle round the stem
float gPart;             // 0 trunk, 1 arm, 2 bud

float bloomA() { return smoothstep(0., 1., uBloom) * (1. - smoothstep(6., 8., uBloom)); }

const vec3 MAGENTA = vec3(1., .18, .55);
const vec3 GOLD = vec3(1., .8, .22);
vec3 gTip;               // the flower hit (its tip)
float gFS = 1.;          // ...and its size

/** A ribbed stem from a to b. */
float stem(vec3 p, vec3 a, vec3 b, float r, out float u, out float th) {
  vec3 ba = b - a, pa = p - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.);
  vec3 c = pa - ba * h;
  vec3 ax = normalize(ba);
  vec3 side = normalize(cross(ax, abs(ax.y) > .9 ? vec3(1., 0., 0.) : vec3(0., 1., 0.)));
  th = atan(dot(c, cross(ax, side)), dot(c, side));
  u = h * length(ba);
  float rib = .06 * r * (1. - abs(cos(th * NR * .5)));
  return length(c) - r + rib;
}

/** A flower of six petals opening into a cup (q: from its base). */
float flower(vec3 q, float open) {
  float r = length(q.xz);
  float a = atan(q.z, q.x);
  float R = (.12 + .3 * open) * (.62 + .38 * abs(cos(a * 3.)));
  // a thin cup, rising at the rim, clipped to the petals' outline
  float cup = abs(q.y - .12 - r * (1.3 - .7 * open)) - .025;
  return max(max(cup * .7, r - R), -q.y - .05);
}

float column(vec3 p) {
  float u, th, d;
  float trunk = stem(p, vec3(0., -.2, 0.), vec3(0., 4.2, 0.), .42, u, th);
  trunk = min(trunk, length(p - vec3(0., 4.2, 0.)) - .42);
  d = trunk; gU = u; gTheta = th; gPart = 0.;
  // two arms: out, then up
  for (int i = 0; i < 2; i++) {
    float sd = i == 0 ? 1. : -1.;
    float hy = i == 0 ? 1.7 : 2.4;
    vec3 a = vec3(sd * .3, hy, 0.), e = vec3(sd * 1.1, hy + .35, 0.), t = vec3(sd * 1.15, hy + 1.6, 0.);
    float u1, t1, u2, t2;
    float a1 = stem(p, a, e, .26, u1, t1);
    float a2 = min(stem(p, e, t, .26, u2, t2), length(p - t) - .26);
    float arm = smin(a1, a2, .25);
    if (arm < d) { gU = a2 < a1 ? u2 + .8 : u1; gTheta = a2 < a1 ? t2 : t1; gPart = 1.; }
    d = smin(d, arm, .12);
  }
  // the drop: a flower opens at each tip, a cup of petals
  float bl = bloomA();
  if (bl > .01) {
    for (int i = 0; i < 3; i++) {
      vec3 tip = i == 0 ? vec3(0., 4.55, 0.) : i == 1 ? vec3(1.15, 3.5, 0.) : vec3(-1.15, 4.2, 0.);
      float fl = flower(p - tip, bl);
      if (fl < d) { gPart = 2.; gTip = tip; gFS = 1.; }
      d = min(d, fl);
    }
  }
  return d;
}

/** Bouton: a low dome of rounded ribs winding a little, tubercles along them; its flower opens at the top. */
float buttonTop() { return 1.6 * (1. + .1 * uSwell) * (.48 + .08 * uSwell) - .15; }
float button(vec3 p) {
  float r = length(p.xz);
  float th = atan(p.z, p.x) + uTime * .03 + r * .25;
  float ribs = 9.;
  float R = 1.6 * (1. + .1 * uSwell);
  float lobe = .5 - .5 * cos(th * ribs);          // 1 on a crest, 0 in a furrow
  float tub = .5 + .5 * cos(r * 2.6 * 6.2831);    // tubercles along the crests
  float dome = sqrt(max(R * R - r * r, 0.)) * (.48 + .08 * uSwell);
  float h = dome - .17 * pow(1. - lobe, 2.) * smoothstep(0., .45, r) + .04 * lobe * tub * smoothstep(.2, .6, r) - .15;
  gU = r; gTheta = th; gPart = 0.;
  float d = (p.y - h) * .5;
  float bl = bloomA();
  if (bl > .01) {
    gFS = 1.8;
    vec3 tip = vec3(0., buttonTop() - .05, 0.);
    float fl = flower((p - tip) / gFS, bl) * gFS;
    if (fl < d) { gPart = 2.; gTip = tip; }
    d = min(d, fl);
  }
  return d;
}

/** The button's ground: a mandala of yarn, rings of zigzags, beads and petals turning in alternate directions. */
vec3 mandala(vec2 xz) {
  float r = length(xz), a = atan(xz.y, xz.x);
  float rr = r * 1.1 - uBreath * .15 + .3;
  float i = floor(rr), v = fract(rr);
  float dir = mod(i, 2.) < .5 ? 1. : -1.;
  float aa = a + dir * (uTime * .03 + bloomA() * .6 * sin(uTime * .4));
  float N = 6. + 6. * i;
  float s = fract(aa / 6.2831 * N);
  float m = mod(i, 3.);
  vec3 c1 = yarn(fract(i * .23 + .1)), c2 = yarn(fract(i * .23 + .55));
  float f;
  if (m < .5) f = 1. - smoothstep(.07, .13, abs(v - .2 - .6 * abs(s - .5) * 2.));                 // zigzag
  else if (m < 1.5) f = 1. - smoothstep(.26, .34, length(vec2(s - .5, v - .5) * 2.));             // beads
  else f = 1. - smoothstep(.0, .07, v - .12 - .72 * pow(sin(3.1416 * s), .8));                       // petals
  vec3 c = mix(c2 * .22, c1 * (.8 + .4 * uBeat), f);
  // a black thread between the rings; finer than a pixel, their average
  c *= smoothstep(.0, .07, v) * (1. - smoothstep(.93, 1., v));
  c = mix(c, (c1 * .45 + c2 * .2) * .8, smoothstep(.12, .45, fwidth(rr) * N * .5));
  return c * exp(-r * .07) + uBase * .4;
}

float map(vec3 p) {
  float ground = p.y + .02 * sin(length(p.xz) * 2. - uBreath * 3.);
  float obj = uButton > .5 ? button(p) : column(p);
  if (ground < obj) { gPart = 3.; return ground; }
  return obj;
}

vec3 calcN(vec3 p) {
  const vec2 k = vec2(1, -1);
  const float e = .002;
  return normalize(k.xyy * map(p + k.xyy * e) + k.yyx * map(p + k.yyx * e) + k.yxy * map(p + k.yxy * e) + k.xxx * map(p + k.xxx * e));
}

vec3 groundCol(vec3 p) { return uButton > .5 ? mandala(p.xz) : groundRings(p.xz, uBreath, bloomA()); }
/** A cactus silhouette on the horizon (x, y in its own units: trunk 1 high). Negative inside. */
float silhouette(vec2 q, float arms) {
  float d = max(abs(q.x) - .11, q.y - 1.) ;
  d = min(d, length(q - vec2(0., 1.)) - .11);
  // its arms: out, then up
  vec2 a = q - vec2(.11, .42);
  d = min(d, max(max(abs(a.y) - .06, -a.x), a.x - .26));
  d = min(d, max(abs(q.x - .32) - .065, max(q.y - .78 - .05, .38 - q.y)));
  d = min(d, length(q - vec2(.32, .83)) - .065);
  if (arms > .5) {
    vec2 b = q - vec2(-.11, .56);
    d = min(d, max(max(abs(b.y) - .06, b.x), -b.x - .24));
    d = min(d, max(abs(q.x + .3) - .065, max(q.y - .86, .52 - q.y)));
    d = min(d, length(q - vec2(-.3, .9)) - .065);
  }
  return d;
}

/**
 * Other cacti standing far off on the desert floor, black, outlined by a thread of colour (flat cut-outs facing the
 * centre). Returns colour and coverage; tmax: what the ray hit before.
 */
vec4 farCacti(vec3 ro, vec3 rd, float tmax) {
  vec4 acc = vec4(0.);
  float rxz = length(rd.xz);
  if (rxz < 1e-3) return acc;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float a0 = fi < 1. ? -.6 : fi < 2. ? -1.15 : fi < 3. ? -1.9 : fi < 4. ? -2.5 : fi < 5. ? 3. : .9;
    float D = 34. + 16. * hash12(vec2(fi, 1.));
    float H = 2.4 + 1.6 * hash12(vec2(fi, 2.));
    vec3 P = vec3(cos(a0), 0., sin(a0)) * D;
    // where the ray crosses the cut-out's plane (facing the centre)
    vec3 nrm = normalize(vec3(P.x, 0., P.z));
    float den = dot(rd, nrm);
    if (abs(den) < 1e-4) continue;
    float t = dot(P - ro, nrm) / den;
    if (t < 0. || (tmax > 0. && t > tmax)) continue;
    vec3 X = ro + rd * t - P;
    vec2 q = vec2(dot(X, normalize(cross(vec3(0., 1., 0.), nrm))), X.y) / H;
    if (abs(q.x) > .6 || q.y > 1.2 || q.y < -.05) continue;
    if (hash12(vec2(fi, 5.)) > .5) q.x = -q.x;
    float d = silhouette(q, step(.4, hash12(vec2(fi, 9.)))) * H;
    float px = t / (uRes.y * uFocal);
    float inside = 1. - smoothstep(-px, px, d);
    float rim = 1. - smoothstep(px, px * 2.5, abs(d));
    vec3 c = uBase * .3 * inside + yarn(fract(fi * .29 + .1)) * rim * .45;
    float a = max(inside, rim * .8);
    acc.rgb = acc.rgb * (1. - a) + c;
    acc.a = max(acc.a, a);
  }
  return acc;
}

vec3 skyCol(vec3 rd) {
  vec3 c = nightSky(rd, uTwist);
  // a crescent moon, low
  c += moon(rd, normalize(vec3(cos(-1.25) * .92, .36, sin(-1.25) * .92)));
  return c;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 ro = uCamPos;
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));
  vec3 col = skyCol(rd);
  float solid = 0.;
  float t = .1, tt = -1.;
  for (int i = 0; i < 110; i++) {
    float d = map(ro + rd * t);
    if (d < .001 * t) { tt = t; break; }
    t += d * .8;
    if (t > 60.) break;
  }
  // the flowers' glow in the night air, and their pollen rising
  float bl = bloomA();
  if (bl > .01 && uButton < .5) {
    for (int i = 0; i < 3; i++) {
      vec3 tip = i == 0 ? vec3(0., 4.55, 0.) : i == 1 ? vec3(1.15, 3.5, 0.) : vec3(-1.15, 4.2, 0.);
      vec3 w = tip + vec3(0., .15, 0.) - ro;
      float along = dot(w, rd);
      if (along > 0. && (tt < 0. || along < tt + .3)) {
        float dd = length(w - rd * along);
        col += mix(MAGENTA, GOLD, .4) * (exp(-dd * 5.) * .35 + exp(-dd * 16.) * .5) * bl;
      }
      for (int j = 0; j < 8; j++) {
        float h1 = hash12(vec2(float(i), float(j) + .5)), h2 = hash12(vec2(float(j), float(i) + 7.));
        float life = fract(h1 + uTime * (.12 + .1 * h2));
        vec3 e = tip + vec3(cos(h2 * 6.28) * (.1 + .6 * life), .2 + life * 2.2, sin(h2 * 6.28) * (.1 + .6 * life));
        vec3 we = e - ro;
        float al = dot(we, rd);
        if (al < 0. || (tt > 0. && al > tt)) continue;
        float sz = max(.02, al / (uRes.y * uFocal));
        float de = length(we - rd * al);
        col += mix(GOLD, vec3(1.), .4) * exp(-de * de / (sz * sz)) * (.02 / sz) * (1. - life) * bl * 1.5;
      }
    }
  }
  if (tt < 0.) {
    vec4 fc = farCacti(ro, rd, -1.);
    col = col * (1. - fc.a) + fc.rgb;
  }
  if (tt > 0.) {
    vec3 p = ro + rd * tt;
    map(p);
    float part = gPart;
    float u = gU, th = gTheta;
    if (part > 2.5) {
      col = groundCol(p);
      col = mix(col, skyCol(rd), smoothstep(20., 55., tt));
      if (uButton < .5) {
        vec4 fc = farCacti(ro, rd, tt);
        col = col * (1. - fc.a) + fc.rgb;
      }
    } else if (part > 1.5) {
      // a flower of yarn: magenta petals threaded toward a golden heart, stamens of light
      vec3 n = calcN(p);
      vec3 q = (p - gTip) / gFS;
      float r = length(q.xz), a = atan(q.z, q.x);
      float R = (.12 + .3 * bl) * (.62 + .38 * abs(cos(a * 3.)));
      float k = clamp(r / max(R, .01), 0., 1.);
      float thread = .7 + .3 * cos(a * 48.);
      vec3 c = mix(GOLD, MAGENTA, smoothstep(.25, .6, k)) * thread * (1.1 + .6 * uBeat);
      c = mix(c, uBase * .5, smoothstep(.9, 1., k));   // a dark thread round each petal
      c += vec3(1., .95, .8) * (1. - smoothstep(.0, .1, r)) * 1.5;
      c += vec3(1.) * pow(abs(dot(n, -rd)), 10.) * .3;
      col = c;
    } else {
      vec3 n = calcN(p);
      // each rib a bundle of threads following its curve (2 or 3 colours, symmetric round the crest),
      // a dark thread in the furrow between two ribs
      float ribs = uButton > .5 ? 9. : NR;
      float x = th / 6.2831 * ribs + .5;
      float ribId = floor(x);
      float w = abs(fract(x) - .5) * 2.;          // 0 on the crest, 1 in the furrow
      float nT = 5.;
      float k = floor(w * nT);                     // which thread, from the crest
      vec3 ca = yarn(fract(ribId * .23 + .02 * uTime));
      vec3 cb = yarn(fract(ribId * .23 + .34));
      vec3 cc = yarn(fract(ribId * .23 + .67));
      vec3 yc = k < 1. ? ca : k < 3. ? cb : cc;
      // a round thread: brighter in its middle; finer than a pixel, its average
      float tw = fract(w * nT);
      float fw = fwidth(w * nT);
      float roundT = mix(.55 + .45 * sin(3.1416 * tw), .78, smoothstep(.4, 1., fw));
      float furrow = smoothstep(.86, .96, w);
      // lit by the moon and the night, a little by the ground's glow
      float dif = clamp(dot(n, normalize(vec3(-.5, .6, .4))), 0., 1.);
      vec3 c = yc * roundT * (.22 + .5 * dif) * (1. - furrow) + uBase * .4 * furrow;
      // light flowing up the threads
      float flow = fract(u * 1.3 - uTime * .25 + hash12(vec2(ribId, 3.)));
      c *= .85 + .35 * smoothstep(.3, .9, flow);
      // the kick: a pulse climbing the ribs
      float h = uButton > .5 ? u * 2. : u;
      c += ca * exp(-pow((h - uPulseT * 4.5) * 3., 2.)) * exp(-uPulseT * .8) * .6 * (1. - furrow);
      // areoles: tufts of white down along the crests (big soft ones on the button, like the real thing)
      float ar = (1. - smoothstep(.0, uButton > .5 ? .3 : .1, w)) * (1. - smoothstep(.0, uButton > .5 ? .22 : .12, abs(fract(u * (uButton > .5 ? 2.6 : 4.)) - .5)));
      c = mix(c, vec3(1., .97, .92) * (.45 + .3 * dif), ar * (uButton > .5 ? .85 : .45));
      col = c;
    }
    solid = 1.;
  }
  gl_FragColor = vec4(hdrOut(col * 1.15), solid);
}
`,
});
