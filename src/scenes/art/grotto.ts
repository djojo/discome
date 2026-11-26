import * as THREE from "three";
import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";
import { HEAD_GLSL, headUniforms, setHead, TITLE_HEAD } from "./heads";
import { MYCELIUM_GLSL } from "./mycelium.glsl";
import { tripUniforms, updateTrip } from "./mycTrip";

const approach = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-dt * rate));

const DROPS = 4;

// Across the black lake toward the far cliff; up at the glowworms; low over the water; the boat
const FRAMINGS: Framing[] = [
  // the whole chamber: the lake, the far cliff, the glowworms' sky above
  { az: 0.05, el: -0.1, dist: 19, target: [0, 5.5, -12], focal: 1.3, weight: 3 },
  // low over the water: everything twice, the glowworms in the lake
  { az: 0.32, el: -0.05, dist: 12, target: [1.5, 2.2, -14], focal: 1.6, weight: 2, tag: "low" },
  // looking up into the threads
  { az: -0.45, el: -0.55, dist: 6, target: [-3, 9.5, -9], focal: 1.25, weight: 2 },
  // the boat and its lantern, small under the vault
  { az: 0.85, el: 0.12, dist: 11, target: [5, 1.4, -13], focal: 2.1, weight: 2, tag: "low" },
  // the far cliff (where the title grows)
  { az: 0, el: 0, dist: 21, target: [0, 6, -20], focal: 1.5, weight: 1, tag: "title" },
];

/**
 * La Grotte aux lucioles: an immense chamber; from its vault hang thousands of threads beaded with blue light
 * (glowworms), a sky of stars underground; stalactites and stalagmites of wet calcite; a black lake, perfectly still,
 * that doubles everything. On it a small boat, a hooded figure and its warm lantern. On every kick a drop falls from
 * the vault and rings spread on the water; the glowworms twinkle on the hats; on the drop the crystals of the
 * stalagmites light up in a wave. « Silence »: low over the water, only the threads and the lantern. Title plan: the
 * night's title grows on the far cliff in threads of glowing mycelium, and the lake reflects it.
 */
