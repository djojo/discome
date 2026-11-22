import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { num } from "../utils";
import { ART_LIB, MARCH } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";
import { HEAD_GLSL, headUniforms, preloadHeads, setHead, type HeadId } from "./heads";

const FRAMINGS: Framing[] = [
  { az: 0.35, el: 0.06, dist: 4.4, target: [0, -0.1, 0], focal: 1.95, weight: 3 },
  { az: -0.6, el: 0.1, dist: 4, target: [0, -0.05, 0], focal: 2, weight: 2 },
  { az: 1.4, el: 0.03, dist: 4.2, target: [0, -0.1, 0], focal: 2.1, weight: 2 },
  { az: 0.15, el: 0, dist: 2.6, target: [0, 0.05, 0.25], focal: 2.2, weight: 2 },
  { az: 0.4, el: 0.35, dist: 5.2, target: [0, -0.3, 0], focal: 1.8, weight: 1 },
];

/** The heads each cycle goes through, in an order drawn from the scene's seed. */
const CYCLES: Record<string, HeadId[]> = {
  bestiaire: ["tigre", "loup", "faucon", "lion", "hibou", "belier"],
  egypte: ["faucon", "nefertiti", "lion", "belier"],
  tout: ["humain", "tigre", "loup", "faucon", "lion", "hibou", "belier", "moai", "nefertiti"],
};

interface MorphState {
  seed: number;
  cycle: string;
  order: HeadId[];
  i: number;
  /** Progress of the current transformation, 0..1. */
  t: number;
  /** Progress per second. */
  rate: number;
  morphing: boolean;
  /** Bars spent still since the last transformation. */
  held: number;
  lastBar: number;
}
const states = new WeakMap<object, MorphState>();

