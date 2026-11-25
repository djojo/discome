import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { WHITE_GLSL } from "./white.glsl";

/**
 * Kintsugi: a long, slow travelling shot skimming the inside of a huge porcelain bowl, broken and mended with gold
 * (a few seams still in the vermilion lacquer under the gold): a curved white landscape crossed by raised seams of
 * gold, its rim rising far away like a horizon. On the kick the gold flows along the seams in a widening wave; the
 * hats run glints along them. On the drop the bowl comes apart, its pieces lift and hang a moment, then settle back,
 * mended along new seams. The flight's height drifts from phrase to phrase, skimming low or gliding high.
 */
export const kintsugi = defineShaderScene({
  id: "kintsugi",
  name: "Kintsugi",
  energy: "calm",
  hdr: true,
  mask: true,
  renderScale: 0.85,
  description:
    "Un travelling au ras d'un grand bol de porcelaine brisé et recollé à l'or ; l'or coule dans les fissures au kick ; au drop, le bol se sépare en morceaux puis se recolle.",
  params: [paletteParam("porcelain")],
  uniforms: () => ({
    uTravel: { value: 0 },
    uAlt: { value: 0.55 },
    uKickT: { value: 9 },
    uLift: { value: 0 },
    uCrack: { value: 0 },
    uGold: { value: 0.5 },
    // state kept on the CPU side only
    uAltGoal: { value: 0.55 },
    uDropT: { value: 99 },
    uLastPhrase: { value: -1 },
  }),
  update(u, f, _p, dt) {
    // its own pace: a slow glide, a little quicker through the build
    u.uTravel.value = (u.uTravel.value as number) + dt * (0.32 + 0.25 * (f.section === "build" ? f.buildProgress : 0));
    // a new height on every phrase: skimming the glaze, or gliding high above it
    const phrase = Math.floor(f.bar / 8);
    if (phrase !== u.uLastPhrase.value) {
      u.uLastPhrase.value = phrase;
      u.uAltGoal.value = 0.28 + Math.random() * 1.1;
    }
    u.uAlt.value = (u.uAlt.value as number) + ((u.uAltGoal.value as number) - (u.uAlt.value as number)) * (1 - Math.exp(-dt * 0.25));
    u.uKickT.value = f.beat ? 0 : (u.uKickT.value as number) + dt;
    // the drop: the pieces lift and hang for two bars, then settle; the bowl is mended along new seams
    const bar = f.bpm > 0 ? 240 / f.bpm : 2;
    if (f.drop) u.uDropT.value = 0;
    const dropT = (u.uDropT.value as number) + dt;
    u.uDropT.value = dropT;
    const x = Math.min(1, dropT / (bar * 2.5));
    const was = u.uLift.value as number;
    u.uLift.value = Math.sin(Math.PI * x) * (f.safeFlash ? 0.6 : 1);
    if (x >= 1 && was > 0.001) u.uCrack.value = (u.uCrack.value as number) + 1;
    const gold = f.section === "build" ? 0.5 + 0.8 * f.buildProgress : f.section === "drop" ? 1.1 : f.section === "breakdown" ? 0.25 : 0.5;
    u.uGold.value = (u.uGold.value as number) + (gold - (u.uGold.value as number)) * (1 - Math.exp(-dt * 1.2));
  },
  fragment: /* glsl */ `
uniform float uTravel;  // how far the shot has gone
uniform float uAlt;     // its height above the glaze
uniform float uKickT;   // seconds since the kick
uniform float uLift;    // the drop: how far the pieces have lifted (0..1..0)
uniform float uCrack;   // which mending: new seams after each drop
uniform float uGold;    // how bright the gold is
${ART_LIB}
${WHITE_GLSL}
const float K = .012;   // the bowl's curve
const float CELL = 2.6; // the size of the pieces
const vec3 L = normalize(vec3(-.45, .8, .35));
const float RIM = 21.;  // the bowl's rim, gilded, standing against the white studio

/** The bowl's surface, before any piece lifts. */
float bowl(vec2 x) { return dot(x, x) * K; }

/** The pieces: distance to the nearest seam (d2 - d1), the piece's id, and the seam's own id (for lacquer or gold). */
vec3 pieces(vec2 x) {
  vec2 g = x / CELL;
  vec2 i0 = floor(g);
  float d1 = 9., d2 = 9.;
  vec2 id1 = vec2(0.), id2 = vec2(0.);
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 c = i0 + vec2(i, j);
      vec2 o = vec2(hash12(c + uCrack * 7.1), hash12(c + 3.3 + uCrack * 5.3));
      float d = length(g - c - o);
      if (d < d1) { d2 = d1; id2 = id1; d1 = d; id1 = c; }
      else if (d < d2) { d2 = d; id2 = c; }
    }
  return vec3((d2 - d1) * CELL * .5, hash12(id1 + 17.), hash12(id1 + id2 + 31.));
}

/** How high piece h is lifted on the drop (each its own height and delay). */
float liftOf(float h) { return uLift * (.35 + 1.1 * h) * smoothstep(0., .25, uLift + .1 - .2 * h); }

float gSeam;   // distance to the seam at the last evaluation
float gPiece;  // its piece
float gSeamId;

float map(vec3 p) {
  vec3 pc = pieces(p.xz);
  gSeam = pc.x; gPiece = pc.y; gSeamId = pc.z;
  float lift = liftOf(pc.y);
  // the raised seam of gold, and the glaze's long slow ripple
  float ridge = .014 * (1. - smoothstep(0., .03, pc.x)) * (1. - smoothstep(.0, .3, uLift)) * step(pc.z, .5);
  float h = bowl(p.xz) + lift + ridge + .004 * sin(p.x * 3.1 + p.z * 2.3);
  float d = (p.y - h) * .8;
  // the bowl ends at its rim: beyond it, the studio
  d = max(d, (length(p.xz) - RIM) * .8);
  // lifted pieces are cut apart: never step over a seam
  if (uLift > .01) d = min(d, max(pc.x, .01) + max(p.y - h - .3, 0.));
  // a piece is a thin shell: below it, empty
  return lift > .001 ? max(d, -(p.y - (h - .05)) * .8) : d;
}

vec3 calcN(vec3 p) {
  vec2 e = vec2(.004, 0.);
  return normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx)));
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  // the flight: round and round inside the bowl, the wall rising on one side, the bottom on the other; its height
  // from the uniforms, and above the pieces when they lift
  float T = uTravel;
  float Rp = 7.5 + 2. * sin(T * .021 + uSeed);
  float a = T / 8. + uSeed;
  vec2 xz = Rp * vec2(cos(a), sin(a));
  vec3 ro = vec3(xz.x, bowl(xz) + uAlt + 1.7 * uLift + .06 * sin(T * .4), xz.y);
  vec2 tg = vec2(-sin(a), cos(a));
  // look along the way, turned a little toward the bottom of the bowl, and down
  vec2 lk = normalize(tg - .25 * normalize(xz));
  vec3 fwd = normalize(vec3(lk.x, -.05 - .09 * uAlt, lk.y));
  vec3 ta = ro + fwd;
  vec3 rd = lookAt(ro, ta) * normalize(vec3(uv, 1.55));
  float pa = 1. / (uRes.y * 1.55);

  vec3 sky = studioW(rd);
  vec3 col = sky;
  float t = .05, tt = -1.;
  for (int i = 0; i < 130; i++) {
    vec3 p = ro + rd * t;
    float d = map(p);
    if (d < .0008 * t) { tt = t; break; }
    t += d;
    if (t > 60.) break;
  }
  if (tt > 0.) {
    vec3 p = ro + rd * tt;
    map(p);
    float seam = gSeam, sid = gSeamId;
    float lift = liftOf(gPiece);
    vec3 n = calcN(p);
    float base = bowl(p.xz) + lift;
    bool side = p.y < base - .006;    // the broken edge of a lifted piece
    float dif = clamp(dot(n, L), 0., 1.);
    // the white glaze: bright, a light bounced from the studio everywhere, mirroring it at grazing angles
    float fre = pow(1. - clamp(dot(n, -rd), 0., 1.), 4.);
    // (the curve of the bowl catches the light: its wall brighter or greyer as it turns)
    vec3 glaze = uInk * (.55 + 1.05 * dif) + uInk * .25;
    glaze = mix(glaze, envW(reflect(rd, n)), .04 + .4 * fre);
    glaze += pow(clamp(dot(reflect(-L, n), -rd), 0., 1.), 60.) * .8;
    if (side) glaze = uInk * vec3(.9, .86, .8) * (.6 + .4 * dif);   // the body of the porcelain, unglazed
    // the seam: gold, or the vermilion lacquer under it on a few of them; finer than a pixel, it fades to its colour
    float w = max(.026, tt * pa * 1.2);
    // only some of the joints are cracks: a few long seams, not a tiling
    float inSeam = (1. - smoothstep(w * .5, w, seam)) * (1. - smoothstep(.1, .6, uLift)) * step(sid, .5);
    bool lacquer = sid < .12;
    // the gilded rim
    inSeam = max(inSeam, smoothstep(RIM - .25, RIM - .08, length(p.xz)));
    vec3 gold = vec3(1., .74, .32);
    // the kick: a wave of molten gold widening from under the camera along the seams
    float dist = length(p.xz - ro.xz);
    float wave = exp(-pow(dist - uKickT * 7., 2.) * .6) * exp(-uKickT * .9);
    // the hats: glints running along them
    float glint = step(.985, hash12(floor(p.xz * 14.) + floor(uTime * 9.))) * uHat;
    vec3 seamCol = lacquer
      ? mix(uAccent, vec3(.55, .08, .05), .3) * (.6 + .6 * dif) + gold * .3 * wave
      : gold * (.5 + .9 * dif) * (.6 + uGold) + gold * pow(clamp(dot(reflect(rd, n), L), 0., 1.), 20.) * 1.5
        + gold * (2.2 * wave + 2.5 * glint);
    col = mix(glaze, seamCol, inSeam);
    // far away the bowl melts into the white of the studio
    col = mix(col, sky, smoothstep(22., 70., tt));
  }
  // below the lifted pieces: the shadowed hollow of the bowl
  if (tt < 0. && rd.y < 0. && uLift > .01) col = mix(col, uInk * .35, uLift * .5);
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
