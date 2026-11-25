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
  // at eye level along the rows: where the heads can be seen rising (asked for on the drop)
  { az: 0.78, el: 0, dist: 6.5, target: [0, 1.35, 0], focal: 2.1, weight: 2, tag: "eye" },
  { az: -0.2, el: 0.03, dist: 5, target: [0.3, 1.4, -0.2], focal: 2.3, weight: 1, tag: "eye" },
];

/**
 * The faithful: a crowd of hooded figures, heads bowed, each lit from below by the screen in its hands.
 * The screens flicker on the kick and notifications pop on the hats. On the drop every screen goes out and,
 * slowly, the heads rise toward a sky full of stars; the next build lights the screens again, one by one,
 * and the heads bow back down. As the night drifts, the crowd fills up. Somewhere in the crowd one figure has no
 * screen: it dances, slowly, in a warm light of its own.
 */
export const faithful = defineShaderScene({
  id: "faithful",
  name: "Les Fidèles",
  energy: "calm",
  hdr: true,
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
  update(u, f, p, dt, ctx) {
    if (f.drop) ctx.camera?.request("eye");
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
float gMat;                     // 0 robe, 1 screen, 2 the dancer
float gSkin;                    // on a person: 1 on the face and the hands (they catch the screen's light)
vec2 gCid;

/** Per-figure randoms: jitter, yaw, height, bow. */
vec4 figRand(vec2 cid) {
  return vec4(hash12(cid + uSeed), hash12(cid + uSeed + 3.1), hash12(cid + uSeed + 7.7), hash12(cid + uSeed + 11.3));
}

/** The cell of the one who has no screen. */
vec2 dancerCell() { return floor(vec2(hash12(vec2(uSeed, 1.)), hash12(vec2(uSeed, 2.))) * 5.) - 2.; }

/** Is there someone in this cell? (and never right on top of the camera: the crowd parts around us) */
bool occupied(vec2 cid) {
  if (max(abs(cid.x), abs(cid.y)) * CELL > EXT) return false;
  if (length(cid * CELL - uCamPos.xz) < 1.1) return false;
  return all(equal(cid, dancerCell())) || hash12(cid + uSeed + 23.) < uCrowd;
}

/**
 * A person, feet at the origin, facing +z: a long coat over the legs, dropping shoulders, arms bent to hold the
 * screen at chest height, a neck and a head bowed from the base of the neck (bow, radians), sometimes inside a hood
 * open at the front. w widens the build. mat: 1 on the screen.
 */
float figure(vec3 q, float bow, float w, float hood, out float mat) {
  mat = 0.;
  // cheap bound first: most of the march happens far from anyone
  float bnd = sdCapsule(q, vec3(0., .25, .05), vec3(0., 1.45, .05), .4);
  if (bnd > .15) return bnd;
  vec3 m = vec3(abs(q.x), q.y, q.z);
  // the coat: chest, waist, the skirt to the knees, the legs below it
  float d = sdEllipsoid(q - vec3(0., 1.12, -.01), vec3(.2 * w, .19, .12));
  d = smin(d, sdEllipsoid(q - vec3(0., .86, 0.), vec3(.155 * w, .2, .11)), .08);
  d = smin(d, sdEllipsoid(q - vec3(0., .56, 0.), vec3(.185 * w, .33, .135)), .1);
  d = smin(d, sdCapsule(m, vec3(.085, .4, 0.), vec3(.08, .04, .02), .055), .04);
  // shoulders, dropping a little
  d = smin(d, sdEllipsoid(m - vec3(.165 * w, 1.25, -.01), vec3(.085, .062, .075)), .06);
  // the arms, bent, hands together at the screen
  vec3 sh = vec3(.175 * w, 1.23, 0.), el = vec3(.195 * w, .98, .07), ha = vec3(.055, 1.01, .24);
  d = smin(d, sdCapsule(m, sh, el, .047), .035);
  d = smin(d, sdCapsule(m, el, ha, .039), .03);
  float hands = sdEllipsoid(m - ha - vec3(0., 0., .025), vec3(.03, .024, .045));
  d = smin(d, hands, .02);
  // the neck and the head, bowed from the base of the neck
  vec3 hq = q - vec3(0., 1.32, -.02);
  hq.yz *= rot(-bow);
  float head = sdEllipsoid(hq - vec3(0., .19, .015), vec3(.088, .11, .1));
  // close to it, the sculpted head: a real face for the screen to light
  if (head < .03) head = sdHead((hq - vec3(0., .2, .03)) / .165) * .165;
  gSkin = step(min(head, hands), .012);
  float hd = smin(sdCapsule(hq, vec3(0.), vec3(0., .1, .01), .046), head, .03);
  if (hood > .5) {
    // a hood around the head, open at the front where the screen lights the face
    float hv = sdEllipsoid(hq - vec3(0., .2, -.012), vec3(.13, .155, .14));
    hd = min(hd, max(hv, hq.z - .06));
  }
  d = smin(d, hd, .04);
  // the screen, held up toward the face
  vec3 sq = q - vec3(0., 1.04, .28);
  sq.yz *= rot(-.7);
  float scr = sdBox(sq, vec3(.038, .072, .004));
  if (scr < d) mat = 1.;
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

/**
 * The one without a screen: the same build, no hood, head up, one arm raised and one held out, swaying and turning
 * slowly at its own pace.
 */
float dancer(vec3 q) {
  float t = uTime * .55;
  q.xz *= rot(.8 * sin(t * .45));
  q.xy *= rot(.09 * sin(t));
  vec3 m = vec3(abs(q.x), q.y, q.z);
  float d = sdEllipsoid(q - vec3(0., 1.12, -.01), vec3(.19, .19, .115));
  d = smin(d, sdEllipsoid(q - vec3(0., .86, 0.), vec3(.145, .2, .105)), .08);
  d = smin(d, sdEllipsoid(q - vec3(0., .56, 0.), vec3(.175, .33, .13)), .1);
  d = smin(d, sdCapsule(m, vec3(.08, .4, 0.), vec3(.075, .04, .02), .05), .04);
  d = smin(d, sdEllipsoid(m - vec3(.16, 1.25, -.01), vec3(.08, .06, .07)), .06);
  vec3 hq = q - vec3(0., 1.32, -.02);
  hq.yz *= rot(.28 + .1 * sin(t * 1.3));
  float head = sdEllipsoid(hq - vec3(0., .19, .015), vec3(.085, .108, .097));
  if (head < .03) head = sdHead((hq - vec3(0., .2, .03)) / .16) * .16;
  d = smin(d, smin(sdCapsule(hq, vec3(0.), vec3(0., .1, .01), .044), head, .03), .04);
  float s1 = sin(t * 1.1), s2 = sin(t * .8 + 1.);
  // one arm raised, bent at the elbow; the other held out
  vec3 e1 = vec3(-.3 - .04 * s1, 1.45 + .05 * s1, .04), h1 = vec3(-.26 - .05 * s1, 1.75 + .06 * s1, .08);
  d = smin(d, sdCapsule(q, vec3(-.17, 1.23, 0.), e1, .044), .035);
  d = smin(d, sdCapsule(q, e1, h1, .036), .03);
  vec3 e2 = vec3(.4, 1.17 + .06 * s2, -.02), h2 = vec3(.62, 1.24 + .1 * s2, -.08);
  d = smin(d, sdCapsule(q, vec3(.17, 1.23, 0.), e2, .044), .035);
  d = smin(d, sdCapsule(q, e2, h2, .036), .03);
  return d;
}

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
  float mat = 2.;
  float d = all(equal(cid, dancerCell())) ? dancer(q) * s : figure(q, bowOf(r), .9 + .25 * hash12(cid + 5.3), step(.45, hash12(cid + 9.7)), mat) * s;
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
  vec3 l = vec3(0., 1.04, .28) * s;
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
    float skin = gSkin;
    float on = all(equal(cid, dancerCell())) ? 0. : screenOn(cid);
    if (mat > 1.5) {
      // the dancer, a dark figure caught by a warm light falling from above: lit crown, shoulders and arms,
      // and a warm outline
      vec3 n = calcN(p);
      vec3 warm = mix(vec3(1., .82, .6), uAccent, .3);
      col = uBase * .12 + warm * (.01 + .3 * pow(clamp(dot(n, normalize(vec3(.2, 1., .3))), 0., 1.), 3.));
      col += warm * .35 * pow(1. - abs(dot(n, -rd)), 3.);
    } else if (mat > .5) {
      // the screen itself
      col = SCREEN * on * 1.6 + uBase * .1;
    } else {
      // Lit only by its own screen: the face and the hands catch it, the coat stays in the dark; a hair of
      // haze light on the outline, and the moon once the heads are up
      vec3 n = calcN(p);
      vec3 L = screenPos(cid) - p;
      float fall = 1. / (1. + dot(L, L) * 22.);
      float alb = mix(.14, .72, skin);  // a dark coat; the skin takes the light
      vec3 c = uBase * .12;
      c += SCREEN * on * clamp(dot(n, normalize(L)) * .8 + .2, 0., 1.) * fall * 3. * alb;
      c += uInk * .12 * uLift * clamp(dot(n, normalize(vec3(.3, 1., .2))), 0., 1.) * alb;
      // their outline in the haze, sharper against the stars once the heads are up
      c += uInk * (.06 + .14 * uLift) * pow(1. - abs(dot(n, -rd)), 4.);
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
  // a soft column of warm light above the dancer, so the eye finds it
  {
    vec2 D = dancerCell() * CELL + (figRand(dancerCell()).xy - .5) * .3;
    vec2 rxz = rd.xz;
    float ts = dot(D - ro.xz, rxz) / max(dot(rxz, rxz), 1e-4);
    float y = ro.y + rd.y * ts;
    if (ts > 0. && (hitT < 0. || ts < hitT) && y > 0. && y < 7.) {
      float dd = length(ro.xz + rxz * ts - D);
      col += mix(vec3(1., .82, .6), uAccent, .3) * exp(-dd * 7.) * (1. - y / 7.) * .07;
    }
  }

  gl_FragColor = vec4(hdrOut(col * 1.1), step(0., hitT));
}
`,
});
