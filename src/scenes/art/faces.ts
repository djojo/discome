import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { num } from "../utils";
import { ART_LIB, MARCH } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";
import { HEAD_GLSL, headParam, headUniforms, setHead, TITLE_HEAD } from "./heads";

/**
 * The sculpted head, nearly still: only a very slow drift (`turn` scales it). The framings move instead.
 * World space: the head centre sits near the origin, facing +z.
 */
const HEAD_MAP = /* glsl */ `
${HEAD_GLSL}
float gYaw;
float gPitch = 0.;
vec3 toHead(vec3 p) { p.y += .1; p.xz *= rot(gYaw); p.yz *= rot(gPitch); return p; }
float map(vec3 p) { return headD(toHead(p)); }
${MARCH}
`;

/**
 * The face as a machine sees it: landmarks, a mesh between them, a box that follows it, a scan line on the
 * kick. No words. Needs gYaw/gPitch (HEAD_MAP) and the camera uniforms.
 */
const RECOG_GLSL = /* glsl */ `
float recogBox(vec2 uv, vec2 c0, vec2 c1);
float segD(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0., 1.)); }
float recognition(vec2 uv) {
  const vec3 L[14] = vec3[14](
    vec3(-.15, .02, .5), vec3(.15, .02, .5),      // eyes
    vec3(-.16, .13, .48), vec3(.16, .13, .48),    // brows
    vec3(0., -.2, .6),                             // nose
    vec3(-.09, -.4, .5), vec3(.09, -.4, .5),      // mouth corners
    vec3(0., -.37, .53),                           // lip
    vec3(0., -.56, .42),                           // chin
    vec3(-.3, -.35, .2), vec3(.3, -.35, .2),      // jaw
    vec3(-.28, -.08, .38), vec3(.28, -.08, .38),  // cheekbones
    vec3(0., .36, .45));                           // forehead
  const ivec2 E[18] = ivec2[18](
    ivec2(0, 1), ivec2(0, 2), ivec2(1, 3), ivec2(2, 13), ivec2(3, 13), ivec2(0, 4), ivec2(1, 4),
    ivec2(4, 7), ivec2(5, 7), ivec2(6, 7), ivec2(5, 8), ivec2(6, 8), ivec2(8, 9), ivec2(8, 10),
    ivec2(9, 11), ivec2(10, 12), ivec2(11, 0), ivec2(12, 1));
  mat3 cam = lookAt(uCamPos, uCamTarget);
  vec2 P[14];
  float V[14];
  vec2 bmin = vec2(1e3), bmax = vec2(-1e3);
  for (int i = 0; i < 14; i++) {
    vec3 hp = L[i];
    hp.yz *= rot(-gPitch);
    hp.xz *= rot(-gYaw);
    hp.y -= .1;
    vec3 v = hp - uCamPos;
    vec3 c = vec3(dot(v, cam[0]), dot(v, cam[1]), dot(v, cam[2]));
    P[i] = c.xy / c.z * uFocal;
    V[i] = step(-.05, dot(normalize(hp - vec3(0., -.1, -.1)), normalize(uCamPos - hp)));
    bmin = min(bmin, P[i]);
    bmax = max(bmax, P[i]);
  }
  float flash = .5 + 1.5 * uDrop;
  float o = 0.;
  for (int i = 0; i < 18; i++) {
    int a = E[i].x, b = E[i].y;
    o += (1. - smoothstep(.0015, .0035, segD(uv, P[a], P[b]))) * V[a] * V[b] * .45 * flash;
  }
  for (int i = 0; i < 14; i++) {
    float d = length(uv - P[i]);
    float blink = .6 + .4 * step(.5, fract(uTime * 3. + float(i) * .37)) * uHat;
    o += (1. - smoothstep(.004, .007, abs(d - .008))) * V[i] * blink + (1. - smoothstep(.002, .004, d)) * V[i];
  }
  return o + recogBox(uv, bmin - .04, bmax + .04);
}

/** A detection box, by its corners, and a scan line sweeping down it on every kick. */
float recogBox(vec2 uv, vec2 c0, vec2 c1) {
  float o = 0.;
  vec2 q = uv;
  float bx = min(abs(q.x - c0.x), abs(q.x - c1.x)), by = min(abs(q.y - c0.y), abs(q.y - c1.y));
  bool inX = q.x > c0.x - .003 && q.x < c1.x + .003, inY = q.y > c0.y - .003 && q.y < c1.y + .003;
  float arm = .05;
  float nearCornerX = min(abs(q.x - c0.x), abs(q.x - c1.x)) < arm ? 1. : 0.;
  float nearCornerY = min(abs(q.y - c0.y), abs(q.y - c1.y)) < arm ? 1. : 0.;
  o += (1. - smoothstep(.002, .004, by)) * (inX ? 1. : 0.) * nearCornerX;
  o += (1. - smoothstep(.002, .004, bx)) * (inY ? 1. : 0.) * nearCornerY;
  // a scan line sweeping down the box on every kick
  float sy = mix(c1.y, c0.y, clamp(uWave * 1.6, 0., 1.));
  o += (1. - smoothstep(.001, .004, abs(q.y - sy))) * (inX ? 1. : 0.) * step(uWave, .65) * .8;
  return o;
}

/** The night's title as a machine reads it: a box around it, a ruler of ticks along its foot. */
float recognitionTitle(vec2 uv) {
  mat3 cam = lookAt(uCamPos, uCamTarget);
  vec2 bmin = vec2(1e3), bmax = vec2(-1e3);
  vec3 lo = vec3(uHeadMin.xy + .09, -uHeadRelief.x), hi = vec3(uHeadMin.xy + uHeadSize.xy - .09, uHeadRelief.x);
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    vec3 hp = vec3(mod(fi, 2.) < .5 ? lo.x : hi.x, mod(floor(fi * .5), 2.) < .5 ? lo.y : hi.y, fi < 3.5 ? lo.z : hi.z);
    hp.yz *= rot(-gPitch);
    hp.xz *= rot(-gYaw);
    hp.y -= .1;
    vec3 v = hp - uCamPos;
    vec3 c = vec3(dot(v, cam[0]), dot(v, cam[1]), dot(v, cam[2]));
    vec2 P = c.xy / c.z * uFocal;
    bmin = min(bmin, P);
    bmax = max(bmax, P);
  }
  vec2 c0 = bmin - .03, c1 = bmax + .03;
  float o = recogBox(uv, c0, c1);
  // the ruler: a tick every twentieth of the width, longer every fifth; one lights up on each attack
  float tx = (uv.x - c0.x) / (c1.x - c0.x) * 20.;
  float k = floor(tx + .5);
  float len = mod(k, 5.) < .5 ? .022 : .011;
  float tick = (1. - smoothstep(.0015, .003, abs(tx - k) * (c1.x - c0.x) / 20.)) * step(0., tx) * step(tx, 20.);
  tick *= step(c0.y - .012 - len, uv.y) * step(uv.y, c0.y - .012);
  float lit = step(.85, hash12(vec2(k, floor(uTime * 6.)))) * uHat;
  return o + tick * (.55 + 1.2 * lit);
}
`;

