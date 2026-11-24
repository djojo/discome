import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { DETAIL_GLSL } from "./detail.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";

const NS = 36;
const FLOORS = 4;
/** Angle of one cell (one sector of the ring). */
const W = (Math.PI * 2) / NS;
const RI = 6;

type V3 = [number, number, number];
/** A framing from where the camera stands and the point it looks at. */
function shot(pos: V3, target: V3, focal: number, weight: number, tag?: string): Framing {
  const dx = pos[0] - target[0];
  const dy = pos[1] - target[1];
  const dz = pos[2] - target[2];
  const dist = Math.hypot(dx, dy, dz);
  return { az: Math.atan2(dx, dz), el: Math.asin(dy / dist), dist, target, focal, weight, tag };
}
/** A point at angle a around the tower (the shader's atan(z, x)), height y, radius r. */
const around = (a: number, y: number, r: number): V3 => [Math.cos(a) * r, y, Math.sin(a) * r];

const FRAMINGS: Framing[] = [
  // low in the courtyard, against the ring: the tower, its eye and the far side
  shot(around(0.6, 0.6, 5.4), around(0.6 + Math.PI - 0.55, 6.6, 3.5), 1.2, 3, "wide"),
  // the watcher's view: high over the courtyard beside the tower, down at the galleries the beam sweeps
  shot(around(0.9, 8.2, 3.4), around(2.25, 2.6, RI), 1.4, 2, "wide"),
  // from the top floor, across the courtyard at the whole far side
  shot(around(-0.9, 5.6, 5), around(Math.PI - 0.4, 2.6, RI), 1.35, 2, "wide"),
  // from outside, over the roof of the ring, toward the tower
  shot(around(2.6, 10.5, 13), [0, 4.5, 0], 1.9, 2),
  // a row of cells, from the courtyard
  shot(around(-1.2, 2, 3), around(-0.3, 2.6, RI), 1.6, 2),
  // one cell, its occupant and its screen
  shot(around(7 * W + 0.12, 2.2, 3.9), around(7 * W, 2.45, RI + 0.5), 1.9, 2),
  // from the foot of the tower, looking up at the top floors
  shot(around(0.3, 0.4, 1.6), around(0.7, 5.5, RI), 1.3, 1),
];

/** What the beam and the screens remember from one frame to the next. */
interface State {
  goal: number;
  goalFl: number;
  dir: number;
  sinceKick: number;
  sinceDrop: number;
}

/**
 * The panopticon: a ring of concrete cells around a watchtower, at night. In every cell a figure is lit, cold blue,
 * by the screen in its hands (or, in an empty cell, by a screen on the wall). A searchlight in the tower's eye sweeps
 * the ring through the dust and, on each kick, stops on a cell; with no kick it sweeps on without stopping. A build
 * switches screens on and sends the beam further on each kick; on the drop every screen comes on at once and the eye
 * flashes, then the screens go out one by one. As the night drifts, more screens stay on.
 */
