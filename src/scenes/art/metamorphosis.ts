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
  // the animals one after the other, and the human head last: it stays alone
  extinction: ["tigre", "loup", "faucon", "lion", "hibou", "belier"],
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
        { value: "extinction", label: "Extinction" },
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
    uDying: { value: 0 },
  }),
  update(u, f, p, dt) {
    const seed = u.uSeed.value as number;
    const cycle = String(p.cycle ?? "bestiaire");
    let s = states.get(u);
    if (!s || s.seed !== seed || s.cycle !== cycle) {
      const order: HeadId[] = shuffled(CYCLES[cycle] ?? CYCLES.bestiaire, seed);
      if (cycle === "extinction") order.push("humain");
      s = { seed, cycle, order, i: 0, t: 0, rate: 0, morphing: false, held: 0, lastBar: f.bar };
      preloadHeads(order);
      states.set(u, s);
    }
    const extinction = s.cycle === "extinction";
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
      // Extinction: only the drops change the head, and once only the human head is left, it stays
      const go = extinction ? f.drop && n > 1 : f.drop || phrase;
      if (ready && go) {
        s.morphing = true;
        s.t = 0;
        s.rate = 1 / (bar * (f.drop ? 2 : num(p.pace, 6)));
      }
    } else {
      // the drop hurries a transformation under way: it ends within two bars
      if (f.drop) s.rate = Math.max(s.rate, (1 - s.t) / (bar * 2));
      s.t += s.rate * dt;
      if (s.t >= 1) {
        // the head that just went extinct leaves the cycle for good
        if (extinction) s.order.splice(s.i % n, 1);
        else s.i = (s.i + 1) % n;
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
    const dying = extinction && s.morphing ? 1 : 0;
    u.uDying.value = (u.uDying.value as number) + (dying - (u.uDying.value as number)) * (1 - Math.exp(-dt * 4));
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
uniform float uDying;   // extinction: the old head petrifies and cracks as the new one rises
${ART_LIB}
${HEAD_GLSL}
${CAMERA_GLSL}
const float K = .16;    // half width of the transformation front
float gYaw;
float gPitch = 0.;
float gFront;           // height of the front: below it, head B
vec3 toHead(vec3 p) { p.y += .1; p.xz *= rot(gYaw); p.yz *= rot(gPitch); return p; }
vec3 fromHead(vec3 h) { h.yz *= rot(-gPitch); h.xz *= rot(-gYaw); h.y -= .1; return h; }
float frontY(vec3 h) { return h.y + (vnoise(h * 2.6 + uSeed) - .5) * .35; }

const float CUT = -.82;  // the busts float, cut just under the neck; the light dies out before the cut

float morphD(vec3 h) {
  if (uMorph <= 0.) return headD(h);
  float w = 1. - smoothstep(gFront - K, gFront + K, frontY(h));
  float dB = w > .001 ? headSlot(uHeadTexB, uHeadOnB, uHeadMinB, uHeadSizeB, h) : 0.;
  if (w >= .999) return dB;
  float dA = headD(h);
  if (w <= .001) return dA;
  // the weight varies in space: divide by the blend's Lipschitz bound so the march never overshoots
  return mix(dA, dB, w) / (1. + abs(dB - dA) * 3.6 * w * (1. - w) / K);
}

float map(vec3 p) {
  vec3 h = toHead(p);
  // both heads fit in the common box
  float b = sdBox(h - vec3(0., .025, 0.), vec3(.84, 1., .92));
  if (b > .2) return b;
  return max(morphD(h), CUT - h.y);
}
${MARCH}

/**
 * The studio the obsidian reflects: a big softbox overhead, two tall strips on the sides, a lighter backdrop,
 * a warm bounce from the floor. These shapes, stretched along the curves, are what draws the black glass.
 */
vec3 env(vec3 r) {
  vec3 c = mix(uBase * .5, uBase * 1.5 + uInk * .1, smoothstep(-.3, .8, r.y));
  c += uInk * 1.7 * smoothstep(.55, .8, r.y);
  float az = atan(r.z, r.x);
  float strips = exp(-pow((az - 2.3) * 7., 2.)) + exp(-pow((az - .7) * 7., 2.)) + .6 * exp(-pow((az + 1.9) * 6., 2.));
  c += uInk * 2.3 * strips * smoothstep(-.45, .1, r.y) * (1. - smoothstep(.55, .85, r.y));
  c += uAccent * .14 * (1. - smoothstep(-.6, -.1, r.y));
  return c;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  gYaw = .3 * sin(uTime * .045 + uSeed) + .07 * sin(uTime * .11 + uSeed * 2.);
  gPitch = .05 * sin(uTime * .06 + uSeed * 3.);
  gFront = mix(-1.25, 1.3, uMorph);
  vec3 ro = uCamPos;
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));
  // museum dark, a soft spot behind the bust
  vec3 gold = mix(vec3(1., .74, .32), uAccent, .3);
  // museum dark, a warm halo behind the bust so it stands out of the background
  vec3 col = uBase * .9 + uInk * .06 * exp(-2.2 * length(uv - vec2(0., .12))) + mix(gold, uAccent, .4) * .1 * exp(-2.4 * length(uv - vec2(0., .1)));
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
      // Marble: a warm key light and cool shadows, a stone whose tint drifts slightly, veins of colour,
      // a warm glow through the thin parts (ears, mane, horns) and a coloured rim
      vec3 warm = vec3(1., .88, .72), cool = vec3(.52, .62, .85);
      float v = fbm3(h * 2.2 + uSeed);
      float s = abs(sin(h.x * 3. + h.y * 2. + v * 7.));
      float vein = 1. - smoothstep(0., .1 + fwidth(s), s);
      vec3 tint = uInk * mix(vec3(1., .96, .9), vec3(.95, .93, 1.), vnoise(h * 1.3 + 3.));
      vec3 base = mix(tint, mix(gold, uAccent, .4) * .85, vein * .5);
      col = base * (warm * dif * .95 + cool * (.14 + .22 * (1. - dif)) * (.6 + .4 * n.y)) * ao;
      col += base * .14 * clamp(dot(n, -rd), 0., 1.) * ao;
      // translucency: where the stone is thin, the light from behind glows through
      // (only where the light comes from behind: a lit face does not glow from within)
      float thin = 1. - smoothstep(.02, .12, -map(p - n * .14));
      col += mix(warm, uAccent, .35) * thin * .3 * clamp(dot(-n, L) + .2, 0., 1.);
      col += mix(uAccent, gold, .5) * rim * .5 * (.6 + .8 * kick);
      col += warm * pow(clamp(dot(refl, L), 0., 1.), 24.) * .3;
    } else {
      // Obsidian: black glass drawn by the studio's reflections, a coloured backlight around its outline,
      // and veins of gold inside that light up on the kick
      col = uBase * .15 * dif * ao + env(refl) * (.14 + .86 * fre) * ao;
      col += pow(clamp(dot(refl, L), 0., 1.), 90.) * 1.6 * uInk;
      float edge = pow(1. - clamp(dot(n, -rd), 0., 1.), 3.);
      col += mix(gold, uAccent, .4) * edge * (.35 + .65 * rim) * (.9 + 1.2 * kick);
      float gv = abs(vnoise(h * 6. + uSeed * 2.) - .5);
      float gvein = 1. - smoothstep(0., .012 + fwidth(gv) * 1.5, gv);
      col += gold * gvein * (.15 + 1.1 * kick) * ao;
    }
    // Extinction: above the front, the head that is disappearing turns to grey stone and cracks
    if (uDying > .01 && uMorph > 0.) {
      float old = smoothstep(gFront - .05, gFront + .3, frontY(h)) * uDying;
      float cv = abs(vnoise(h * 9. + uSeed * 3.) - .5);
      float crack = 1. - smoothstep(.0, .02 + fwidth(cv) * 1.5, cv);
      float lum = dot(col, vec3(.3, .59, .11));
      col = mix(col, vec3(lum) * vec3(.9, .9, .95) * .7, old * .8);
      col *= 1. - crack * old * .85;
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
    // a museum spotlight from above: the light dies out down the neck, the cut melts into the dark
    col *= smoothstep(CUT, -.42, h.y);
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
