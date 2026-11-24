import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";

/** The crowd: NX × NZ identical figures, SP apart; the front row stands at Z0, facing the monument (-z). */
const NX = 30;
const NZ = 24;
const SP = 0.9;
const Z0 = -9;

const FRAMINGS: Framing[] = [
  // from the stand behind the crowd: the rows, and the Patron above them
  { az: 0, el: 0.2, dist: 28, target: [0, 5.5, -6], focal: 1.7, weight: 3 },
  { az: 0.42, el: 0.17, dist: 25, target: [0, 6, -7], focal: 1.8, weight: 2 },
  // among them, just over their heads, looking up at him: the same napes as far as the eye can see
  { az: -0.12, el: 0.02, dist: 13, target: [0, 3.6, -8], focal: 1.6, weight: 2 },
  // high above: the mosaic (the drop asks for it)
  { az: 0, el: 1.08, dist: 30, target: [0, 0, 1.5], focal: 1.55, weight: 1, tag: "high" },
];

/** Bars the mosaic holds before it comes undone, and bars it takes to come undone. */
const HOLD = 6;
const UNDO = 2;

/**
 * La Collectivité: a parade ground of concrete under a low golden sun. At its end, the facade of a monumental building
 * bears the giant face of the Patron in concrete bas-relief, his eyes glowing. In front of it, the collective: rows of
 * identical figures, perfectly aligned, all facing him, each holding a screen. On the kick they all make the same
 * gesture at the same instant, screens raised then lowered, one body. Through the build the screens light up row by
 * row. On the drop the camera rises and the screens, held up, draw together the Patron's face, a giant mosaic as in
 * mass games: each person a pixel of their leader. Then the mosaic comes undone in waves, row after row.
 */
