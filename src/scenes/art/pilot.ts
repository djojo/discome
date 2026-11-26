import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";
import { CIRCUIT_GLSL } from "./circuit.glsl";

const approach = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-dt * rate));
/** The shortest way from angle a to angle b. */
const toward = (a: number, b: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

const FRAMINGS: Framing[] = [
  // three-quarters, the classic portrait
  { az: 0.55, el: 0.05, dist: 4.3, target: [0, 0.05, 0], focal: 2, weight: 3 },
  { az: -0.6, el: 0.08, dist: 4.4, target: [0, 0.05, 0], focal: 2, weight: 2 },
  // profile
  { az: 1.5, el: 0.02, dist: 4.1, target: [0, 0.08, 0], focal: 2, weight: 2 },
  // low, heroic
  { az: 0.3, el: -0.26, dist: 3.9, target: [0, 0.15, 0], focal: 1.9, weight: 2 },
  // close on the visor
  { az: 0.15, el: 0.04, dist: 2.5, target: [0, 0.1, 0.25], focal: 2.3, weight: 2 },
  // wide: the background round the head
  { az: -0.25, el: 0.06, dist: 7.2, target: [0, -0.15, 0], focal: 1.8, weight: 2 },
  // the ride (the drop): onboard cameras fixed in front of the rider, a little low, the world rushing past
  { az: 0, el: -0.07, dist: 4.3, target: [0, -0.3, 0], focal: 1.95, weight: 3, tag: "ride" },
  { az: 0.4, el: -0.04, dist: 4.1, target: [0, -0.25, 0], focal: 1.95, weight: 2, tag: "ride" },
  { az: -0.32, el: -0.14, dist: 4.4, target: [0, -0.2, 0], focal: 1.9, weight: 2, tag: "ride" },
  { az: 0.12, el: -0.04, dist: 2.9, target: [0, 0.02, 0.1], focal: 2, weight: 1, tag: "ride" },
];

/**
 * Le Pilote: a rider in a full-face racing helmet of our own design, turning slowly on itself before a background of
 * neon. Black lacquer mirroring the lights, a white blade on each flank edged with the moment's colour, a carbon
 * spoiler and scoops, an iridium visor on chrome pivots behind which the eyes are glimpsed; racing leathers.
 * Backgrounds: a ring of neon, a wall of neon tubes, the race behind, speed lines. The background carries the rhythm;
 * the helmet turns at its own pace (about a turn a minute). On the drop (and in « Face à face », cast on drops) the
 * ride: onboard cameras fixed in front of the rider, who faces the way and tucks in; the speed builds over a bar and
 * holds through the drop: the background fades, the road, its track lights and the city's lights rush past toward
 * the vanishing point behind the rider, streaking, mirrored in the lacquer and the visor; the camera shakes, the lens
 * opens, the image blurs with speed. Then the speed falls away and the helmet turns again.
 */
export const pilot = defineShaderScene({
  id: "circuit-pilot",
  name: "Le Pilote",
  energy: "calm",
  hdr: true,
  mask: true,
  camera: { framings: FRAMINGS, glideBars: 3 },
  description:
    "Un pilote en casque de moto intégral qui tourne lentement sur lui-même devant des néons : laque noire, lame blanche sur les flancs, becquet et écopes en carbone, écran iridium sur pivots chromés, cuir de course. Fonds : anneau de néon, mur de tubes, la course derrière, lignes de vitesse. Au drop, caméra embarquée : face au pilote couché sur sa machine, la route, ses feux et la ville filent vers le point de fuite derrière lui.",
  params: [
    paletteParam("piste"),
    {
      type: "select",
      key: "bg",
      label: "Fond",
      options: [
        { value: "ring", label: "Anneau de néon" },
        { value: "tubes", label: "Mur de tubes néon" },
        { value: "race", label: "La course derrière" },
        { value: "speed", label: "Lignes de vitesse" },
      ],
      default: "ring",
    },
  ],
  uniforms: () => ({
    uRotY: { value: Math.random() * 6.28 },
    uBg: { value: 0 },
    uCharge: { value: 0 },
    uBlaze: { value: 0 },
    uKick: { value: 9 },
    uSeq: { value: 0 },
    uRun: { value: 0 },
    uTuck: { value: 0 },
    uRush: { value: 0 },
    uDist: { value: 0 },
    uBuffet: { value: 0 },
    // CPU side: seconds into the ride, when last on screen
    uRideT: { value: 1e4 },
    uSeen: { value: -1e9 },
  }),
  motion: (u) => 0.45 * (u.uRush.value as number),
  update(u, f, p, dt, ctx) {
    const bar = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;
    u.uBg.value = p.bg === "tubes" ? 1 : p.bg === "race" ? 2 : p.bg === "speed" ? 3 : 0;
    const build = f.section === "build" ? f.buildProgress : 0;
    u.uCharge.value = approach(u.uCharge.value as number, build, 3, dt);
    // the ride: on the drop (or arriving on screen in one), the onboard camera, the rider tucked in, the world rushing
    // past; the speed builds over a bar, holds through the drop (four bars at least, sixteen at most), falls away
    const fresh = f.time - (u.uSeen.value as number) > 1.5;
    u.uSeen.value = f.time;
    if (f.drop || (fresh && f.section === "drop")) {
      u.uBlaze.value = 1;
      u.uRideT.value = 0;
      if ((u.uRush.value as number) < 0.05) u.uDist.value = 0;
      ctx.camera?.request("ride");
    }
    const rideT = (u.uRideT.value as number) + dt;
    u.uRideT.value = rideT;
    const riding = rideT < bar * 4 || (f.section === "drop" && rideT < bar * 16);
    const rush = approach(u.uRush.value as number, riding ? 1 : 0, (riding ? 3 : 2) / bar, dt);
    u.uRush.value = rush;
    u.uTuck.value = rush;
    u.uDist.value = (u.uDist.value as number) + dt * rush * 90;
    u.uBuffet.value = rush * 0.012 * (Math.sin(f.time * 31) + 0.5 * Math.sin(f.time * 47 + 1));
    if (ctx.camera) ctx.camera.allow = (fr) => (fr.tag === "ride") === riding;
    u.uBlaze.value = (u.uBlaze.value as number) * Math.exp(-dt / (bar * 2.5));
    u.uKick.value = f.beat ? 0 : (u.uKick.value as number) + dt;
    // the tubes' sequence, one step a kick (and quicker through the build); the race and the lines run on
    if (f.beat) u.uSeq.value = (u.uSeq.value as number) + 1;
    u.uSeq.value = (u.uSeq.value as number) + dt * (0.5 + 3 * build);
    u.uRun.value = (u.uRun.value as number) + dt * (1 + 2.5 * build + 1.5 * (u.uBlaze.value as number));
    // the head: turning at its own pace; on the ride it faces the way it goes (toward the cameras), then turns again
    const rot = u.uRotY.value as number;
    if (riding) u.uRotY.value = rot + toward(rot, 0) * (1 - Math.exp(-dt * (3.5 / bar)));
    else u.uRotY.value = rot + dt * ((Math.PI * 2) / 60);
  },
  fragment: /* glsl */ `
uniform float uRotY;    // the head's turn
uniform float uBg;      // 0 ring, 1 tubes, 2 the race, 3 speed lines
uniform float uCharge;  // the build
uniform float uBlaze;   // the drop
uniform float uKick;    // seconds since the kick
uniform float uSeq;     // the tubes' sequence
uniform float uRun;     // the race's and the lines' clock
uniform float uTuck;    // the rider tucked in (the drop)
uniform float uRush;    // the ride's speed: 0 the portrait, 1 full speed
uniform float uDist;    // how far the ride has gone (the world rushing past, along -z)
uniform float uBuffet;  // the wind shaking the head
${ART_LIB}
${CAMERA_GLSL}
${CIRCUIT_GLSL}
float gMat;   // 0 the painted shell, 1 the visor, 2 carbon, 3 the suit, 4 rubber trim, 5 the visor's pivots

/** A world point in the head's frame (sdHead's: y up, facing +z), turned with it. */
vec3 toHead(vec3 p) { p.xz = rot(-uRotY - uBuffet) * p.xz; return p; }
/** The helmet's frame: the head's, tucked forward on the drop (as on the bike), pivoting at the neck. */
vec3 tuck(vec3 q) {
  q.y += .1 * uTuck;
  vec2 yz = q.yz - vec2(-.62, 0.);
  yz = rot(.22 * uTuck) * yz;
  return vec3(q.x, yz + vec2(-.62, 0.));
}

/** A superellipsoid (sides fuller than an ellipsoid's): an approximate distance. */
float sdSuper(vec3 p, vec3 r, float n) {
  vec3 a = abs(p / r);
  float k = pow(pow(a.x, n) + pow(a.y, n) + pow(a.z, n), 1. / n);
  return (k - 1.) * min(r.x, min(r.y, r.z)) * .85;
}

/** The shell: the dome of a full-face helmet. */
float shellD(vec3 q) { return sdSuper(q - vec3(0., .2, -.05), vec3(.63, .7, .8), 2.35); }

/** The eye port, by angle round the front and height: low edge rising toward the sides (negative inside). */
float portD(vec3 q) {
  float phi = atan(q.x, q.z);
  float lo = -.05 + .07 * phi * phi, hi = .3 - .035 * phi * phi;
  return max(max(lo - q.y, q.y - hi), (abs(phi) - 1.2) * .7);
}

/** The visor: a thin curved shield over the port, wider than it, from one pivot to the other. */
float visorD(vec3 q) {
  float phi = atan(q.x, q.z);
  float lo = -.1 + .07 * phi * phi, hi = .36 - .035 * phi * phi;
  float region = max(max(lo - q.y, q.y - hi), (abs(phi) - 1.48) * .7);
  float sh = abs(sdSuper(q - vec3(0., .2, -.05), vec3(.655, .725, .825), 2.35)) - .011;
  return max(sh, region);
}

/** The helmet (paint, carbon, rubber, pivots, visor), in the helmet's frame. */
float helmetD(vec3 q) {
  vec3 a = vec3(abs(q.x), q.y, q.z);
  float shell = shellD(q);
  // a shallow channel down the crown, between two crisp ridges
  shell = smax(shell, -(sdBox(q - vec3(0., .95, -.15), vec3(.075, .1, .75)) - .015), .02);
  // the chin bar: the shell carried down and forward under the visor, rounded, its front a soft V seen from above
  vec3 cq = q - vec3(0., -.35, .3);
  cq.z += .24 * abs(cq.x);
  float chin = sdEllipsoid(cq, vec3(.5, .3, .44));
  shell = smin(shell, chin, .14);
  // open at the bottom (lower in front)
  float bottom = -(q.y + .58 + .1 * q.z);
  shell = max(shell, bottom);
  // the eye port cut through
  shell = max(shell, -max(portD(q) - .005, -q.z));
  // the chin's air intake: three slots cut into its front, flush
  float slots = max(max(abs(q.x) - .13 - .3 * (q.y + .43), abs(q.y + .43) - .06), abs(fract((q.y + .43) / .04 + .5) - .5) * .04 - .009);
  shell = max(shell, -max(slots, .64 - q.z));
  float d = shell;
  gMat = 0.;
  // carbon: the rear spoiler with its end plates, two scoops on top
  vec3 wq = q - vec3(0., .52, -.7);
  wq.yz = rot(.45) * wq.yz;
  float wing = sdBox(wq, vec3(.3, .028, .13)) - .015;
  float plates = sdBox(vec3(a.x - .3, wq.y - .04, wq.z), vec3(.012, .07, .13)) - .006;
  float scoops = sdEllipsoid(a - vec3(.17, .8, .25), vec3(.065, .045, .14));
  float carbon = min(min(wing, plates), scoops);
  if (carbon < d) { d = carbon; gMat = 2.; }
  // the rubber trim round the bottom opening
  float rim = max(abs(shellD(q) + .005) - .03, abs(q.y + .58 + .1 * q.z) - .035);
  if (rim < d) { d = rim; gMat = 4.; }
  // the visor and its round pivot plates
  float vis = visorD(q);
  if (vis < d) { d = vis; gMat = 1.; }
  vec3 pq = vec3(a.x - .66, q.y - .1, q.z + .02);
  float pivot = max(length(pq.yz) - .1, abs(pq.x) - .022) - .006;
  if (pivot < d) { d = pivot; gMat = 5.; }
  return d;
}

/** The rider: the neck in its balaclava, the collar, the shoulders of a racing leather with their armour, the hump. */
float suitD(vec3 q) {
  vec3 a = vec3(abs(q.x), q.y, q.z);
  float neck = sdCapsule(q, vec3(0., -.42, -.06), vec3(0., -1.1, -.1), .2);
  float collar = length(vec2(length(q.xz - vec2(0., -.06)) - .27, q.y + .8)) - .075;
  float body = sdEllipsoid(q - vec3(0., -1.42, -.08), vec3(1., .42, .5));
  float armour = sdEllipsoid(a - vec3(.78, -1.12, -.05), vec3(.26, .16, .3));
  float hump = sdEllipsoid(q - vec3(0., -.82, -.42), vec3(.27, .36, .2));
  float d = smin(smin(neck, collar, .06), body, .2);
  d = smin(d, armour, .08);
  return smin(d, hump, .14);
}

float sceneD(vec3 p) {
  vec3 q = toHead(p);
  float h = helmetD(tuck(q));
  float m = gMat;
  float s = suitD(q);
  if (s < h) { gMat = 3.; return s; }
  gMat = m;
  return h;
}

vec3 nrm(vec3 p, float e) {
  const vec2 k = vec2(1, -1);
  return normalize(k.xyy * sceneD(p + k.xyy * e) + k.yyx * sceneD(p + k.yyx * e) + k.yxy * sceneD(p + k.yxy * e) + k.xxx * sceneD(p + k.xxx * e));
}

// ---------------------------------------------------------------- the background, on a plane behind the head
vec3 gF, gR, gU;   // the camera's frame

/** Where a ray meets the background's plane (dist behind the head), in that plane's coordinates (x right, y up). */
vec3 onPlane(vec3 ro, vec3 rd, float dist) {
  vec3 c = uCamTarget + gF * dist;
  float dn = dot(rd, gF);
  if (dn < 1e-3) return vec3(0., 0., -1.);
  float t = dot(c - ro, gF) / dn;
  if (t < 0.) return vec3(0., 0., -1.);
  vec3 x = ro + rd * t - c;
  return vec3(dot(x, gR), dot(x, gU), t);
}

float pulseK() { return exp(-uKick * 4.); }

vec3 bgRing(vec3 ro, vec3 rd) {
  vec3 pl = onPlane(ro, rd, 4.2);
  if (pl.z < 0.) return vec3(0.);
  vec2 p = pl.xy - vec2(0., .15);
  float r = length(p);
  float d = abs(r - 2.3);
  vec3 c = uTint * (exp(-d * d / .002) * 2.6 + .05 / (d * d + .05) * .25);
  // a second, finer ring charging through the build
  float d2 = abs(r - 2.75);
  c += mix(uTint, vec3(1.), .5) * exp(-d2 * d2 / .0008) * (.3 + 2. * uCharge);
  // shafts radiating from the ring through the haze
  float a = atan(p.y, p.x);
  float sh = pow(.5 + .5 * sin(a * 24. + 1.3 * sin(a * 5. + uTime * .2)), 6.);
  c += uTint * sh * exp(-abs(r - 2.3) * .9) * .12 * (1. + uCharge);
  return c * (1. + 1.5 * pulseK() + 2.5 * uBlaze);
}

vec3 bgTubes(vec3 ro, vec3 rd) {
  vec3 c = vec3(0.);
  for (int l = 0; l < 2; l++) {
    float dist = l == 0 ? 3.8 : 6.5;
    vec3 pl = onPlane(ro, rd, dist);
    if (pl.z < 0.) continue;
    float sp = l == 0 ? .6 : .45;
    float k = floor(pl.x / sp + .5);
    float dx = (pl.x - k * sp) * (l == 0 ? 1. : 1.4);
    float h = step(abs(pl.y + .2), l == 0 ? 2.7 : 3.4);
    // the sequence: a wave of light running along the tubes, one step a kick
    float ph = mod(k - uSeq * 1.5 + float(l) * 3., 12.);
    float seq = .25 + 2.5 * exp(-ph * .9) + uCharge * .8;
    vec3 tc = mix(uTint, mix(uTint, vec3(1., .25, .6), .5), step(.5, fract(k * .5)));
    c += tc * (exp(-dx * dx / .0012) * 1.6 + .01 / (dx * dx + .01) * .12) * h * seq * (l == 0 ? 1. : .45);
  }
  return c * (1. + 2. * uBlaze);
}

vec3 bgRace(vec3 ro, vec3 rd) {
  vec3 c = vec3(0.);
  // the megacity out of focus: big soft points of light
  vec3 pl = onPlane(ro, rd, 14.);
  if (pl.z < 0.) return c;
  vec2 g = floor(pl.xy / .9);
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 cell = g + vec2(i, j);
      float h = hash12(cell + 3.3);
      if (h < .55 || cell.y * .9 > .6) continue;
      vec2 o = (cell + vec2(hash12(cell + 1.1), hash12(cell + 7.7))) * .9;
      float d = length(pl.xy - o);
      vec3 bc = mix(vec3(1., .62, .3), uTint, step(.8, h));
      c += bc * smoothstep(.42, .3, d) * .18 * (.6 + .4 * hash12(cell + 9.));
    }
  // the gantry's beam, a dark line high, its lights
  c += vec3(1., .1, .05) * exp(-pow((pl.y - 1.9) / .03, 2.)) * step(.7, fract(pl.x * .8)) * .4;
  // the pack streaking past behind the pilot: trails of light crossing the frame, more through the build
  vec3 p2 = onPlane(ro, rd, 7.);
  if (p2.z > 0.) {
    for (int k = 0; k < 4; k++) {
      float fk = float(k);
      float y = -.6 + .35 * fk + .1 * sin(fk * 3.1);
      float run = fract(uRun * (.35 + .1 * fk) + fk * .27);
      float x0 = mix(-9., 9., run);
      float along = (x0 - p2.x) / 5.;
      float dy = p2.y - y;
      float on = step(0., along) * step(along, 1.) * step(fk, 1. + 3. * uCharge + 2. * uBlaze);
      vec3 tc = fk < 1. ? uTint : fk < 2. ? vec3(1., .4, .2) : vec3(.8, .4, 1.);
      c += tc * exp(-dy * dy / .0006) * (1. - along) * on * 2.;
    }
  }
  return c * (1. + pulseK() * .6 + uBlaze);
}

vec3 bgSpeed(vec3 ro, vec3 rd) {
  vec3 pl = onPlane(ro, rd, 5.);
  if (pl.z < 0.) return vec3(0.);
  float row = floor(pl.y / .13);
  float h = hash12(vec2(row, 4.4));
  if (h < .35) return vec3(0.);
  float sp = (1.5 + 3. * h) * (1. + 2. * uCharge);
  float x = pl.x / (1.2 + 2. * h) + uRun * sp;
  float dash = smoothstep(0., .1, fract(x)) * (1. - smoothstep(.3, .9, fract(x))) * step(.3, hash12(vec2(row, floor(x))));
  float dy = (fract(pl.y / .13) - .5) * .13;
  vec3 c = mix(uTint, vec3(1.), .3 * h) * dash * exp(-dy * dy / .0004) * (.4 + 1.4 * h);
  // the lines fade toward the middle, round the head
  return c * smoothstep(.2, 1.6, abs(pl.x) + .3) * (1. + 1.2 * pulseK() + 2. * uBlaze);
}

/**
 * The studio's light strips (for the reflections only): two tall strips at the sides, a little behind the head, one
 * of the moment's colour and one white; a soft one overhead. They draw long highlights on the lacquer.
 */
vec3 strips(vec3 rd) {
  vec3 c = vec3(0.);
  for (int i = 0; i < 2; i++) {
    float sx = i == 0 ? 1. : -1.;
    vec3 sd = normalize(gR * sx * .95 - gF * .45 + gU * .05);
    vec3 side = normalize(cross(sd, gU));
    float across = dot(rd, side);
    float up = dot(rd, gU);
    float on = step(.55, dot(rd, sd)) * exp(-across * across / .006) * smoothstep(.75, .3, abs(up));
    c += (i == 0 ? mix(uTint, vec3(1.), .2) * 1.4 : vec3(1.)) * on * (1. + .8 * uCharge + 2. * uBlaze);
  }
  float top = smoothstep(.75, .95, dot(rd, normalize(gU - gF * .25)));
  return c + vec3(.7, .75, .85) * top * .5;
}

// ---------------------------------------------------------------- the ride: the world rushing past, along -z
float gPa;   // a pixel's angle (wider for the reflections)

/**
 * A line of lights along the way (parallel to z, at the lateral point c), each light S after the last and streaked
 * over L by the speed, its head bright, its tail fading: its light on the ray. Far down the line, where a pixel
 * spans several lights, their average.
 */
float streak(vec3 ro, vec3 rd, vec2 c, float S, float L, float off, float w) {
  vec2 o = ro.xy - c;
  float t = -dot(o, rd.xy) / max(dot(rd.xy, rd.xy), 1e-6);
  if (t < 0.) return 0.;
  float d = length(o + rd.xy * t);
  float ww = max(w, t * gPa * 1.3);
  float k = w / ww;
  float glow = (exp(-d * d / (ww * ww)) + exp(-d * d / (16. * ww * ww)) * .12) * k;
  float u = mod(ro.z + rd.z * t + uDist - off, S);
  float fz = t * t * gPa / max(length(o), .05);
  float dash = mix(smoothstep(L, 0., u), .5 * L / S, smoothstep(.2 * S, .8 * S, fz));
  return glow * dash * exp(-t * .012);
}

/** The road below: dark asphalt, its lane lines rushing, the track lights shining in it. */
vec3 rushRoad(vec3 ro, vec3 rd) {
  const float Y = -1.9;
  if (rd.y > -1e-3) return vec3(0.);
  float t = (Y - ro.y) / rd.y;
  if (t < 0.) return vec3(0.);
  vec2 h = ro.xz + rd.xz * t;
  float fx = t * gPa * 1.5;
  float fz = t * t * gPa / max(ro.y - Y, .1);
  float far = smoothstep(1., 4., fz);
  vec3 c = vec3(.004, .004, .006);
  float dash = mix(step(mod(h.y + uDist, 7.), 3.5), .5, far);
  c += vec3(.5) * neon(abs(abs(h.x) - .95), .03, fx) * dash * .5;
  c += vec3(.5) * neon(abs(abs(h.x) - 2.4), .04, fx) * .35;
  // the track lights' reflections, long in the asphalt
  float row = exp(-pow(abs(h.x) - 1.75, 2.) / .015);
  float lit = mix(smoothstep(3.6, 0., mod(h.y + uDist - sign(h.x) * 1.3, 4.)), .45, max(far, .5));
  c += mix(uTint, vec3(1.), .35) * row * lit * .45;
  return c * exp(-t * .02);
}

/** The ride: the road, its two rows of track lights close by, the city's lights in layers round the way. */
vec3 rushScene(vec3 ro, vec3 rd) {
  vec3 c = rushRoad(ro, rd);
  float L = .3 + 7. * uRush;
  for (int s = 0; s < 2; s++) {
    float sx = s == 0 ? -1. : 1.;
    c += mix(uTint, vec3(1.), .35) * streak(ro, rd, vec2(1.75 * sx, -1.45), 4., min(L, 3.4), sx * 1.3, .035) * 1.8;
  }
  // the wind, then the city (neon, windows) on cylinders round the way, nearer ones streaking faster across the frame
  float rr = max(dot(rd.xy, rd.xy), 1e-6);
  for (int l = 0; l < 4; l++) {
    float fl = float(l);
    float R = l == 0 ? 2.5 : l == 1 ? 3.6 : l == 2 ? 6.2 : 11.;
    float N = l == 0 ? 40. : l == 1 ? 26. : l == 2 ? 38. : 56.;
    float b = dot(ro.xy, rd.xy), cc = dot(ro.xy, ro.xy) - R * R;
    float disc = b * b - rr * cc;
    if (disc < 0.) continue;
    vec2 h = ro.xy + rd.xy * ((-b + sqrt(disc)) / rr);
    float k = floor(atan(h.y, h.x) / 6.2831853 * N);
    float h1 = hash12(vec2(k, fl * 7.1 + .3));
    if (h1 < .3) continue;
    float a = (k + .5 + (hash12(vec2(k, fl * 3.3 + 1.7)) - .5) * .5) / N * 6.2831853;
    vec2 lc = R * vec2(cos(a), sin(a));
    if (lc.y < -1.6) continue;
    float h2 = hash12(vec2(k, fl * 5.9 + 4.1));
    if (l == 0) {
      // the wind: faint white threads close by
      c += vec3(.8, .85, 1.) * streak(ro, rd, lc, 3. + 4. * h2, min(6., L * 1.2), h1 * 23., .008) * .5;
      continue;
    }
    float S = (6. + 8. * h2) * (1. + .5 * fl);
    float len = h1 > .85 ? S * .85 : min(S * .85, L * (.6 + .8 * h2));
    vec3 col = h2 < .35 ? uTint : h2 < .6 ? vec3(1.) : h2 < .8 ? vec3(1., .5, .2) : vec3(1., .25, .65);
    float w = l == 1 ? .03 : l == 2 ? .045 : .07;
    c += col * streak(ro, rd, lc, S, len, h1 * 37., w) * (l == 1 ? 1.6 : l == 2 ? 1. : .6);
  }
  // the glow of the city where the way runs to
  c += mix(uTint, vec3(1., .55, .3), .5) * pow(max(-rd.z, 0.), 30.) * .25;
  return c;
}

vec3 background(vec3 ro, vec3 rd) {
  vec3 c = mix(vec3(.004, .005, .012), vec3(.0, .0, .003), smoothstep(-.3, .6, rd.y));
  // the chosen background fades under the speed
  float keep = 1. - uRush;
  if (keep > .01) {
    vec3 b;
    if (uBg < .5) b = bgRing(ro, rd);
    else if (uBg < 1.5) b = bgTubes(ro, rd);
    else if (uBg < 2.5) b = bgRace(ro, rd);
    else b = bgSpeed(ro, rd);
    c += b * keep;
  }
  if (uRush > .01) c += rushScene(ro, rd) * smoothstep(0., .4, uRush);
  return c;
}

// ---------------------------------------------------------------- shading
float fres(vec3 n, vec3 rd, float f0) { return f0 + (1. - f0) * pow(1. - clamp(dot(n, -rd), 0., 1.), 5.); }

/** Behind the visor: the face, dark, lit from below by the race display's glow; two glints in the eyes. */
vec3 throughVisor(vec3 qo, vec3 qd) {
  float t = .01;
  bool hit = false;
  for (int i = 0; i < 40; i++) {
    vec3 q = qo + qd * t;
    float d = min(sdHead(q), -(shellD(q) + .04));
    if (d < .002) { hit = true; break; }
    t += d;
    if (t > 1.4) break;
  }
  vec3 glow = mix(uTint, vec3(1.), .25) * (.25 + .6 * uCharge + 2. * uBlaze);
  vec3 c = vec3(0.);
  if (hit) {
    vec3 q = qo + qd * t;
    const vec2 k = vec2(1, -1);
    vec3 n = normalize(k.xyy * sdHead(q + k.xyy * .004) + k.yyx * sdHead(q + k.yyx * .004) + k.yxy * sdHead(q + k.yxy * .004) + k.xxx * sdHead(q + k.xxx * .004));
    vec3 L = normalize(vec3(0., -.35, .55) - q);
    float lit = max(dot(n, L), 0.);
    c = vec3(.05, .04, .04) * .3 + glow * lit * .22 * smoothstep(-.3, .3, q.z);
  }
  // the eyes: two glints, as if the gaze met ours
  for (int e = 0; e < 2; e++) {
    vec3 ep = vec3(e == 0 ? -.15 : .15, .03, .5);
    vec3 oc = ep - qo;
    float tc = dot(oc, qd);
    float dd = length(oc - qd * tc);
    c += mix(glow, vec3(1.), .6) * exp(-dd * dd / .00012) * 1.4;
  }
  return c;
}

vec3 tuckDir(vec3 d) { return vec3(d.x, rot(.22 * uTuck) * d.yz); }

/** Woven carbon: a fine twill, its average once finer than a pixel. */
float carbonWeave(vec3 q, float fw) {
  vec2 uv = vec2(q.x + q.z * .7, q.y + q.z * .3) * 45.;
  float tw = abs(step(.5, fract(uv.x)) - step(.5, fract(uv.y + floor(uv.x) * .5)));
  return mix(tw, .5, smoothstep(.004, .015, fw));
}

vec3 helmetColor(vec3 p, vec3 rd, float t, float pa) {
  sceneD(p);
  float m = gMat;
  vec3 qi = tuck(toHead(p));
  // the intake's insert, flush in the chin: carbon
  float intake = step(abs(qi.x), .17 + .35 * (qi.y + .43)) * step(abs(qi.y + .43), .085) * step(.5, qi.z);
  if (m < .5 && intake > .5) m = 2.;
  vec3 n = nrm(p, max(.0015, t * pa));
  vec3 qs = toHead(p);
  vec3 q = tuck(qs);
  vec3 qd = tuckDir(toHead(rd));
  vec3 rr = reflect(rd, n);
  // (the strips fade at grazing angles: on the silhouette they would only sparkle; and on the ride, on the road)
  gPa = pa * 3.;
  vec3 env = background(p, rr) + strips(rr) * smoothstep(.04, .3, dot(n, -rd)) * (1. - .75 * uRush);
  float fw = t * pa;
  vec3 key = vec3(.8, .85, 1.) * pow(max(dot(rr, normalize(vec3(-.6, .5, .6))), 0.), 30.) * .6;
  vec3 rim = uTint * pow(1. - max(dot(n, -rd), 0.), 3.) * .22 * (1. + uCharge + uBlaze);
  float dif = max(dot(n, normalize(gR * .95 - gF * .45)), 0.) + max(dot(n, normalize(-gR * .95 - gF * .3)), 0.) * .7 + max(n.y, 0.) * .4;
  float lit = .6 + 1.5 * uCharge + 4. * uBlaze;
  vec3 lineC = mix(uTint, vec3(1.), .15);
  vec3 c;
  if (m < .5) {
    // the race livery: black lacquer, the chin black; on each flank a white blade sweeping up and back from the cheek
    // to the nape, edged with a band of the moment's colour and a white pinstripe; chevrons on the crown, the channel
    float yb = .02 - .42 * q.z;
    float front = .34 - .25 * (q.y + .3);
    float ahead = smoothstep(.006, -.006, q.z - front);
    float tall = mix(.07, .32, clamp((q.z + .8) / 1.1, 0., 1.));
    float white = smoothstep(.006, -.006, q.y - yb) * smoothstep(-.006, .006, q.y - yb + tall) * ahead;
    float band = (1. - smoothstep(.02, .03, abs(q.y - yb - .045))) * smoothstep(.006, -.006, q.z - front - .04);
    float pin = (1. - smoothstep(.004, .008, abs(q.y - yb - .085))) * smoothstep(.006, -.006, q.z - front - .07);
    float chevron = step(.55, q.y) * step(.05, q.z) * step(q.z, .5) * step(.5, fract((q.z + 1.1 * abs(q.x)) * 5.)) * step(abs(q.x), .4);
    float channel = step(abs(q.x), .07) * step(.5, q.y);
    vec3 alb = mix(vec3(.012), vec3(.62, .63, .66), max(white, pin));
    alb = mix(alb, uTint * .55, max(band, max(chevron, channel) * .8));
    float f = fres(n, rd, .05);
    c = alb * (.05 + .3 * dif) + (env + key) * f * 1.4 + rim;
    // lines of light: round the eye port, along the two ridges, in the band
    float port = neon(abs(portD(q) + .012), .01, fw) * step(.05, q.z);
    float ridges = neon(abs(abs(q.x) - .085), .01, fw) * step(.55, q.y);
    c += lineC * ((port + ridges) * lit + band * .25 * lit);
  } else if (m < 1.5) {
    // the iridium visor: a thin film turning gold, violet, blue with the angle, mirroring the background; on the
    // drop, lit from within, the eyes behind it
    float cosv = clamp(dot(n, -rd), 0., 1.);
    vec3 film = .5 + .5 * cos(6.2831853 * (vec3(0., .33, .67) + (1. - cosv) * 1.15 + q.y * .9 + .12));
    float f = fres(n, rd, .35);
    vec3 inside = throughVisor(q + qd * .01, qd);
    c = vec3(.006) + (env * 1.3 + key * 2.) * mix(film, vec3(1.), .2) * f + film * .02 + inside * (.15 + .9 * uBlaze);
    c += mix(uTint, vec3(1.), .3) * uBlaze * smoothstep(.1, -.08, q.y) * .4;
  } else if (m < 2.5) {
    // carbon: the twill under a clear coat
    float w = carbonWeave(q, fw);
    float f = fres(n, rd, .06);
    c = vec3(.018 + .03 * w) * (.4 + .6 * dif) + (env + key) * f * 1.1 + rim * .6;
    c += lineC * neon(abs(abs(q.x) - .3), .006, fw) * step(.4, q.y) * lit * .6;
  } else if (m < 3.5) {
    // the racing leather: black, white on the shoulders' armour, a stripe of the moment's colour, the collar piped
    vec3 a = vec3(abs(qs.x), qs.y, qs.z);
    float arm = 1. - smoothstep(.0, .06, length((a - vec3(.78, -1.12, -.05)) / vec3(.27, .17, .31)) - 1.);
    float stripe = 1. - smoothstep(.015, .03, abs(a.x - .55 + .25 * (qs.y + 1.1)));
    vec3 alb = mix(vec3(.01), vec3(.5, .5, .52), arm);
    alb = mix(alb, uTint * .5, stripe * step(qs.y, -.95));
    c = alb * (.05 + .25 * dif) + env * fres(n, rd, .04) * .6 + rim * .5;
    c += lineC * neon(abs(qs.y + .8), .012, fw) * step(length(qs.xz), .42) * (.5 + uBlaze);
  } else if (m < 4.5) {
    // rubber
    c = vec3(.01) * (.5 + .5 * dif) + env * fres(n, rd, .03) * .25;
  } else {
    // the visor's pivots: chrome, a ring of light
    vec3 a = vec3(abs(q.x), q.y, q.z);
    float r = length(vec2(a.y - .1, a.z + .02));
    c = vec3(.03) + (env + key) * .9 + lineC * neon(abs(r - .072), .008, fw) * lit;
  }
  return c;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  // on the ride: the camera shaken by the speed, the lens opening wider
  uv += uRush * .0025 * vec2(sin(uTime * 63.) + .6 * sin(uTime * 101. + 2.), sin(uTime * 57. + 1.) + .6 * sin(uTime * 93.));
  float foc = uFocal * (1. - .18 * uRush);
  vec3 ro = uCamPos;
  gF = normalize(uCamTarget - ro);
  gR = normalize(cross(gF, vec3(0., 1., 0.)));
  gU = cross(gR, gF);
  vec3 rd = normalize(uv.x * gR + uv.y * gU + foc * gF);
  float pa = 1. / (uRes.y * foc);
  gPa = pa;
  vec3 col = background(ro, rd);
  // the bust: march within its bounding sphere
  vec3 bc = vec3(0., -.35, 0.);
  vec3 oc = ro - bc;
  float b = dot(oc, rd), cc = dot(oc, oc) - 2.2 * 2.2;
  float hdisc = b * b - cc;
  if (hdisc > 0.) {
    float t = max(-b - sqrt(hdisc), .01), t1 = -b + sqrt(hdisc);
    for (int i = 0; i < 130; i++) {
      float d = sceneD(ro + rd * t);
      if (d < .0006 * t) {
        col = helmetColor(ro + rd * t, rd, t, pa);
        break;
      }
      t += d * .85;
      if (t > t1) break;
    }
  }
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
