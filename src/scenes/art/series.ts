import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { HEAD_GLSL, headsOf, headUniforms, setHead, type HeadId } from "./heads";
import { SKY_GLSL } from "./sky.glsl";
import { Casting, pick } from "./casting";

/**
 * The portrait every cast is taken from: one of Rome and Greece (or an archetype), a different one on each passage,
 * never the one just shown. The first loads with the world.
 */
// (portraits the Assembly's gods already load: the world downloads nothing more for them)
const FIRST: HeadId[] = ["dame"];
const POOL: HeadId[] = [...headsOf("visage"), ...headsOf("archetype")].filter((h) => h !== "humain" && h !== "patron");
const casting = new Casting(FIRST, (avoid) => pick(POOL, 1, avoid));
/** Each instance's passage: its seed (redrawn when it comes back on screen), its portrait. */
const passes = new WeakMap<object, { seed: number; head: HeadId }>();

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/**
 * Les Œuvres mortes: a forgotten storeroom in the clouds. Rows of shelves carry plaster casts all taken from the same
 * mould, copies of copies of one portrait of Antiquity (a different one on each passage); some lie under white dust
 * sheets. Shafts of light fall through the air and the dust glints in them on the hats. The camera glides slowly along
 * the shelves. Through a breakdown a sheet slowly slides off one of them and uncovers a face; on the drop one cast
 * cracks and a pale gold light comes out of the crack. Over the night the rows grow longer: more shelves.
 */
