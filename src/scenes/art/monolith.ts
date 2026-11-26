import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { num } from "../utils";
import { ART_LIB } from "./lib.glsl";
import { FLIGHT_GLSL, flightParams } from "./flight";
import { HEAD_GLSL, headParam, headUniforms, setHead } from "./heads";

/**
 * Brutalist concrete avenue under a single low sun, flown through by the shared flight:
 * slow glide at ground level in the breakdown, rising through the build, take-off over the roofs on the drop.
 * The sun stands low, just to the right of the avenue's axis, ahead of us: the towers stand against the light and
 * their long shadows cross the avenue; through the build it sinks and reddens; seen from above on the drop the city
 * is a sundial, and the monolith's shadow runs across it.
 * At night (« Nuit sodium »): no sun, sodium lamps along the avenue, pools of orange light on the wet road; on the
 * kick they waver, on the drop they go out and come back on one after the other down the avenue.
 */
/** The sun's azimuth: ahead (-z) and about 24° to the right of the avenue. */
const SUN_AZ = -1.15;

export const monolith = defineShaderScene({
  id: "monolith",
  name: "Monolithe",
  energy: "calm",
  hdr: true,
  renderScale: 0.85,
  mask: true,
  // a lot (2.6 units) every ~1.7 s at cruise; each kick adds a gentle surge
  flight: { cruise: 1.5, pump: 0.3 },
  description:
    "Avenue brutaliste sous un soleil rasant : on la remonte au ras du sol, on accélère pendant la montée, on décolle au-dessus des toits au drop.",
  params: [
    paletteParam("concrete"),
    ...flightParams(1, 1.3),
    { type: "range", key: "sun", label: "Hauteur du soleil", min: 0.05, max: 0.6, step: 0.01, default: 0.2 },
    { type: "range", key: "dust", label: "Poussière", min: 0, max: 2, step: 0.05, default: 1 },
    {
      type: "select",
      key: "monument",
      label: "Au bout de l'avenue",
      options: [
        { value: "slab", label: "Le monolithe" },
        { value: "head", label: "Une tête colossale" },
      ],
      default: "slab",
    },
    headParam("moai"),
    { type: "toggle", key: "night", label: "Nuit (lampadaires sodium)", default: false },
    { type: "toggle", key: "letterbox", label: "Format cinéma 2.39 (bandes noires)", default: false },
  ],
  uniforms: () => ({
    // low ahead, a little to the right of the avenue's axis (-z)
    uSunAz: { value: SUN_AZ },
    uSunEl: { value: 0.2 },
    uDusk: { value: 0 },
    uSunUp: { value: 0 },
    uNight: { value: 0 },
    uCascade: { value: 1 },
    uBarPos: { value: 0 },
    uRise: { value: 1 },
    uDust: { value: 1 },
    uMonument: { value: 0 },
    // the title plan: the flight rises over the roofs to face the inscription (0..1)
    uTitleView: { value: 0 },
    uSlabScreen: { value: 0 },
    uCinema: { value: 0 },
    ...headUniforms(),
  }),
  update(u, f, p, dt) {
    // On the drop the monolith lights up like a giant screen, then goes dark again over a few bars
    const barS = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;
    u.uSlabScreen.value = f.drop ? 1 : (u.uSlabScreen.value as number) * Math.exp(-dt / (barS * 2.5));
    u.uSunEl.value = num(p.sun, 0.2);
    // Through the build the sun sinks and reddens; it comes back up slowly after
    const dusk = f.section === "build" ? f.buildProgress : 0;
    const d0 = u.uDusk.value as number;
    u.uDusk.value = f.drop ? 0 : d0 + (dusk - d0) * (1 - Math.exp(-dt * (dusk > d0 ? 1 : 0.12)));
    // ...and on the drop it springs back up: the light floods the city, the towers' shadows draw the sundial
    u.uSunUp.value = f.drop ? 1 : (u.uSunUp.value as number) * Math.exp(-dt / (barS * 4));
    u.uNight.value = p.night === true ? 1 : 0;
    // Night: on the drop the lamps go out and come back on one after the other down the avenue (over two bars)
    const c0 = u.uCascade.value as number;
    u.uCascade.value = f.drop ? 0 : Math.min(1, c0 + dt / (barS * 2));
    u.uBarPos.value = f.bpm > 0 ? f.bar + (f.beatInBar + f.beatPhase) / 4 : f.time / 2;
    // The city moves at its own pace: towers rise and settle over a phrase, quieter in the breakdown
    const rise = f.section === "breakdown" ? 0.3 : 1;
    const r = u.uRise.value as number;
    u.uRise.value = r + (rise - r) * (1 - Math.exp(-dt * 0.3));
    u.uDust.value = num(p.dust, 1);
    u.uCinema.value = p.letterbox === true ? 1 : 0;
    // the colossal head once it is loaded (or the night's title once drawn), the slab until then
    u.uMonument.value = p.monument === "head" && setHead(u, p.head ?? "moai", "", p) ? 1 : 0;
    const titled = (u.uMonument.value as number) > 0.5 && (u.uHeadOn.value as number) > 1.5;
    const tv = u.uTitleView.value as number;
    u.uTitleView.value = tv + ((titled ? 1 : 0) - tv) * (1 - Math.exp(-dt * 0.8));
  },
  fragment: /* glsl */ `
uniform float uSunAz;
uniform float uSunEl;
uniform float uDusk;     // the build: the sun sinks and reddens
uniform float uSunUp;    // the drop: the sun springs back up
uniform float uNight;    // sodium night: no sun, lamps
uniform float uCascade;  // night drop: how far down the avenue the lamps are back on (0..1)
uniform float uBarPos;
uniform float uRise;
uniform float uDust;
uniform float uTitleView;  // the title plan: up over the roofs, facing the inscription
uniform float uCinema;
uniform float uSlabScreen;
uniform float uMonument;  // 0: the black slab, 1: a colossal head
${ART_LIB}
${HEAD_GLSL}
${FLIGHT_GLSL}
#define CS 2.6
vec3 gSun;
vec3 gSunC;   // the sun's colour (it reddens through the build)
vec3 gRo;

float sdRBox(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b + r; return length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.) - r; }

/** Four random numbers per lot in one go (Dave Hoskins' hash42). */
vec4 hash42(vec2 c) {
  vec4 p4 = fract(vec4(c.xyxy) * vec4(.1031, .103, .0973, .1099));
  p4 += dot(p4, p4.wzxy + 33.33);
  return fract((p4.xxyz + p4.yzzw) * p4.zywx);
}

/** Shadows, occlusion and dust skip the small details (grooves, skywalks). */
bool gCheap = false;

/** The two middle columns are the avenue; a quarter of the other lots stay empty. */
bool built(vec4 h, vec2 c) { return abs(c.x + .5) > 1. && h.w > .25; }

/** Lot height; a few towers rise and settle back over a phrase (8 bars), each on its own phase. */
float lotH(vec4 h, vec4 k) {
  float rise = smoothstep(.55, 1., sin(uBarPos * .7854 + k.x * 6.283)) * uRise * 1.4;
  return 1.3 + h.z * h.z * 7. + rise;
}

/** One lot: four brutalist archetypes (tower, cantilever, stacked volumes, ribbed facade). */
float lot(vec2 c, vec3 p, vec4 h, vec4 k) {
  vec2 lp = p.xz - (c + .5) * CS;
  vec2 off = (h.xy - .5) * .5;
  vec2 sz = .34 + .4 * k.yz;
  float H = lotH(h, k);
  vec3 q = vec3(lp.x - off.x, p.y - H * .5, lp.y - off.y);
  float bound = sdBox(q, vec3(sz.x + .2, H * .5 + .05, sz.y + .2));
  if (bound > .25) return bound;
  float type = floor(k.w * 4.);
  if (type < .5) return sdRBox(q, vec3(sz.x, H * .5, sz.y), .025);
  if (type < 1.5) {
    // A slab cantilevered toward the avenue over a narrower base
    float dir = c.x < -.5 ? 1. : -1.;
    float base = sdRBox(q - vec3(-dir * sz.x * .35, -H * .12, 0.), vec3(sz.x * .6, H * .38, sz.y), .025);
    float slab = sdRBox(q - vec3(dir * .12, H * .38, 0.), vec3(sz.x, H * .12, sz.y * .95), .025);
    return min(base, slab);
  }
  if (type < 2.5) {
    float a = sdRBox(q - vec3(0., -H * .25, 0.), vec3(sz.x, H * .25, sz.y), .025);
    float b = sdRBox(q - vec3(.1, H * .14, -.08), vec3(sz.x * .78, H * .14, sz.y * .8), .025);
    float e = sdRBox(q - vec3(-.06, H * .39, .05), vec3(sz.x * .52, H * .11, sz.y * .55), .025);
    return min(a, min(b, e));
  }
  // Vertical ribs (brise-soleil): grooves cut into every face
  float d = sdRBox(q, vec3(sz.x, H * .5, sz.y), .02);
  if (gCheap) return d;
  const float P = .44;
  float rx = mod(q.x + P * .5, P) - P * .5;
  float rz = mod(q.z + P * .5, P) - P * .5;
  // Grooves flatten out with distance: too fine to resolve, they would only shimmer
  float depth = .09 * (1. - smoothstep(4., 10., length(p - gRo)));
  if (depth < .002) return d;
  float g = sdBox(vec3(rx, q.y + .1, abs(q.z) - sz.y), vec3(P * .2, H * .5 - .25, depth));
  g = min(g, sdBox(vec3(abs(q.x) - sz.x, q.y + .1, rz), vec3(depth, H * .5 - .25, P * .2)));
  return max(d, -g);
}

/** Half of a skywalk between two towers of the same side; both lots draw their half up to the shared edge. */
float walk(vec2 c, vec3 p, float side, vec4 h, vec4 k) {
  vec2 key = vec2(c.x, c.y + max(side, 0.));
  float hk = hash12(key * 3.7 + 1.3);
  if (hk < .8) return 1e3;
  vec2 cn = c + vec2(0., side);
  vec4 hn = hash42(cn), kn = hash42(cn + 17.31);
  if (!built(hn, cn)) return 1e3;
  float y = min(lotH(h, k), lotH(hn, kn)) * (.35 + 1.75 * (hk - .8));
  vec2 lp = p.xz - (c + .5) * CS;
  return sdBox(vec3(lp.x, p.y - y, lp.y - side * CS * .25), vec3(.16, .11, CS * .25));
}

float lotAndWalks(vec2 c, vec3 p) {
  vec4 h = hash42(c);
  if (!built(h, c)) return 1e3;
  vec4 k = hash42(c + 17.31);
  float d = lot(c, p, h, k);
  if (!gCheap && p.y < 6.5) d = min(d, min(walk(c, p, 1., h, k), walk(c, p, -1., h, k)));
  return d;
}

/** What the last map() hit: 0 building, 1 a surveillance camera, 2 its red light. */
float gMatM = 0.;

/** One surveillance camera on its pole at the edge of the avenue, turned toward us. */
float camOne(vec3 p, float cz, float side, out float mat) {
  mat = 1.;
  // more and more of them as the night drifts
  if (hash12(vec2(cz * 1.7, side * 3.1 + 7.7)) > .15 + .7 * uDrift) return 1e3;
  vec3 base = vec3(side * 2.45, 0., (cz + .5) * CS);
  vec3 q = p - base;
  float pole = length(vec2(q.x, q.z)) - .045;
  // well below the head, the pole is all there is (the head is at least this far)
  if (q.y < 2.6) return min(pole, 2.75 - q.y);
  vec3 head = vec3(-side * .3, 3.15, 0.);
  float d = min(sdCapsule(q, vec3(0.), vec3(0., 3.1, 0.), .045), sdCapsule(q, vec3(0., 3.05, 0.), head, .03));
  vec3 to = gRo - (base + head);
  vec3 hq = q - head;
  hq.xz *= rot(atan(to.x, to.z));
  hq.yz *= rot(atan(to.y, length(to.xz)));
  // a box camera with its hood and lens, big enough to read as a camera, not a street lamp
  d = min(d, min(sdRBox(hq, vec3(.12, .1, .26), .02), sdCapsule(hq, vec3(0., 0., .16), vec3(0., 0., .32), .065)));
  d = min(d, sdBox(hq - vec3(0., .12, .06), vec3(.14, .015, .3)));
  float led = length(hq - vec3(.07, .1, .22)) - .02;
  if (led < d) { mat = 2.; d = led; }
  return d;
}

/** The cameras along both edges of the avenue (this cell and the nearest neighbour along it). */
float camsD(vec3 p, out float mat) {
  mat = 0.;
  float ex = abs(abs(p.x) - 2.45);
  if (ex > .7 || p.y > 3.7) return max(ex - .55, p.y - 3.5);
  float side = p.x > 0. ? 1. : -1.;
  float cz = floor(p.z / CS);
  float fr = fract(p.z / CS);
  float m1, m2;
  float d1 = camOne(p, cz, side, m1);
  // the neighbouring camera only matters near the edge of the cell (it reaches .7 into ours at most)
  float edge = (.5 - abs(fr - .5)) * CS;
  if (edge > .75) { mat = m1; return min(d1, edge - .7); }
  float d2 = camOne(p, cz + (fr < .5 ? -1. : 1.), side, m2);
  mat = d1 < d2 ? m1 : m2;
  return min(d1, d2);
}

/** Buildings only: the ground is intersected analytically (grazing rays would crawl along it). */
float map(vec3 p) {
  vec2 g = p.xz / CS;
  vec2 c = floor(g);
  vec2 f = g - c;
  vec2 o = vec2(f.x < .5 ? -1. : 1., f.y < .5 ? -1. : 1.);
  // The 4 nearest lots; anything further is at least the distance to the far edges of this cell
  float d = min(min(lotAndWalks(c, p), lotAndWalks(c + vec2(o.x, 0.), p)), min(lotAndWalks(c + vec2(0., o.y), p), lotAndWalks(c + o, p)));
  vec2 far = (.5 + abs(f - .5)) * CS;
  d = min(d, min(far.x, far.y));
  gMatM = 0.;
  if (!gCheap) {
    float cm;
    float dc = camsD(p, cm);
    if (dc < d) { d = dc; gMatM = cm; }
  }
  return d;
}

float marchB(vec3 ro, vec3 rd, float tmax) {
  float t = .02;
  for (int i = 0; i < 100; i++) {
    float d = map(ro + rd * t);
    if (d < .0008 * t) return t;
    t += d;
    if (t > tmax) break;
  }
  return -1.;
}

/** Soft shadow that hardens near the contact point. */
/** Interleaved gradient noise: an even, fine dither (white noise clumps into grain). */
float ign(vec2 fc) { return fract(52.9829189 * fract(dot(fc, vec2(.06711056, .00583715)))); }

/** The monolith (always 40 ahead) as a box: where a ray enters it, or -1. */
float slabHit(vec3 ro, vec3 rd) {
  vec3 c = vec3(0., 12., gRo.z - 40.);
  vec3 m = 1. / rd;
  vec3 n = m * (ro - c);
  vec3 k = abs(m) * vec3(2.4, 12., .3);
  vec3 t1 = -n - k, t2 = -n + k;
  float tN = max(max(t1.x, t1.y), t1.z), tF = min(min(t2.x, t2.y), t2.z);
  return (tN > tF || tF < 0.) ? -1. : tN;
}

float shadow(vec3 ro, vec3 rd) {
  // the monolith's own shadow, long across the city (seen from above on the drop)
  if (uMonument < .5 && slabHit(ro, rd) > 0.) return 0.;
  gCheap = true;
  // The fixed steps would print fans of lines around the edges: a small ordered offset (interleaved gradient
  // noise) breaks them up without the speckle a random one leaves in the penumbra
  float res = 1., t = .03 + .015 * ign(gl_FragCoord.xy), ph = 1e10;
  for (int i = 0; i < 36; i++) {
    float h = map(ro + rd * t);
    if (h < 0.) { res = 0.; break; }
    float y = h * h / (2. * ph);
    float d = sqrt(max(h * h - y * y, 0.));
    res = min(res, 8. * d / max(t - y, .0001));
    ph = h;
    t += clamp(h, .03, .6);
    // (beyond 16 the haze has the last word: against a low sun the rays would cross half the city)
    if (res < .004 || t > 16. || ro.y + rd.y * t > 10.) break;
  }
  gCheap = false;
  res = clamp(res, 0., 1.);
  return res * res * (3. - 2. * res);
}

vec3 nrm(vec3 p) {
  const vec2 k = vec2(1, -1);
  const float h = .0015;
  return normalize(k.xyy * map(p + k.xyy * h) + k.yyx * map(p + k.yyx * h) + k.yxy * map(p + k.yxy * h) + k.xxx * map(p + k.xxx * h));
}

float ao(vec3 p, vec3 n) {
  gCheap = true;
  float occ = 0., sca = 1.;
  for (int i = 0; i < 3; i++) { float h = .06 + .3 * float(i); occ += (h - map(p + n * h)) * sca; sca *= .6; }
  gCheap = false;
  return clamp(1. - 1.5 * occ, 0., 1.);
}

const float COL_S = 12.;
/** Scale of the colossus, and of the night's title. */
float gColS = COL_S;
/** The title's inscription: its scale, its distance ahead, the height of its middle (above the roofs). */
const float TITLE_S = 11.;
const float TITLE_D = 32.;
const float TITLE_Y = 11.5;
/**
 * The colossus: a giant head buried up to the lips at the end of the avenue, always on the horizon. The night's
 * title hangs there instead, a great concrete inscription above the roofs, which the flight rises to face.
 */
float colossus(vec3 ro, vec3 rd, out vec3 c) {
  bool title = uHeadOn > 1.5;
  gColS = title ? TITLE_S : COL_S;
  // (the Patron stands higher: his moustache must show above the roofs' haze)
  bool patron = uHeadOn > .2 && uHeadOn < .5;
  c = title
    ? vec3(0., TITLE_Y - (uHeadMin.y + uHeadSize.y * .5) * TITLE_S, ro.z - TITLE_D)
    : vec3(0., COL_S * (patron ? .58 : .3), ro.z - 42.);
  vec3 oc = ro - c;
  float R = gColS * (title ? length(uHeadSize.xy) * .5 + .1 : 1.2);
  float b = dot(oc, rd), h = b * b - dot(oc, oc) + R * R;
  if (h < 0.) return -1.;
  h = sqrt(h);
  float t = max(-b - h, 0.), t1 = -b + h;
  for (int i = 0; i < 64; i++) {
    float d = headD((ro + rd * t - c) / gColS) * gColS;
    if (d < .002 * t) return t;
    t += d;
    if (t > t1) break;
  }
  return -1.;
}

/**
 * Dust motes hanging in the air near the lens, on planes that come at the camera as it travels: they rush
 * past and stretch into streaks with the speed.
 */
float motes(vec2 uv, float focal, float tHit) {
  float acc = 0.;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    const float SPAN = 6.;
    float phase = uTravel / SPAN + fi * .25;
    float z = .4 + SPAN * (1. - fract(phase));
    if (tHit > 0. && z > tHit) continue;
    vec2 w = uv * z / focal / .5;
    vec2 id = floor(w);
    float seed = floor(phase) * 13.1 + fi * 7.7;
    float h = hash12(id + seed);
    if (h < .75) continue;
    vec2 o = (vec2(hash12(id + seed + 1.3), hash12(id + seed + 4.7)) - .5) * .7;
    vec2 d = (w - id - .5 - o) * .5;
    // stretched along the flow of the flight (away from the centre of the frame)
    vec2 dir = normalize(uv + 1e-4);
    float along = dot(d, dir) / (1. + uSpeed * 10. / z);
    float r = length(vec2(along, dot(d, vec2(-dir.y, dir.x))));
    float size = .006 + .004 * h;
    float fade = smoothstep(.4, 1.2, z) * (1. - smoothstep(4., 6.4, z));
    acc += (1. - smoothstep(size * .3, size, r)) * fade * (.5 + .5 * h);
  }
  return acc;
}

/** Thin line where fract(x) wraps, width w (in units of one period). */
float joint(float x, float w) { float f = fract(x); return 1. - smoothstep(0., w, min(f, 1. - f)); }

// ---------------------------------------------------------------- sodium night
const vec3 LAMP = vec3(1., .55, .2);
const float LS = 5.2;   // a lamp every LS on each side, staggered

vec3 lampPos(float k, float side) { return vec3(side * 2.15, 3., (k + (side > 0. ? 0. : .5)) * LS); }

/** Is this lamp on: the drop puts them out, they come back on one after the other; the kick makes some waver. */
float lampOn(vec3 L) {
  float ahead = gRo.z - L.z;
  float on = 1. - smoothstep(uCascade * 60. - 3., uCascade * 60. + 1., ahead);
  return on * (1. - .35 * uBeat * step(.7, hash12(L.xz * .37)));
}

/** Light of the nearest lamps on a surface: sodium orange, thrown downward. */
vec3 lampLight(vec3 p, vec3 n) {
  vec3 acc = vec3(0.);
  for (int s = 0; s < 2; s++) {
    float side = s == 0 ? 1. : -1.;
    float k0 = floor(p.z / LS - (side > 0. ? 0. : .5) + .5);
    for (int j = -1; j <= 1; j++) {
      vec3 L = lampPos(k0 + float(j), side);
      vec3 d = L - p;
      float r2 = dot(d, d);
      float ir = inversesqrt(r2);
      float ndl = max(dot(n, d * ir), 0.);
      // a sodium lamp throws its light down: a pool under it, darkness between two
      float cone = .15 + .85 * smoothstep(.45, .95, d.y * ir);
      acc += LAMP * ndl * cone * lampOn(L) * 11. / (1. + r2 * 2.4);
    }
  }
  return acc;
}

/** The lamp heads seen along a ray (their glow in the haze); tmax: what the ray hit. */
vec3 lampGlow(vec3 ro, vec3 rd, float tmax, float pa) {
  vec3 acc = vec3(0.);
  float k0 = floor(gRo.z / LS) + 1.;
  for (int i = 0; i < 10; i++) {
    for (int s = 0; s < 2; s++) {
      vec3 L = lampPos(k0 - float(i), s == 0 ? 1. : -1.);
      vec3 w = L - ro;
      float along = dot(w, rd);
      if (along < 0. || (tmax > 0. && along > tmax + .2)) continue;
      float d = length(w - rd * along);
      float px = max(along * pa, .05);
      acc += LAMP * lampOn(L) * (exp(-d * d / (px * px * 2.)) * 3. + exp(-d * 2.5) * .22) * exp(-along * .035);
    }
  }
  return acc;
}

vec3 fogColor(vec3 rd) {
  float s = max(dot(rd, gSun), 0.);
  // night: a dark orange haze, the lamps' glow low over the avenue
  if (uNight > .5) return uBase * .8 + LAMP * .06 * (1. - smoothstep(0., .3, abs(rd.y)));
  // against the light: the haze glows toward the sun, stays cool and dim away from it
  return mix(uBase * .8 + uInk * .14, gSunC * 1.15, pow(s, 4.) * .85) + gSunC * pow(s, 32.) * .4;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  uv *= rot(uBank);
  uv += flightShake();
  float az = uSunAz + .05 * sin(uTime * .05);
  gSun = normalize(vec3(cos(az) * .9, uSunEl * (1. - .55 * uDusk) + .25 * uSunUp, sin(az) * .9));
  gSunC = mix(uAccent * vec3(1.08, .86, .62) * 1.2, vec3(1., .4, .17), uDusk * .75);

  // Flight: low along the avenue, high over the roofs when the drop takes off
  // On top of the flight's moves, a weave across the avenue and a swell in altitude tied to the distance
  // travelled: the faster we go, the faster we weave. The camera looks into its turns.
  float weave = sin(uTravel * .11), swell = sin(uTravel * .07 + 1.3);
  float alt = .55 + .22 * swell + (uDive > 0. ? uDive * uDive * 4.2 : uDive * .38);
  // Over the night the water rises in the avenue: the towers stand in it, the camera flies above it
  float W = .32 * smoothstep(.2, 1., uDrift) - .02;
  float level = max(W, 0.);
  // (the avenue is 5.2 wide: stay clear of the facades)
  vec3 ro = vec3(clamp(uSway * 1.6 + .5 * weave, -1.9, 1.9), max(alt, .2) + level, -uTravel);
  // the title plan: up over the roofs, level with the inscription, facing it
  float tv = smoothstep(0., 1., uTitleView);
  ro.y = mix(ro.y, TITLE_Y - .5 + .3 * swell, tv);
  ro.x *= 1. - .7 * tv;
  gRo = ro;
  float pitch = mix(.55, -2.4, smoothstep(.5, 1.5, uDive)) + .35 * smoothstep(0., 1., -uDive) + .12 * swell;
  vec3 ta = ro + vec3(.25 * sin(uTime * .1) + uSway * .7 + .45 * cos(uTravel * .11), pitch, -4.);
  ta = mix(ta, vec3(0., TITLE_Y, ro.z - TITLE_D), tv);
  uv *= rot(-.07 * cos(uTravel * .11));
  float focal = flightFocal(1.35);
  vec3 rd = lookAt(ro, ta) * normalize(vec3(uv, focal));

  vec3 sky = mix(uInk * .6 + uBase * .5, uBase * 1.4, clamp(rd.y * 1.6, 0., 1.));
  float sd = max(dot(rd, gSun), 0.);
  sky += gSunC * (pow(sd, 4.) * .4 + pow(sd, 24.) * .8 + smoothstep(.9994, .9998, sd) * 2.2);
  if (uNight > .5) sky = uBase * .6 + LAMP * .07 * exp(-max(rd.y, 0.) * 6.);
  float pa = 1. / (uRes.y * focal);
  // the haze thins out high up (the drop sees the whole city)
  float fogK = .018 * mix(1., .4, smoothstep(1., 4., ro.y));

  // Ground plane intersected analytically; the march only looks for buildings in front of it
  float tg = rd.y < -.0001 ? (ro.y - level) / -rd.y : 1e5;
  float t = marchB(ro, rd, min(tg, 46.));
  bool ground = false;
  if (t < 0. && tg < 46.) { t = tg; ground = true; }
  // The monolith: a black slab standing at the end of the avenue, always on the horizon
  float tm = -1.;
  vec3 cc;
  if (uMonument > .5) tm = colossus(ro, rd, cc);
  else if (rd.z < -.01) {
    float tt = -40. / rd.z;
    vec3 q = ro + rd * tt;
    if (abs(q.x) < 2.4 && q.y < 24. && q.y > 0.) tm = tt;
  }

  vec3 col = sky;
  float solid = step(0., t);
  if (tm > 0. && (t < 0. || t > tm)) {
    if (uMonument > .5) {
      // Weathered stone in the low sun, softened by the distance; its edges flare on the drop
      vec3 q = (ro + rd * tm - cc) / gColS;
      const vec2 k = vec2(1, -1);
      const float e = .004;
      vec3 n = normalize(k.xyy * headD(q + k.xyy * e) + k.yyx * headD(q + k.yyx * e) + k.yxy * headD(q + k.yxy * e) + k.xxx * headD(q + k.xxx * e));
      float dif = clamp(dot(n, gSun), 0., 1.);
      vec3 alb = uInk * .75 * (.88 + .18 * vnoise(q * 18.));
      // against the light: a dark face, its edges haloed by the sun behind it
      float rim = pow(1. - clamp(dot(n, -rd), 0., 1.), 3.) * (.5 + 1.2 * uDrop) * smoothstep(.3, .95, dot(rd, gSun));
      col = alb * (dif * gSunC * 2.6 * (1. + uDrop) + uBase * 1.2 * (.5 + .5 * n.y)) + gSunC * (rim * 1.4 + pow(1. - clamp(dot(n, -rd), 0., 1.), 3.) * dif * .5);
      col *= 1. - .6 * uNight;
      // (the title, against the sun: a dark inscription edged with light, the haze kept off it so it stands out)
      col = mix(col, fogColor(rd), uHeadOn > 1.5 ? .08 : .3);
    } else {
      // Near black, with a thin sunlit edge on the side facing the sun
      vec3 q = ro + rd * tm;
      float rim = smoothstep(2.25, 2.4, q.x * sign(gSun.x)) * (.4 + 1.2 * uDrop) * (1. - uNight);
      vec3 slab = uBase * .1 + gSunC * rim;
      // ...until the drop lights it up like a giant screen
      if (uSlabScreen > .01) {
        vec2 su = vec2((q.x + 2.4) / 4.8, q.y / 24.);
        vec3 scr = mix(pal(fract(su.y * .5 + su.x * .2 + uTime * .04)), uInk, .35);
        scr *= .75 + .25 * smoothstep(-.3, .3, sin(su.y * 75.));
        scr += uInk * .5 * exp(-pow((su.y - fract(uTime * .25)) * 9., 2.));
        slab = mix(slab, scr * 1.5, uSlabScreen);
      }
      col = mix(slab, fogColor(rd), .22);
    }
    t = -1.;
    solid = 1.;
  }
  if (t > 0. && ground && W > 0.) {
    // The water: the city reflected, rippling, rings spreading on the kick
    vec3 p = ro + rd * t;
    vec2 rel = p.xz - ro.xz;
    vec3 wn = vec3(.015 * sin(p.x * 3.1 + uTime * 1.3) + .01 * sin(p.z * 5.3 - uTime * .9), 1., .015 * sin(p.z * 2.3 - uTime));
    wn.xz += .05 * uBeat * sin(length(rel) * 5. - uTime * 7.) * normalize(rel + 1e-4);
    wn = normalize(wn);
    vec3 rr = reflect(rd, wn);
    gCheap = true;
    float tr = marchB(p + vec3(0., .01, 0.), rr, 30.);
    gCheap = false;
    vec3 refl = uNight > .5 ? uBase * .6 : mix(uInk * .6 + uBase * .5, uBase * 1.4, clamp(rr.y * 1.6, 0., 1.)) + gSunC * pow(max(dot(rr, gSun), 0.), 24.) * .8;
    if (tr > 0.) {
      vec3 q = p + rr * tr;
      vec3 qn = nrm(q);
      refl = uInk * .7 * (clamp(dot(qn, gSun), 0., 1.) * gSunC * 2.5 * (1. - uNight) + uBase * 1.2);
      if (uNight > .5) refl += uInk * .5 * lampLight(q, qn);
      refl = mix(refl, fogColor(rr), 1. - exp(-(t + tr) * fogK));
    }
    if (uNight > .5) refl += lampGlow(p, rr, tr, pa) * .6;
    float fre = .3 + .7 * pow(1. - clamp(dot(wn, -rd), 0., 1.), 4.);
    col = mix(uBase * .45 + uInk * .03, refl, fre);
    col = mix(col, fogColor(rd), max(1. - exp(-t * fogK), smoothstep(30., 46., t)));
  } else if (t > 0.) {
    vec3 p = ro + rd * t;
    map(p);
    float mm = ground ? 0. : gMatM;
    vec3 n = ground ? vec3(0., 1., 0.) : nrm(p);
    float sh = uNight > .5 ? 0. : shadow(p + n * .01, gSun);
    float dif = clamp(dot(n, gSun), 0., 1.) * sh;
    float occ = ao(p, n);
    vec2 c = floor(p.xz / CS);
    float fade = 1. - smoothstep(4., 11., t);
    vec3 alb;
    if (ground) {
      // Ground: big cast-concrete slabs, dusty
      alb = uInk * .55 * (.9 + .15 * vnoise(p * 1.7));
      vec2 gw = fwidth(p.xz / 1.3);
      alb *= 1. - .25 * fade * max(joint(p.x / 1.3, .012), joint(p.z / 1.3, .012)) * (1. - smoothstep(.006, .015, max(gw.x, gw.y)));
    } else if (mm > .5) {
      // a surveillance camera: dark metal
      alb = vec3(.05, .05, .06);
    } else {
      float H = lotH(hash42(c), hash42(c + 17.31));
      alb = uInk * .85 * (.88 + .2 * hash12(c + 21.));
      // Darker at the foot of the walls
      occ *= .6 + .4 * smoothstep(0., .9, p.y);
      vec2 f = vec2(abs(n.x) > abs(n.z) ? p.z : p.x, p.y);
      // Formwork: board joints, panel seams, tie holes. Each pattern fades out once it gets
      // smaller than a few pixels (far away or seen at a grazing angle) instead of turning into moiré.
      vec2 cell = f / vec2(.3, .225);
      vec2 fw = fwidth(cell);
      // ...and at grazing angles, where even fwidth lets stripes through
      float facing = smoothstep(.12, .4, abs(dot(n, rd)));
      // (holes only while a cell spans 20+ pixels: smaller, they turn into speckle)
      float holes = (1. - smoothstep(.018, .03, length((fract(cell) - .5) * vec2(.3, .225)))) * (1. - smoothstep(.025, .05, max(fw.x, fw.y)));
      float jy = joint(f.y / .45, .04) * (1. - smoothstep(.02, .05, fwidth(f.y / .45)));
      float jx = joint(f.x / 1.2, .012) * (1. - smoothstep(.006, .015, fwidth(f.x / 1.2)));
      alb *= 1. - facing * (fade * (.2 * jy + .14 * jx) + .16 * holes * step(abs(n.y), .5));
      // Rain streaks hanging under the top edge, and broader stains
      float streak = smoothstep(.45, .85, vnoise(vec3(f.x * 3.2, p.y * .18, hash12(c) * 50.))) * exp(-max(H - p.y, 0.) * .25);
      streak *= (1. - smoothstep(.25, .6, fwidth(f.x * 3.2))) * facing; // facades seen edge-on would turn the streaks into moiré
      alb *= (1. - .18 * streak * (1. - smoothstep(8., 22., t))) * (.93 + .14 * vnoise(vec3(f * 1.1, c.x)));
    }
    vec3 sunCol = gSunC * 3.4 * (1. + uDrop) * (1. - uNight);
    // the shadowed side stays dark: one sun, hard shadows
    vec3 skyCol = uBase * 1.15 * (.4 + .6 * n.y) * (1. - .7 * uNight);
    // Warm light bounced by the sunlit ground onto the lower facades
    vec3 bounce = gSunC * .4 * clamp(gSun.y * 3., 0., 1.) * (.5 - .5 * n.y) * exp(-p.y * .35) * (1. - uNight);
    col = alb * (dif * sunCol + (skyCol + bounce) * occ);
    if (uNight > .5) {
      col += alb * lampLight(p, n) * (.4 + .6 * occ);
      // the wet road mirrors the lamps, in long streaks
      if (ground) {
        vec3 wn = normalize(vec3(.03 * (vnoise(p * vec3(3., 0., .4)) - .5), 1., .2 * (vnoise(p * vec3(.6, 0., 2.5)) - .5)));
        col += lampGlow(p + vec3(0., .01, 0.), reflect(rd, wn), -1., pa) * .8;
      }
    }
    // its red light blinks on the beat
    if (mm > 1.5) col = vec3(1., .14, .1) * (.4 + 2.6 * uBeat);
    // Silent advertising screens on the facades facing the avenue (more of them as the night drifts)
    if (!ground && mm < .5 && -sign(p.x) * n.x > .9) {
      vec4 hp = hash42(c + 41.7);
      if (hp.x < .2 + .6 * uDrift) {
        vec2 lc = (c + .5) * CS;
        vec2 pc = vec2(p.z - lc.y - (hp.y - .5) * .6, p.y - (1.3 + hp.z * 1.4));
        vec2 ps = vec2(.62, .4);
        vec2 dq = abs(pc) - ps;
        if (max(dq.x, dq.y) < 0.) {
          vec2 pu = pc / ps * .5 + .5;
          float tt = uTime * .3 + hp.w * 10.;
          vec3 ad = mix(pal(fract(hp.w + pu.y * .3 + tt * .1)), pal(fract(hp.w + .5)), smoothstep(.3, .7, pu.x + .2 * sin(tt)));
          ad += uInk * .8 * (1. - smoothstep(.18, .22, length(pu - vec2(.5 + .25 * sin(tt * 1.3), .5))));
          col = ad * (1.1 + .4 * uHat) * (1. - .7 * smoothstep(-.03, 0., max(dq.x, dq.y)));
        }
      }
    }
    float fog = max(1. - exp(-t * fogK), smoothstep(30., 46., t));
    col = mix(col, fogColor(rd), fog);
  }
  // night: the lamp heads in the haze
  if (uNight > .5) col += lampGlow(ro, rd, t, pa);

  // Dust lit by the sun, with shafts where the towers cut the light
  if (uDust > 0. && uNight < .5) {
    float tEnd = t > 0. ? min(t, 24.) : 24.;
    // a fixed, even dither and soft shadow edges: no flickering grain in the shafts
    float j = ign(fc);
    float lit = 0.;
    gCheap = true;
    for (int i = 0; i < 6; i++) {
      float s = (float(i) + j) / 6.;
      vec3 q = ro + rd * (tEnd * s * s);
      lit += smoothstep(.02, .35, min(map(q + gSun * 1.2), map(q + gSun * 4.5)));
    }
    gCheap = false;
    lit /= 6.;
    float phase = .25 + 1.6 * pow(sd, 5.);
    // the dust catches the light on the kick
    col += gSunC * lit * phase * uDust * .14 * (1. - exp(-tEnd * .08)) * (1. + uDrop + .6 * uBeat);
  }

  // dust right in front of the lens, lit by the sun; it flashes on the kick
  col += mix(uInk, uAccent, .6) * motes(uv, focal, t) * (.25 + .6 * uSpeed + .3 * uBeat);

  float l = dot(col, vec3(.3, .59, .11));
  col = mix(vec3(l), col, .78);
  col = mix(col * vec3(.92, .96, 1.06), col * vec3(1.06, 1., .92), smoothstep(.1, .7, l));
  float lb = uCinema > .5 ? letterbox(fc) : 1.;
  // Letterbox bars stay opaque: the background never shows through them
  gl_FragColor = vec4(hdrOut(col * .95) * lb, max(solid, 1. - lb));
}
`,
});
