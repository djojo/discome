import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";
import { NIGHT_GLSL } from "./night.glsl";

const FRAMINGS: Framing[] = [
  // from low down, the cactus against the turning sky
  { az: 0.3, el: -0.05, dist: 7.5, target: [0, 2.4, 0], focal: 1.6, weight: 3 },
  { az: -0.8, el: 0.25, dist: 10, target: [0, 2.3, 0], focal: 1.7, weight: 2, tag: "open" },
  // from above: the ground's mandala around it
  { az: 0.5, el: 1.15, dist: 12, target: [0, 0, 0], focal: 1.7, weight: 2, tag: "open" },
  // close on the ribs
  { az: 1.4, el: 0.1, dist: 3.2, target: [0, 2.2, 0], focal: 2, weight: 2 },
  // Bouton: right above the round cactus
  { az: 0, el: 1.45, dist: 8, target: [0, 0, 0], focal: 1.8, weight: 3, tag: "button" },
  { az: 0.7, el: 0.9, dist: 7, target: [0, 0, 0], focal: 1.9, weight: 2, tag: "button" },
];

/**
 * The sacred cactus, at night in the desert. Everything is drawn in flowing lines of colour, like yarn paintings:
 * the ribs of the cactus, light climbing them; the ground breathing in rings around it; the stars turning in a
 * spiral overhead (more and more through the build). On the kick a pulse climbs the ribs; on the drop a crown of
 * light flowers at its tips and the ground becomes a mandala.
 * Variant « Bouton »: a round cactus seen from above, its ribs a living star that unfolds on the drop.
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
    "Le cactus sacré dans la nuit du désert, dessiné en lignes de couleur comme une peinture de fil : la lumière monte dans ses côtes, le sol respire en cercles, le ciel tourne en spirale ; au drop il fleurit et le sol devient mandala. Variante Bouton : un cactus rond vu du dessus.",
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
  }),
  update(u, f, p, dt, ctx) {
    const button = p.variant === "button";
    u.uButton.value = button ? 1 : 0;
    if (ctx.camera) ctx.camera.allow = (fr) => (fr.tag === "button") === button;
    u.uPulseT.value = f.beat ? 0 : (u.uPulseT.value as number) + dt;
    const bar = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;
    // the drop: it flowers (over a bar), the bloom stays a while then fades
    const b = u.uBloom.value as number;
    u.uBloom.value = f.drop ? Math.max(b, 0.01) : b > 0 ? Math.min(1.6, b + dt / bar) : 0;
    if ((u.uBloom.value as number) >= 1.6) u.uBloom.value = 0;
    if (f.drop) ctx.camera?.request(button ? "button" : "open");
    // the sky winds into a spiral through the build, unwinds slowly after
    const tw = f.section === "build" ? 0.3 + 2.2 * f.buildProgress : f.section === "drop" ? 2.5 : 0.3;
    const t = u.uTwist.value as number;
    u.uTwist.value = t + (tw - t) * (1 - Math.exp(-dt * 0.6));
    u.uBreath.value = (u.uBreath.value as number) + dt * 0.28;
  },
  fragment: /* glsl */ `
uniform float uButton;
uniform float uPulseT;   // seconds since the kick
uniform float uBloom;    // the drop's flowering (0..1.6)
uniform float uTwist;    // the sky's spiral
uniform float uBreath;   // the ground's slow breath
${ART_LIB}
${CAMERA_GLSL}
${NIGHT_GLSL}
const float NR = 14.;    // ribs
float gU;                // where on the cactus: height along the trunk or arm
float gTheta;            // angle round the stem
float gPart;             // 0 trunk, 1 arm, 2 bud

float bloomA() { return smoothstep(0., .6, uBloom) * (1. - smoothstep(1.2, 1.6, uBloom)); }

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
  // the drop: buds of light at the tips
  float bl = bloomA();
  if (bl > .01) {
    float bud = min(min(length(p - vec3(0., 4.65, 0.)), length(p - vec3(1.15, 3.78, 0.))), length(p - vec3(-1.15, 4.48, 0.))) - .22 * bl;
    if (bud < d) gPart = 2.;
    d = min(d, bud);
  }
  return d;
}

/** Bouton: a round ribbed dome seen from above. */
float button(vec3 p) {
  float r = length(p.xz);
  float th = atan(p.z, p.x) + uTime * .03;
  float ribs = 9.;
  float rib = .12 * (1. - abs(cos(th * ribs * .5))) * smoothstep(0., .5, r);
  float unfold = bloomA();
  float R = 1.6 + .5 * unfold;
  float h = sqrt(max(R * R - r * r, 0.)) * .45 - rib - .15;
  gU = r; gTheta = th; gPart = 0.;
  return (p.y - h) * .6;
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

vec3 groundCol(vec3 p) { return groundRings(p.xz, uBreath, bloomA()); }
vec3 skyCol(vec3 rd) { return nightSky(rd, uTwist); }

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
  // the flowers' glow, in the night air
  float bl = bloomA();
  if (bl > .01 && uButton < .5) {
    vec3 tips[3];
    tips[0] = vec3(0., 4.65, 0.); tips[1] = vec3(1.15, 3.78, 0.); tips[2] = vec3(-1.15, 4.48, 0.);
    for (int i = 0; i < 3; i++) {
      vec3 w = tips[i] - ro;
      float along = dot(w, rd);
      if (along > 0. && (tt < 0. || along < tt + .3)) {
        float dd = length(w - rd * along);
        col += yarn(fract(float(i) * .3 + uTime * .05)) * (exp(-dd * 5.) * .5 + exp(-dd * 18.) * .8) * bl;
      }
    }
  }
  if (tt > 0.) {
    vec3 p = ro + rd * tt;
    map(p);
    float part = gPart;
    float u = gU, th = gTheta;
    if (part > 2.5) {
      col = groundCol(p);
      col = mix(col, skyCol(rd), smoothstep(20., 55., tt));
    } else if (part > 1.5) {
      // a flower of light: petals of colour round a white heart
      vec3 n = calcN(p);
      vec3 lp = p - vec3(0., 4.65, 0.);
      float pet = .5 + .5 * cos(atan(n.z, n.x) * 6. + uTime);
      col = mix(yarn(fract(pet * .5 + uTime * .05)), yarn(fract(pet * .5 + .5)), pet) * (1.3 + uBeat) + vec3(1.) * pow(abs(dot(n, -rd)), 12.) * .6;
    } else {
      vec3 n = calcN(p);
      // the ribs: lines of colour following the crests, light flowing up them
      float ribs = uButton > .5 ? 9. : NR;
      float crest = abs(cos(th * ribs * .5));
      float ribId = floor(th / 6.2831 * ribs + .5);
      float lineW = uButton > .5 ? .06 : .12;
      float onCrest = smoothstep(1. - lineW, 1., crest);
      vec3 c = uBase * .5 + mix(uPal1, uBase, .7) * .25 * (.5 + .5 * n.y);
      float flow = fract(u * 1.3 - uTime * .25 + hash12(vec2(ribId, 3.)));
      vec3 yc = yarn(fract(ribId * .23 + uTime * .01));
      c += yc * onCrest * (.6 + .6 * smoothstep(.3, .9, flow));
      // the furrows between the ribs, in a second colour
      c += yarn(fract(ribId * .23 + .5)) * smoothstep(.75, 1., 1. - crest) * .35;
      // the kick: a pulse climbing the ribs
      float h = uButton > .5 ? u * 2. : u;
      c += mix(yc, vec3(1.), .4) * exp(-pow((h - uPulseT * 4.5) * 2.2, 2.)) * exp(-uPulseT * .8) * 1.4 * onCrest;
      // areoles: tufts of white down along the crests (big soft ones on the button, like the real thing)
      float ar = smoothstep(1. - lineW * 2.5, 1., crest) * (1. - smoothstep(.0, uButton > .5 ? .22 : .12, abs(fract(u * (uButton > .5 ? 2.6 : 4.)) - .5)));
      c += mix(vec3(1.), yc, .25) * ar * (uButton > .5 ? .75 : .25);
      // rim of light
      c += yc * pow(1. - abs(dot(n, -rd)), 3.) * .35;
      col = c;
    }
    solid = 1.;
  }
  gl_FragColor = vec4(hdrOut(col * 1.15), solid);
}
`,
});