const FACE_FRAMINGS: Framing[] = [
  // The night's title: from the front, so that it always reads (its centre sits at y = -.05)
  { az: 0, el: 0.04, dist: 4.8, target: [0, -0.05, 0], focal: 2.2, weight: 3, tag: "title" },
  { az: 0.22, el: 0.1, dist: 5, target: [0, -0.05, 0], focal: 2.2, weight: 2, tag: "title" },
  { az: -0.25, el: 0.02, dist: 4.8, target: [0, -0.05, 0], focal: 2.2, weight: 2, tag: "title" },
  { az: 0.05, el: 0.3, dist: 5.2, target: [0, -0.05, 0], focal: 2.2, weight: 1, tag: "title" },
  { az: 0, el: 0.05, dist: 3.4, target: [0, -0.12, 0], focal: 2.4, weight: 2 },
  { az: 0.55, el: 0.08, dist: 3.4, target: [0, -0.12, 0], focal: 2.4, weight: 3 },
  { az: -0.6, el: 0.02, dist: 3.5, target: [0, -0.12, 0], focal: 2.4, weight: 2 },
  { az: 0.25, el: 0.1, dist: 2.2, target: [0.1, -0.05, 0.3], focal: 2.4, weight: 1 },
  { az: -0.2, el: 0.35, dist: 3.8, target: [0, -0.05, 0], focal: 2.3, weight: 1 },
  { az: 1.2, el: 0.05, dist: 3.6, target: [0, -0.12, 0], focal: 2.5, weight: 1 },
];