export const panopticon = defineShaderScene({
  id: "panopticon",
  name: "Panoptique",
  energy: "medium",
  hdr: true,
  renderScale: 0.8,
  mask: true,
  camera: { framings: FRAMINGS, glideBars: 2 },
  description:
    "Un anneau de cellules autour d'une tour de guet, la nuit ; dans chaque cellule une silhouette éclairée en bleu par son écran. Le projecteur balaie l'anneau dans la poussière et s'arrête sur une cellule à chaque kick ; au drop, tous les écrans s'allument et l'œil de la tour flashe.",
  params: [paletteParam("concrete")],
  uniforms: () => ({
    uBeamAz: { value: 0 },
    uBeamFl: { value: 1 },
    uBeamGain: { value: 1 },
    uDust: { value: 1 },
    uLit: { value: 0.3 },
    uAllLit: { value: 0 },
    uEye: { value: 0 },
    uTension: { value: 0 },
    uState: { value: { goal: 0, goalFl: 1, dir: 1, sinceKick: 99, sinceDrop: 1e6 } satisfies State },
  }),
  update(u, f, _p, dt, ctx) {
    const s = u.uState.value as State;
    const beat = f.bpm > 0 ? 60 / f.bpm : 0.5;
    const bar = beat * 4;
    const build = f.section === "build" ? f.buildProgress : 0;
    const tension = (u.uTension.value as number) + (build - (u.uTension.value as number)) * (1 - Math.exp(-dt / bar));
    u.uTension.value = tension;

    // The beam lands on a cell on each kick: the next one along the ring, further apart as a build rises
    if (f.beat) {
      const k = Math.round(s.goal / W);
      const skip = 1 + (Math.random() < 0.2 + 0.6 * build ? 1 : 0) + (Math.random() < 0.5 * build ? 1 : 0);
      s.goal = (k + s.dir * skip) * W;
      if (Math.random() < 0.3) s.goalFl = Math.floor(Math.random() * FLOORS);
      s.sinceKick = 0;
    }
    s.sinceKick += dt;
    // No kick for a while (a breakdown, a quiet intro): it sweeps on, slowly, without stopping
    if (s.sinceKick > beat * 2.5) s.goal += s.dir * 0.16 * dt;
    if (f.downbeat && f.phraseBar === 0 && Math.random() < 0.35) s.dir = -s.dir;
    let az = u.uBeamAz.value as number;
    az += (s.goal - az) * (1 - Math.exp(-dt * 16));
    // keep the angles small
    if (Math.abs(s.goal) > 60) {
      const turns = Math.round(s.goal / (Math.PI * 2)) * Math.PI * 2;
      s.goal -= turns;
      az -= turns;
    }
    u.uBeamAz.value = az;
    u.uBeamFl.value = (u.uBeamFl.value as number) + (s.goalFl - (u.uBeamFl.value as number)) * (1 - Math.exp(-dt * 10));

    // Screens: a share that grows over the night and through a build
    const lit = Math.min(0.94, 0.45 + 0.3 * f.drift + 0.45 * build + (f.section === "drop" ? 0.1 : 0));
    u.uLit.value = (u.uLit.value as number) + (lit - (u.uLit.value as number)) * (1 - Math.exp(-dt / bar));

    // The drop: every screen on at once for two bars, then they go out one by one over six; the eye flashes
    // (a short swell instead with "Limiter les flashs")
    s.sinceDrop = f.drop ? 0 : s.sinceDrop + dt;
    const sd = s.sinceDrop;
    u.uAllLit.value = sd < 2 * bar ? 1 : Math.max(0, 1 - (sd - 2 * bar) / (6 * bar));
    const eye = f.safeFlash
      ? 0.5 * Math.min(1, sd / 0.35) * Math.exp(-Math.max(0, sd - 0.35) / bar)
      : Math.exp(-sd / (bar * 0.35));
    u.uEye.value = eye;
    u.uBeamGain.value = (1 + 0.35 * tension) * (1 + 1.2 * eye);
    u.uDust.value = 1 + 1.3 * tension;
    if (f.drop) ctx.camera?.request("wide");
  },
  fragment: /* glsl */ `
uniform float uBeamAz;
uniform float uBeamFl;
uniform float uBeamGain;
uniform float uDust;
uniform float uLit;
uniform float uAllLit;
uniform float uEye;
uniform float uTension;
${ART_LIB}
${CAMERA_GLSL}
${DETAIL_GLSL}
const float NS = ${NS}.;
const float NF = ${FLOORS}.;
const float W = 6.2831853 / NS;
const float RI = ${RI}., RO = 7.4;   // the ring, inside and outside
const float FH = 1.6;                 // floor height
const float CB = .25, CT = 1.45;      // a cell's floor and ceiling, above its level
const float CD = 1.1;                 // depth of a cell
const float CW = .4;                  // half width of a cell
const float WW = .4;                  // the walkways in front of the cells
const float RH = NF * FH + .1;        // top of the ring
const vec3 EYE = vec3(0., 6.85, 0.);  // the middle of the tower's eye, a band of glass of radius GR
const float GR = 1.18;
const float TANA = .1;                // half-angle of the searchlight's cone (tangent)
const vec3 SCREEN = vec3(.2, .47, 1.);
float gMat;                           // 0 concrete, 1 screen, 2 figure, 3 the eye's glass, 4 tower concrete
vec2 gCell;                           // sector, floor
vec2 gHero = vec2(-1.);               // the cell a close framing looks at: its screen is always on
vec3 gLamp;                           // apex of the beam's cone, on the tower's axis
vec3 gV;                              // the beam's axis
vec3 gExit;                           // where it leaves the glass
float gS0;                            // how far that is from the apex

vec4 cellRand(vec2 c) {
  return vec4(hash12(c + uSeed * .37), hash12(c * 1.31 + uSeed + 3.7), hash12(c * .77 + uSeed + 7.1), hash12(c + uSeed + 11.9));
}

/** Where the occupant of a cell stands (sector frame), and k = (turn, size, bow, 1 if there is someone). */
void figOf(vec2 cell, out vec3 o, out vec4 k) {
  vec4 h = cellRand(cell);
  o = vec3(RI + .5 + .16 * h.y, cell.y * FH + CB, (h.z - .5) * .26);
  k = vec4((h.w - .5) * .7, .9 + .12 * h.y, .25 + .45 * h.z, cell == gHero ? 1. : step(.12, h.x));
}

/** A figure standing, feet at the origin, facing +z, head bowed over the screen in its hands. */
float figure(vec3 q, float bow, out float mat) {
  vec3 m = vec3(abs(q.x), q.y, q.z);
  float d = sdCapsule(m, vec3(.05, .04, 0.), vec3(.055, .44, 0.), .042);
  d = smin(d, sdEllipsoid(q - vec3(0., .63, -.005), vec3(.115, .2, .072)), .05);
  d = smin(d, sdCapsule(m, vec3(.03, .79, 0.), vec3(.1, .77, -.005), .045), .04);
  // arms down to the elbows, forearms up to the hands that hold the screen
  float arms = min(sdCapsule(m, vec3(.115, .76, 0.), vec3(.11, .6, .05), .03),
                   sdCapsule(m, vec3(.11, .6, .05), vec3(.04, .645, .17), .027));
  d = smin(d, arms, .03);
  vec3 hq = q - vec3(0., .82, 0.);
  hq.yz *= rot(-bow);
  float head = smin(sdEllipsoid(hq - vec3(0., .09, .01), vec3(.056, .068, .062)), sdCapsule(hq, vec3(0.), vec3(0., .05, 0.), .03), .03);
  d = smin(d, head, .02);
  // the screen, tilted up toward the face
  vec3 sq = q - vec3(0., .66, .19);
  sq.yz *= rot(-.927);
  float scr = sdBox(sq, vec3(.045, .065, .004));
  mat = scr < d ? 1. : 2.;
  return min(d, scr);
}

/** The ring of cells. In the frame of a sector, q.x runs out from the tower, q.z along the facade. */
float ringD(vec3 p) {
  float r = length(p.xz);
  float shell = max(max(RI - r, r - RO), max(-p.y, p.y - RH));
  // walkways in front of the cells (not on the ground floor): the nearest one, so that every level is seen
  float lv = clamp(floor((p.y - CB) / FH + .5), 1., NF - 1.);
  vec2 wd = abs(vec2(r - (RI - WW * .5), p.y - (lv * FH + CB - .04))) - vec2(WW * .5, .04);
  float walk = length(max(wd, 0.)) + min(max(wd.x, wd.y), 0.);
  gMat = 0.;
  float d = min(shell, walk);
  if (d > .5) return d;
  float id = floor(atan(p.z, p.x) / W + .5);
  vec3 q = p;
  q.xz *= rot(-id * W);
  float fl = clamp(floor(p.y / FH), 0., NF - 1.);
  float y0 = fl * FH;
  gCell = vec2(mod(id, NS), fl);
  // the cell, open on the courtyard, and a slit window in its back wall
  float room = sdBox(q - vec3(RI + (CD - .1) * .5, y0 + (CB + CT) * .5, 0.), vec3((CD + .1) * .5, (CT - CB) * .5, CW));
  float slit = sdBox(q - vec3(RO - .2, y0 + .95, 0.), vec3(.3, .2, .05));
  d = min(max(shell, -min(room, slit)), walk);
  if (room < .25) {
    vec3 o;
    vec4 k;
    figOf(gCell, o, k);
    if (k.w > .5) {
      vec3 f = q - o;
      vec3 fq = vec3(f.z, f.y, -f.x);
      fq.xz *= rot(k.x);
      float m;
      float fig = figure(fq / k.y, k.z, m) * k.y;
      if (fig < d) { d = fig; gMat = m; }
    } else {
      // nobody: only a screen on the back wall
      float scr = sdBox(q - vec3(RI + CD - .01, y0 + CB + .62, 0.), vec3(.02, .13, .21));
      if (scr < d) { d = scr; gMat = 1.; }
    }
  }
  return d;
}

float towerD(vec3 p) {
  float r = length(p.xz);
  float shaft = max(r - .7, max(-p.y, p.y - 6.4));
  float cabin = max(r - 1.25, abs(p.y - 6.85) - .5);
  // the eye: a band of glass all around, set back
  cabin = max(cabin, -max(1.18 - r, abs(p.y - 6.85) - .25));
  float roof = max(r - 1.55, abs(p.y - 7.42) - .07);
  float cap = max((r - 1. + (p.y - 7.49) * 1.6) * .53, max(7.49 - p.y, p.y - 7.95));
  return min(min(shaft, cabin), min(roof, cap));
}

float map(vec3 p) {
  float r = ringD(p);
  float t = towerD(p);
  if (t < r) {
    gMat = length(p.xz) < 1.21 && abs(p.y - 6.85) < .25 ? 3. : 4.;
    return t;
  }
  return r;
}

vec3 calcN(vec3 p) {
  const vec2 k = vec2(1, -1);
  const float h = .002;
  return normalize(k.xyy * map(p + k.xyy * h) + k.yyx * map(p + k.yyx * h) + k.yxy * map(p + k.yxy * h) + k.xxx * map(p + k.xxx * h));
}

float calcAO(vec3 p, vec3 n) {
  float occ = 0.;
  for (int i = 1; i <= 3; i++) {
    float h = .05 + .09 * float(i);
    occ += h - map(p + n * h);
  }
  return clamp(1. - 1.6 * occ, 0., 1.);
}

/** How bright a cell's screen is (0 = off). */
float screenOn(vec2 cell) {
  vec4 h = cellRand(cell + 17.);
  float on = step(h.x, uLit);
  // the last screens to come on stutter for a moment (or for good: a screen that is failing)
  on *= mix(1., step(.25, hash12(cell + floor(uTime * 7.))), step(uLit - .025, h.x));
  // the drop: all on, then they go out one by one
  on = max(on, step(h.y * .96 + .02, uAllLit));
  if (cell == gHero) on = 1.;
  // what plays on it: a slow shimmer, and a notification now and then on the hats
  on *= (.8 + .2 * sin(uTime * (.7 + 2. * h.z) + h.w * 6.28)) * (1. + .3 * uAllLit);
  return on * (1. + .8 * uHat * step(.9, hash12(cell + floor(uTime * 5.) + 3.)));
}

/** A cell's screen: where it is and which way it shines (world). */
void screenOf(vec2 cell, out vec3 S, out vec3 e) {
  vec3 o;
  vec4 k;
  figOf(cell, o, k);
  vec3 sq, eq;
  if (k.w > .5) {
    vec3 l = vec3(0., .66, .19) * k.y;
    vec3 el = vec3(0., .8, -.6);
    l.xz *= rot(-k.x);
    el.xz *= rot(-k.x);
    sq = vec3(-l.z, l.y, l.x) + o;
    eq = vec3(-el.z, el.y, el.x);
  } else {
    sq = vec3(RI + CD - .04, cell.y * FH + CB + .62, 0.);
    eq = vec3(-1., 0., 0.);
  }
  float a = cell.x * W;
  sq.xz *= rot(a);
  eq.xz *= rot(a);
  S = sq;
  e = eq;
}

/** A capsule between a point and a light, as a soft shadow (iq). */
float capShadow(vec3 ro, vec3 rd, float tmax, vec3 a, vec3 b, float r) {
  vec3 ba = b - a, oa = ro - a;
  float oad = dot(oa, rd), dba = dot(rd, ba), baba = dot(ba, ba), oaba = dot(oa, ba);
  vec2 th = vec2(-oad * baba + dba * oaba, oaba - oad * dba) / max(baba - dba * dba, 1e-4);
  th.x = max(th.x, 1e-4);
  th.y = clamp(th.y, 0., 1.);
  if (th.x > tmax) return 1.;
  float d = length(a + ba * th.y - ro - rd * th.x) - r;
  float s = clamp(6. * d / th.x + .5, 0., 1.);
  return s * s * (3. - 2. * s);
}

/**
 * The blue light of a cell's screen on a point: straight from the screen (the occupant's shadow on the walls behind),
 * the glow of the room, and what spills out of the opening onto the walkway and the courtyard.
 */
vec3 cellLight(vec3 p, vec3 n, vec2 cell, float onFig) {
  float on = screenOn(cell);
  if (on < .001) return vec3(0.);
  vec3 S, e;
  screenOf(cell, S, e);
  S += e * .02;
  vec3 L = S - p;
  float d2 = dot(L, L);
  vec3 l = L * inversesqrt(d2);
  float nl = clamp(mix(dot(n, l), 1., .25 * onFig), 0., 1.);
  float direct = clamp(dot(e, -l), 0., 1.) * nl / (1. + d2 * 12.) * 4.5;
  if (onFig < .5 && direct > 0.) {
    vec3 o;
    vec4 k;
    figOf(cell, o, k);
    if (k.w > .5) {
      vec3 a = o + vec3(0., .35 * k.y, 0.), b = o + vec3(0., .95 * k.y, 0.);
      a.xz *= rot(cell.x * W);
      b.xz *= rot(cell.x * W);
      direct *= capShadow(p, l, sqrt(d2), a, b, .12 * k.y);
    }
  }
  vec3 qp = p, qn = n;
  qp.xz *= rot(-cell.x * W);
  qn.xz *= rot(-cell.x * W);
  float room = smoothstep(RI - .05, RI + .15, qp.x) * step(qp.x, RI + CD + .02);
  vec3 Lo = vec3(RI + .12, cell.y * FH + CB + .55, 0.) - qp;
  float d2o = dot(Lo, Lo);
  vec3 lo = Lo * inversesqrt(d2o);
  float spill = clamp(lo.x, 0., 1.) * clamp(dot(qn, lo), 0., 1.) * 1.4 / (1. + d2o * 5.) * (1. - room);
  // the occupant also stands in the glow of its lit room: the whole silhouette shows, not only the face
  return SCREEN * on * (direct + room * .2 + spill + onFig * (.3 + .3 * clamp(-qn.x, 0., 1.)));
}

/**
 * The searchlight, aimed at the cell it is watching. Its cone leaves the tower through the middle of the eye; its
 * apex sits on the tower's axis (so that, seen from the lamp, everything lies in one vertical plane: see beamReach).
 */
void beamSetup() {
  vec2 dir = vec2(cos(uBeamAz), sin(uBeamAz));
  float rt = RI + .5, yt = uBeamFl * FH + CB + .55;
  float k = GR / rt;
  gLamp = vec3(0., (EYE.y - yt * k) / (1. - k), 0.);
  gExit = vec3(dir.x * GR, EYE.y, dir.y * GR);
  gV = normalize(vec3(dir.x * rt, yt, dir.y * rt) - gLamp);
  gS0 = length(gExit - gLamp);
}

/** How far inside the beam a point is (1 on the axis, 0 outside, and nothing inside the tower); s = its distance along the beam. */
float coneAt(vec3 x, vec3 v, out float s) {
  vec3 w = x - gLamp;
  s = dot(w, v);
  float u = length(w - v * s) / max(s * TANA, 1e-3);
  return (1. - smoothstep(.62, 1., u)) * (.45 + .55 * exp(-u * u * 4.)) * step(gS0, s);
}

/** Does the beam reach this point (radius r, height y), or do the walkways and the facade stop it? */
float beamReach(float r, float y) {
  float dy = y - gLamp.y;
  if (dy > -1e-3) return 0.;
  float vis = 1.;
  for (int k = 1; k < ${FLOORS}; k++) {
    float u = (float(k) * FH + CB - .04 - gLamp.y) / dy;
    if (u > 0. && u < 1.) {
      float rk = u * r;
      vis *= 1. - smoothstep(RI - WW - .03, RI - WW + .03, rk) * (1. - smoothstep(RI - .03, RI + .03, rk));
    }
  }
  if (r > RI) {
    float yf = gLamp.y + dy * RI / r;
    float l = yf - clamp(floor(yf / FH), 0., NF - 1.) * FH;
    vis *= smoothstep(CB - .03, CB + .03, l) * (1. - smoothstep(CT - .03, CT + .03, l));
  }
  return vis * (1. - smoothstep(RI + CD - .05, RI + CD + .05, r));
}

/** The dust lit by the beam along the ray, up to tmax: the cone, cut where it leaves the glass and at the cell's back. */
float beamVolume(vec3 ro, vec3 rd, float tmax, vec3 v, float jit) {
  // (a wider cone than the beam: the dust around it catches a little light too)
  float k = 1. / (1. + TANA * TANA * 2.6);
  vec3 co = ro - gLamp;
  float dv = dot(rd, v), cv = dot(co, v);
  float a = dv * dv - k;
  float b = dv * cv - k * dot(rd, co);
  float c = cv * cv - k * dot(co, co);
  float disc = b * b - a * c;
  if (abs(a) < 1e-6) a = 1e-6;
  float t0 = -1e5, t1 = 1e5;
  if (disc >= 0.) {
    float sq = sqrt(disc);
    float r1 = (-b - sq) / a, r2 = (-b + sq) / a;
    float lo = min(r1, r2), hi = max(r1, r2);
    if (a < 0.) { t0 = lo; t1 = hi; }
    else if (dv > 0.) t0 = hi;
    else t1 = lo;
  } else if (a < 0.) return 0.;
  float s0 = gS0, s1 = (RI + CD + .1) / max(length(v.xz), .3);
  if (abs(dv) > 1e-5) {
    float ta = (s0 - cv) / dv, tb = (s1 - cv) / dv;
    t0 = max(t0, min(ta, tb));
    t1 = min(t1, max(ta, tb));
  } else if (cv < s0 || cv > s1) return 0.;
  t0 = max(t0, 0.);
  t1 = min(t1, tmax);
  if (t1 <= t0) return 0.;
  float dt = (t1 - t0) / 12.;
  float acc = 0.;
  for (int i = 0; i < 12; i++) {
    vec3 x = ro + rd * (t0 + (float(i) + jit) * dt);
    float s;
    float prof = coneAt(x, v, s);
    float u = length(x - gLamp - v * s) / max(s * TANA, 1e-3);
    prof += .1 * exp(-u * u * 1.2) * (1. - smoothstep(1.2, 1.6, u));
    if (prof < .001) continue;
    float reach = beamReach(length(x.xz), x.y);
    if (reach < .001) continue;
    float dust = (.45 + .55 * vnoise(x * 1.7 + vec3(0., -uTime * .06, uTime * .045)))
               * (.75 + .5 * vnoise(x * 6. + vec3(uTime * .15, uTime * .05, 0.)));
    acc += prof * dust * reach / (1. + s * s * .03);
  }
  return acc * dt;
}

/** The searchlight's own shadows: the walkways, the walls of the cell, its occupant. */
float beamShadow(vec3 p, vec3 n, float jit) {
  vec3 L = gLamp - p;
  float dist = length(L);
  vec3 l = L / dist;
  // hard shadows (the penumbra from two successive distances), the start dithered so they don't band
  float res = 1., t = .02 + .03 * jit, ph = 1e10;
  for (int i = 0; i < 26; i++) {
    vec3 x = p + n * .004 + l * t;
    // out of the ring, in the courtyard's open air: nothing more in the way before the tower
    if (length(x.xz) < RI - WW - .1) break;
    float h = map(x);
    float y = h * h / (2. * ph);
    float d = sqrt(max(h * h - y * y, 0.));
    res = min(res, 24. * d / max(t - y, 1e-4));
    ph = h;
    t += clamp(h, .02, .8);
    if (res < .01 || t > dist - gS0 - .05) break;
  }
  res = clamp(res, 0., 1.);
  return res * res * (3. - 2. * res);
}

vec3 sky(vec3 rd, float sea) {
  vec3 c = mix(uBase * .55, uBase * .2, smoothstep(-.05, .7, rd.y));
  return c + SCREEN * sea * .05 * (1. - smoothstep(0., .6, rd.y));
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 ro = uCamPos;
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));
  float sea = max(uLit, uAllLit);
  vec3 lampCol = mix(vec3(1., .92, .8), uAccent, .2);
  if (distance(uCamPos, uCamTarget) < 3.6 && length(uCamTarget.xz) > 5.)
    gHero = vec2(mod(floor(atan(uCamTarget.z, uCamTarget.x) / W + .5), NS), floor(uCamTarget.y / FH));
  beamSetup();
  vec3 v = gV;
  float jit = fract(52.9829189 * fract(dot(fc, vec2(.06711056, .00583715))));

  float tg = rd.y < -1e-4 ? -ro.y / rd.y : 1e5;
  float tmax = min(tg, 70.);
  float t = .05, tt = -1.;
  for (int i = 0; i < 140; i++) {
    float d = map(ro + rd * t);
    if (d < .0007 * t) { tt = t; break; }
    t += d * .9;
    if (t > tmax) break;
  }
  float hitT = tt > 0. ? tt : (tg < 70. ? tg : -1.);
  vec3 col = sky(rd, sea);
  if (hitT > 0.) {
    vec3 p = ro + rd * hitT;
    float r = length(p.xz);
    float mat = 5.;   // the ground
    vec2 cell = vec2(mod(floor(atan(p.z, p.x) / W + .5), NS), 0.);
    vec3 n = vec3(0., 1., 0.);
    float ao = 1.;
    if (tt > 0.) {
      map(p);
      mat = gMat;
      cell = gCell;
      n = calcN(p);
      ao = calcAO(p, n);
    }
    // the light of a cell falls on its walkway too, and on the underside of the walkway above the cell below
    if (mat < .5) cell.y = clamp(floor((p.y - .2) / FH), 0., NF - 1.);

    // board-formed concrete: the marks of the planks (where the screen can show them) and stains
    float pix = pixelSize(hitT, n, rd);
    vec3 alb = uInk * .5 * (.88 + .2 * vnoise(p * 2.3));
    alb *= 1. - .14 * resolved(.2, pix) * smoothstep(.4, .5, abs(fract(p.y * 5.) - .5));
    if (mat > 1.5 && mat < 2.5) alb = vec3(.32, .32, .34);
    if (mat > 4.5) alb *= .6;

    // the night: a little sky, hardly any inside the cells
    float inside = smoothstep(RI, RI + .3, r) * (1. - smoothstep(RI + CD + .05, RI + CD + .15, r)) * step(p.y, RH - .05);
    vec3 light = (uBase * 3. + vec3(.12, .15, .22)) * (.45 + .55 * clamp(n.y * .5 + .5, 0., 1.)) * ao * (1. - .85 * inside);
    // the searchlight
    float s;
    float cone = coneAt(p, v, s);
    if (cone > .001) {
      float nl = clamp(dot(n, normalize(gLamp - p)), 0., 1.);
      if (nl > 0.) light += lampCol * 7. * uBeamGain * (1. + .6 * uBeat) * cone * nl / (1. + s * s * .02) * beamShadow(p, n, jit);
    }
    // the screens
    float fig = mat > 1.5 && mat < 2.5 ? 1. : 0.;
    if (mat < .5 || fig > .5 || (mat > 4.5 && r < RI)) light += cellLight(p, n, cell, fig) * mix(1., ao, .6);
    // the whole ring of screens, on everything that faces it, and the eye's flash on everything that faces the tower
    float court = 1. - smoothstep(RO - .1, RO + .5, r);
    light += SCREEN * sea * .1 * (1. - .6 * abs(n.y)) * (1. - .7 * inside) * court;
    vec3 te = EYE - p;
    light += lampCol * uEye * 1.2 * clamp(dot(n, normalize(te)), 0., 1.) / (1. + dot(te, te) * .03) * court;
    col = alb * light;

    if (mat > .5 && mat < 1.5) {
      // a screen: its face glows, its back is a dark slab
      vec3 S, e;
      screenOf(cell, S, e);
      col = uBase * .1 + SCREEN * screenOn(cell) * smoothstep(.2, .6, dot(n, e)) * 1.7;
    } else if (mat > 2.5 && mat < 3.5) {
      // the eye: dark glass, the searchlight's lens where the beam leaves it, a dim watch room that swells in a build
      // and flashes on the drop
      vec3 E = gExit;
      col = uBase * .06 + uInk * .12 * pow(1. - abs(dot(n, -rd)), 3.);
      col += lampCol * (14. * uBeamGain * exp(-dot(p - E, p - E) * 60.) + .08 + .7 * uTension + 9. * uEye);
    }
    col = mix(col, sky(rd, sea) * .9, 1. - exp(-hitT * .02));
  }
  // the courtyard's air glows with the screens
  col += SCREEN * sea * (.025 + .04 * uAllLit) * (1. - exp(-(hitT > 0. ? hitT : 30.) * .05));
  // the beam in the dust
  float vol = beamVolume(ro, rd, hitT > 0. ? hitT : 70., v, jit);
  col += lampCol * vol * .75 * uDust * uBeamGain * (1. + .4 * uBeat);
  gl_FragColor = vec4(hdrOut(col), hitT > 0. ? 1. : clamp(vol * 3., 0., 1.));
}
`,
});
