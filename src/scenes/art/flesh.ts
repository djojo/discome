import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { num } from "../utils";
import { ABYSS_GLSL } from "./abyss.glsl";
import { ART_LIB, MARCH } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";

const FRAMINGS: Framing[] = [
  { az: 0, el: 0.08, dist: 5.6, target: [0, 0.05, 0], focal: 2, weight: 3 },
  { az: 0.8, el: 0.35, dist: 5, target: [0, 0.2, 0], focal: 2, weight: 2 },
  { az: -1.2, el: -0.12, dist: 5.4, target: [0, 0.1, 0], focal: 2, weight: 2 },
  { az: 0.4, el: 0.2, dist: 3.5, target: [0.3, 0.75, 0.2], focal: 2.1, weight: 2 },
  { az: 2.6, el: 0.6, dist: 4.6, target: [0, 0.4, 0], focal: 2, weight: 1 },
];

/**
 * A slow organic creature between an anemone and a coral: a translucent body, a ruffled collar and a crown of
 * tentacles that sway at their own pace. The music lives in its light: a pulse runs up the bioluminescent veins
 * on every kick, the inner glow follows the bass, the drop lights it from within and releases drifting spores.
 * Variant « Abysses »: deep cold water, light from above, marine snow.
 */
export const flesh = defineShaderScene({
  id: "flesh",
  name: "Chair",
  energy: "calm",
  hdr: true,
  renderScale: 0.7,
  mask: true,
  camera: { framings: FRAMINGS, glideBars: 2 },
  description:
    "Créature translucide entre l'anémone et le corail : ses tentacules ondulent lentement, une impulsion de lumière monte dans ses veines à chaque kick, le drop libère des spores.",
  params: [
    paletteParam("flesh"),
    {
      type: "select",
      key: "variant",
      label: "Variante",
      options: [
        { value: "nacre", label: "Nacre" },
        { value: "abyss", label: "Abysses" },
      ],
      default: "nacre",
    },
    { type: "range", key: "breath", label: "Respiration", min: 0, max: 2, step: 0.05, default: 1 },
    { type: "range", key: "detail", label: "Relief", min: 0.6, max: 2, step: 0.05, default: 1.1 },
  ],
  uniforms: () => ({
    uBreath: { value: 1 },
    uDetail: { value: 1.1 },
    uWave: { value: 9 },
    uSporeT: { value: 99 },
    uVariant: { value: 0 },
  }),
  update(u, f, p, dt) {
    u.uBreath.value = num(p.breath, 1);
    u.uDetail.value = num(p.detail, 1.1);
    u.uVariant.value = p.variant === "abyss" ? 1 : 0;
    u.uWave.value = f.beat ? 0 : (u.uWave.value as number) + dt;
    u.uSporeT.value = f.drop ? 0 : (u.uSporeT.value as number) + dt;
  },
  fragment: /* glsl */ `
uniform float uBreath;
uniform float uDetail;
uniform float uWave;
uniform float uSporeT;
uniform float uVariant;
${ART_LIB}
${ABYSS_GLSL}
${CAMERA_GLSL}
// Two whorls of fine tentacles: an inner one, shorter, and an outer one
const float NI = 16., NO = 24.;
const float Y0 = -.04;  // the tentacles rise from the oral disc at this height
float gT;     // along the nearest tentacle: 0 at the disc, 1 at the tip (-1 off the tentacles)
float gPhi;   // around the tentacle
float gRock;  // 1 on the rock it clings to
bool gWantPhi = false;  // the angle around a tentacle is only needed to shade it

vec3 toCreature(vec3 p) { p.xz *= rot(uTime * .02 + uSeed); return p; }

float tentLen(float id, float w) { return mix(.6, 1.05, w) + .3 * hash12(vec2(id + 37. * w, uSeed)); }

/**
 * Centre line of tentacle id of whorl w (0 inner, 1 outer), in its sector frame (x outward, y up, z sideways):
 * it spreads out and up, a slow current bends it (cur: the current in this frame), each one sways on its own phase
 * and its tip curls over.
 */
vec3 tentCentre(float t, float id, float w, vec2 cur) {
  float L = tentLen(id, w);
  float ph = id * 1.37 + w * 2.1 + uSeed;
  float rb = mix(.3, .56, w);
  float sway = .22 * sin(uTime * .21 + ph) + .12 * sin(uTime * .13 + ph * 2.3);
  // (always rising: the tentacle is found by its height, so it must never fold back down)
  vec3 c = vec3(rb + t * mix(.12, .3, w) + t * t * (sway + .1 * w) + .1 * t * t * t,
                Y0 + t * L - mix(.08, .16, w) * L * t * t * t,
                .05 * t * t * sin(uTime * .19 + ph * 1.7));
  c.xz += cur * t * t;
  return c;
}

float tentacleD(vec3 p, float id, float n, float w, out float t, out float phi) {
  float W = 6.2831853 / n;
  float ang = (id + .5 * w) * W;
  vec3 q = p;
  q.xz *= rot(-ang);
  // the current, the same for all, seen from this tentacle's sector
  vec2 cur = vec2(cos(uTime * .07), sin(uTime * .07)) * .09 * rot(-ang);
  float L = tentLen(id, w);
  // the point of the tentacle at this height: y(t) = Y0 + L (t - k t^3), inverted by two Newton steps
  float k = mix(.08, .16, w);
  float h = (q.y - Y0) / L;
  t = clamp(h, 0., 1.);
  t = clamp(t - (t - k * t * t * t - h) / (1. - 3. * k * t * t), 0., 1.);
  t = clamp(t - (t - k * t * t * t - h) / (1. - 3. * k * t * t), 0., 1.);
  vec3 c = tentCentre(t, id, w, cur);
  vec3 r = q - c;
  phi = gWantPhi ? atan(r.z, r.x) : 0.;
  // measured at the same height, the distance to a leaning tentacle is too long: scale it by the slope
  // (the curve's derivative, roughly: outward, up, sideways)
  vec3 dc = vec3(mix(.12, .3, w) + 2. * t * (.34 + .1 * w) + .3 * t * t + 2. * t * length(cur), L * (1. - 3. * k * t * t), .1 * t + 2. * t * length(cur));
  float slope = dc.y / length(dc);
  return (length(r) - mix(.042, .009, t)) * clamp(slope, .35, 1.);
}

/** The nearest tentacle of a whorl; neighbours are checked too, since a curling tip may leave its own sector. */
float whorl(vec3 p, float n, float w, inout float t, inout float phi) {
  // far from this whorl's shell of tentacles, its bounds are enough
  float rb = mix(.3, .56, w);
  float rxz = length(p.xz);
  float shell = max(max(rb - .1 - rxz, rxz - (rb + mix(.75, 1.05, w))), max(Y0 - .08 - p.y, p.y - (Y0 + mix(.95, 1.4, w))));
  if (shell > .06) return shell;
  float W = 6.2831853 / n;
  float fa = atan(p.z, p.x) / W - .5 * w;
  float id0 = floor(fa + .5);
  float d = tentacleD(p, mod(id0, n), n, w, t, phi);
  // the neighbour on this side only, and only near the edge of the sector (a leaning tip may cross it)
  float f = fa - id0;
  if (abs(f) > .2) {
    float tk, pk;
    float dk = tentacleD(p, mod(id0 + sign(f), n), n, w, tk, pk);
    if (dk < d) { d = dk; t = tk; phi = pk; }
  }
  return d;
}

float map(vec3 p) {
  p = toCreature(p);
  // Cheap bound: far from the creature, nothing else to evaluate
  float bound = sdCapsule(p, vec3(0., -1.9, 0.), vec3(0., 1.1, 0.), 1.6);
  gT = -1.;
  gRock = 0.;
  if (bound > .3) return bound;
  float breath = 1. + .025 * sin(uTime * .4) * uBreath;
  float a = atan(p.z, p.x);
  float rxz = length(p.xz);
  // the column: stocky, ribbed, flaring into the oral disc
  float column = sdCapsule(p, vec3(0., -1.45, 0.), vec3(0., -.4, 0.), .38 * breath) - .02 * sin(a * 14.) * smoothstep(-1.4, -.6, p.y);
  // the oral disc, wide, pleated in rays, the slit of the mouth at its centre
  float disc = sdEllipsoid(p - vec3(0., -.14, 0.), vec3(.74, .15, .74) * breath);
  disc += .022 * sin(a * 22. + rxz * 9.) * smoothstep(.2, .65, rxz);
  disc = smax(disc, -sdEllipsoid(p - vec3(0., -.01, 0.), vec3(.13, .05, .04)), .03);
  float body = smin(column, disc, .28);
  if (body < .25) {
    vec3 q = p * 2.2 * uDetail + vec3(uSeed, uTime * .05, 0.);
    body -= (vnoise(q) * .65 + vnoise(q * 2.1) * .35 - .5) * .1;
  }
  // the rock it clings to
  float rock = sdEllipsoid(p - vec3(0., -1.78, 0.), vec3(1.55, .42, 1.35)) + .14 * (fbm3(p * 2.3 + uSeed) - .5);
  float d = smin(body, rock, .12);
  float t = -1., phi = 0.;
  float ti = -1., pi = 0.;
  float tent = whorl(p, NO, 1., t, phi);
  float tentI = whorl(p, NI, 0., ti, pi);
  if (tentI < tent) { tent = tentI; t = ti; phi = pi; }
  d = smin(d, tent, .035);
  gT = tent < d + .015 ? t : -1.;
  gPhi = phi;
  gRock = rock < min(body, tent) ? 1. : 0.;
  return d * .8;
}
${MARCH}

vec3 iri(float t) { return .5 + .5 * cos(6.2831 * (t + vec3(0., .33, .67))); }

/** Deep water: a gradient, light falling from above, marine snow drifting. */
vec3 abyss(vec3 rd, vec2 uv) {
  vec3 c = mix(uBase * .5, uInk * .16 + uBase, smoothstep(-.4, .9, rd.y));
  float rays = pow(vnoise(vec3(uv.x * 7. + uTime * .04, 0., uTime * .08)), 3.) * smoothstep(-.3, .7, uv.y);
  c += uInk * rays * .25;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 g = uv * (14. + fi * 9.) + vec2(fi * 3.7, uTime * (.03 + fi * .02));
    vec2 id = floor(g);
    float h = hash12(id + fi * 11.);
    vec2 o = (vec2(hash12(id + 2.1), hash12(id + 5.3)) - .5) * .7;
    c += vec3(.75, .85, 1.) * step(.88, h) * (1. - smoothstep(.02, .08, length(fract(g) - .5 - o))) * (.15 + .1 * fi);
    // fragments of plastic drifting with the snow, more of them as the night drifts
    vec3 plastic = .5 + .5 * cos(6.2831 * (hash12(id + 9.9) + vec3(0., .33, .67)));
    vec2 fq = (fract(g) - .5 - o) * rot(hash12(id + 2.2) * 6.);
    float shard = 1. - smoothstep(.0, .03, max(abs(fq.x) - .09, abs(fq.y) - .03));
    c += plastic * step(.97 - .05 * uDrift, hash12(id + 7.4)) * shard * (.12 + .1 * fi);
  }
  // A plastic bag drifting like a jellyfish, translucent
  vec2 bc = vec2(.55 * sin(uTime * .045 + uSeed), .18 + .14 * sin(uTime * .06 + uSeed * 2.));
  vec2 bq = (uv - bc) * rot(.15 * sin(uTime * .3));
  // a sagging bag, wider at the bottom, its edge rippling
  float wdt = .06 + .035 * clamp((.1 - bq.y) / .2, 0., 1.);
  float body = max(abs(bq.x) - wdt, abs(bq.y) - .1) + .006 * sin(bq.y * 60. + uTime * 2.);
  // its two handles: thin half-loops on top
  vec2 hq = vec2(abs(bq.x) - .04, bq.y - .1);
  float handle = hq.y < 0. ? 1e3 : abs(length(hq) - .028);
  // and its torn bottom: a few thin strands trailing like tentacles
  float strands = 1e3;
  for (int k = 0; k < 5; k++) {
    float fk = float(k);
    float yy = bq.y + .1;
    float len = .06 + .1 * hash12(vec2(fk, uSeed));
    if (yy < 0. && yy > -len) strands = min(strands, abs(bq.x - (-.07 + fk * .035) - .012 * sin(yy * 40. + uTime * 1.5 + fk)));
  }
  float bag = exp(-abs(body) * 70.) * .25 + step(body, 0.) * .04 + exp(-handle * 90.) * .2 + exp(-strands * 260.) * .14;
  c += vec3(.85, .9, 1.) * bag * (.3 + .6 * uDrift);
  return c;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 ro = uCamPos;
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));
  bool deep = uVariant > .5;
  vec3 col = deep ? abyss(rd, uv) : deepWater(rd, uv, 1.) + uAccent * .06 * exp(-length(uv - vec2(.05, .1)) * 2.);
  // (its own march: the fine tentacles need not be met closer than this)
  float tt = -1.;
  {
    float t = .05;
    for (int i = 0; i < 110; i++) {
      float d = map(ro + rd * t);
      if (abs(d) < .0024 * t) { tt = t; break; }
      t += d * 1.1;
      if (t > 12.) break;
    }
  }
  vec3 veinCol = deep ? mix(uInk, vec3(.6, 1., 1.), .5) : mix(uAccent, vec3(1., .55, .6), .55);
  // Over the night the creature bleaches like coral: its colour drains away, its veins dim
  float bleach = smoothstep(.15, 1., uDrift) * .85;
  veinCol = mix(veinCol, vec3(.8), bleach * .6);
  if (tt > 0.) {
    vec3 p = ro + rd * tt;
    gWantPhi = true;
    map(p);
    gWantPhi = false;
    float tAlong = gT, phi = gPhi;
    vec3 n = calcNormal(p);
    // (the fine tentacles are their own shadow: no costly occlusion for them)
    float ao = tAlong >= 0. ? .4 + .35 * tAlong : calcAO(p, n);
    vec3 V = normalize(uCamPos - uCamTarget);
    vec3 F = deep ? normalize(vec3(0., 1., .2)) : normalize(V + vec3(-.6, .4, 0.));
    vec3 L = deep ? normalize(vec3(0., 1., 0.)) : normalize(-V + vec3(0., .8, 0.));
    float dif = clamp(dot(n, F) * .5 + .5, 0., 1.);
    float sss = clamp(map(p + L * .3) / .18, 0., 1.);
    float fre = pow(1. - clamp(dot(n, -rd), 0., 1.), 3.);
    vec3 glow = deep ? uInk * .8 : mix(uAccent, vec3(1., .42, .3), .6);
    float onRock = gRock;
    col = mix(uPal1 * .55, uInk, dif * dif) * (.12 + .68 * dif) * (deep ? .45 : 1.);
    col *= mix(uAccent * 1.2, vec3(1.), ao * ao);
    // inner light: the bass feeds it, the drop makes it bloom
    col += glow * sss * (.2 + .4 * uBass) * (1. + 3. * uDrop);
    col += glow * pow(fre, 1.5) * clamp(dot(n, L) + .4, 0., 1.) * (.7 + 1.2 * uDrop);
    vec3 irid = iri(fre * 1.3 + uSeed * .1);
    col += pow(clamp(dot(reflect(-F, n), -rd), 0., 1.), 28.) * .3 * mix(vec3(1.), irid, .6) + fre * irid * .1;

    // Bioluminescent veins, and a pulse running up them on every kick
    vec3 m = toCreature(p);
    float pulseH;
    float lines;
    float along;
    if (tAlong >= 0.) {
      lines = 1. - smoothstep(.08, .2, abs(fract(phi / 6.2831 * 4.) - .5) * 2.);
      along = tAlong;
      pulseH = uWave * 1.6 - .2;
    } else {
      float v = vnoise(m * 5.5 + uSeed);
      float w = fwidth(v);
      lines = 1. - smoothstep(.02, .02 + w * 1.5, abs(v - .5));
      along = (m.y + 1.45) / 1.6 - .9;
      pulseH = uWave * 1.6 - .9;
    }
    float pulse = exp(-pow(along - pulseH, 2.) * 25.) * exp(-uWave * 1.1);
    col += veinCol * lines * (.08 + 1.8 * pulse + .6 * uDrop) * (.6 + .4 * ao) * (1. - .6 * bleach);
    // the tips of the tentacles: bioluminescent, breathing with the bass
    if (tAlong >= 0.) col += veinCol * smoothstep(.75, 1., tAlong) * (.35 + .8 * uBass + 1.5 * uDrop);
    float lum = dot(col, vec3(.3, .59, .11));
    col = mix(col, vec3(lum) * 1.15 + .04, bleach);
    // the rock: dark stone, a little of the creature's light on it
    if (onRock > .5) col = (uBase * 1.6 + uPal1 * .04) * (.3 + .7 * dif) * ao + glow * sss * .05;
  }

  // Spores released from the tentacle tips on the drop
  if (uSporeT < 8.) {
    for (int i = 0; i < 22; i++) {
      float fi = float(i);
      float id = mod(fi * 7., NO);
      float W = 6.2831853 / NO;
      float ang = (id + .5) * W;
      vec3 tip = tentCentre(1., id, 1., vec2(cos(uTime * .07), sin(uTime * .07)) * .09 * rot(-ang));
      tip.xz *= rot(ang);
      vec3 dir = normalize(vec3(tip.x, .8, tip.z) + (vec3(hash12(vec2(fi, 1.)), hash12(vec2(fi, 2.)), hash12(vec2(fi, 3.))) - .5));
      vec3 sp = tip + dir * uSporeT * (.25 + .2 * hash12(vec2(fi, 4.))) + vec3(.1 * sin(uTime + fi), 0., .1 * cos(uTime * .8 + fi));
      // the creature turns slowly: spores leave from where the tips are now
      sp.xz *= rot(-(uTime * .02 + uSeed));
      float s = dot(sp - ro, rd);
      if (s < 0. || (tt > 0. && s > tt)) continue;
      float d = length(sp - ro - rd * s);
      col += veinCol * exp(-d * 160.) * exp(-uSporeT * .35) * 1.6;
    }
  }

  // the creature lives in its own deep water: it covers the frame, no world background through it
  gl_FragColor = vec4(hdrOut(col * 1.1), 1.);
}
`,
});