export const series = defineShaderScene({
  id: "series",
  name: "Les Œuvres mortes",
  energy: "calm",
  hdr: true,
  renderScale: 0.8,
  heads: FIRST,
  description:
    "Une réserve oubliée dans les nuages : des rangées de plâtres tirés du même moule, copies de copies d'un portrait antique, certains sous des draps blancs ; de la poussière dans les rais de lumière. Pendant un break, un drap glisse et découvre un visage ; au drop, un plâtre se fend et une lumière d'or pâle sort de la fêlure.",
  params: [paletteParam("olympe")],
  uniforms: () => ({
    ...headUniforms(),
    uTravel: { value: 0 },
    uKickT: { value: 9 },
    uCrackX: { value: 9999 },
    uCrackY: { value: 0 },
    uCrackT: { value: 99 },
    uView: { value: 0 },
    uRows: { value: 1 },
    uVeilX: { value: 9999 },
    uVeilY: { value: 0 },
    uUnveil: { value: 0 },
    // CPU side only
    uLastPhrase: { value: -1 },
    uWasBreak: { value: 0 },
    uBreakT: { value: 0 },
  }),
  update(u, f, _p, dt) {
    // the portrait of this passage
    const seed = u.uSeed.value as number;
    let pass = passes.get(u);
    if (!pass || pass.seed !== seed) passes.set(u, (pass = { seed, head: casting.pass()[0] }));
    setHead(u, pass.head);
    u.uTravel.value = (u.uTravel.value as number) + dt * 0.16;
    u.uKickT.value = f.beat ? 0 : (u.uKickT.value as number) + dt;
    const bar = f.bpm > 0 ? 240 / f.bpm : 2;
    // a new way of looking at the shelves on every phrase
    const phrase = Math.floor(f.bar / 8);
    if (phrase !== u.uLastPhrase.value) {
      u.uLastPhrase.value = phrase;
      u.uView.value = Math.floor(Math.random() * 3);
    }
    const view = u.uView.value as number;
    const camX = (u.uTravel.value as number) + (view === 1 ? 0 : 0.9);
    // the drop: the cast in front of us cracks
    if (f.drop) {
      u.uCrackX.value = Math.round(camX / 0.62);
      u.uCrackY.value = view === 2 ? 1 : 0;
      u.uCrackT.value = 0;
    }
    u.uCrackT.value = (u.uCrackT.value as number) + dt;
    // a breakdown: a sheet slides off a veiled cast in view, over four bars (the shader veils one cell in three:
    // the same hash picks one here)
    const inBreak = f.section === "breakdown";
    if (inBreak && u.uWasBreak.value === 0) {
      const row = view === 2 ? 1 : 0;
      let col = Math.round(camX / 0.62);
      for (let k = 0; k < 6 && !veiled(col, row); k++) col += 1;
      u.uVeilX.value = col;
      u.uVeilY.value = row;
      u.uBreakT.value = 0;
    }
    u.uWasBreak.value = inBreak ? 1 : 0;
    u.uBreakT.value = (u.uBreakT.value as number) + dt;
    u.uUnveil.value = u.uVeilX.value === 9999 ? 0 : smooth((u.uBreakT.value as number) / (bar * 4));
    u.uRows.value = 1 + Math.round(2 * f.drift);
  },
  fragment: /* glsl */ `
uniform float uTravel;  // how far along the shelves
uniform float uKickT;   // seconds since the kick
uniform float uCrackX;  // the cast that cracked (column, row), and since when
uniform float uCrackY;
uniform float uCrackT;
uniform float uView;    // 0: three-quarters along the row, 1: face to face, 2: high, looking down the rows
uniform float uRows;    // shelves above the first one
uniform float uVeilX;   // the veiled cast being uncovered (column, row), and how far its sheet has slid
uniform float uVeilY;
uniform float uUnveil;
${ART_LIB}
${HEAD_GLSL}
${SKY_GLSL}
const float SX = .62;   // spacing of the casts along a shelf
const float SY = 1.05;  // spacing of the shelves
const float S = .27;    // the casts' scale
const float CUT = -.82; // cut flat under the neck
float gMat;             // 0 cast, 1 sheet, 2 shelf
vec2 gCell;

float veiledCell(vec2 c) { return step(hash12(c * vec2(1.7, 3.1) + 11.3), .33); }

/**
 * The dust sheet over a cast (its own frame h): a cloth thrown over the head, rounder than the face under it, hanging
 * in a wide skirt with folds down to the shelf; slide: how far it has slid off.
 */
float sheetD(vec3 h, float slide) {
  h.y += slide * 1.15;
  float head = sdEllipsoid(h - vec3(0., .12, .02), vec3(.64, .82, .74));
  float hang = 1. - smoothstep(-.95, .1, h.y);
  float a = atan(h.z, h.x);
  float r = .62 + .4 * hang + .05 * sin(a * 7. + 1.3) * hang;
  float skirt = max((length(h.xz * vec2(1., 1.05)) - r) * .75, h.y - .1);
  return smin(head, skirt, .3);
}

/** One cast from the mould, cut flat on its little block; or its sheet. Origin at the shelf's top. */
float castD(vec3 q, vec2 cell, out float sheet) {
  vec3 h = (q - vec3(0., .02 - CUT * S, .02)) / S;
  float block = sdBox(q - vec3(0., .01, .02), vec3(.09, .01, .09));
  float d = max(headD(h), CUT - h.y) * S;
  sheet = 1e3;
  if (veiledCell(cell) > .5) {
    float slide = cell == vec2(uVeilX, uVeilY) ? uUnveil : 0.;
    // the sheet sinks through the shelf as it slides off
    sheet = max(sheetD(h, slide) * S, -q.y);
    if (slide < .99) d = max(d, -sheet - .002);
  }
  return min(block, d);
}

float map(vec3 p) {
  float row = clamp(floor(p.y / SY + .5), 0., uRows);
  float yr = row * SY;
  // the shelves: long boards on posts, standing in the clouds
  float shelf = sdBox(p - vec3(p.x, yr - .03, -.1), vec3(1., .03, .24));
  float post = sdBox(vec3(mod(p.x + 1.55, 3.1) - 1.55, p.y - (uRows * SY) * .5, p.z + .1), vec3(.035, uRows * SY * .5 + .2, .2));
  float col = floor(p.x / SX + .5);
  gCell = vec2(col, row);
  vec3 q = p - vec3(col * SX, yr, 0.);
  // cheap bound round each cast
  float b = sdCapsule(q, vec3(0., 0., .02), vec3(0., .52, .02), .29);
  float sheet = 1e3;
  float face = b > .1 ? b : castD(q, gCell, sheet);
  // never step past a neighbour's cast
  face = min(face, max(SX * .5 - abs(q.x), .02));
  float wood = min(shelf, post);
  float d = min(min(face, sheet), wood);
  gMat = d == face ? 0. : d == sheet ? 1. : 2.;
  return d;
}

vec3 calcN(vec3 p) {
  vec2 e = vec2(.0015, 0.);
  return normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx)));
}

/** The crack of the cast that broke: a few lines of a Voronoi net over it, widening with time. */
float crackOf(vec3 q) {
  vec3 g = q * 9.;
  vec3 i0 = floor(g);
  float d1 = 9., d2 = 9.;
  for (int k = 0; k < 8; k++) {
    vec3 c = i0 + vec3(float(k & 1), float((k >> 1) & 1), float(k >> 2));
    vec3 o = vec3(hash13(c), hash13(c + 1.7), hash13(c + 3.1));
    float d = length(g - c - o);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  float grow = smoothstep(0., 1.2, uCrackT);
  float reach = exp(-abs(q.x) * (14. - 10. * grow));
  return (1. - smoothstep(.02, .06, d2 - d1)) * reach;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  float T = uTravel;
  gSun = normalize(vec3(-.55, .5, -.65));
  gKey = normalize(vec3(-.4, .75, .55));
  gSeaY = -6.;
  gSeaDrift = vec2(uTime * .003, uSeed * .1);
  // three ways of looking, each sliding along the shelves at its own pace
  vec3 ro, ta;
  float focal = 1.7;
  if (uView < .5) { ro = vec3(T - .9, .55, 1.6); ta = vec3(T + .9, .35, -.1); }
  else if (uView < 1.5) { ro = vec3(T + .08 * sin(uTime * .1), .42, 1.25); ta = vec3(T, .4, 0.); focal = 1.9; }
  else { ro = vec3(T - .4, 2.6, 2.); ta = vec3(T + .9, .9, -.1); focal = 1.6; }
  vec3 rd = lookAt(ro, ta) * normalize(vec3(uv, focal));
  vec3 col = heavenO(ro, rd, 150.);
  float t = .02, tt = -1.;
  for (int i = 0; i < 90; i++) {
    float d = map(ro + rd * t);
    if (d < .0008 * t) { tt = t; break; }
    t += d;
    if (t > 30.) break;
  }
  if (tt > 0.) {
    vec3 p = ro + rd * tt;
    map(p);
    float mat = gMat;
    vec2 cell = gCell;
    vec3 n = calcN(p);
    float ao = 1.;
    for (int i = 0; i < 3; i++) {
      float hd = .01 + .03 * float(i);
      ao -= max(hd - map(p + n * hd), 0.) * 5.;
    }
    ao = clamp(ao, 0., 1.);
    vec3 q = p - vec3(cell.x * SX, cell.y * SY, 0.);
    if (mat < .5) {
      // plaster: matte, chalky, the dust of years settled on whatever faces up
      vec3 a = uInk * .93 * (1. - .12 * smoothstep(.4, .9, n.y));
      col = lightO(a, n, rd, ao);
      // the one that cracked: its crack, and the pale gold light coming out of it
      if (cell.x == uCrackX && cell.y == uCrackY) {
        float cr = crackOf(q - vec3(0., .4, .02));
        col = mix(col, (uAccent * 2. + uInk * .5) * (1.3 + 2. * exp(-uCrackT * 1.5) + 1.2 * uBeat), cr);
      }
    } else if (mat < 1.5) {
      // the dust sheet: a white cloth, blue-grey in its folds
      col = lightO(uInk * 1.02, n, rd, ao) * mix(vec3(.9, .93, 1.), vec3(1.), ao);
    } else {
      // the shelves and posts: old white paint
      col = lightO(uInk * .86, n, rd, ao);
    }
    // the gold light spilling from the crack onto its neighbours
    vec3 cp = vec3(uCrackX * SX, uCrackY * SY + .42, .1);
    col += uAccent * exp(-length(p - cp) * 3.5) * .6 * smoothstep(0., .5, uCrackT) * step(uCrackT, 600.);
    col = mix(col, heavenO(ro, rd, 150.), smoothstep(10., 34., tt));
  }
  // the shafts of light through the air, and the dust glinting in them on the hats
  col = withShafts(col, ro, rd, tt > 0. ? tt : 30., .7 + .3 * exp(-uKickT * 3.));
  for (int i = 0; i < 28; i++) {
    float fi = float(i);
    vec3 dp = vec3(T + (hash12(vec2(fi, 1.)) - .3) * 5., hash12(vec2(fi, 2.)) * 2.4, hash12(vec2(fi, 3.)) * 1.8 - .3);
    dp.y += .12 * sin(uTime * .2 + fi);
    dp.x += .1 * sin(uTime * .13 + fi * 2.);
    float s = dot(dp - ro, rd);
    if (s < 0. || (tt > 0. && s > tt)) continue;
    float d = length(dp - ro - rd * s);
    float glint = .1 + 2.2 * uHat * pow(hash12(vec2(fi, floor(uTime * 8.))), 4.);
    col += (uAccent * .8 + uInk * .4) * exp(-d * 900. / (1. + s * .5)) * glint;
  }
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});

/** The same choice of veiled casts as the shader's veiledCell (hash12, ported). */
function veiled(col: number, row: number): boolean {
  const fract = (x: number) => x - Math.floor(x);
  const px = col * 1.7 + 11.3;
  const py = row * 3.1 + 11.3;
  let a = fract(px * 0.1031);
  let b = fract(py * 0.1031);
  let c = fract(px * 0.1031);
  const dd = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
  a += dd;
  b += dd;
  c += dd;
  return fract((a + b) * c) < 0.33;
}