export const collective = defineShaderScene({
  id: "collective",
  name: "La Collectivité",
  energy: "medium",
  hdr: true,
  renderScale: 0.8,
  mask: true,
  camera: { framings: FRAMINGS, glideBars: 2 },
  description:
    "Une place d'armes : des rangs de silhouettes identiques, chacune un écran à la main, face au visage géant du Patron en bas-relief ; au kick toute la foule fait le même geste, pendant la montée les écrans s'allument rang par rang, au drop ils dessinent ensemble le visage du Patron.",
  params: [paletteParam("concrete")],
  uniforms: () => ({
    uRaise: { value: 0 },
    uRows: { value: 0 },
    uMosaic: { value: 0 },
    uEyes: { value: 0.2 },
    // CPU side only
    uSinceDrop: { value: 999 },
  }),
  update(u, f, _p, dt, ctx) {
    const bar = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;
    // the kick: every screen up at once, then down (one body)
    u.uRaise.value = f.beat ? 1 : (u.uRaise.value as number) * Math.exp(-dt * 5);
    // the build lights the rows one after the other; they stay lit through the drop, go out slowly after
    const rows = f.section === "build" ? f.buildProgress : f.section === "drop" ? 1 : 0;
    const r = u.uRows.value as number;
    u.uRows.value = r + (rows - r) * (1 - Math.exp(-dt * (rows > r ? 3 : 0.3)));
    // the drop: the mosaic, held up for a few bars, then undone in waves
    if (f.drop) {
      u.uSinceDrop.value = 0;
      ctx.camera?.request("high");
    } else u.uSinceDrop.value = (u.uSinceDrop.value as number) + dt;
    const t = (u.uSinceDrop.value as number) / bar;
    const target = t < HOLD ? 1 : Math.max(0, 1 - (t - HOLD) / UNDO);
    const m = u.uMosaic.value as number;
    u.uMosaic.value = target > m ? m + (target - m) * (1 - Math.exp(-dt * 6)) : target;
    // while the mosaic holds, the camera stays high above it
    if (ctx.camera) ctx.camera.allow = target > 0.5 ? (fr) => fr.tag === "high" : () => true;
    // his eyes: dim, brighter through the build, blazing on the drop
    const eyes = f.section === "build" ? 0.2 + 0.8 * f.buildProgress : 0.2;
    const e = u.uEyes.value as number;
    u.uEyes.value = f.drop ? 1.5 : e + (eyes - e) * (1 - Math.exp(-dt * 0.8));
  },
  fragment: /* glsl */ `
uniform float uRaise;    // the kick's gesture (0 screens at the chest, 1 over the heads)
uniform float uRows;     // how many rows of screens are lit, from the front
uniform float uMosaic;   // the drop's mosaic (rows from the back stay longest)
uniform float uEyes;     // the glow of the Patron's eyes
${ART_LIB}
${CAMERA_GLSL}
const float NX = ${NX}., NZ = ${NZ}., SP = ${SP}, Z0 = ${Z0}.;
const float HX = NX * SP * .5;
const float WZ = -15.;              // the monument's facade
const float HS = 5.5;               // the Patron's scale on it
const vec3 FACE = vec3(0., 7.8, WZ - .25 * HS);
const vec3 POSTER_RED = vec3(.78, .09, .06);
const vec3 POSTER_CREAM = vec3(1., .9, .74);
vec3 gSun;
vec3 gSunC;
float gMat;     // 0 concrete, 1 a figure, 2 a screen, 3 the monument
vec2 gCell;     // the figure hit: its cell
float gHold;    // how high the screens are held
float gFill;    // the mosaic: screens grown to the size of cards, turned to the sky

// ---------------------------------------------------------------- the crowd
/** One figure, identical to every other one, facing -z; its screen low at the chest or held over the head. */
float figure(vec3 q, out float mat) {
  float body = sdCapsule(q, vec3(0., .5, 0.), vec3(0., 1.28, 0.), .2);
  body = smin(body, sdCapsule(q, vec3(0., .05, 0.), vec3(0., .55, 0.), .15), .1);
  body = smin(body, length(q - vec3(0., 1.58, .02)) - .12, .05);
  vec3 hand = mix(vec3(0., 1.12, -.3), vec3(0., 2.02, -.06), gHold);
  float arms = min(sdCapsule(q, vec3(.19, 1.28, 0.), hand + vec3(.15, 0., 0.), .045),
                   sdCapsule(q, vec3(-.19, 1.28, 0.), hand - vec3(.15, 0., 0.), .045));
  // the screen: turned toward its holder at the chest, toward the sky behind when held up
  vec3 s = q - hand - vec3(0., .06, 0.);
  s.yz *= rot(mix(mix(-.35, .8, gHold), 1.3, gFill));
  float scr = sdBox(s, vec3(mix(vec2(.27, .18), vec2(.44, .42), gFill), .012));
  mat = 1.;
  float d = min(body, arms);
  if (scr < d) { mat = 2.; d = scr; }
  return d;
}

float crowdD(vec3 p, out float mat, out vec2 cell) {
  mat = 0.;
  cell = vec2(0.);
  if (p.y > 2.6) return p.y - 2.5;
  vec2 g = (p.xz - vec2(-HX + SP * .5, Z0)) / SP;
  vec2 c0 = floor(g);
  float d = 1e3;
  // the four nearest figures (a raised screen reaches into the next cell)
  for (int j = 0; j < 2; j++)
    for (int i = 0; i < 2; i++) {
      vec2 c = clamp(c0 + vec2(float(i), float(j)), vec2(0.), vec2(NX - 1., NZ - 1.));
      vec3 q = p - vec3(-HX + SP * .5 + c.x * SP, 0., Z0 + c.y * SP);
      float m;
      float f = figure(q, m);
      if (f < d) { d = f; mat = m; cell = c; }
    }
  return d;
}

// ---------------------------------------------------------------- the monument
float monumentD(vec3 p) {
  // a facade of concrete, and on it the Patron's face in bas-relief
  float wall = sdBox(p - vec3(0., 12., WZ - 3.), vec3(22., 12., 3.));
  vec3 h = (p - FACE) / HS;
  if (length(h - vec3(0., -.1, .2)) > 1.35) return wall;
  return min(wall, sdPatron(h) * HS);
}

float map(vec3 p) {
  float m;
  vec2 c;
  float cr = crowdD(p, m, c);
  float mo = monumentD(p);
  if (mo < cr) { gMat = 3.; return mo; }
  gMat = m;
  gCell = c;
  return cr;
}

vec3 calcN(vec3 p, float e) {
  const vec2 k = vec2(1, -1);
  return normalize(k.xyy * map(p + k.xyy * e) + k.yyx * map(p + k.yyx * e) + k.yxy * map(p + k.yxy * e) + k.xxx * map(p + k.xxx * e));
}

float shadow(vec3 ro, vec3 rd, float t) {
  float res = 1.;
  for (int i = 0; i < 28; i++) {
    float m;
    vec2 c;
    float h = min(crowdD(ro + rd * t, m, c), monumentD(ro + rd * t));
    res = min(res, 10. * h / t);
    t += clamp(h, .04, .8);
    if (res < .01 || t > 14.) break;
  }
  return clamp(res, 0., 1.);
}

// ---------------------------------------------------------------- the mosaic
/** Is a point of the Patron's head his hair, brows, eyes or moustache (dark in the poster)? */
float patronDark(vec3 p) {
  vec3 q = vec3(abs(p.x), p.y, p.z);
  float d = sdCapsule(q, vec3(.075, .165, .535), vec3(.3, .15, .41), .05);
  // the eyes, narrow under the brows
  d = min(d, sdEllipsoid(q - vec3(.15, .045, .5), vec3(.065, .028, .08)));
  d = min(d, sdEllipsoid(p - vec3(0., -.285, .585), vec3(.16, .065, .065)));
  d = min(d, sdCapsule(q, vec3(.06, -.29, .58), vec3(.2, -.37, .5), .06));
  d = min(d, sdEllipsoid(p - vec3(0., .52, -.1), vec3(.52, .36, .62)));
  d = min(d, sdEllipsoid(p - vec3(0., .66, .12), vec3(.44, .2, .38)));
  return step(d, .02);
}

/** The Patron's portrait as the crowd draws it, in poster tones. xy: his head's frame, seen from the front. */
vec3 portrait(vec2 xy) {
  if (length(xy * vec2(1.4, 1.) - vec2(0., -.1)) > 1.2) return POSTER_RED;
  vec3 ro = vec3(xy, .9);
  float t = 0.;
  for (int i = 0; i < 26; i++) {
    float d = sdPatron(ro - vec3(0., 0., t));
    if (d < .004) break;
    t += d;
    if (t > 1.8) return POSTER_RED;
  }
  vec3 p = ro - vec3(0., 0., t);
  const vec2 k = vec2(1, -1);
  const float e = .01;
  vec3 n = normalize(k.xyy * sdPatron(p + k.xyy * e) + k.yyx * sdPatron(p + k.yyx * e) + k.yxy * sdPatron(p + k.yxy * e) + k.xxx * sdPatron(p + k.xxx * e));
  float lit = dot(n, normalize(vec3(-.5, .5, .7)));
  vec3 c = lit > .25 ? POSTER_CREAM : lit > -.15 ? vec3(.55, .12, .08) : vec3(.2, .04, .03);
  return mix(c, vec3(.05, .04, .04), patronDark(p));
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 ro = uCamPos;
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));
  gSun = normalize(vec3(-.45, .42, .78));
  gSunC = uAccent * vec3(1.08, .86, .62) * 1.25;
  gHold = max(uRaise, smoothstep(0., .3, uMosaic));
  gFill = smoothstep(.2, .8, uMosaic);

  float sd = max(dot(rd, gSun), 0.);
  vec3 col = mix(uInk * .55 + uBase * .5, uBase * 1.3, clamp(rd.y * 1.5, 0., 1.)) + gSunC * (pow(sd, 6.) * .3 + pow(sd, 64.) * .8);
  float tg = rd.y < -1e-4 ? -ro.y / rd.y : 1e5;
  float t = .05, tt = -1., d = 1.;
  for (int i = 0; i < 140; i++) {
    d = map(ro + rd * t);
    if (d < .0008 * t) { tt = t; break; }
    t += max(d, .0005 * t);
    if (t > min(tg, 90.)) break;
  }
  // out of steps while skimming the heads of the far rows: a hit, not a hole
  if (tt < 0. && t < min(tg, 90.) && d < .02 * t) tt = t;
  float mat = 0.;
  vec2 cell = vec2(0.);
  float hitT = tt;
  if (tt > 0.) { map(ro + rd * tt); mat = gMat; cell = gCell; }
  else if (tg < 90.) { hitT = tg; mat = -1.; }
  if (hitT > 0.) {
    vec3 p = ro + rd * hitT;
    vec3 n = mat < -.5 ? vec3(0., 1., 0.) : calcN(p, max(.002, hitT * .0012));
    // (the relief's combed hair would shadow itself: start further out on the monument)
    float sh = shadow(p + n * .04, gSun, mat > 2.5 ? .45 : .08);
    float dif = clamp(dot(n, gSun), 0., 1.) * sh;
    vec3 amb = uBase * 1.2 * (.45 + .55 * n.y);
    vec3 alb;
    if (mat < -.5) {
      // the parade ground: big concrete slabs
      vec2 j = abs(fract(p.xz / 2.4) - .5) * 2.4;
      float jw = max(.015, hitT * .0015);
      alb = uInk * .5 * (.9 + .1 * vnoise(p * 1.3)) * (1. - .35 * (1. - smoothstep(0., jw, min(j.x, j.y) - .01)));
    } else if (mat > 2.5) {
      // the monument: weathered concrete, formwork lines
      alb = uInk * .72 * (.9 + .15 * vnoise(p * .7)) * (1. - .18 * (1. - smoothstep(.0, .05, abs(fract(p.y / 1.2) - .5) - .46)));
    } else if (mat > 1.5) {
      alb = vec3(.02);
    } else {
      // the figures: all the same grey coat
      alb = uBase * .9 + uInk * .12;
    }
    col = alb * (dif * gSunC * 3. + amb);
    if (mat > 1.5 && mat < 2.5) {
      // a screen: dark glass; lit by the build, row after row; on the drop, a pixel of the Patron's face
      float row = cell.y / (NZ - 1.);
      vec3 sc = vec3(.03) + gSunC * .04;
      float on = step(row, uRows * 1.02 - .01);
      sc = mix(sc, vec3(.72, .84, 1.) * (1.1 + .3 * uRaise), on);
      float mm = step(1. - uMosaic, row + .02);
      if (uMosaic > .01 && mm > 0.) {
        // two by two pixels per screen
        vec2 sub = floor(vec2(p.x, p.z) / (SP * .5)) + .5;
        vec2 w = sub * SP * .5;
        vec2 xy = vec2(w.x / HX * 1.15, -.1 - (w.y - Z0 - (NZ - 1.) * SP * .5) / ((NZ - 1.) * SP * .5) * .96);
        sc = mix(sc, portrait(xy) * 1.35, mm);
      }
      col = sc;
    }
    // the Patron's eyes glow from the facade
    if (mat > 2.5) {
      vec3 h = (p - FACE) / HS;
      vec3 hq = vec3(abs(h.x), h.yz);
      float eye = exp(-length(hq - vec3(.15, .02, .5)) * 30.);
      col += vec3(1., .5, .25) * eye * uEyes * 2.;
    }
    col = mix(col, mix(uBase * 1.1, gSunC * .6, pow(sd, 3.)), 1. - exp(-hitT * .016));
  }
  // the glow of his eyes in the air
  for (int s = 0; s < 2; s++) {
    vec3 E = FACE + vec3((s == 0 ? .15 : -.15) * HS, .02 * HS, .5 * HS);
    vec3 w = E - ro;
    float along = dot(w, rd);
    if (along > 0. && (hitT < 0. || along < hitT + 1.)) col += vec3(1., .45, .2) * exp(-length(w - rd * along) * 1.5) * uEyes * .25;
  }
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
