import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";
import { HEAD_GLSL, headUniforms, setHead, TITLE_HEAD } from "./heads";
import { NIGHT_GLSL } from "./night.glsl";
import { AURORA_GLSL, auroraGlass } from "./aurora.glsl";

const FRAMINGS: Framing[] = [
  // Always from the front or three-quarters (the animal must read), never so close that its ears leave the frame
  { az: 0, el: 0.05, dist: 10, target: [0, 2.3, 0], focal: 1.7, weight: 3, tag: "open" },
  { az: 0.5, el: 0.16, dist: 9, target: [0, 2.7, 0], focal: 1.8, weight: 2 },
  { az: -0.55, el: 0.1, dist: 8, target: [0, 2.8, 0], focal: 1.8, weight: 2 },
  // low, by the fire, looking up at the spirit
  { az: -0.35, el: -0.12, dist: 7.2, target: [0, 2.8, 0], focal: 1.7, weight: 2, tag: "open" },
  // close on the face of smoke (the whole head in the frame)
  { az: 0.2, el: 0.06, dist: 5.2, target: [0, 3.55, 0], focal: 1.8, weight: 2 },
  // The night's title above the fire: from the front, the flames at the foot of the frame
  { az: 0, el: 0.04, dist: 5.2, target: [0, 3.05, 0], focal: 1.7, weight: 3, tag: "title" },
  { az: 0.2, el: 0.1, dist: 5.5, target: [0, 3.05, 0], focal: 1.7, weight: 2, tag: "title" },
  { az: -0.2, el: -0.06, dist: 5, target: [0, 3.15, 0], focal: 1.7, weight: 2, tag: "title" },
  { az: 0.1, el: 0.03, dist: 7, target: [0, 2.7, 0], focal: 1.7, weight: 2, tag: "title-open" },
];

/** The animal spirits (heads of the library), in the order they come. */
const ANIMALS = ["loup", "cerf", "faucon", "ours", "hibou", "panthere", "belier", "cobra", "elephant"];

/**
 * L'Esprit: a fire in the night of the desert, its flames in tongues of yarn; its smoke rises, twisting, turns to the
 * colours of the aurora and becomes an animal spirit (the sculpted heads of the library) of aurora glass: translucent,
 * lit from within, curtains of green and violet light rising through it, a glowing contour, the night showing through
 * it; its neck dissolves into a veil. A light aurora rises behind it. Embers rise; on the kick the fire flares, throws
 * a sheaf of sparks and sends a wave of light up through the spirit; through the build its curtains quicken; on the
 * drop it blazes, comes undone into light and forms again as another animal, in a burst of sparks. With the night's
 * title (or logo) instead, the same glass, its curtains fainter over the letters so that they read.
 */
