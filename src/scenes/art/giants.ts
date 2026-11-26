import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { num } from "../utils";
import { ART_LIB } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";
import { MYCELIUM_GLSL } from "./mycelium.glsl";
import { tripUniforms, updateTrip } from "./mycTrip";

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const approach = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-dt * rate));

// Low, at an insect's height, looking up at the giants; the moon is behind them (toward -z)
const FRAMINGS: Framing[] = [
  // from the moss, up at the whole cluster against the moon
  { az: 0.1, el: -0.24, dist: 7.5, target: [0, 2.3, 0], focal: 1.6, weight: 3 },
  // right under a cap: the gills radiating overhead
  { az: 0.55, el: -0.72, dist: 3.4, target: [0.4, 3.4, 0.2], focal: 1.35, weight: 2 },
  // a long lens through the grass toward the stems
  { az: -0.45, el: -0.09, dist: 11, target: [-0.5, 1.6, -2.5], focal: 2.3, weight: 2 },
  // among the stems, close to the ground
  { az: 1.15, el: -0.14, dist: 5, target: [-1, 1.3, 0.8], focal: 1.7, weight: 2 },
  // wider: the cluster and the giants behind it (the drop's)
  { az: -0.15, el: 0.02, dist: 15, target: [0, 2.4, -1], focal: 1.7, weight: 1, tag: "open" },
];

/**
 * Les Géants: a forest of giant mushrooms seen from an insect's height (Alice made small). Bent stems, translucent
 * caps lit from behind by the moon, under them gills radiating in rays where the colour slides slowly (lilac, violet,
 * pink, amber); their light falls in pools on the moss. Huge blades of grass in front, a snow of spores falling,
 * out of focus near the lens. Each kick sends a ring of light along the mycelium from every stem. « Rétrécir »: through
 * the build the camera keeps shrinking, the giants rise ever higher, the grass becomes a forest. On the drop the caps
 * exhale clouds of glowing spores, a ring of light runs over the ground and the gills turn to the next colour.
 */
