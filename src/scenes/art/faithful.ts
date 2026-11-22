import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { num } from "../utils";
import { ART_LIB } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";

const FRAMINGS: Framing[] = [
  { az: 0.4, el: 0.06, dist: 7, target: [0, 1.1, 0], focal: 1.7, weight: 3 },
  { az: -0.9, el: 0.5, dist: 9, target: [0, 0.4, 0], focal: 1.8, weight: 2 },
  { az: 2.2, el: 0.12, dist: 5, target: [0.5, 1.1, -0.5], focal: 2.2, weight: 2 },
  { az: 0.1, el: 1.1, dist: 10, target: [0, 0, 0], focal: 1.9, weight: 1 },
  { az: -0.3, el: 0.02, dist: 3.4, target: [0.2, 1.3, 0.2], focal: 2.4, weight: 2 },
];

/**
 * The faithful: a crowd of hooded figures, heads bowed, each lit from below by the screen in its hands.
 * The screens flicker on the kick and notifications pop on the hats. On the drop every screen goes out and,
 * slowly, the heads rise toward a sky full of stars; the next build lights the screens again, one by one,
 * and the heads bow back down. As the night drifts, the crowd fills up.
 */
export const faithful = defineShaderScene({
  id: "faithful",
  name: "Les Fidèles",
  energy: "calm",
  renderScale: 0.8,
  mask: true,
  camera: { framings: FRAMINGS, glideBars: 2 },
  description:
    "Une foule tête baissée, chacun éclairé par son écran ; au drop les écrans s'éteignent et les têtes se relèvent lentement vers les étoiles.",
  params: [paletteParam("whiteLight"), { type: "range", key: "crowd", label: "Foule", min: 0.3, max: 1, step: 0.05, default: 0.6 }],
  uniforms: () => ({
    uScreens: { value: 1 },
    uLift: { value: 0 },
    uCrowd: { value: 0.6 },
    uWave: { value: 9 },
  }),
  update(u, f, p, dt) {
    const bar = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;
    // Awake: the screens go out on the drop and stay out through the breakdown; the build lights them again
    const awake = f.section === "drop" || f.section === "breakdown" ? 1 : f.section === "build" ? 1 - f.buildProgress : 0;
    const s = u.uScreens.value as number;
    u.uScreens.value = f.drop ? 0 : s + (1 - awake - s) * (1 - Math.exp(-dt / (bar * 1.5)));
    // Heads follow, slowly: up over a couple of bars, back down over four
    const l = u.uLift.value as number;
    u.uLift.value = l + (awake - l) * (1 - Math.exp(-dt / (bar * (awake > l ? 1.5 : 3))));
    const crowd = num(p.crowd, 0.6);
    u.uCrowd.value = crowd + (1 - crowd) * 0.8 * f.drift;
    u.uWave.value = f.beat ? 0 : (u.uWave.value as number) + dt;
  },
  fragment: /* glsl */ `
uniform float uScreens;
uniform float uLift;
uniform float uCrowd;
uniform float uWave;
${ART_LIB}
${CAMERA_GLSL}
const float CELL = 1.1;
const float EXT = 9.5;          // half size of the crowd
const vec3 SCREEN = vec3(.78, .88, 1.);
float gMat;                     // 0 robe, 1 screen
vec2 gCid;

/** Per-figure randoms: jitter, yaw, height, bow. */
vec4 figRand(vec2 cid) {
  return vec4(hash12(cid + uSeed), hash12(cid + uSeed + 3.1), hash12(cid + uSeed + 7.7), hash12(cid + uSeed + 11.3));
}

/** Is there someone in this cell? (and never right on top of the camera: the crowd parts around us) */
bool occupied(vec2 cid) {
  if (max(abs(cid.x), abs(cid.y)) * CELL > EXT) return false;
  if (length(cid * CELL - uCamPos.xz) < 1.1) return false;
  return hash12(cid + uSeed + 23.) < uCrowd;
}

/** One hooded figure, feet at the origin, facing +z, head bowed forward by bow (radians). */
float figure(vec3 q, float bow, out float mat) {
  float robe = sdEllipsoid(q - vec3(0., .62, 0.), vec3(.25, .64, .21));
  robe = smin(robe, sdEllipsoid(q - vec3(0., 1.16, -.02), vec3(.23, .13, .16)), .1);
  vec3 hq = q - vec3(0., 1.22, 0.);
  hq.yz *= rot(-bow);
  float head = sdEllipsoid(hq - vec3(0., .2, .02), vec3(.13, .16, .14));
  float d = smin(robe, head, .06);
  float arms = min(sdCapsule(q, vec3(-.17, 1.05, .05), vec3(-.03, .98, .24), .045),
                   sdCapsule(q, vec3(.17, 1.05, .05), vec3(.03, .98, .24), .045));
  d = smin(d, arms, .05);
  vec3 sq = q - vec3(0., 1., .27);
  sq.yz *= rot(-.6);
  float scr = sdBox(sq, vec3(.04, .075, .004));
  mat = scr < d ? 1. : 0.;
  return min(d, scr);
}

/** Local frame of the figure in cell cid: jitter, yaw toward a common direction, height. */
vec3 toFigure(vec3 p, vec2 cid, vec4 r, out float s) {
  vec3 q = p;
  q.xz -= cid * CELL + (r.xy - .5) * .3;
  q.xz *= rot((r.y - .5) * 1.4);
  s = .9 + .2 * r.z;
  return q / s;
}

float bowOf(vec4 r) { return mix(.75 + .2 * r.w, -.45 - .2 * r.w, uLift); }

float map(vec3 p) {
  float bound = sdBox(p - vec3(0., 1., 0.), vec3(EXT + .6, 1., EXT + .6));
  gMat = 0.;
  if (bound > .3) return bound;
  vec2 cid = floor(p.xz / CELL + .5);
  gCid = cid;
  vec2 lq = p.xz - cid * CELL;
  // distance to the edge of the cell: never more than to a neighbour's figure
  float edge = CELL * .5 - max(abs(lq.x), abs(lq.y)) + .02;
  if (!occupied(cid)) return max(edge, bound);
  vec4 r = figRand(cid);
  float s;
  vec3 q = toFigure(p, cid, r, s);
  float mat;
  float d = figure(q, bowOf(r), mat) * s;
  gMat = mat;
  return min(d, edge);
}

vec3 calcN(vec3 p) {
  const vec2 k = vec2(1, -1);
  const float h = .002;
  return normalize(k.xyy * map(p + k.xyy * h) + k.yyx * map(p + k.yyx * h) + k.yxy * map(p + k.yxy * h) + k.xxx * map(p + k.xxx * h));
}

/** Is this figure's screen on, and how bright (kick flicker, notifications on the hats)? */
float screenOn(vec2 cid) {
  vec4 r = figRand(cid);
  float on = step(1. - uScreens, r.z * .98 + .01);
  float kick = exp(-uWave * 6.) * .35;
  float notif = uHat * step(.88, hash12(cid + floor(uTime * 6.))) * 1.4;
  return on * (.85 + kick + notif);
}

/** World position of the screen of the figure in cell cid. */
vec3 screenPos(vec2 cid) {
  vec4 r = figRand(cid);
  float s = .9 + .2 * r.z;
  vec3 l = vec3(0., 1., .27) * s;
  l.xz *= rot(-(r.y - .5) * 1.4);
  return vec3(cid * CELL + (r.xy - .5) * .3, 0.).xzy + l;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 ro = uCamPos;
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));

  // The sky: black while the screens are on; the stars come out as the heads rise
  vec3 col = uBase * .5;
  vec3 sd = rd * 90.;
  vec3 sid = floor(sd);
  float star = step(.985, hash13(sid)) * (1. - smoothstep(.05, .25, length(fract(sd) - .5)));
  col += vec3(.8, .88, 1.) * star * smoothstep(.0, .3, rd.y) * uLift * (.6 + .4 * sin(uTime * 2. + hash13(sid) * 30.));

  // Ground plane, then the figures inside the slab y < 2
  float tg = rd.y < -1e-4 ? -ro.y / rd.y : 1e5;
  float t = ro.y > 2. && rd.y < 0. ? (ro.y - 2.) / -rd.y : .02;
  float tt = -1.;
  for (int i = 0; i < 110; i++) {
    if (t > min(tg, 40.)) break;
    float d = map(ro + rd * t);
    if (d < .001 * t) { tt = t; break; }
    t += d;
  }
  float hitT = tt > 0. ? tt : (tg < 40. ? tg : -1.);
  if (tt > 0.) {
    vec3 p = ro + rd * tt;
    map(p);
    float mat = gMat;
    vec2 cid = gCid;
    float on = screenOn(cid);
    if (mat > .5) {
      // the screen itself
      col = SCREEN * on * 1.6 + uBase * .1;
    } else {
      vec3 n = calcN(p);
      vec3 L = screenPos(cid) - p;
      float fall = 1. / (1. + dot(L, L) * 30.);
      vec3 c = uBase * .25 + uInk * .02;
      c += SCREEN * on * clamp(dot(n, normalize(L)), 0., 1.) * fall * 2.2;
      // moonlight once the heads are up
      c += uInk * .35 * uLift * clamp(dot(n, normalize(vec3(.3, 1., .2))), 0., 1.);
      c += uInk * .08 * pow(1. - abs(dot(n, -rd)), 3.);
      col = c;
    }
  } else if (tg < 40.) {
    // Dark floor with a pool of cold light under each screen
    vec3 p = ro + rd * tg;
    vec2 cid = floor(p.xz / CELL + .5);
    vec3 c = uBase * .3;
    if (occupied(cid)) {
      vec3 sp = screenPos(cid);
      float d2 = dot(p.xz - sp.xz, p.xz - sp.xz);
      // (tight enough to fade out before the edge of the cell)
      c += SCREEN * screenOn(cid) * exp(-d2 * 16.) * .3;
    }
    c += uInk * .05 * uLift;
    col = c;
  }
  // depth haze
  if (hitT > 0.) col = mix(col, uBase * .6 + uInk * .03, 1. - exp(-hitT * .05));

  col = aces(col * 1.1);
  col *= vignette(fc / uRes);
  gl_FragColor = vec4(col, step(0., hitT));
}
`,
});