export const spirit = defineShaderScene({
  id: "canyon-spirit",
  heads: ANIMALS,
  name: "L'Esprit",
  energy: "calm",
  hdr: true,
  renderScale: 0.7,
  mask: true,
  camera: { framings: FRAMINGS, glideBars: 2 },
  description:
    "Un feu dans la nuit du désert ; sa fumée prend les couleurs de l'aurore boréale et devient un esprit animal (loup, cerf, faucon, ours, hibou, panthère, bélier, cobra, éléphant) en verre d'aurore, translucide, lumineux de l'intérieur, traversé de rideaux verts et violets. Au kick une onde de lumière le traverse, au drop il s'embrase et change d'animal.",
  params: [
    paletteParam("peyote"),
    {
      type: "select",
      key: "spirit",
      label: "Esprit",
      options: [
        { value: "animals", label: "Les animaux" },
        { value: "titre", label: "Le titre de la soirée" },
      ],
      default: "animals",
    },
  ],
  uniforms: () => ({
    uTitle: { value: 0 },
    ...headUniforms(),
    ...headUniforms("B"),
    uMorph: { value: 0 },
    uFlare: { value: 0 },
    uBurst: { value: 99 },
    uTwist: { value: 0.3 },
    // the aurora: seconds since the kick, the build, the drop's blaze
    uKickT: { value: 9 },
    uCharge: { value: 0 },
    uBlaze: { value: 0 },
    // CPU side only
    uIdx: { value: Math.floor(Math.random() * ANIMALS.length) },
    uHold: { value: 0 },
  }),
  update(u, f, p, dt, ctx) {
    // The night's title instead of the animals: it stays, drawn in smoke; the drop only bursts into sparks round it
    const title = p.spirit === "titre";
    u.uTitle.value = title ? 1 : 0;
    if (ctx.camera)
      ctx.camera.allow = title
        ? (fr) => fr.tag === "title" || fr.tag === "title-open"
        : (fr) => !fr.tag?.startsWith("title");
    const n = ANIMALS.length;
    let idx = u.uIdx.value as number;
    let m = u.uMorph.value as number;
    let hold = (u.uHold.value as number) + dt;
    // a new animal on the drop, or at its own pace (every ~45 s)
    if (f.drop || (m === 0 && hold > 45)) {
      if (m === 0) m = 0.0001;
      hold = 0;
      u.uBurst.value = 0;
      if (f.drop) ctx.camera?.request(title ? "title-open" : "open");
    }
    if (m > 0) {
      m += dt / 2.6;
      if (m >= 1) {
        idx = (idx + 1) % n;
        m = 0;
      }
    }
    u.uIdx.value = idx;
    u.uMorph.value = m;
    u.uHold.value = hold;
    setHead(u, title ? TITLE_HEAD : ANIMALS[idx], "", p);
    setHead(u, title ? TITLE_HEAD : ANIMALS[(idx + 1) % n], "B", p);
    u.uBurst.value = (u.uBurst.value as number) + dt;
    u.uFlare.value = f.beat ? 1 : (u.uFlare.value as number) * Math.exp(-dt * 3.5);
    u.uKickT.value = f.beat ? 0 : (u.uKickT.value as number) + dt;
    const charge = f.section === "build" ? f.buildProgress : 0;
    u.uCharge.value = (u.uCharge.value as number) + (charge - (u.uCharge.value as number)) * (1 - Math.exp(-dt * 2));
    const barS = f.bpm > 0 ? 240 / f.bpm : 2;
    u.uBlaze.value = f.drop ? 1 : (u.uBlaze.value as number) * Math.exp(-dt / barS);
    const tw = f.section === "build" ? 0.3 + 2 * f.buildProgress : f.section === "drop" ? 2.2 : 0.3;
    const t = u.uTwist.value as number;
    u.uTwist.value = t + (tw - t) * (1 - Math.exp(-dt * 0.5));
  },
  fragment: /* glsl */ `
uniform float uMorph;    // 0..1 from one animal to the next
uniform float uFlare;    // the kick: the fire flares
uniform float uBurst;    // seconds since the change of animal
uniform float uTwist;
uniform float uTitle;    // the night's title instead of the animals
uniform float uKickT;    // seconds since the kick
uniform float uCharge;   // the build
uniform float uBlaze;    // the drop's blaze
uniform highp sampler3D uHeadTexB;
uniform float uHeadOnB;
uniform vec3 uHeadMinB;
uniform vec3 uHeadSizeB;
uniform vec2 uHeadReliefB;
${ART_LIB}
${HEAD_GLSL}
${CAMERA_GLSL}
${NIGHT_GLSL}
${AURORA_GLSL}
const vec3 HC = vec3(0., 3.5, 0.);   // the spirit's head, above the fire
const float HS = 1.25;

/** Tiny stars caught in the smoke. */
float starSpeck(vec3 p) {
  vec3 q = p * 14.;
  vec3 id = floor(q);
  float h = hash13(id);
  if (h < .9) return 0.;
  vec3 o = (vec3(hash13(id + 1.1), hash13(id + 2.2), hash13(id + 3.3)) - .5) * .5;
  return (1. - smoothstep(.04, .14, length(fract(q) - .5 - o))) * (.55 + .45 * sin(uTime * 2.5 + h * 60.));
}

vec3 toHead(vec3 p) {
  vec3 h = (p - HC) / HS;
  h.xz *= rot(.25 * sin(uTime * .13));
  // it sways like smoke
  h.x += .05 * sin(h.y * 2. + uTime * .7);
  return h;
}

float spiritD(vec3 p) {
  vec3 h = toHead(p);
  // (a bound only: up to the top of either grid, antlers included; wide enough for a title)
  float top = uTitle > .5 ? 1.15 : max(1.35, max(uHeadMin.y + uHeadSize.y, uHeadMinB.y + uHeadSizeB.y) + .05);
  float bot = -1.15 - .2 * uTitle;
  float b = sdBox(h - vec3(0., .5 * (top + bot), 0.), vec3(.9 + .32 * uTitle, .5 * (top - bot), .95));
  if (b > .2) return b * HS;
  float m = smoothstep(0., 1., uMorph);
  float d = headD(h);
  if (m > .001) d = mix(d, headSlot(uHeadTexB, uHeadOnB, uHeadMinB, uHeadSizeB, uHeadReliefB, h), m);
  // under the neck it is cut away, out of sight in the veil it dissolves into (the title, lower: all of it stands)
  d = max(d, -.95 - .45 * uTitle - h.y);
  return d * HS;
}
${auroraGlass("spiritGlass", "spiritD", "toHead")}

float spiritMarch(vec3 ro, vec3 rd, out float dmin) {
  dmin = 1e3;
  float t = .1;
  for (int i = 0; i < 70; i++) {
    float d = spiritD(ro + rd * t);
    dmin = min(dmin, d);
    if (d < .002 * t) return t;
    t += d * .9;
    if (t > 30.) break;
  }
  return -1.;
}

vec3 spiritN(vec3 p) {
  const vec2 k = vec2(1, -1);
  const float e = .004;
  return normalize(k.xyy * spiritD(p + k.xyy * e) + k.yyx * spiritD(p + k.yyx * e) + k.yxy * spiritD(p + k.yxy * e) + k.xxx * spiritD(p + k.xxx * e));
}

/** Fire and smoke along the ray, through the column above the fire. Returns light (rgb) and opacity (a). */
vec4 column(vec3 ro, vec3 rd, float tEnd) {
  // the column: a cylinder of radius 1.3 from the ground up into the spirit (the fire sits on a ring of stones)
  vec2 oc = ro.xz;
  float a = dot(rd.xz, rd.xz), b = dot(oc, rd.xz), c = dot(oc, oc) - 1.69;
  float h = b * b - a * c;
  if (h < 0. || a < 1e-5) return vec4(0.);
  float t0 = max((-b - sqrt(h)) / a, 0.), t1 = min((-b + sqrt(h)) / a, tEnd);
  if (t1 <= t0) return vec4(0.);
  vec3 acc = vec3(0.);
  float tr = 1.;
  float dt = (t1 - t0) / 24.;
  float undo = sin(3.1416 * smoothstep(0., 1., uMorph));   // the spirit comes undone into its smoke
  for (int i = 0; i < 24; i++) {
    vec3 p = ro + rd * (t0 + dt * (float(i) + .5));
    if (p.y < 0. || p.y > 4.3) continue;
    float r = length(p.xz);
    // flames: tongues of yarn, streaked upward; yellow at the heart, orange, magenta at the tips
    float top = 2.1 + .8 * uFlare;
    float k = p.y / top;
    float ang = atan(p.z, p.x);
    float fl = fbm3(p * vec3(4., 1.5, 4.) - vec3(0., uTime * 2.6, 0.));
    float rad = max(.8 * (1. - k), .01);
    float cone = (1. - smoothstep(0., rad, r)) * step(p.y, top);
    float tongues = .55 + .45 * smoothstep(.2, .6, sin(ang * 9. + fl * 6. - p.y * 2.));
    float fire = smoothstep(.36, .7, fl + .3 * (1. - k)) * cone * tongues;
    vec3 fc = mix(mix(vec3(1., .86, .38), vec3(1., .45, .1), smoothstep(.1, .55, k)), vec3(1., .22, .55), smoothstep(.55, 1., k));
    fc *= 1.5 + 1.6 * uFlare;
    // smoke: a column rising and twisting toward the spirit, lit from below by the fire
    vec3 q = p;
    q.xz *= rot(p.y * 1.1 + uTime * .25);
    float sm = smoothstep(.4, .74, fbm3(q * 1.5 - vec3(0., uTime * .6, 0.)))
      * (1. - smoothstep(.15, 1., r / (.22 + .22 * p.y))) * smoothstep(.9, 1.9, p.y) * (1. + 1.5 * undo);
    vec3 sc = mix(uPal1, uInk, .5) * .45 + uAccent * .35 * exp(-max(p.y - 1.5, 0.) * .9);
    // rising toward the spirit, the smoke turns to the aurora
    sc = mix(sc, mix(AURORA_GREEN, AURORA_VIOLET, smoothstep(2.6, 4.3, p.y)) * .45, smoothstep(1.4, 3., p.y));
    float dens = (fire * 2. + sm * .8) * dt;
    acc += tr * (fc * fire * 2. + sc * sm) * dt * 1.6;
    tr *= exp(-dens * 1.5);
  }
  return vec4(acc, 1. - tr);
}

/** Embers rising round the column; a sheaf on the kick; a burst of sparks when the spirit changes. */
vec3 embers(vec3 ro, vec3 rd, float tEnd, float pa) {
  vec3 c = vec3(0.);
  for (int i = 0; i < 28; i++) {
    float fi = float(i);
    float h1 = hash12(vec2(fi, 1.3)), h2 = hash12(vec2(fi, 4.7)), h3 = hash12(vec2(fi, 8.1));
    float life = fract(h1 + uTime * (.1 + .08 * h2));
    float ang = h2 * 6.28 + life * 3. * (h3 - .5);
    float rad = .15 + 1.2 * life * h3;
    vec3 e = vec3(cos(ang) * rad, .3 + life * 4.5, sin(ang) * rad);
    // the burst: some fly out round the spirit
    if (uBurst < 3. && i < 20) {
      vec3 dir = normalize(vec3(h1 - .5, h2 - .3, h3 - .5));
      e = HC + dir * (.6 + uBurst * 2.2);
    }
    vec3 w = e - ro;
    float along = dot(w, rd);
    if (along < 0. || along > tEnd) continue;
    float d = length(w - rd * along);
    float sz = max(.025, along * pa);
    float bright = (1. - life) * (.6 + 1.2 * uFlare) + (uBurst < 3. && i < 20 ? 2. * exp(-uBurst) : 0.);
    c += mix(uAccent, vec3(1., .8, .4), h2) * exp(-d * d / (sz * sz)) * bright * (.025 / sz);
  }
  return c;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 ro = uCamPos;
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));
  float pa = 1. / (uRes.y * uFocal);
  gAuroraKick = uKickT;
  gAuroraCharge = uCharge;
  gAuroraBlaze = uBlaze;
  // the title: fainter curtains over the letters, so that they read
  gAuroraCurtains = 1. - .55 * uTitle;
  gAuroraCore = .04 + .3 * uTitle;
  // the night, and a light aurora rising behind the spirit
  vec3 col = nightSky(rd, uTwist) + auroraOverHorizon(rd) * (.3 + .4 * uCharge + .6 * uBlaze);
  float solid = 0.;
  float tEnd = 60.;
  float tg = rd.y < -1e-4 ? -ro.y / rd.y : 1e5;
  if (tg < 60.) {
    vec3 p = ro + rd * tg;
    // the desert floor: rings of colour, lit by the fire
    float r = length(p.xz);
    vec3 g = groundRings(p.xz, uTime * .2, 0.);
    g += mix(uAccent, vec3(1., .7, .4), .3) * exp(-r * .9) * (.5 + .4 * uFlare + .1 * sin(uTime * 9.));
    col = mix(g, col, smoothstep(20., 55., tg));
    solid = 1.;
    tEnd = tg;
  }
  // the spirit
  float dmin;
  float ts = spiritMarch(ro, rd, dmin);
  if (ts > 0. && ts < tEnd) {
    vec3 p = ro + rd * ts;
    vec3 n = spiritN(p);
    vec3 h = toHead(p);
    float fre = pow(clamp(1. - abs(dot(n, -rd)), 0., 1.), 2. - .6 * uTitle);
    // aurora glass: the night behind it shows through, a little bent; its light, its bright contour
    vec4 g = spiritGlass(ro, rd, ts, HS);
    vec3 behind = mix(col, nightSky(refract(rd, n, .92), uTwist) + auroraOverHorizon(refract(rd, n, .92)) * .3, .5);
    vec3 c = behind * g.a + g.rgb + auroraRim(h, fre) * (1. + .5 * uTitle);
    // stars caught in it
    c += vec3(1.) * starSpeck(h * 1.6) * .35;
    // it dissolves into a veil below the neck, and comes undone into light while it changes
    float fade = smoothstep(-.9 - .45 * uTitle, -.15 - .45 * uTitle, h.y) * (1. - .65 * sin(3.1416 * smoothstep(0., 1., uMorph)));
    col = mix(col, c, fade);
    solid = max(solid, .7 * fade);
    tEnd = ts;
  }
  // its halo, the aurora's colours
  float dh = length(cross(rd, HC - ro)) / HS;
  col += mix(AURORA_GREEN, AURORA_VIOLET, .35) * exp(-dh * 2.2) * (.08 + .1 * uBlaze);
  // fire and smoke, then the embers
  vec4 fcol = column(ro, rd, tEnd);
  col = col * (1. - fcol.a) + fcol.rgb;
  solid = max(solid, fcol.a);
  col += embers(ro, rd, tEnd, pa);
  gl_FragColor = vec4(hdrOut(col * 1.1), solid);
}
`,
});
