import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { num } from "../utils";
import { ART_LIB, MARCH } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";

const FRAMINGS: Framing[] = [
  { az: 0, el: 0.08, dist: 5.6, target: [0, 0.05, 0], focal: 2, weight: 3 },
  { az: 0.8, el: 0.35, dist: 5, target: [0, 0.2, 0], focal: 2, weight: 2 },
  { az: -1.2, el: -0.12, dist: 5.4, target: [0, 0.1, 0], focal: 2, weight: 2 },
  { az: 0.4, el: 0.2, dist: 2.8, target: [0.4, 0.9, 0.3], focal: 2.1, weight: 2 },
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
${CAMERA_GLSL}
const float NT = 13.;
const float R0 = .42;  // radius of the crown
const float Y0 = .12;  // height of the crown
float gT;     // along the nearest tentacle: 0 at the crown, 1 at the tip (-1 off the tentacles)
float gPhi;   // around the tentacle

vec3 toCreature(vec3 p) { p.xz *= rot(uTime * .025 + uSeed); return p; }

float tentLen(float id) { return .95 + .45 * hash12(vec2(id, uSeed)); }

/** Centre line of tentacle id (in its sector frame: x outward, y up, z sideways). */
vec3 tentCentre(float t, float id) {
  float L = tentLen(id);
  float ph = id * 1.3 + uSeed;
  // they spread out, curl over at the tip and sway slowly, each on its own phase
  return vec3(R0 + t * .45 + .45 * t * t * sin(uTime * .2 + ph) + .25 * t * t * t,
              Y0 + t * L - .45 * t * t * t,
              .35 * t * t * sin(uTime * .24 + ph * 1.7));
}

float tentacleD(vec3 p, float id, out float t, out float phi) {
  float W = 6.2831853 / NT;
  vec3 q = p;
  q.xz *= rot(-id * W);
  float L = tentLen(id);
  t = clamp((q.y - Y0) / (L * .9), 0., 1.);
  vec3 r = q - tentCentre(t, id);
  phi = atan(r.z, r.x);
  return length(r) - .075 * (1. - t * t * .78);
}

/** The nearest tentacle; neighbours are checked too, since a curling tip may leave its own sector. */
float tentacles(vec3 p, out float t, out float phi) {
  float W = 6.2831853 / NT;
  float id0 = floor(atan(p.z, p.x) / W + .5);
  float d = 1e3;
  for (int k = -1; k <= 1; k++) {
    float tk, pk;
    float dk = tentacleD(p, mod(id0 + float(k), NT), tk, pk);
    if (dk < d) { d = dk; t = tk; phi = pk; }
  }
  return d;
}

float map(vec3 p) {
  p = toCreature(p);
  // Cheap bound: far from the creature, nothing else to evaluate
  float bound = sdCapsule(p, vec3(0., -1.5, 0.), vec3(0., 1.3, 0.), 1.45);
  gT = -1.;
  if (bound > .3) return bound;
  float breath = 1. + .025 * sin(uTime * .4) * uBreath;
  // body and column, softly folded
  float body = sdEllipsoid(p - vec3(0., -.28, 0.), vec3(.62, .5, .62) * breath);
  body = smin(body, sdCapsule(p, vec3(0., -.3, 0.), vec3(0., -1.45, 0.), .34), .25);
  if (body < .25) {
    vec3 q = p * 2.2 * uDetail + vec3(uSeed, uTime * .05, 0.);
    body -= (vnoise(q) * .65 + vnoise(q * 2.1) * .35 - .5) * .16;
  }
  // ruffled collar around the crown
  float a = atan(p.z, p.x);
  vec2 tq = vec2(length(p.xz) - .5, p.y - .05 - .04 * sin(a * 13. + uTime * .2));
  float collar = length(tq) - .07;
  float d = smin(body, collar, .12);
  float t, phi;
  float tent = tentacles(p, t, phi);
  d = smin(d, tent, .07);
  gT = tent < d + .02 ? t : -1.;
  gPhi = phi;
  return d * .72;
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
  vec3 col = deep ? abyss(rd, uv) : uBase + uAccent * .12 * exp(-length(uv - vec2(.05, .1)) * 2.);
  float tt = march(ro, rd, 12.);
  vec3 veinCol = deep ? mix(uInk, vec3(.6, 1., 1.), .5) : mix(uAccent, vec3(1., .55, .6), .55);
  // Over the night the creature bleaches like coral: its colour drains away, its veins dim
  float bleach = smoothstep(.15, 1., uDrift) * .85;
  veinCol = mix(veinCol, vec3(.8), bleach * .6);
  if (tt > 0.) {
    vec3 p = ro + rd * tt;
    map(p);
    float tAlong = gT, phi = gPhi;
    vec3 n = calcNormal(p);
    float ao = calcAO(p, n);
    vec3 V = normalize(uCamPos - uCamTarget);
    vec3 F = deep ? normalize(vec3(0., 1., .2)) : normalize(V + vec3(-.6, .4, 0.));
    vec3 L = deep ? normalize(vec3(0., 1., 0.)) : normalize(-V + vec3(0., .8, 0.));
    float dif = clamp(dot(n, F) * .5 + .5, 0., 1.);
    float sss = clamp(map(p + L * .3) / .18, 0., 1.);
    float fre = pow(1. - clamp(dot(n, -rd), 0., 1.), 3.);
    vec3 glow = deep ? uInk * .8 : mix(uAccent, vec3(1., .42, .3), .6);
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
    float lum = dot(col, vec3(.3, .59, .11));
    col = mix(col, vec3(lum) * 1.15 + .04, bleach);
  }

  // Spores released from the tentacle tips on the drop
  if (uSporeT < 8.) {
    for (int i = 0; i < 22; i++) {
      float fi = float(i);
      float id = mod(fi, NT);
      vec3 tip = tentCentre(1., id);
      float W = 6.2831853 / NT;
      tip.xz *= rot(id * W);
      vec3 dir = normalize(vec3(tip.x, .8, tip.z) + (vec3(hash12(vec2(fi, 1.)), hash12(vec2(fi, 2.)), hash12(vec2(fi, 3.))) - .5));
      vec3 sp = tip + dir * uSporeT * (.25 + .2 * hash12(vec2(fi, 4.))) + vec3(.1 * sin(uTime + fi), 0., .1 * cos(uTime * .8 + fi));
      // the creature turns slowly: spores leave from where the tips are now
      sp.xz *= rot(-(uTime * .025 + uSeed));
      float s = dot(sp - ro, rd);
      if (s < 0. || (tt > 0. && s > tt)) continue;
      float d = length(sp - ro - rd * s);
      col += veinCol * exp(-d * 160.) * exp(-uSporeT * .35) * 1.6;
    }
  }

  col = aces(col * 1.1);
  col *= vignette(fc / uRes);
  gl_FragColor = vec4(col, step(0., tt));
}
`,
});