const PROFILE_FRAMINGS: Framing[] = [
  { az: 1.57, el: 0.03, dist: 4, target: [0, -0.12, 0], focal: 2.6, weight: 3 },
  { az: -1.57, el: 0.03, dist: 4, target: [0, -0.12, 0], focal: 2.6, weight: 2 },
  { az: 2.05, el: 0.08, dist: 4.2, target: [0, -0.1, 0], focal: 2.6, weight: 2 },
  { az: 1.35, el: 0.02, dist: 2.6, target: [0, -0.1, 0.25], focal: 2.6, weight: 1 },
  { az: -1.4, el: 0.28, dist: 4.4, target: [0, -0.1, 0], focal: 2.5, weight: 1 },
];

/** Time since the last kick: a light event runs across the face from there. */
const kickTimer = () => ({ uWave: { value: 9 } });

export const topoHead = defineShaderScene({
  id: "topo-head",
  name: "Topographie",
  tag: "Visage",
  energy: "medium",
  renderScale: 0.85,
  mask: true,
  camera: { framings: FACE_FRAMINGS, glideBars: 2 },
  description:
    "Le visage n'existe que par ses lignes de niveau, qui avancent lentement et changent peu à peu d'orientation ; une ligne s'allume et le traverse à chaque kick, au drop elles basculent en profondeur.",
  params: [
    paletteParam("mono"),
    headParam(),
    { type: "range", key: "density", label: "Densité des lignes", min: 10, max: 60, step: 1, default: 26 },
    { type: "range", key: "turn", label: "Dérive du visage", min: 0, max: 1.5, step: 0.05, default: 1 },
    { type: "toggle", key: "recog", label: "Reconnaissance faciale", default: false },
  ],
  uniforms: () => ({
    uDensity: { value: 26 },
    uTurn: { value: 1 },
    uRecog: { value: 0 },
    uTitle: { value: 0 },
    ...kickTimer(),
    ...headUniforms(),
  }),
  update(u, f, p, dt, ctx) {
    // The night's title instead of a face: read from the front, by its contour lines
    const title = p.head === TITLE_HEAD;
    setHead(u, p.head, "", p);
    u.uTitle.value = title ? 1 : 0;
    if (ctx.camera) ctx.camera.allow = title ? (fr) => fr.tag === "title" : (fr) => fr.tag !== "title";
    u.uRecog.value = p.recog === true ? 1 : 0;
    u.uDensity.value = num(p.density, 26);
    u.uTurn.value = num(p.turn, 1);
    u.uWave.value = f.beat ? 0 : (u.uWave.value as number) + dt;
  },
  fragment: /* glsl */ `
uniform float uDensity;
uniform float uTurn;
uniform float uWave;
uniform float uRecog;
uniform float uTitle;
${ART_LIB}
${CAMERA_GLSL}
${HEAD_MAP}
${RECOG_GLSL}
void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  // (the title only sways: it must keep reading)
  float turn = uTurn * (1. - .7 * uTitle);
  gYaw = (.3 * sin(uTime * .045 + uSeed) + .07 * sin(uTime * .11 + uSeed * 2.)) * turn;
  gPitch = .05 * sin(uTime * .06 + uSeed * 3.) * turn;
  vec3 ro = uCamPos;
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));
  vec3 col = uBase;
  float tt = march(ro, rd, 9.);
  if (tt > 0.) {
    vec3 p = ro + rd * tt;
    vec3 n = calcNormal(p);
    vec3 h = toHead(p);
    // The slicing direction turns slowly over minutes, sometimes blending into rings around the nose
    float a = uTime * .018 + uSeed;
    vec3 dir = normalize(vec3(.6 * sin(a * .7), cos(a), .8 * sin(a * 1.3)));
    float g = mix(dot(h, dir), length(h - vec3(0., -.1, .55)) * 1.1, .5 + .5 * sin(a * .45));
    // the title: mostly its depth, whose contour lines follow the letters' outlines
    g = mix(g, mix(dot(h, dir) * .5, h.z * 3., .7), uTitle);
    g = mix(g, h.z, smoothstep(.35, .8, uDrop));
    // the lines flow slowly across the face at their own pace (one every ~8 s), deaf to the music
    float f = g * uDensity - uTime * .12;
    float w = fwidth(f);
    float dist = abs(fract(f + .5) - .5);
    float line = 1. - smoothstep(.5 * w, 1.6 * w, dist);
    float light = .2 + .8 * clamp(dot(n, normalize(vec3(-.5, .5, .75))), 0., 1.);
    col = mix(uBase, uInk, line * light);
    // A line of light crosses the face on every kick
    float band = exp(-pow(g - (-.75 + uWave * 1.3), 2.) * 400.) * exp(-uWave * 1.3);
    col += uAccent * line * band * 2.2;
  }
  float alpha = step(0., tt);
  if (uRecog > .5) {
    float r = uTitle > .5 ? recognitionTitle(uv) : recognition(uv);
    col = mix(col, uAccent * 1.3, clamp(r, 0., 1.));
    alpha = max(alpha, clamp(r, 0., 1.));
  }
  gl_FragColor = vec4(col, alpha); // alpha = silhouette, keeps the background behind the face
}
`,
});

