import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";
import { HEAD_GLSL, headUniforms, setHead } from "./heads";
import { NIGHT_GLSL } from "./night.glsl";

const FRAMINGS: Framing[] = [
  { az: 0, el: 0.05, dist: 10, target: [0, 2.2, 0], focal: 1.7, weight: 3, tag: "open" },
  { az: 0.5, el: 0.18, dist: 9, target: [0, 2.3, 0], focal: 1.8, weight: 2 },
  // low, by the fire, looking up at the spirit
  { az: -0.35, el: -0.12, dist: 5.2, target: [0, 2.4, 0], focal: 1.7, weight: 2, tag: "open" },
  // close on the face of smoke
  { az: 0.2, el: 0.06, dist: 3.4, target: [0, 3.5, 0], focal: 1.9, weight: 2 },
];

/** The animal spirits (heads of the library), in the order they come. */
const ANIMALS = ["loup", "faucon", "belier", "hibou"];

/**
 * L'Esprit: a fire in the night of the desert; out of its smoke an animal spirit is born, drawn in smoke and in
 * lines of yarn light (the sculpted heads of the library). Embers rise; on the kick the fire flares and throws a
 * sheaf of sparks; on the drop the spirit changes into another animal in a burst of sparks.
 */
export const spirit = defineShaderScene({
  id: "canyon-spirit",
  name: "L'Esprit",
  energy: "calm",
  hdr: true,
  renderScale: 0.7,
  mask: true,
  camera: { framings: FRAMINGS, glideBars: 2 },
  description:
    "Un feu dans la nuit du désert ; de sa fumée naît un esprit animal (loup, aigle, bélier, hibou) dessiné en fumée et en lignes de lumière ; le feu crache des braises au kick, l'esprit change d'animal au drop.",
  params: [paletteParam("peyote")],
  uniforms: () => ({
    ...headUniforms(),
    ...headUniforms("B"),
    uMorph: { value: 0 },
    uFlare: { value: 0 },
    uBurst: { value: 99 },
    uTwist: { value: 0.3 },
    // CPU side only
    uIdx: { value: Math.floor(Math.random() * ANIMALS.length) },
    uHold: { value: 0 },
  }),
  update(u, f, _p, dt, ctx) {
    const n = ANIMALS.length;
    let idx = u.uIdx.value as number;
    let m = u.uMorph.value as number;
    let hold = (u.uHold.value as number) + dt;
    // a new animal on the drop, or at its own pace (every ~45 s)
    if (f.drop || (m === 0 && hold > 45)) {
      if (m === 0) m = 0.0001;
      hold = 0;
      u.uBurst.value = 0;
      if (f.drop) ctx.camera?.request("open");
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
    setHead(u, ANIMALS[idx]);
    setHead(u, ANIMALS[(idx + 1) % n], "B");
    u.uBurst.value = (u.uBurst.value as number) + dt;
    u.uFlare.value = f.beat ? 1 : (u.uFlare.value as number) * Math.exp(-dt * 3.5);
    const tw = f.section === "build" ? 0.3 + 2 * f.buildProgress : f.section === "drop" ? 2.2 : 0.3;
    const t = u.uTwist.value as number;
    u.uTwist.value = t + (tw - t) * (1 - Math.exp(-dt * 0.5));
  },
  fragment: /* glsl */ `
uniform float uMorph;    // 0..1 from one animal to the next
uniform float uFlare;    // the kick: the fire flares
uniform float uBurst;    // seconds since the change of animal
uniform float uTwist;
uniform highp sampler3D uHeadTexB;
uniform float uHeadOnB;
uniform vec3 uHeadMinB;
uniform vec3 uHeadSizeB;
uniform vec2 uHeadReliefB;
${ART_LIB}
${HEAD_GLSL}
${CAMERA_GLSL}
${NIGHT_GLSL}
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
  float b = sdBox(h - vec3(0., .02, 0.), vec3(.85, 1., .92));
  if (b > .2) return b * HS;
  float m = smoothstep(0., 1., uMorph);
  float d = headD(h);
  if (m > .001) d = mix(d, headSlot(uHeadTexB, uHeadOnB, uHeadMinB, uHeadSizeB, uHeadReliefB, h), m);
  // it dissolves into smoke below the neck
  d = max(d, -.55 - h.y);
  return d * HS;
}

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
  // the column: a cylinder of radius .9 from the ground to the spirit (the fire sits on a ring of stones)
  vec2 oc = ro.xz;
  float a = dot(rd.xz, rd.xz), b = dot(oc, rd.xz), c = dot(oc, oc) - .81;
  float h = b * b - a * c;
  if (h < 0. || a < 1e-5) return vec4(0.);
  float t0 = max((-b - sqrt(h)) / a, 0.), t1 = min((-b + sqrt(h)) / a, tEnd);
  if (t1 <= t0) return vec4(0.);
  vec3 acc = vec3(0.);
  float tr = 1.;
  float dt = (t1 - t0) / 20.;
  for (int i = 0; i < 20; i++) {
    vec3 p = ro + rd * (t0 + dt * (float(i) + .5));
    if (p.y < 0. || p.y > 3.) continue;
    float r = length(p.xz);
    // flames: a narrowing tongue of noise
    float fl = fbm3(p * vec3(3., 2., 3.) - vec3(0., uTime * 2.4, 0.));
    float top = 1.6 + .8 * uFlare;
    float rad = max(.6 * (1. - p.y / top), .01);
    float cone = (1. - smoothstep(0., rad, r)) * step(p.y, top);
    float fire = smoothstep(.38, .72, fl + .25 * (1. - p.y / top)) * cone;
    vec3 fc = mix(uAccent, vec3(1., .85, .45), smoothstep(.0, .5, fire)) * (1.4 + 1.6 * uFlare);
    // smoke: a slow rising veil widening upward, toward the spirit
    float sm = smoothstep(.45, .8, fbm3(p * 1.4 - vec3(0., uTime * .5, 0.))) * (1. - smoothstep(.2, .9, r / (.3 + .2 * p.y))) * smoothstep(.8, 1.6, p.y);
    vec3 sc = mix(uPal1, uInk, .5) * .35;
    float dens = (fire * 2. + sm * .7) * dt;
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
  vec3 col = nightSky(rd, uTwist);
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
    // lines of yarn light round the form, drifting up like smoke
    float g = h.y * 22. + .8 * fbm3(h * 2. + vec3(0., -uTime * .3, 0.)) - uTime * .25;
    // thin lines where the form turns away (its contour), fading on the faces turned to us
    float line = (1. - smoothstep(.0, .1, abs(fract(g) - .5) - .38)) * (.35 + .65 * pow(1. - abs(dot(n, -rd)), 1.5));
    vec3 yc = yarn(fract(floor(g) * .19 + uTime * .02));
    float fre = pow(1. - abs(dot(n, -rd)), 2.);
    // smoke inside the lines: half transparent, lit from below by the fire
    vec3 smoke = mix(uPal1, uInk, .5) * (.05 + .3 * fre) * (.6 + .4 * dot(n, normalize(vec3(-.3, .5, .8)))) + uAccent * .2 * smoothstep(.3, -.6, h.y) * max(-n.y, 0.);
    vec3 c = mix(smoke, yc * 1.35, line) + yc * pow(fre, 3.) * .7;
    // stars glinting in the smoke
    c += vec3(1.) * starSpeck(h * 1.6) * .8;
    float fade = smoothstep(-.6, -.25, h.y);
    col = mix(col, c, .9 * fade);
    solid = max(solid, .9 * fade);
    tEnd = ts;
  }
  // the spirit's smoky halo
  float dh = length(cross(rd, HC - ro)) / HS;
  col += mix(uPal1, uInk, .4) * exp(-dh * 2.2) * .16;
  // fire and smoke, then the embers
  vec4 fcol = column(ro, rd, tEnd);
  col = col * (1. - fcol.a) + fcol.rgb;
  solid = max(solid, fcol.a);
  col += embers(ro, rd, tEnd, pa);
  gl_FragColor = vec4(hdrOut(col * 1.1), solid);
}
`,
});