export const grotto = defineShaderScene({
  id: "myc-grotto",
  name: "La Grotte aux lucioles",
  energy: "calm",
  hdr: true,
  mask: true,
  renderScale: 0.65,
  camera: { framings: FRAMINGS, glideBars: 3 },
  description:
    "Une caverne immense : au plafond, des milliers de fils perlés de lumière bleue comme un ciel d'étoiles, des stalactites, un lac noir qui reflète tout, une petite silhouette sur une barque avec sa lanterne. Au kick une goutte tombe et le lac s'anneau ; au drop, les cristaux s'embrasent.",
  params: [
    paletteParam("luciole"),
    { type: "toggle", key: "silence", label: "Silence (seulement les fils et la lanterne)", default: false },
    {
      type: "select",
      key: "end",
      label: "Sur la falaise",
      options: [
        { value: "rien", label: "Rien" },
        { value: "titre", label: "Le titre de la soirée" },
      ],
      default: "rien",
    },
  ],
  uniforms: () => ({
    ...tripUniforms(),
    uDrops: { value: Array.from({ length: DROPS }, () => new THREE.Vector4(0, 0, 99, 0)) },
    uDropI: { value: 0 },
    uBoat: { value: new THREE.Vector3(5, -13, 0.4) },
    uKick: { value: 9 },
    uBurst: { value: 99 },
    uSilence: { value: 0 },
    uTitle: { value: 0 },
    uTitleT: { value: 0 },
    uSafe: { value: 0 },
    uLast: { value: -99 },
    ...headUniforms(),
  }),
  update(u, f, p, dt, ctx) {
    updateTrip(u, f, dt);
    if (f.time - (u.uLast.value as number) > 1.5) {
      u.uBurst.value = 99;
      u.uTitleT.value = 0;
    }
    u.uLast.value = f.time;
    u.uSafe.value = f.safeFlash ? 1 : 0;
    const title = p.end === "titre" && setHead(u, TITLE_HEAD, "", p);
    u.uTitle.value = title ? 1 : 0;
    u.uTitleT.value = title ? (u.uTitleT.value as number) + dt : 0;
    const silence = p.silence === true;
    u.uSilence.value = approach(u.uSilence.value as number, silence ? 1 : 0, 2, dt);
    // the title plan looks at the cliff; Silence stays low over the water
    if (ctx.camera) ctx.camera.allow = (fr) => (title ? fr.tag === "title" : silence ? fr.tag === "low" : fr.tag !== "title");
    // a drop falls from the vault on every kick: rings on the lake
    const drops = u.uDrops.value as THREE.Vector4[];
    for (const d of drops) d.z += dt;
    if (f.beat && !silence) {
      const i = (u.uDropI.value as number) % DROPS;
      u.uDropI.value = i + 1;
      drops[i].set(-10 + Math.random() * 20, -22 + Math.random() * 18, 0, 1);
    }
    u.uKick.value = f.beat ? 0 : (u.uKick.value as number) + dt;
    if (f.drop) u.uBurst.value = 0;
    else u.uBurst.value = Math.min(99, (u.uBurst.value as number) + dt);
    // the boat drifts slowly, turning
    const b = u.uBoat.value as THREE.Vector3;
    b.z += dt * 0.012;
    b.x = 5 + 2.5 * Math.sin(f.time * 0.02);
    b.y = -13 + 2 * Math.sin(f.time * 0.013 + 1);
  },
  fragment: /* glsl */ `
uniform vec4 uDrops[${DROPS}];  // a drop's rings: x, z, seconds since it fell, on
uniform vec3 uBoat;      // the boat: x, z, heading
uniform float uKick;
uniform float uBurst;
uniform float uSilence;  // 1: only the threads and the lantern
uniform float uTitle;    // the night's title on the cliff
uniform float uTitleT;   // since when it grows
uniform float uSafe;
${ART_LIB}
${CAMERA_GLSL}
${HEAD_GLSL}
${MYCELIUM_GLSL}
const float CLIFF = -27.;  // the far cliff's plane (z)
float gMat;               // 0 rock (walls, vault), 1 the cliff, 2 calcite (stalactites, stalagmites), 3 the boat, 4 the figure, 5 the lantern
vec3 gLamp;               // the lantern

float ceilY(vec2 xz) { return 13. + 3. * vnoise(vec3(xz * .06, 1.)) + 1.2 * vnoise(vec3(xz * .21, 4.)); }

mat2 boatRot() { float c = cos(uBoat.z), s = sin(uBoat.z); return mat2(c, s, -s, c); }

/** The boat, its passenger and the lantern on its pole (q: the boat's frame, y up, bow toward +x). */
float boat(vec3 q, out float mat) {
  mat = 3.;
  float hull = sdEllipsoid(q - vec3(0., .1, 0.), vec3(1.5, .38, .5));
  hull = max(hull, q.y - .22);
  hull = max(hull, -sdEllipsoid(q - vec3(0., .22, 0.), vec3(1.38, .3, .4)));
  // the figure, seated at the stern, hooded, a long coat
  vec3 f = q - vec3(-.5, .2, 0.);
  float fig = sdTaper(f, vec3(0., 0., 0.), vec3(.05, .85, 0.), .26, .16);
  fig = smin(fig, length(f - vec3(.08, 1.02, 0.)) - .13, .06);
  fig = smin(fig, sdEllipsoid(f - vec3(.03, 1.06, 0.), vec3(.17, .19, .16)), .04);
  // its arm out to the pole
  fig = min(fig, sdTaper(f, vec3(.08, .7, .1), vec3(.55, .78, .12), .06, .045));
  float d = hull;
  if (fig < d) { d = fig; mat = 4.; }
  // the pole and the lantern hanging from it
  float pole = sdCapsule(q, vec3(.05, .2, .12), vec3(.9, 1.45, .12), .018);
  if (pole < d) { d = pole; mat = 3.; }
  float lamp = length(q - vec3(.92, 1.25, .12)) - .07;
  if (lamp < d) { d = lamp; mat = 5.; }
  return d;
}

float map(vec3 p) {
  gMat = 0.;
  vec2 c = p.xz - vec2(0., -10.);
  float a = atan(c.y, c.x);
  float wall = (31. + 5. * vnoise(vec3(cos(a) * 2.5, p.y * .15, sin(a) * 2.5)) - length(c)) * .8;
  float cliff = (p.z - CLIFF - .5 * vnoise(vec3(p.xy * .3, 2.)) - .25 * vnoise(vec3(p.xy * 1.1, 5.))) * .8;
  float vault = (ceilY(p.xz) - p.y) * .7;
  float d = min(wall, vault);
  if (cliff < d) { d = cliff; gMat = 1.; }
  // stalactites hanging from the vault (the lowest tips at 8.5 m)
  if (p.y > 8.) {
    vec2 sc = floor(p.xz / 3.5) + .5;
    vec2 sl = p.xz - sc * 3.5;
    float h = hash12(sc + 2.3);
    vec2 o = (vec2(h, fract(h * 7.3)) - .5) * 1.6;
    float L = 1.2 + 3.3 * fract(h * 3.1);
    float yc = ceilY(sc * 3.5 + o);
    // (the trip: they breathe)
    float sr = (.25 + .35 * fract(h * 5.7)) * (1. + uTrip * (.1 * uBreath + .1 * sin(p.y * 2. - uTime * 1.5 + h * 9.)));
    float st = sdTaper(vec3(sl.x, p.y, sl.y), vec3(o.x, yc + 1., o.y), vec3(o.x, yc - L, o.y), sr, .01) * .85;
    st = min(st, 1.75 - max(abs(sl.x), abs(sl.y)) + .3);
    if (h < .7 && st < d) { d = st; gMat = 2.; }
    else d = min(d, 1.75 - max(abs(sl.x), abs(sl.y)) + .3);
  } else d = min(d, 8.4 - p.y);
  // stalagmites rising out of the lake
  if (p.y < 5.6) {
    vec2 sc = floor(p.xz / 5.) + .5;
    vec2 sl = p.xz - sc * 5.;
    float h = hash12(sc + 8.1);
    vec2 o = (vec2(h, fract(h * 5.1)) - .5) * 1.8;
    float H = 1. + 4.3 * fract(h * 9.7);
    float sg = sdTaper(vec3(sl.x, p.y, sl.y), vec3(o.x, -1., o.y), vec3(o.x, H, o.y), .5 + .5 * fract(h * 2.9), .03) * .9;
    // not in front of the camera's usual places, nor on the boat's way
    bool keep = h < .45 && abs(sc.x * 5.) > 3. && distance(sc * 5., uBoat.xy) > 4.5;
    float bd = 2.5 - max(abs(sl.x), abs(sl.y)) + .5;
    if (keep && sg < d) { d = sg; gMat = 2.; }
    d = min(d, bd);
  } else d = min(d, p.y - 5.4);
  // the boat
  vec3 bq = p - vec3(uBoat.x, 0., uBoat.y);
  bq.xz = boatRot() * bq.xz;
  float bb = length(bq - vec3(0., .6, 0.)) - 2.;
  if (bb < .3) {
    float m;
    float bt = boat(bq, m);
    if (bt < d) { d = bt; gMat = m; }
  } else d = min(d, bb + .1);
  return d;
}

vec3 nrm(vec3 p, float e) {
  const vec2 k = vec2(1, -1);
  return normalize(k.xyy * map(p + k.xyy * e) + k.yyx * map(p + k.yyx * e) + k.yxy * map(p + k.yxy * e) + k.xxx * map(p + k.xxx * e));
}

float march(vec3 ro, vec3 rd, float tmax, float pa, int steps) {
  float t = .02;
  for (int i = 0; i < 120; i++) {
    if (i >= steps) break;
    float d = map(ro + rd * t);
    if (d < max(.001, t * pa * .7)) return t;
    t += d * .9;
    if (t > tmax) break;
  }
  return -1.;
}

/**
 * The glowworms' colour at (x, z): their blue, and as the trip deepens slow waves of the enchanted colours drifting
 * across the vault like a galaxy turning; on the drop, a wave of colour runs out across it.
 */
vec3 gwC(vec2 xz) {
  vec3 c = mix(uInk, tripPal(xz.x * .025 + xz.y * .018 + uTime * .03), .2 + .65 * uTrip);
  if (uBurst < 10.) {
    float r = length(xz - vec2(0., -12.));
    c += tripPal(r * .05 + .3) * 1.5 * exp(-pow((r - uBurst * 7.) / 3., 2.)) * exp(-uBurst * .3) * (uSafe > .5 ? .35 : 1.);
  }
  return c;
}

/** The glowworms' threads hanging under the vault near where the ray meets it (h): their light. */
vec3 threads(vec3 ro, vec3 rd, vec3 h, float pa) {
  vec3 acc = vec3(0.);
  const float G = .45;
  vec2 c0 = floor(h.xz / G);
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 c = c0 + vec2(i, j);
      float hs = hash12(c + 5.5);
      if (hs > .6) continue;
      vec2 o = (c + .2 + .6 * vec2(hs, fract(hs * 13.7))) * G;
      // they sway (more as the trip deepens)
      o += vec2(sin(uTime * .7 + hs * 20.), cos(uTime * .6 + hs * 13.)) * .03 * (.3 + uTrip);
      float top = ceilY(o);
      float L = .2 + 1.1 * fract(hs * 7.1);
      // the ray's closest approach to the vertical thread at o
      vec2 w = ro.xz - o;
      float b = dot(rd.xz, w), a2 = dot(rd.xz, rd.xz);
      float t = -b / max(a2, 1e-5);
      if (t < 0.) continue;
      vec3 q = ro + rd * t;
      float y = clamp(q.y, top - L, top);
      vec3 near = vec3(o.x, y, o.y);
      float dd = length(ro + rd * dot(near - ro, rd) - near);
      float tt = dot(near - ro, rd);
      float r = max(.006, pa * tt * 1.1);
      // beads of light along it, brighter at its tip
      float k = (top - y) / L;
      float bead = .35 + .65 * smoothstep(.6, 1., sin(y * 38. + hs * 20.)) + 1.5 * smoothstep(.9, 1., k);
      float tw = .7 + .5 * sin(uTime * (1.3 + 2. * hs) + hs * 50.) * (.5 + .5 * uHat);
      acc += gwC(o) * (.006 * .006) / (r * r) * exp(-dd * dd / (r * r)) * bead * tw;
    }
  return acc * 9.;
}

/** The night's title on the cliff, in threads of glowing mycelium growing into its letters: its light at p. */
vec3 titleGlow(vec3 p, float fw) {
  if (uTitle < .5) return vec3(0.);
  float k = 15. / uHeadSize.x;
  vec2 xy = uHeadMin.xy + uHeadSize.xy * .5 + vec2(p.x, p.y - 6.) / k;
  float d2 = titleD2(xy) * k;
  float grow = smoothstep(0., 5., uTitleT - (p.y - 3.) * .25);
  float inside = 1. - smoothstep(-.02, .06, d2);
  float th = mycThreads(p.xy * 2.2, fw * 2.2);
  vec3 glow = uTint * uTint * 1.4;
  float edge = mycLine(abs(d2 + .03), .035, fw);
  return glow * grow * (inside * (.35 + 2.5 * th) + 1.6 * edge * inside + .06 * exp(-max(d2, 0.) * 1.5));
}

/** What the ray sees past the water: rock, calcite, the boat; lit by the glowworms above and the lantern. */
vec3 shade(vec3 ro, vec3 rd, float t, float pa) {
  vec3 p = ro + rd * t;
  map(p);
  float mat = gMat;
  vec3 n = nrm(p, max(.002, t * pa));
  float fw = t * pa / max(abs(dot(n, rd)), .15);
  vec3 lampC = mix(uAccent, vec3(1., .75, .45), .5) * 2.2;
  vec3 lv = gLamp - p;
  float ld2 = dot(lv, lv);
  vec3 lamp = lampC * max(dot(n, lv * inversesqrt(ld2)), 0.) / (1. + ld2 * .5);
  // the glowworms light from above, cold and faint
  vec3 sky = uInk * (.1 + .08 * max(n.y, 0.) + .06 * max(-n.y, 0.)) * (1. - .6 * uSilence);
  vec3 col;
  if (mat < .5 || mat > .5 && mat < 1.5) {
    // wet dark rock; the vault spangled with glowworms
    vec3 alb = vec3(.05, .048, .055) * (.7 + .6 * vnoise(p * 2.3));
    col = alb * (sky * 3. + lamp);
    // glowworms all over the rock above the water, thicker up the vault: points of light where the surface passes
    // near the points of a 3D grid; their threads hang from the vault
    float gwK = smoothstep(1.2, 8., p.y);
    if (gwK > 0.) {
      vec3 gq = p * 6.;
      vec3 gi = floor(gq);
      float hs = hash13(gi + 1.7);
      if (hs > .35) {
        vec3 lc = gq - gi - .2 - .6 * vec3(hs, fract(hs * 9.1), fract(hs * 5.3));
        float r = max(.14, fw * 6. * .8);
        col += gwC(p.xz) * (.0196 / (r * r)) * exp(-dot(lc, lc) / (r * r)) * (.7 + .5 * sin(uTime * (1. + 3. * hs) + hs * 40.) * (.5 + .5 * uHat)) * gwK * 9.;
      }
      if (n.y < -.3 && p.y > 9.) col += threads(ro, rd, p, pa);
    }
    if (mat > .5) col += titleGlow(p, fw);
    // a sheen where the rock is wet, the lantern in it
    col += lampC * pow(max(dot(reflect(rd, n), normalize(lv)), 0.), 40.) * .08 / (1. + ld2 * .05);
  } else if (mat < 2.5) {
    // wet calcite: pale, glossy; on the drop its crystals light up in a wave
    vec3 alb = vec3(.2, .19, .17) * (.8 + .4 * vnoise(vec3(p.xz * 3., p.y * 8.)));
    col = alb * (sky * 2.5 + lamp) + lampC * pow(max(dot(reflect(rd, n), normalize(lv)), 0.), 60.) * .3 / (1. + ld2 * .05);
    if (uBurst < 12.) {
      float rr = length(p.xz - vec2(0., -12.));
      float wave = smoothstep(uBurst * 6. + 2., uBurst * 6., rr) * exp(-uBurst * .25) * (uSafe > .5 ? .35 : 1.);
      float cry = smoothstep(.55, .8, vnoise(p * 6.));
      col += uTint * uTint * 1.6 * wave * (.4 + 1.6 * cry);
    }
  } else if (mat < 3.5) {
    col = vec3(.06, .04, .03) * (sky * 2. + lamp);
  } else if (mat < 4.5) {
    // the figure: a dark coat, rim-lit by its own lantern
    col = vec3(.03, .03, .035) * (sky * 1.5 + lamp) + lampC * .3 * pow(1. - max(dot(n, -rd), 0.), 3.) / (1. + ld2);
  } else {
    col = lampC * 3.;
  }
  return col;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  // Silence: lower, nearer the water
  vec3 ro = uCamPos;
  ro.y = mix(ro.y, max(.9, ro.y * .45), uSilence);
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));
  float pa = 1. / (uRes.y * uFocal);
  vec3 bq = vec3(.92, 1.25, .12);
  bq.xz = bq.xz * boatRot();
  gLamp = vec3(uBoat.x, 0., uBoat.y) + bq;

  float tW = rd.y < -1e-4 ? -ro.y / rd.y : 1e5;
  float t = march(ro, rd, min(tW, 80.), pa, 120);
  vec3 col;
  float tHit;
  if (t > 0.) {
    col = shade(ro, rd, t, pa);
    tHit = t;
  } else if (tW < 1e4) {
    // the lake: black, perfectly still but for the drops' rings; a mirror
    vec3 p = ro + rd * tW;
    vec2 g = vec2(0.);
    float ringL = 0.;
    for (int i = 0; i < ${DROPS}; i++) {
      vec4 D = uDrops[i];
      if (D.w < .5 || D.z > 5.) continue;
      vec2 dv = p.xz - D.xy;
      float r = length(dv);
      float x = r - D.z * 1.1;
      float amp = exp(-x * x * 6.) * exp(-D.z * .9) * (1. - uSilence);
      g += dv / max(r, 1e-3) * cos(x * 26.) * amp * .25;
      ringL += amp * smoothstep(.0, .05, x + .05);
    }
    // the trip: slow swells run over the lake, its reflections ripple
    g += uTrip * .03 * vec2(sin(p.x * .8 + uTime * .9 + sin(p.z * .5)), cos(p.z * .7 - uTime * .8 + sin(p.x * .4)));
    vec3 n = normalize(vec3(-g.x, 1., -g.y));
    vec3 rr = reflect(rd, n);
    vec3 ro2 = p + n * .01;
    float t2 = march(ro2, rr, 80., pa, 90);
    vec3 refl = t2 > 0. ? shade(ro2, rr, t2, pa) : vec3(0.);
    float F = .04 + .96 * pow(1. - max(dot(-rd, n), 0.), 5.);
    col = refl * mix(.55, 1., F) + uInk * .004;
    // a rainbow sheen on the water as the trip deepens
    col *= mix(vec3(1.), .6 + .8 * iridescence(dot(-rd, n), p.x * .05 + uTime * .04), .35 * uTrip);
    col += uInk * ringL * .02;
    tHit = tW;
  } else {
    col = vec3(0.);
    tHit = 80.;
  }
  // the lantern's glow, and its double in the lake
  vec3 lampC = mix(uAccent, vec3(1., .75, .45), .5);
  for (int k = 0; k < 2; k++) {
    vec3 L = k == 0 ? gLamp : gLamp * vec3(1., -1., 1.);
    vec3 v = L - ro;
    float tc = dot(v, rd);
    if (tc < .1 || (k == 0 && tc > tHit + .1)) continue;
    float dd = length(v - rd * tc);
    col += lampC * (exp(-dd / (.04 + .004 * tc)) * 1.2 + exp(-dd / (.6 + .02 * tc)) * .12) * (k == 0 ? 1. : .55);
  }
  // a faint haze in the chamber, the glowworms' blue
  col = mix(col, uInk * .025 * (1. - .6 * uSilence), 1. - exp(-tHit * .015));
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
