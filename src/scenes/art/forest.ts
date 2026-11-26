import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { num } from "../utils";
import { ART_LIB } from "./lib.glsl";
import { FLIGHT_GLSL, flightParams } from "./flight";
import { MYCELIUM_GLSL } from "./mycelium.glsl";
import { tripUniforms, updateTrip } from "./mycTrip";

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const approach = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-dt * rate));

/**
 * La Forêt hantée: a slow flight at a walker's height between twisted, leaning, mostly dead trees, under a low moon
 * ahead. The mist lies in layers and swallows the far trunks into silhouettes; the moon's light falls through them in
 * shafts and draws their long shadows toward us. Will-o'-the-wisps float ahead, leading the way, flickering on the hats.
 * On the ground the mycelium links every tree to its neighbours with glowing strands, and each kick sends a pulse of
 * light along them, from tree to tree, and up the foot of the trunks. The build speeds up and the nearest trunks close
 * in on the path; on the drop a wave of light runs from the camera to the depths of the forest and lights every
 * mushroom on the trunks (Éclosion), the wisps burst into a swarm.
 */
export const forest = defineShaderScene({
  id: "myc-forest",
  name: "La Forêt hantée",
  energy: "calm",
  hdr: true,
  mask: true,
  renderScale: 0.55,
  flight: { cruise: 1.7, pump: 0.2 },
  description:
    "Un vol lent entre des arbres tordus et morts sous la lune, dans une brume en couches ; des feux follets ouvrent la route, le mycélium relie les arbres au sol et chaque kick y fait courir une impulsion de lumière d'arbre en arbre. La montée accélère et les troncs se resserrent ; au drop, une vague de lumière allume tous les champignons de la forêt.",
  params: [
    paletteParam("boismort"),
    ...flightParams(0.9, 0.8),
    { type: "range", key: "fungi", label: "Champignons", min: 0, max: 1, step: 0.05, default: 0.35 },
    { type: "range", key: "mist", label: "Brume", min: 0, max: 2, step: 0.05, default: 1 },
    { type: "range", key: "wisps", label: "Feux follets", min: 0, max: 2, step: 0.05, default: 1 },
  ],
  uniforms: () => ({
    ...tripUniforms(),
    uKick: { value: 9 },
    uKickB: { value: 9 },
    uBurst: { value: 99 },
    uBloom: { value: 0 },
    uClose: { value: 0 },
    uFungi: { value: 0.35 },
    uMist: { value: 1 },
    uWisps: { value: 1 },
    uSafe: { value: 0 },
    uLast: { value: -99 },
  }),
  update(u, f, p, dt) {
    updateTrip(u, f, dt);
    const bar = f.bpm > 0 ? 240 / f.bpm : 2;
    // Back on screen: no drop in progress
    if (f.time - (u.uLast.value as number) > 1.5) {
      u.uBurst.value = 99;
      u.uBloom.value = 0;
      u.uClose.value = 0;
    }
    u.uLast.value = f.time;
    u.uSafe.value = f.safeFlash ? 1 : 0;
    // two pulses on the way at once: the last kick's and the one before
    if (f.beat) {
      u.uKickB.value = u.uKick.value;
      u.uKick.value = 0;
    } else {
      u.uKick.value = (u.uKick.value as number) + dt;
      u.uKickB.value = (u.uKickB.value as number) + dt;
    }
    if (f.drop) u.uBurst.value = 0;
    else u.uBurst.value = Math.min(99, (u.uBurst.value as number) + dt);
    const burst = u.uBurst.value as number;
    // the mushrooms stay lit through the drop's hold, then go back to their own glow
    u.uBloom.value = burst < 99 ? 1 - smooth(bar * 5, bar * 10, burst) : 0;
    // the build: the nearest trunks close in on the path (and let go slowly after the drop)
    const close = f.section === "build" ? smooth(0.1, 1, f.buildProgress) : 0;
    u.uClose.value = approach(u.uClose.value as number, close, close > (u.uClose.value as number) ? 1.5 : 0.35, dt);
    u.uFungi.value = num(p.fungi, 0.35);
    u.uMist.value = num(p.mist, 1) * (1 + 0.5 * (u.uClose.value as number));
    u.uWisps.value = num(p.wisps, 1);
  },
  fragment: /* glsl */ `
uniform float uKick;    // seconds since the last kick
uniform float uKickB;   // and since the one before
uniform float uBurst;   // seconds since the drop
uniform float uBloom;   // 1: every mushroom lit (the drop), fading back
uniform float uClose;   // the build: the nearest trunks close in
uniform float uFungi;   // how many mushrooms on the trunks, how bright
uniform float uMist;
uniform float uWisps;
uniform float uSafe;
${ART_LIB}
${FLIGHT_GLSL}
${MYCELIUM_GLSL}
const float C = 5.;       // a tree per cell (path space: across the path, along it); the path's own row is empty
const float REACH = 1.4;  // how far a branch may reach past its cell's border
const int NW = 5;         // will-o'-the-wisps
vec2 gSeed;
vec3 gMd;                 // toward the moon
float gMat;               // what map hit: 0 ground, 1 wood, 2 a mushroom
bool gLite = false;       // trunks only (the shadows)
float gFar;               // how far from the camera map is looking
vec3 gRo;

float pathX(float z) { return 3.5 * sin(z * .045) + 1.6 * sin(z * .11 + 1.3); }
float pathDDX(float z) { return -3.5 * .045 * .045 * sin(z * .045) - 1.6 * .11 * .11 * sin(z * .11 + 1.3); }

float groundH(vec2 xz) {
  return .35 * vnoise(vec3(xz * .15, 2.7)) + .15 * vnoise(vec3(xz * .55, 5.1)) - .25;
}

/**
 * The tree of cell k (path space: k.x across the path, k.y along it): its base (s, z) and random numbers. The rows
 * along the path stand closer to it (inside the empty row's cells) and close in through the build.
 */
bool treeOf(vec2 k, out vec2 b, out vec4 h) {
  b = vec2(0.);
  h = vec4(0.);
  if (k.x == 0.) return false;
  vec2 c = k + gSeed;
  vec2 h2 = vec2(hash12(c), hash12(c * 1.7 + 3.1));
  h = vec4(h2, fract(h2.x * 7.31 + h2.y * 3.17), fract(h2.y * 9.13 + h2.x * 1.79));
  bool near = abs(k.x) < 1.5;
  if (!near && h.w < .18) return false;
  float s = near ? sign(k.x) * (3.4 + .8 * h.x - uClose) : k.x * C + (h.x - .5) * 1.2;
  b = vec2(s, k.y * C + (h.y - .5) * 1.6);
  return true;
}

/** The trunk's axis at height y, from its base: leaning, and wandering a little (twisted wood). */
vec2 treeAxis(float y, vec2 lean, vec4 h) {
  return lean * max(y, 0.) + .25 * vec2(sin(y * .35 + h.x * 6.), cos(y * .29 + h.y * 6.)) * smoothstep(0., 3., y);
}
vec2 treeLean(vec2 k, vec4 h) {
  vec2 lean = normalize(vec2(h.x - .5, h.y - .5) + 1e-3) * (.015 + .025 * h.z);
  if (abs(k.x) < 1.5) lean.x = abs(lean.x) * sign(k.x);
  return lean;
}
float treeTop(vec4 h) { return 8.5 + 4.5 * h.w; }
float treeR(vec4 h) { return .2 + .2 * h.z; }

/** A tree (q in path space): its distance, and 2. where it is one of its mushrooms. fungi: also the mushrooms. */
vec2 tree(vec3 q, vec2 k, bool fungi) {
  vec2 b;
  vec4 h;
  if (!treeOf(k, b, h)) return vec2(1e3, 0.);
  vec3 l = q - vec3(b.x, 0., b.y);
  float rr = length(l.xz);
  float top = treeTop(h);
  float y = l.y;
  // far from it: a bound (nothing of it reaches further than 3.7 from its base; below its crown, a trunk and its
  // mushrooms, 1.4 at most)
  float crownLow = top * .34 - .4;
  float far = rr - 3.7;
  if (y < crownLow) far = min(rr - 1.4, max(far, crownLow - y));
  if (far > .6) return vec2(far, 0.);
  float r0 = treeR(h);
  // above its crown (the highest twig: .86 of the height, plus 3.2)
  float crownTop = top * .86 + 3.2;
  if (y > crownTop) return vec2(max(rr - 3.7, y - crownTop), 0.);
  vec2 lean = treeLean(k, h);
  vec2 rp = l.xz - treeAxis(y, lean, h);
  float ang = atan(rp.y, rp.x);
  float fl = exp(-max(y, 0.) * 1.6);
  // the trunk flares into its roots at the foot, tapers to a point; long ridges in the bark
  float taper = 1. - .8 * smoothstep(0., top, y);
  float r = r0 * taper * (1. + .9 * fl) + .15 * fl * max(0., sin(ang * 5. + h.z * 6.)) + .012 * sin(ang * 13. + y * .7);
  // the trip: the trunks breathe, a slow swell climbing the bark
  r *= 1. + uTrip * (.05 * uBreath + .07 * sin(y * 1.1 - uTime * 1.3 + h.x * 6.));
  float d = (length(rp) - r) * .85;
  d = max(d, y - top);
  float mat = 1.;
  // the crown: bare branches from a third of the height up, reaching up and out, each with a twig; the rows along
  // the path reach away from it (the flight passes under nothing)
  if (!gLite && y > crownLow) {
    // far away (lost in the mist) only the branches, not their twigs
    bool twigs = gFar < 18.;
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float hb = top * (.34 + .16 * fi) + .6 * fract(h.w * 7.3 + fi * .37);
      float az = h.x * 6.28 + fi * 2.2;
      vec2 dh = vec2(cos(az), sin(az));
      if (abs(k.x) < 1.5) dh.x = abs(dh.x) * sign(k.x);
      float el = .5 + .6 * fract(h.y * 5.1 + fi * .61);
      float L = (1.1 + .8 * fract(h.z * 3.7 + fi * .29)) * (1. - .1 * fi);
      vec2 a0 = treeAxis(hb, lean, h);
      vec3 s0 = vec3(a0.x, hb, a0.y);
      vec3 dir = vec3(dh.x * cos(el), sin(el), dh.y * cos(el));
      float br = r0 * taper * .45;
      // the branch and its twigs fit in a ball: test it first
      float bb = length(l - s0 - dir * L * .6) - L * .9 - br;
      if (bb > d) continue;
      vec3 s1 = s0 + dir * L;
      d = min(d, sdTaper(l, s0, s1, br, br * .5));
      if (!twigs) continue;
      vec3 s2 = s1 + normalize(dir + vec3(0., .9, 0.) + .5 * vec3(dh.y, 0., -dh.x)) * L * .5;
      vec3 s3 = s0 + dir * L * .55 + normalize(vec3(-dh.y, .7, dh.x)) * L * .45;
      d = min(d, sdTaper(l, s1, s2, br * .5, .012));
      d = min(d, sdTaper(l, s0 + dir * L * .5, s3, br * .4, .01));
    }
  }
  // the mushrooms: bracket fungi in loose clusters on the trunk, overlapping fans of different sizes
  if (fungi && !gLite && gFar < 30. && y < 4.8 && length(rp) < r + .5) {
    for (int c = 0; c < 3; c++) {
      float fc = float(c);
      float hc = fract(h.z * 9.1 + fc * .43);
      if (hc > .25 + .75 * uFungi) continue;
      float yc = .45 + 3.3 * fract(h.w * 3.3 + fc * .71);
      if (abs(y - yc - .12) > .45) continue;
      float ac = h.y * 6.28 + fc * 2.3;
      for (int s = 0; s < 3; s++) {
        float fs = float(s);
        float hs = fract(hc * 17.3 + fs * .61);
        float ys = yc + fs * .11 + .06 * hs;
        float sz = (.16 - .035 * fs) * (.7 + .6 * hs);
        float a = ac + (hs - .5) * .9 + (fs - 1.) * .35;
        vec2 dc = vec2(cos(a), sin(a));
        vec2 ax = treeAxis(ys, lean, h);
        float rs = r0 * (1. - .8 * ys / top) * (1. + .9 * exp(-ys * 1.6));
        vec2 cxz = ax + dc * (rs + sz * .2);
        // a fan: wider than deep, its top a little domed
        vec3 o = l - vec3(cxz.x, ys, cxz.y);
        vec3 lo = vec3(dot(o.xz, vec2(-dc.y, dc.x)), o.y, dot(o.xz, dc));
        float e = sdEllipsoid(lo - vec3(0., -lo.z * lo.z * .6, 0.), vec3(sz * 1.25, sz * .22, sz * .8));
        if (e < d) { d = e; mat = 2.; }
      }
    }
  }
  return vec2(d, mat);
}

/** Nothing stands higher than this: above, only the sky. */
const float CEIL = 14.6;

/** The trees (the ground is a height field, met on its own: rays grazing it would crawl). */
float map(vec3 p) {
  vec3 q = vec3(p.x - pathX(p.z), p.y, p.z);
  if (q.y > CEIL) return q.y - CEIL + .05;
  gFar = length(p - gRo);
  vec2 dm = vec2(1e3, 1.);
  float bound;
  if (q.y < 2.2) {
    // its own cell; in the path's row, the rows on both sides (their trees stand inside it)
    vec2 kc = floor(q.xz / C + .5);
    vec2 o = abs(q.xz - kc * C);
    float border;
    if (kc.x == 0.) {
      vec2 t = tree(q, vec2(-1., kc.y), true);
      if (t.x < dm.x) dm = t;
      t = tree(q, vec2(1., kc.y), true);
      if (t.x < dm.x) dm = t;
      border = C * .5 - o.y;
    } else {
      vec2 t = tree(q, kc, true);
      if (t.x < dm.x) dm = t;
      border = C * .5 - max(o.x, o.y);
    }
    // outside: trunks at least half a metre inside their own cells, branches up high (the lowest at 2.8): a ray
    // running along a border never crawls
    bound = min(border + .5, max(border - REACH, 2.8 - q.y));
  } else {
    // up in the crowns: the four cells around (a branch may reach over its cell's border)
    vec2 k0 = floor(q.xz / C);
    for (int j = 0; j < 2; j++)
      for (int i = 0; i < 2; i++) {
        vec2 t = tree(q, k0 + vec2(i, j), true);
        if (t.x < dm.x) dm = t;
      }
    vec2 lo = q.xz - (k0 - .5) * C, hi = (k0 + 1.5) * C - q.xz;
    bound = min(min(lo.x, lo.y), min(hi.x, hi.y)) - REACH;
  }
  gMat = dm.y;
  return min(dm.x, max(bound, .03));
}

/** The tree nearest to p: its base in world space (x, z), the distance to its axis, its radius. */
vec4 nearTree(vec3 p, out vec4 hh) {
  vec3 q = vec3(p.x - pathX(p.z), p.y, p.z);
  vec2 kc = floor(q.xz / C + .5);
  float best = 1e3;
  vec4 res = vec4(0., 0., 1e3, .3);
  hh = vec4(0.);
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 k = kc + vec2(i, j);
      vec2 b;
      vec4 h;
      if (!treeOf(k, b, h)) continue;
      float d = length(q.xz - b - treeAxis(q.y, treeLean(k, h), h));
      if (d < best) { best = d; res = vec4(b.x + pathX(b.y), b.y, d, treeR(h)); hh = h; }
    }
  return res;
}

/**
 * The network on the ground: a wandering strand of mycelium from each tree to its neighbours (along the path, across
 * it, and over the path between its two rows). Returns its light (a pixel w wide at least) and in .y how far the
 * point is from the nearer tree along the strand (the pulses leave every tree).
 */
vec2 network(vec2 xz, float w) {
  vec2 q = vec2(xz.x - pathX(xz.y), xz.y);
  vec2 k0 = floor(q / C);
  float best = 0., along = 99.;
  for (int e = 0; e < 6; e++) {
    vec2 ka, kb;
    if (e == 0) { ka = k0; kb = k0 + vec2(0., 1.); }
    else if (e == 1) { ka = k0 + vec2(1., 0.); kb = k0 + vec2(1., 1.); }
    else if (e == 2) { ka = k0; kb = k0 + vec2(1., 0.); }
    else if (e == 3) { ka = k0 + vec2(0., 1.); kb = k0 + vec2(1., 1.); }
    else if (e == 4) { ka = k0; kb = k0 + vec2(1., 1.); }
    else { ka = vec2(-1., k0.y + step(.5, fract(q.y / C))); kb = vec2(1., ka.y); if (abs(q.x) > C) continue; }
    // the path's row has no tree: its links jump over it
    if (ka.x == 0.) ka.x = -1.;
    if (kb.x == 0.) kb.x = 1.;
    if (ka == kb) continue;
    float hl = hash12(ka * 3.7 + kb * 1.3 + gSeed);
    if (hl > (e == 4 ? .35 : .8)) continue;
    vec2 a, b;
    vec4 h1, h2;
    if (!treeOf(ka, a, h1) || !treeOf(kb, b, h2)) continue;
    vec2 pa = q - a, ba = b - a;
    float L = length(ba);
    float t = clamp(dot(pa, ba) / (L * L), 0., 1.);
    vec2 nn = vec2(-ba.y, ba.x) / L;
    // it wanders on its way, and leaves the trees from their roots
    float wander = sin(t * 3.1416) * (.35 * sin(t * 9. + hl * 20.) + .5 * (hl - .4));
    float dd = abs(dot(pa - ba * t, nn) - wander);
    float l = mycLine(dd, .011, w) * smoothstep(0., .08, t) * smoothstep(1., .92, t);
    if (l > best) { best = l; along = min(t, 1. - t) * L; }
  }
  return vec2(best, along);
}

/** How much moonlight reaches a point of the mist: the trunks between it and the moon hold it back (shafts). */
float shaftLight(vec3 s) {
  float v = 1.;
  for (int j = 0; j < 3; j++) {
    vec3 x = s + gMd * (1. + 3. * float(j));
    vec3 q = vec3(x.x - pathX(x.z), x.y, x.z);
    vec2 k = floor(q.xz / C + .5);
    if (k.x == 0.) k.x = q.x < 0. ? -1. : 1.;
    vec2 b;
    vec4 h;
    if (!treeOf(k, b, h)) continue;
    if (q.y > treeTop(h)) continue;
    float d = length(q.xz - b - treeAxis(q.y, treeLean(k, h), h)) - treeR(h);
    v *= smoothstep(-.1, .5, d);
  }
  return v;
}

/** The trunks' shadow (only the trunks: the branches' would be lost in the mist). */
float softShadow(vec3 ro, vec3 rd) {
  float res = 1., t = .08;
  gLite = true;
  for (int i = 0; i < 14; i++) {
    vec3 x = ro + rd * t;
    if (x.y > CEIL) break;
    float h = map(x);
    res = min(res, 9. * h / t);
    t += clamp(h, .15, 1.6);
    if (res < .02 || t > 22.) break;
  }
  gLite = false;
  return clamp(res, 0., 1.);
}

/** Where the ray meets the ground (a gentle height field): from the plane, a few corrections. */
float groundT(vec3 ro, vec3 rd) {
  if (rd.y > -1e-3) return 1e5;
  float t = (ro.y + .25) / -rd.y;
  for (int i = 0; i < 6; i++) {
    vec3 x = ro + rd * t;
    t += (x.y - groundH(x.xz)) / -rd.y * .7;
  }
  return t;
}
vec3 groundN(vec2 xz) {
  float e = .05;
  return normalize(vec3(groundH(xz - vec2(e, 0.)) - groundH(xz + vec2(e, 0.)), 2. * e, groundH(xz - vec2(0., e)) - groundH(xz + vec2(0., e))));
}

/**
 * The hit (x > 0), or none (x < 0); y: how far the ray got. Far in the forest a ray may run out of steps before it
 * hits: it stops among the trunks, and the mist decides what is seen there.
 */
vec2 march(vec3 ro, vec3 rd, float tmax, float pa) {
  float t = .1;
  for (int i = 0; i < 130; i++) {
    vec3 x = ro + rd * t;
    // above everything, going up: the sky
    if (x.y > CEIL && rd.y > 0.) return vec2(-1., tmax);
    float d = map(x);
    if (d < max(.0015, t * pa * .7)) return vec2(t, t);
    t += d * .9;
    if (t > tmax) return vec2(-1., tmax);
  }
  return vec2(-1., t);
}

vec3 nrm(vec3 p, float e) {
  const vec2 k = vec2(1, -1);
  return normalize(k.xyy * map(p + k.xyy * e) + k.yyx * map(p + k.yyx * e) + k.yxy * map(p + k.yxy * e) + k.xxx * map(p + k.xxx * e));
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  gSeed = vec2(floor(fract(uSeed * .731) * 97.), floor(fract(uSeed * .377) * 61.));
  gMd = normalize(vec3(.28 + .25 * (fract(uSeed * .53) - .5), .2, -1.));
  // the enchanted night: the moon's silver turns toward the drifting colours
  vec3 moonC = enchant(mix(uInk, vec3(.8, .88, 1.), .4));

  // the flight, at a walker's height along the path; up among the branches on the drop, skimming the mist in the breakdown
  float z = -uTravel;
  float alt = uDive >= 0. ? mix(1.5, 6.2, smoothstep(0., 1.4, uDive)) : mix(1.5, .75, -uDive);
  float sway = clamp(uSway, -1., 1.) * .7;
  vec3 ro = vec3(pathX(z) + sway, alt, z);
  gRo = ro;
  float zt = z - 6.;
  vec3 ta = vec3(pathX(zt) + sway * .5, alt - .15 - .8 * smoothstep(.8, 1.4, uDive), zt);
  // banking only into the path's turns (a ghost's glide: no barrel roll in a forest)
  uv *= rot(pathDDX(z - 3.) * 5. + .04 * uSway);
  uv += flightShake();
  float focal = flightFocal(1.45);
  vec3 rd = lookAt(ro, ta) * normalize(vec3(uv, focal));
  float pa = 1. / (uRes.y * focal);

  // the will-o'-the-wisps ahead along the path: the flight slowly catches up with them, they fade as it passes
  vec3 wp[NW];
  float wi[NW];
  for (int i = 0; i < NW; i++) {
    float fi = float(i);
    float dz = 3. + mod(fi * 6.3 + 2.1 * fract(gSeed.x * .13 + fi * .37) - uTravel * .4, float(NW) * 6.3);
    float wz = z - dz;
    float side = sin(fi * 2.7 + uTime * .11 + gSeed.y) * 1.4;
    wp[i] = vec3(pathX(wz) + side, .9 + .4 * sin(uTime * .37 + fi * 1.9) + .2 * sin(uTime * 1.1 + fi), wz);
    float flick = .65 + .35 * sin(uTime * (5. + fi) + fi * 3.) * sin(uTime * 2.3 + fi * 7.);
    wi[i] = uWisps * smoothstep(3., 6., dz) * smoothstep(float(NW) * 6.3 + 3., float(NW) * 6.3 - 4., dz) * (flick + .9 * uHat * fract(fi * .618 + .3));
  }
  vec3 wispC = mix(mix(uTint, vec3(.85, 1., .95), .35), tripPal(.2), .5 * uTrip);
  // the living light, deeper than the tint itself (pale tints would glow white)
  vec3 glowC = uTint * uTint * 1.3;

  float tmax = 50.;
  float tG = groundT(ro, rd);
  vec2 mh = march(ro, rd, min(tG, tmax), pa);
  float t = mh.x;
  float tHit = mh.y;
  bool lost = t < 0. && tHit < min(tG, tmax);
  bool onGround = t < 0. && !lost && tG < tmax;
  if (onGround) { t = tG; tHit = tG; }
  vec3 col;
  float front = uBurst * 14.;          // the drop's wave, running away from the camera
  float flash = uSafe > .5 ? .25 : 1.;
  if (t > 0.) {
    vec3 p = ro + rd * t;
    float mat = 0.;
    vec3 n;
    if (onGround) n = groundN(p.xz);
    else {
      map(p);
      mat = gMat;
      n = nrm(p, max(.002, t * pa));
    }
    float dif = max(dot(n, gMd), 0.);
    float rim = pow(1. - max(dot(n, -rd), 0.), 3.) * (.2 + .8 * pow(max(dot(rd, gMd), 0.), 3.));
    float fw = t * pa / max(abs(dot(n, rd)), .15);
    vec4 hh;
    vec4 tr = nearTree(p, hh);
    // the drop's wave: what it has passed stays lit while the mushrooms bloom
    float passed = uBurst < 99. ? smoothstep(front, front - 5., t) : 0.;
    float wave = uBurst < 99. ? exp(-pow((t - front) / 2.2, 2.)) * exp(-uBurst * .25) * flash * 1.6 : 0.;
    float bloom = mix(uFungi * .5, 1., passed * uBloom);
    float kick = mycPulse(0., uKick, 1., .5);
    vec3 alb;
    vec3 emit = vec3(0.);
    if (mat < .5) {
      // the forest floor: dead leaves, moss, the trodden path a little lighter
      float lv = vnoise(vec3(p.xz * 3.1, 1.7)) * .6 + vnoise(vec3(p.xz * 9.7, 4.4)) * .4;
      alb = mix(vec3(.05, .042, .032), vec3(.04, .06, .035), smoothstep(.45, .7, vnoise(vec3(p.xz * .6, 8.8))));
      alb *= .7 + .6 * lv;
      alb *= 1. + .35 * exp(-pow((p.x - pathX(p.z)) / 1.1, 2.));
      // the network between the trees, and the fine mycelium round their roots
      vec2 nw = network(p.xz, fw);
      float pulse = mycPulse(nw.y, uKick, 3.4, .8) + .6 * mycPulse(nw.y, uKickB, 3.4, .8);
      // (the pulses change colour along their way as the trip deepens)
      vec3 netC = mix(glowC, tripPal(nw.y * .08 + uTime * .03), .3 + .6 * uTrip);
      emit += netC * nw.x * (.12 + 3.5 * pulse + 2. * bloom * passed + 4. * wave);
      float th = mycThreads(p.xz, fw) * smoothstep(2.2, .4, tr.z - tr.w);
      emit += glowC * th * (.25 + 2.5 * mycPulse(tr.z, uKick, 3., .6) + 2. * passed * uBloom);
      emit += glowC * wave * .2;
    } else {
      // wood: grey, black where wet, moss on the side facing up and the moon; the threads climb the foot of the trunk
      vec2 bp = vec2(atan(p.z - tr.y, p.x - tr.x) * (tr.w + .1), p.y);
      float bk = vnoise(vec3(bp * vec2(9., 1.6), hh.x * 9.)) * .6 + vnoise(vec3(bp * vec2(31., 6.), 3.3)) * .4;
      alb = vec3(.075, .07, .065) * (.55 + .7 * bk);
      float moss = smoothstep(.35, .75, vnoise(vec3(p * 1.3 + hh.y * 7.)) + .35 * n.y + .2 * dot(n, gMd));
      alb = mix(alb, vec3(.045, .07, .035), moss * smoothstep(5., 1., p.y) * .8);
      if (mat > 1.5) {
        // a mushroom: pale on top, its underside glowing
        alb = vec3(.22, .2, .17);
        float under = smoothstep(.2, -.6, n.y);
        emit += glowC * (1. + .8 * uHat + .6 * kick) * bloom * (.4 + 1.6 * under) * (1. + 2.5 * wave);
      } else {
        // (stretched upward: veins climbing the bark, not a net)
        float th = mycThreads(bp * vec2(1.6, .45), fw * .9) * smoothstep(2.2, .2, p.y);
        float pulse = mycPulse(p.y, uKick, 2.2, .35) + .6 * mycPulse(p.y, uKickB, 2.2, .35);
        emit += glowC * th * (.3 + 4. * pulse + 2. * bloom * passed + 3. * wave);
        // living patterns crawling over the bark, more and more of them; on the drop every trunk runs with colour
        vec2 tf = tripFlow(bp * vec2(1., .6), fw);
        emit += tripPal(tf.y) * tf.x * (.15 + 1.5 * uTrip) * (1. + 2. * passed * uBloom);
      }
    }
    // the moon (shadows on the ground: the trunks' long shadows reach toward us)
    // (far away the shadows are lost in the mist)
    float sh = mat < .5 && t < 28. ? mix(softShadow(p + n * .03, gMd), 1., smoothstep(20., 28., t)) : 1.;
    vec3 light = moonC * (1.35 * dif * sh) + uInk * (.04 + .03 * n.y);
    // the wisps light what is near them
    for (int i = 0; i < NW; i++) {
      vec3 lv = wp[i] - p;
      float d2 = dot(lv, lv);
      light += wispC * wi[i] * 1.4 * max(dot(n, lv * inversesqrt(d2)), 0.) / (1. + d2 * 1.5);
    }
    col = alb * light + moonC * rim * .12 * (mat < .5 ? .3 : 1.) + emit;
  } else if (lost) {
    // deep among the trunks: their dark mass
    col = uBase * .3;
  } else {
    col = mycSky(rd, gMd, moonC, pa) + moonC * 2.2 * mycMoon(rd, gMd, .045, pa) + aurora(rd);
  }

  // the mist: dim everywhere, bright toward the moon where its light falls through the trees in shafts
  float dens = .045 * uMist;
  float fo = mycFog(ro, rd, tHit, dens, .4);
  float cm = max(dot(rd, gMd), 0.);
  float lobe = 1.1 * pow(cm, 14.) + .14 * pow(cm, 3.);
  // (a fixed, even dither: a random one per frame reads as grain on the trunks)
  float j = fract(52.9829189 * fract(dot(fc, vec2(.06711056, .00583715))));
  float vis = 0., wsum = 0.;
  for (int k = 0; k < 6; k++) {
    float ts = (float(k) + j) * 3.;
    if (ts > tHit) break;
    float wk = exp(-ts * .05);
    vis += shaftLight(ro + rd * ts) * wk;
    wsum += wk;
  }
  vis = wsum > 0. ? vis / wsum : 1.;
  vec3 fogC = moonC * (.05 + lobe * (.15 + .85 * vis)) + uBase * .4;
  // the drop: the mist catches the living light as the wave runs through it, then lets it go
  if (uBurst < 12.) {
    float glowMist = exp(-uBurst * .45) * flash * (.35 + .65 * smoothstep(0., 6., min(front, tHit)));
    fogC += glowC * glowMist * .9;
  }
  col = mix(col, fogC, fo);
  // a low mist lying on the ground, lit by the wisps passing over it
  float lowF = mycFog(ro, rd, tHit, .2 * uMist, 2.4);
  col = mix(col, moonC * (.035 + .3 * lobe) + wispC * .03 * uWisps, lowF * .7);

  // the wisps: soft orbs (hidden behind what stands in front of them)
  for (int i = 0; i < NW; i++) {
    vec3 v = wp[i] - ro;
    float tc = dot(v, rd);
    if (tc < .1 || tc > tHit) continue;
    float dd = length(v - rd * tc);
    float r = max(.045, tc * pa * 1.2);
    float core = (.045 * .045) / (r * r) * exp(-dd * dd / (r * r));
    float halo = exp(-dd / (.3 + .02 * tc)) * .1;
    // (each its own colour once the trip deepens)
    vec3 wc = mix(wispC, tripPal(float(i) * .23 + uTime * .02), uTrip);
    col += wc * wi[i] * (core * 5. + halo) * (1. - .5 * mycFog(ro, rd, tc, dens, .4));
  }
  // fireflies; on the drop the wisps burst into a swarm
  float swarm = uBurst < 8. ? exp(-uBurst * .45) : 0.;
  col += mycMotes(ro, rd, tHit, 2.4, .05 + .5 * swarm, .02, pa, .02, wispC, mix(uTint, tripPal(.6), uTrip), .8) * (1. + 3. * swarm) * (.6 + .4 * uWisps);
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