export const profileHead = defineShaderScene({
  id: "profile-head",
  name: "Profil",
  tag: "Visage",
  energy: "calm",
  renderScale: 0.85,
  mask: true,
  camera: { framings: PROFILE_FRAMINGS, glideBars: 2 },
  description:
    "Le profil en contre-jour, dans la brume et les rais de lumière ; le contour s'allume en vague à chaque kick, un second contour d'accent à la montée et au drop.",
  params: [
    paletteParam("porcelain"),
    headParam(),
    { type: "range", key: "sweep", label: "Balayage de la lumière", min: 0, max: 2, step: 0.05, default: 1 },
  ],
  uniforms: () => ({ uSweep: { value: 1 }, ...kickTimer(), ...headUniforms() }),
  update(u, f, p, dt) {
    setHead(u, p.head, "", p);
    u.uSweep.value = num(p.sweep, 1);
    u.uWave.value = f.beat ? 0 : (u.uWave.value as number) + dt;
  },
  fragment: /* glsl */ `
uniform float uSweep;
uniform float uWave;
${ART_LIB}
${CAMERA_GLSL}
${HEAD_MAP}
void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  gYaw = .18 * sin(uTime * .04 + uSeed) + .05 * sin(uTime * .1 + uSeed * 2.);
  gPitch = .05 * sin(uTime * .06 + uSeed * 3.);
  vec3 ro = uCamPos;
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));
  // Lights follow the framing: the key light sits behind the head
  vec3 V = normalize(uCamPos - uCamTarget);
  vec3 up = vec3(0., 1., 0.);
  vec3 side = normalize(cross(up, V));
  // Back light: a glow behind the head, haze, and shafts of light around the silhouette
  float r = length(uv - vec2(.04, .06));
  float ang = atan(uv.y - .06, uv.x - .04);
  float shafts = pow(vnoise(vec3(ang * 7. + uSeed, uTime * .08, 0.)), 3.) * exp(-r * 1.3);
  vec3 col = uBase + uInk * (.05 * exp(-r * 2.) + .12 * shafts * (.8 + .4 * uBass)) + uInk * .015;
  float tt = march(ro, rd, 9.);
  if (tt > 0.) {
    vec3 p = ro + rd * tt;
    vec3 n = calcNormal(p);
    float edge = 1. - abs(dot(n, -rd));
    // from behind the head and from the side of the face (+z), sweeping slowly: the profile line catches it
    vec3 Lb = normalize(-V * .6 + up * (.3 + .15 * sin(uTime * .3 * uSweep)) + vec3(0., 0., .75));
    float rim = pow(edge, 2.) * clamp(dot(n, Lb) * .8 + .35, 0., 1.);
    rim = smoothstep(.1, .5, rim);
    // A wave of light runs round the contour on every kick
    float around = atan(dot(p - uCamTarget, up), dot(p - uCamTarget, side));
    float wave = exp(-pow(mod(around - uWave * 5. + PI, 2. * PI) - PI, 2.) * 6.) * exp(-uWave * 1.2);
    col = uInk * rim * (1.1 + 1.6 * wave);
    col += uInk * .035 * clamp(dot(n, normalize(V + up * .5)), 0., 1.);
    vec3 Lr = normalize(-side + up * .1 - V * .4);
    float rimR = smoothstep(.1, .5, pow(edge, 2.) * clamp(dot(n, Lr) * .8 + .2, 0., 1.));
    col += uAccent * rimR * (uDrop * 2. + uBuild * .8);
  }
  gl_FragColor = vec4(col, step(0., tt)); // alpha = silhouette, keeps the background behind the face
}
`,
});