function shuffled<T>(list: T[], seed: number): T[] {
  const out = [...list];
  let s = Math.floor(seed * 1e4) || 1;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * A museum bust that slowly turns from one head into another: human, wolf, falcon, lion… Each transformation
 * starts on a phrase and takes several bars, rising from the neck to the top of the skull like a front; in
 * between, the bust holds still. The front is a seam of gold: it flashes on the kick, glints on the hats and
 * flares on the drop (which also starts or hurries a transformation), letting sparks fly.
 */
export const metamorphosis = defineShaderScene({
  id: "metamorphosis",
  name: "Métamorphose",
  tag: "Visage",
  energy: "calm",
  renderScale: 0.75,
  mask: true,
  camera: { framings: FRAMINGS, glideBars: 2 },
  description:
    "Buste de musée qui se transforme lentement d'une tête en une autre (loup, faucon, lion…) ; la couture d'or du front flashe au kick et s'embrase au drop.",
  params: [
    paletteParam("porcelain"),
    {
      type: "select",
      key: "matter",
      label: "Matière",
      options: [
        { value: "marble", label: "Marbre" },
        { value: "obsidian", label: "Obsidienne et or" },
      ],
      default: "marble",
    },
    {
      type: "select",
      key: "cycle",
      label: "Têtes",
      options: [
        { value: "bestiaire", label: "Bestiaire" },
        { value: "egypte", label: "Égypte" },
        { value: "tout", label: "Toutes" },
      ],
      default: "bestiaire",
    },
    { type: "range", key: "hold", label: "Tenue (mesures)", min: 2, max: 16, step: 1, default: 8 },
    { type: "range", key: "pace", label: "Transformation (mesures)", min: 2, max: 16, step: 1, default: 6 },
  ],
  uniforms: () => ({
    ...headUniforms(),
    ...headUniforms("B"),
    uMorph: { value: 0 },
    uWave: { value: 9 },
    uFlare: { value: 0 },
    uMatter: { value: 0 },
  }),
  update(u, f, p, dt) {
    const seed = u.uSeed.value as number;
    const cycle = String(p.cycle ?? "bestiaire");
    let s = states.get(u);
    if (!s || s.seed !== seed || s.cycle !== cycle) {
      const order = shuffled(CYCLES[cycle] ?? CYCLES.bestiaire, seed);
      s = { seed, cycle, order, i: 0, t: 0, rate: 0, morphing: false, held: 0, lastBar: f.bar };
      preloadHeads(order);
      states.set(u, s);
    }
    const n = s.order.length;
    const a = s.order[s.i % n];
    const b = s.order[(s.i + 1) % n];
    const ready = setHead(u, a) && setHead(u, b, "B");
    const bar = f.bpm > 0 ? 240 / f.bpm : 2;
    const newBar = f.bar !== s.lastBar;
    s.lastBar = f.bar;

    if (!s.morphing) {
      if (newBar) s.held++;
      // a new transformation starts on a phrase once the bust has held long enough, or right away on a drop
      const phrase = newBar && f.phraseBar === 0 && s.held >= num(p.hold, 8);
      if (ready && (f.drop || phrase)) {
        s.morphing = true;
        s.t = 0;
        s.rate = 1 / (bar * (f.drop ? 2 : num(p.pace, 6)));
      }
    } else {
      // the drop hurries a transformation under way: it ends within two bars
      if (f.drop) s.rate = Math.max(s.rate, (1 - s.t) / (bar * 2));
      s.t += s.rate * dt;
      if (s.t >= 1) {
        s.i = (s.i + 1) % n;
        s.t = 0;
        s.morphing = false;
        s.held = 0;
        setHead(u, s.order[s.i % n]);
        setHead(u, s.order[(s.i + 1) % n], "B");
      }
    }
    const t = s.t;
    u.uMorph.value = t * t * (3 - 2 * t);
    u.uWave.value = f.beat ? 0 : (u.uWave.value as number) + dt;
    u.uFlare.value = f.dropPulse;
    u.uMatter.value = p.matter === "obsidian" ? 1 : 0;
  },
  fragment: /* glsl */ `
uniform highp sampler3D uHeadTexB;
uniform float uHeadOnB;
uniform vec3 uHeadMinB;
uniform vec3 uHeadSizeB;
uniform float uMorph;   // 0..1: the current transformation (0: head A only)
uniform float uWave;    // seconds since the last kick
uniform float uFlare;   // the drop, decaying
uniform float uMatter;  // 0: marble, 1: obsidian and gold
${ART_LIB}
${HEAD_GLSL}
${CAMERA_GLSL}
const float K = .16;    // half width of the transformation front
float gYaw;
float gFront;           // height of the front: below it, head B
vec3 toHead(vec3 p) { p.y += .1; p.xz *= rot(gYaw); return p; }
vec3 fromHead(vec3 h) { h.xz *= rot(-gYaw); h.y -= .1; return h; }
float frontY(vec3 h) { return h.y + (vnoise(h * 2.6 + uSeed) - .5) * .35; }

float map(vec3 p) {
  vec3 h = toHead(p);
  // both heads fit in the common box, on the common column
  float b = min(sdBox(h - vec3(0., .025, 0.), vec3(.84, 1., .92)), sdCapsule(h, vec3(0., -.55, -.12), vec3(0., -1.6, -.2), .26));
  if (b > .2) return b;
  if (uMorph <= 0.) return headD(h);
  float w = 1. - smoothstep(gFront - K, gFront + K, frontY(h));
  float dB = w > .001 ? headSlot(uHeadTexB, uHeadOnB, uHeadMinB, uHeadSizeB, h) : 0.;
  if (w >= .999) return dB;
  float dA = headD(h);
  if (w <= .001) return dA;
  // the weight varies in space: divide by the blend's Lipschitz bound so the march never overshoots
  return mix(dA, dB, w) / (1. + abs(dB - dA) * 3.6 * w * (1. - w) / K);
}
${MARCH}

vec3 env(vec3 r) {
  vec3 c = mix(uBase * .6, uInk * .8, smoothstep(-.2, .9, r.y));
  float az = atan(r.z, r.x);
  // two softboxes: the long reflections that make the obsidian read
  c += uInk * 1.4 * exp(-pow((az - 2.2) * 2.5, 2.)) * smoothstep(-.1, .5, r.y);
  c += uInk * .6 * exp(-pow((az + .6) * 3., 2.)) * smoothstep(.1, .7, r.y);
  return c;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  gYaw = sin(uTime * .05 + uSeed) * .15;
  gFront = mix(-1.25, 1.3, uMorph);
  vec3 ro = uCamPos;
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));
  // museum dark, a soft spot behind the bust
  vec3 col = uBase * .9 + uInk * .07 * exp(-2.2 * length(uv - vec2(0., .12)));
  vec3 gold = mix(vec3(1., .74, .32), uAccent, .3);
  float kick = exp(-uWave * 5.);
  float tt = march(ro, rd, 12.);
  if (tt > 0.) {
    vec3 p = ro + rd * tt;
    vec3 n = calcNormal(p);
    float ao = calcAO(p, n);
    vec3 h = toHead(p);
    vec3 L = normalize(vec3(-.6, .7, .5));
    vec3 R = normalize(vec3(.6, .35, -.75));
    float dif = clamp(dot(n, L), 0., 1.);
    float rim = pow(clamp(dot(n, R) * .5 + .5, 0., 1.), 6.);
    float fre = pow(1. - clamp(dot(n, -rd), 0., 1.), 4.);
    vec3 refl = reflect(rd, n);
    if (uMatter < .5) {
      // Marble: warm white with soft veining
      float v = fbm3(h * 2.2 + uSeed);
      float s = abs(sin(h.x * 3. + h.y * 2. + v * 7.));
      float vein = 1. - smoothstep(0., .1 + fwidth(s), s);
      vec3 base = uInk * vec3(1., .97, .92) * (1. - .22 * vein);
      col = base * (.12 + .8 * dif) * ao;
      col += base * .22 * clamp(dot(n, -rd), 0., 1.) * ao;
      col += uInk * rim * .35 * (.6 + .8 * kick);
      col += pow(clamp(dot(refl, L), 0., 1.), 24.) * .25;
    } else {
      // Obsidian: black glass, everything is in the reflections
      col = uBase * .2 * dif * ao + env(refl) * (.06 + .9 * fre) * ao;
      col += pow(clamp(dot(refl, L), 0., 1.), 90.) * 1.2 * uInk;
      col += gold * rim * .25 * (.5 + 1.2 * kick);
    }
    // The seam of the transformation: a thread of gold and the veins around it
    if (uMorph > 0. && uMorph < 1.) {
      float dy = frontY(h) - gFront;
      float band = exp(-dy * dy * 180.);
      float zone = exp(-abs(dy) * 10.);
      float vv = abs(vnoise(h * 11. + uSeed) - .5);
      float veins = (1. - smoothstep(0., .025 + fwidth(vv) * 1.5, vv)) * zone;
      float glint = step(.97, hash13(floor(h * 40.) + floor(uTime * 12.))) * uHat;
      col = mix(col, gold * (.35 + dif), clamp(veins, 0., 1.) * .65);
      col += gold * (band * (1.2 + 2.5 * kick + 4. * uFlare) + veins * (.25 + 1.2 * kick + 2. * uFlare) + glint * zone * 2.);
    }
    // between transformations the hats glint on the highlights
    col += gold * step(.985, hash13(floor(h * 60.) + floor(uTime * 10.))) * uHat * pow(dif, 4.) * .8;
  }

  // The drop: sparks flying off the front
  float sparks = 0.;
  if (uFlare > .02) {
    for (int i = 0; i < 24; i++) {
      float fi = float(i);
      float age = fract(uTime * .35 + hash12(vec2(fi, 1.3))) * 3.;
      float ang = hash12(vec2(fi, 7.1)) * 6.2831853;
      float r = .45 + .2 * hash12(vec2(fi, 2.9)) + age * .25;
      vec3 sp = fromHead(vec3(cos(ang) * r, gFront + age * .5 - age * age * .18, sin(ang) * r));
      float s = dot(sp - ro, rd);
      if (s < 0. || (tt > 0. && s > tt)) continue;
      float d = length(sp - ro - rd * s);
      sparks += exp(-d * 220.) * exp(-age * 1.2) * uFlare;
    }
    col += gold * sparks * 1.6;
  }

  col = aces(col * 1.05);
  col *= vignette(fc / uRes);
  gl_FragColor = vec4(col, max(step(0., tt), clamp(sparks, 0., 1.)));
}
`,
});