export const giants = defineShaderScene({
  id: "myc-giants",
  name: "Les Géants",
  energy: "intense",
  hdr: true,
  mask: true,
  renderScale: 0.6,
  camera: { framings: FRAMINGS, glideBars: 3 },
  description:
    "Une forêt de champignons géants vue à hauteur d'insecte : chapeaux translucides éclairés par la lune, lamelles lumineuses où la couleur glisse, brins d'herbe immenses et neige de spores. En montée (Rétrécir) on rétrécit encore ; au drop, les chapeaux exhalent des nuages de spores lumineuses.",
  params: [
    paletteParam("spores"),
    { type: "toggle", key: "shrink", label: "Rétrécir pendant la montée", default: false },
    { type: "range", key: "spores", label: "Spores", min: 0, max: 2, step: 0.05, default: 1 },
    { type: "range", key: "mist", label: "Brume", min: 0, max: 2, step: 0.05, default: 1 },
  ],
  uniforms: () => ({
    ...tripUniforms(),
    uKick: { value: 9 },
    uBurst: { value: 99 },
    uHue: { value: 0 },
    uHueTo: { value: 0 },
    uShrink: { value: 1 },
    uSpores: { value: 1 },
    uMist: { value: 1 },
    uSafe: { value: 0 },
    uLast: { value: -99 },
  }),
  update(u, f, p, dt, ctx) {
    updateTrip(u, f, dt);
    // Back on screen: no drop in progress, full size
    if (f.time - (u.uLast.value as number) > 1.5) {
      u.uBurst.value = 99;
      u.uShrink.value = 1;
    }
    u.uLast.value = f.time;
    u.uSafe.value = f.safeFlash ? 1 : 0;
    u.uKick.value = f.beat ? 0 : (u.uKick.value as number) + dt;
    if (f.drop) {
      u.uBurst.value = 0;
      // the gills turn to the next colour
      u.uHueTo.value = (u.uHueTo.value as number) + 0.3;
      ctx.camera?.request("open");
    } else u.uBurst.value = Math.min(99, (u.uBurst.value as number) + dt);
    // the colour slides slowly along the gills, and toward the drop's new one
    u.uHueTo.value = (u.uHueTo.value as number) + dt * 0.004;
    u.uHue.value = approach(u.uHue.value as number, u.uHueTo.value as number, 0.6, dt);
    // Rétrécir: smaller and smaller through the build, back to size slowly after
    const small = p.shrink === true && f.section === "build" ? 1 - 0.82 * smooth(0, 1, f.buildProgress) : 1;
    u.uShrink.value = approach(u.uShrink.value as number, small, small < (u.uShrink.value as number) ? 1.2 : 0.3, dt);
    u.uSpores.value = num(p.spores, 1);
    u.uMist.value = num(p.mist, 1);
  },
  fragment: /* glsl */ `
uniform float uKick;    // seconds since the last kick
uniform float uBurst;   // seconds since the drop
uniform float uHue;     // where the gills' colour is along the palette
uniform float uShrink;  // the camera's size (1: an insect; smaller through Rétrécir)
uniform float uSpores;
uniform float uMist;
uniform float uSafe;
${ART_LIB}
${CAMERA_GLSL}
${MYCELIUM_GLSL}
const int NM = 7;
vec3 gMd;                // toward the moon
vec3 gRo;
float gFar;
float gPart;             // what map hit: 0 ground (none), 1 a stem, 2 a cap's top, 3 its gills, 4 grass, 5 a far giant
float gWhich;            // which mushroom

float groundH(vec2 xz) {
  return .12 * vnoise(vec3(xz * .45, 2.7)) + .06 * vnoise(vec3(xz * 1.7, 5.1)) - .09;
}

/** A giant: base (x, z), the stem's height, the cap's radius; and the cap's height, bend direction, bend, tilt. */
void giant(int i, out vec4 a, out vec4 b) {
  if (i == 0) { a = vec4(0., 0., 4.6, 2.5); b = vec4(1.3, .4, .5, .12); }
  else if (i == 1) { a = vec4(2.8, -1.6, 3.2, 1.7); b = vec4(.9, 2.6, .6, .18); }
  else if (i == 2) { a = vec4(-2.6, -1., 3.9, 2.); b = vec4(1.1, -.6, .7, .15); }
  else if (i == 3) { a = vec4(1.3, 2.3, 2., 1.15); b = vec4(.6, 1.9, .35, .22); }
  else if (i == 4) { a = vec4(-3.9, 1.7, 2.6, 1.4); b = vec4(.75, 3.6, .4, .2); }
  else if (i == 5) { a = vec4(4.3, 1.2, 1.5, .85); b = vec4(.45, -2.2, .25, .25); }
  else { a = vec4(-.6, -4.2, 5.8, 2.9); b = vec4(1.5, .9, .8, .1); }
  // each return a little different
  float s = fract(uSeed * .37 + float(i) * .29);
  a.xy += (vec2(fract(s * 7.1), fract(s * 3.3)) - .5) * .5;
  b.y += s * 2.;
}

/** The stem's axis at height y (its base at 0): it bends toward the light, more and more. */
vec2 stemOff(float y, vec4 a, vec4 b) {
  float k = y / a.z;
  return vec2(cos(b.y), sin(b.y)) * b.z * k * k;
}

/** A giant (p from its base): its distance; part: 1 stem, 2 cap top, 3 gills. */
float mushroom(vec3 q, vec4 a, vec4 b, out float part) {
  part = 1.;
  float y = q.y;
  // the cap's centre, at the stem's top
  vec2 o = stemOff(y, a, b);
  vec2 ot = stemOff(a.z, a, b);
  // the stem: a bulb at the foot, thinner up, fibrous
  float sr = a.w * .13 * (1. + .7 * exp(-y * 1.5)) * (1. - .2 * clamp(y / a.z, 0., 1.));
  vec2 sq = q.xz - o;
  float stem = max((length(sq) - sr) * .8, max(-y - .2, y - a.z));
  // the cap, tilted, breathing slowly
  vec3 cq = q - vec3(ot.x, a.z, ot.y);
  float tl = b.w;
  vec2 td = vec2(cos(b.y + 1.), sin(b.y + 1.));
  cq.y += dot(cq.xz, td) * tl;
  // (the trip: they breathe deeper, waves run out across the caps)
  float br = 1. + (.015 + .05 * uTrip) * sin(uTime * .5 + a.x) + .03 * uTrip * uBreath;
  float R = a.w * br, H = b.x * br;
  float r = length(cq.xz);
  cq.y -= uTrip * .06 * H * sin(r * 3.2 / a.w * 3.1416 - uTime * 1.6 + a.x) * smoothstep(0., .3 * R, r);
  float top = sdEllipsoid(cq, vec3(R, H, R));
  // the underside: a bowl rising toward the rim (a parasol), the rim thin
  float u = cq.y + .12 * H - .5 * H * (r * r) / (R * R);
  float cap = max(top, -u * .8);
  if (cap < stem) {
    part = -u * .8 > top ? 3. : 2.;
    return cap;
  }
  return stem;
}

/** Huge blades of grass round the camera (they shrink to nothing further away). */
float grass(vec3 p) {
  const float GC = .6;
  vec2 c = floor(p.xz / GC);
  vec2 lp = p.xz - (c + .5) * GC;
  float border = GC * .5 - max(abs(lp.x), abs(lp.y));
  float h = hash12(c + 3.7);
  // (none right where the camera stands: it would be inside a blade)
  float dc = length((c + .5) * GC - gRo.xz);
  float grow = smoothstep(4.3, 1.8, dc) * smoothstep(.12, .45, dc);
  float Hb = (.4 + 1. * fract(h * 7.3)) * grow;
  if (h > .65 || Hb < .02) return border + .04;
  float ga = h * 40.;
  vec2 dir = vec2(cos(ga), sin(ga));
  vec2 jit = (vec2(fract(h * 13.1), fract(h * 5.7)) - .5) * .08;
  vec2 bp = lp - jit;
  float y = p.y - groundH(p.xz);
  float lx = dot(bp, vec2(-dir.y, dir.x)), lz = dot(bp, dir);
  float k = clamp(y / Hb, 0., 1.);
  float bend = .12 * k * k;
  float w = .035 * (1. - k * .9) * (1. + .5 * fract(h * 3.1));
  float d = max(max(abs(lz - bend) - .004, abs(lx) - w), max(-y, y - Hb));
  return min(d * .6, border + .04);
}

/**
 * The far giants: a wood of them all round, past the cluster, simple shapes lost in the mist. Each stays 1.1 inside
 * its cell (a ray along a border does not crawl).
 */
float farGiants(vec3 p) {
  const float FC = 9.;
  vec2 c = floor(p.xz / FC + .5);
  float border = FC * .5 - max(abs(p.x - c.x * FC), abs(p.z - c.y * FC));
  if (length(c) < 1.2) return border + 1.1;
  float h = hash12(c + 9.1);
  vec2 lp = p.xz - c * FC - (vec2(h, fract(h * 7.7)) - .5) * 2.;
  if (h > .7) return border + 1.1;
  float H = 2. + 5. * fract(h * 3.3), R = .8 + 1.6 * fract(h * 5.9);
  float stem = max(length(lp) - R * .12, p.y - H);
  float cap = sdEllipsoid(vec3(lp.x, p.y - H, lp.y), vec3(R, R * .45, R));
  cap = max(cap, -(p.y - H + .05 - .4 * R * .45 * dot(lp, lp) / (R * R)));
  return min(min(stem, cap) * .85, border + 1.1);
}

/** The giants, near and far (not the grass). */
float mapM(vec3 p) {
  float d = 1e3;
  gPart = 0.;
  for (int i = 0; i < NM; i++) {
    vec4 a, b;
    giant(i, a, b);
    vec3 q = p - vec3(a.x, -.05, a.y);
    // its bounding cylinder first
    float bb = max(length(q.xz) - a.w * 1.25 - b.z, q.y - a.z - b.x - a.w * b.w - .2);
    if (bb > d) continue;
    float part;
    float m = mushroom(q, a, b, part);
    if (m < d) { d = m; gPart = part; gWhich = float(i); }
  }
  float fg = farGiants(p);
  if (fg < d) { d = fg; gPart = 5.; }
  return d;
}

/** The grass: it only grows round the camera, below 1.4 (outside, a bound to that zone). grass: it is a blade. */
float mapG(vec3 p, out bool blade) {
  float gz = max(p.y - 1.4, gFar - 4.7);
  blade = gz < .1;
  return blade ? grass(p) : gz;
}

float map(vec3 p) {
  gFar = length(p - gRo);
  float d = mapM(p);
  bool blade;
  float g = mapG(p, blade);
  if (g < d && blade) gPart = 4.;
  return min(d, g);
}

vec3 nrm(vec3 p, float e) {
  const vec2 k = vec2(1, -1);
  return normalize(k.xyy * map(p + k.xyy * e) + k.yyx * map(p + k.yyx * e) + k.yxy * map(p + k.yxy * e) + k.xxx * map(p + k.xxx * e));
}

float groundT(vec3 ro, vec3 rd) {
  if (rd.y > -1e-3) return 1e5;
  float t = (ro.y + .09) / -rd.y;
  for (int i = 0; i < 5; i++) {
    vec3 x = ro + rd * t;
    t += (x.y - groundH(x.xz)) / -rd.y * .7;
  }
  return t;
}
vec3 groundN(vec2 xz) {
  float e = .03;
  return normalize(vec3(groundH(xz - vec2(e, 0.)) - groundH(xz + vec2(e, 0.)), 2. * e, groundH(xz - vec2(0., e)) - groundH(xz + vec2(0., e))));
}

/**
 * The march keeps how far the giants are at least (dM: it shrinks by no more than the way gone), and only looks at
 * them again when it gets small: through the grass the steps are short, the giants need not be measured at each.
 */
vec2 march(vec3 ro, vec3 rd, float tmax, float pa) {
  float t = .02, dM = 0.;
  for (int i = 0; i < 150; i++) {
    vec3 x = ro + rd * t;
    if (x.y > 12. && rd.y > 0.) return vec2(-1., tmax);
    gFar = length(x - gRo);
    if (dM < .3) dM = mapM(x);
    bool blade;
    float d = min(dM, mapG(x, blade));
    if (d < max(.0008, t * pa * .7)) return vec2(t, t);
    float st = d * .9;
    t += st;
    dM -= st;
    if (t > tmax) return vec2(-1., tmax);
  }
  return vec2(-1., t);
}

/** The colour of a giant's gills at radius k (0 centre, 1 rim): along the palette, sliding; deepened (no pastel). */
vec3 gillC(float k, float which) {
  vec3 c = pal(fract(.15 + k * .55 + uHue + which * .13));
  c = mix(c, c * c * 1.5, .65);
  // the trip: waves of the enchanted colours rolling out along the gills, faster as it deepens
  return mix(c, tripPal(k * .8 - uTime * (.03 + .12 * uTrip) + which * .17), .2 + .6 * uTrip);
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  gMd = normalize(vec3(-.25 + .2 * (fract(uSeed * .53) - .5), .28, -1.));
  vec3 moonC = enchant(mix(uInk, vec3(.85, .88, 1.), .5));
  // Rétrécir: the eye sinks to the moss under it, and the lens closes in (the giants fill more and more of the frame:
  // seen from a smaller eye they loom)
  vec3 ro = uCamPos, ta = uCamTarget;
  vec3 P = vec3(ro.x, groundH(ro.xz), ro.z);
  ro = P + (ro - P) * uShrink;
  ta = P + (ta - P) * uShrink;
  ro.y = max(ro.y, groundH(ro.xz) + .04);
  gRo = ro;
  float focal = uFocal * (1. + .9 * (1. - uShrink));
  vec3 rd = lookAt(ro, ta) * normalize(vec3(uv, focal));
  float pa = 1. / (uRes.y * focal);

  float tmax = 70.;
  float tG = groundT(ro, rd);
  vec2 mh = march(ro, rd, min(tG, tmax), pa);
  float t = mh.x;
  float tHit = mh.y;
  bool lost = t < 0. && tHit < min(tG, tmax);
  bool onGround = t < 0. && !lost && tG < tmax;
  if (onGround) { t = tG; tHit = tG; }

  // the drop: each cap exhales a cloud of spores, a ring of light runs over the ground
  float burst = uBurst < 99. ? uBurst : 99.;
  float flash = uSafe > .5 ? .3 : 1.;
  float puffs = burst < 12. ? 1. - smoothstep(4., 12., burst) : 0.;

  vec3 col;
  if (t > 0.) {
    vec3 p = ro + rd * t;
    float part = 0., which = 0.;
    vec3 n;
    if (onGround) n = groundN(p.xz);
    else {
      map(p);
      part = gPart;
      which = gWhich;
      n = nrm(p, max(.001, t * pa));
    }
    float dif = max(dot(n, gMd), 0.);
    float back = pow(max(dot(rd, gMd), 0.), 2.);
    float fw = t * pa / max(abs(dot(n, rd)), .15);
    vec3 alb;
    vec3 emit = vec3(0.);
    float trans = 0.;
    // the giants' light falling round them: a pool under every cap, in its gills' colour
    vec3 pool = vec3(0.);
    float nearStem = 1e3;
    for (int i = 0; i < NM; i++) {
      vec4 a, b;
      giant(i, a, b);
      vec2 ot = stemOff(a.z, a, b);
      vec3 lp = vec3(a.x + ot.x, a.z - .25 * b.x, a.y + ot.y);
      vec3 lv = lp - p;
      float d2 = dot(lv, lv);
      float facing = max(dot(n, lv * inversesqrt(d2)), 0.);
      pool += gillC(.5, float(i)) * a.w * a.w * .45 * facing / (1. + d2 * .35);
      nearStem = min(nearStem, length(p.xz - a.xy - stemOff(clamp(p.y, 0., a.z), a, b)));
    }
    if (part < .5) {
      // moss: dark green, fine; the mycelium in it, pulsing out of every stem on the kicks
      float m = vnoise(vec3(p.xz * 6., 1.7)) * .6 + vnoise(vec3(p.xz * 23., 4.4)) * .4;
      alb = mix(vec3(.025, .04, .02), vec3(.05, .075, .03), m);
      float th = mycThreads(p.xz * 1.6, fw * 1.6);
      float pulse = mycPulse(nearStem, uKick, 2.5, .5);
      float ring = burst < 99. ? exp(-pow((length(p.xz) - burst * 5.) / 1.2, 2.)) * exp(-burst * .3) * flash : 0.;
      emit += uTint * uTint * th * (.25 + 3. * pulse + 4. * ring) + uTint * ring * .15;
    } else if (part < 1.5) {
      // a stem: pale, fibrous, glowing at its foot where the mycelium enters
      vec4 a, b;
      giant(int(which), a, b);
      float fib = vnoise(vec3(atan(n.z, n.x) * 12., p.y * 1.2, which * 3.));
      alb = mix(uInk * .16, uInk * .26, fib);
      emit += uTint * uTint * .12 * exp(-p.y * 5.) * (1. + 3. * mycPulse(0., uKick, 1., .4));
      trans = .25;
    } else if (part < 2.5) {
      // a cap's top: pale, translucent where it is thin (toward the rim), lit through by the moon
      vec4 a, b;
      giant(int(which), a, b);
      vec2 ot = stemOff(a.z, a, b);
      float k = clamp(length(p.xz - a.xy - ot) / a.w, 0., 1.);
      float ca = atan(p.z - a.y - ot.y, p.x - a.x - ot.x);
      float streak = vnoise(vec3(ca * 9., k * 3., which)) * .6 + vnoise(vec3(ca * 40., k * 9., which)) * .4;
      alb = uInk * (.12 + .12 * streak) * mix(vec3(1.), gillC(k, which), .35);
      trans = mix(.3, 1.2, k * k);
      emit += gillC(k, which) * .06 * k;
      // a beetle's sheen, and living patterns flowing over the cap
      emit += iridescence(dot(n, -rd), k * 2. + uTime * .08) * (.02 + .12 * uTrip) * (.5 + .5 * streak);
      vec2 tf = tripFlow(vec2(ca * a.w, k * a.w) * 1.5, fw * 1.5);
      emit += tripPal(tf.y + which * .2) * tf.x * (.2 + 1.8 * uTrip);
    } else if (part < 3.5) {
      // the gills: rays from the stem to the rim, glowing in the palette's colours, sliding
      vec4 a, b;
      giant(int(which), a, b);
      vec2 ot = stemOff(a.z, a, b);
      vec2 cxz = p.xz - a.xy - ot;
      float k = clamp(length(cxz) / a.w, 0., 1.);
      // the gills waver a little; long ones from the stem, short ones between them toward the rim
      float ang = atan(cxz.y, cxz.x) + .035 * (vnoise(vec3(k * 4., atan(cxz.y, cxz.x) * 3., which)) - .5);
      float nG = 60. + 30. * fract(which * .37);
      float g = .5 + .5 * cos(ang * nG);
      float g2 = .5 + .5 * cos(ang * nG * 2.);
      float gw = clamp(fw * nG * 2. / max(length(cxz), .05) * .5, 0., 1.);
      float lines = max(pow(g, 9.), pow(g2, 9.) * smoothstep(.4, .6, k) * .7);
      float gl = mix(lines, .2, gw);
      alb = uInk * .05;
      emit += gillC(k, which) * (.07 + .8 * gl) * (.3 + .7 * smoothstep(.1, .6, k)) * (1. + .35 * mycPulse(0., uKick, 1., .3) + 1.5 * puffs * flash);
    } else if (part < 4.5) {
      // grass: thin, dark green, its edges lit by the moon behind
      alb = vec3(.03, .06, .025);
      trans = .6;
    } else {
      // the far giants: dark shapes with a faint glow under their caps
      alb = uInk * .05;
      emit += pal(fract(uHue + .5)) * .05 * smoothstep(.0, -.6, n.y);
    }
    vec3 light = moonC * (dif * .9 + .04 + .03 * n.y) + pool;
    col = alb * light + emit;
    // light through it, from the moon behind (the caps glow)
    col += alb * moonC * trans * back * 3.;
    col += moonC * pow(1. - max(dot(n, -rd), 0.), 4.) * back * .25 * (part > 3.5 && part < 4.5 ? 2. : 1.);
  } else if (lost) {
    col = uBase * .5;
  } else {
    col = mycSky(rd, gMd, moonC, pa) + moonC * 2.4 * mycMoon(rd, gMd, .05, pa) + aurora(rd);
  }

  // the mist: low, lit toward the moon
  float fo = mycFog(ro, rd, tHit, .03 * uMist, .35);
  float cm = max(dot(rd, gMd), 0.);
  vec3 fogC = moonC * (.04 + .9 * pow(cm, 12.) + .12 * pow(cm, 3.)) + pal(fract(uHue + .3)) * .015;
  col = mix(col, fogC, fo);

  // the drop's clouds: each cap exhales a ball of glowing spores that rises and spreads
  if (puffs > 0.) {
    for (int i = 0; i < NM; i++) {
      vec4 a, b;
      giant(i, a, b);
      vec2 ot = stemOff(a.z, a, b);
      vec3 c = vec3(a.x + ot.x, a.z + b.x * .3 + burst * .35, a.y + ot.y);
      float R = a.w * (.6 + .5 * sqrt(burst));
      vec3 oc = ro - c;
      float bq = dot(oc, rd), cq = dot(oc, oc) - R * R;
      float disc = bq * bq - cq;
      if (disc <= 0.) continue;
      float sq = sqrt(disc);
      float t0 = max(-bq - sq, 0.), t1 = min(-bq + sq, tHit);
      if (t1 <= t0) continue;
      vec3 m = ro + rd * (t0 + t1) * .5;
      float n = vnoise(m * 1.5 + vec3(0., -uTime * .3, 0.)) * .7 + vnoise(m * 4.1) * .3;
      float chord = (t1 - t0) / (2. * R);
      col += gillC(.5, float(i)) * chord * chord * smoothstep(.35, .7, n) * puffs * exp(-burst * .25) * 1.2 * flash;
    }
  }
  // the snow of spores, out of focus near the lens; thick in the drop's clouds
  float foc = max(length(ta - ro), .5);
  col += mycMotes(ro, rd, tHit, .6, .22 + .5 * puffs, .007, pa, .025, gillC(.5, 2.), mix(uInk, tripPal(.55), uTrip), .6, foc, .08) * (2.4 + 4. * puffs) * uSpores;
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