export const halftoneHead = defineShaderScene({
  id: "halftone-head",
  name: "Trame",
  tag: "Visage",
  energy: "medium",
  renderScale: 0.9,
  mask: true,
  camera: { framings: FACE_FRAMINGS, glideBars: 2 },
  description:
    "Visage en trois trames de couleur, chacune éclairée d'un côté, qui tournent lentement ; des points s'allument sur les kicks, le drop inverse l'image.",
  params: [
    paletteParam("porcelain"),
    headParam(),
    { type: "range", key: "cells", label: "Finesse de la trame", min: 30, max: 120, step: 1, default: 62 },
    { type: "range", key: "turn", label: "Dérive du visage", min: 0, max: 1.5, step: 0.05, default: 1 },
  ],
  uniforms: () => ({ uCells: { value: 62 }, uTurn: { value: 1 }, ...kickTimer(), ...headUniforms() }),
  update(u, f, p, dt) {
    setHead(u, p.head, "", p);
    u.uCells.value = num(p.cells, 62);
    u.uTurn.value = num(p.turn, 1);
    u.uWave.value = f.beat ? 0 : (u.uWave.value as number) + dt;
  },
  fragment: /* glsl */ `
uniform float uCells;
uniform float uTurn;
uniform float uWave;
${ART_LIB}
${CAMERA_GLSL}
${HEAD_MAP}

/** One screen of the separation: dots on a grid rotated by ang, sized by v (0..1). */
float plate(vec2 fc, float cell, float ang, vec2 off, float v, out vec2 id) {
  vec2 q = (fc + off) * rot(ang) / cell;
  id = floor(q);
  float r = sqrt(clamp(v, 0., 1.)) * .62;
  return 1. - smoothstep(r - .08, r + .08, length(fract(q) - .5));
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  gYaw = (.3 * sin(uTime * .045 + uSeed) + .07 * sin(uTime * .11 + uSeed * 2.)) * uTurn;
  gPitch = .05 * sin(uTime * .06 + uSeed * 3.) * uTurn;
  vec3 ro = uCamPos;
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));
  float tt = march(ro, rd, 9.);
  // Three lights from three sides, one per screen: the separation is where they disagree
  vec3 v = vec3(0.);
  if (tt > 0.) {
    vec3 p = ro + rd * tt;
    vec3 n = calcNormal(p);
    float ao = .4 + .6 * calcAO(p, n);
    float a = uTime * .2;
    v.x = pow(clamp(dot(n, normalize(vec3(-.8, .4 + .2 * sin(a), .55))), 0., 1.), .8) * ao;
    v.y = pow(clamp(dot(n, normalize(vec3(.8, .3, .5 + .2 * cos(a)))), 0., 1.), .8) * ao;
    v.z = pow(clamp(dot(n, normalize(vec3(.1, .9, .4))), 0., 1.), .8) * ao;
  }
  float cell = max(4., uRes.y / uCells);
  float drift = uTime * .01 + uSeed;
  // The screens turn slowly and slip a little against each other (misregistration)
  vec2 idA, idB, idC;
  float dA = plate(fc, cell, .26 + drift, vec2(sin(drift * 3.) * 2., 0.), v.x, idA);
  float dB = plate(fc, cell, 1.31 + drift, vec2(0., cos(drift * 2.) * 2.), v.y, idB);
  float dC = plate(fc, cell, .79 - drift * .5, vec2(1.5, -1.), v.z, idC);
  // On the kick, a few dots light up fully
  float flash = uBeat * .9;
  dA = max(dA, step(1. - .08 * flash, hash12(idA + floor(uTime * 4.))) * step(.01, v.x));
  dB = max(dB, step(1. - .08 * flash, hash12(idB + 7. + floor(uTime * 4.))) * step(.01, v.y));
  vec3 col = uBase * .5 + uInk * dA * .6 + uAccent * dB * 1.05 + uPal1 * dC * .6;
  col = min(col, vec3(1.2));
  if (uDrop > .7) col = uInk - col * .95;
  gl_FragColor = vec4(col, step(0., tt)); // alpha = silhouette, keeps the background behind the face
}
`,
});
