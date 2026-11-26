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
];

/**
 * Le Pilote: a racer's head in a futuristic racing helmet of our own design, turning slowly on itself before a
 * background of neon. Black lacquered shell mirroring the lights, an aerodynamic tail and a small dorsal fin, scoops
 * on the cheeks, a chin bar, a livery line of light in the colour of the moment; a smoked visor that mirrors the
 * background, behind which the pilot's eyes are glimpsed, lit by the glow of the race display. Backgrounds: a ring of
 * neon, a wall of neon tubes, the race behind, speed lines. The background carries the rhythm; the helmet turns at
 * its own pace (about a turn a minute). On the drop (and in « Face à face », cast on drops) it turns to face us, the
 * visor ablaze, its livery lit, for the hold; then it turns again.
 */
export const pilot = defineShaderScene({
  id: "circuit-pilot",
  name: "Le Pilote",
  energy: "calm",
  hdr: true,
  mask: true,
  camera: { framings: FRAMINGS, glideBars: 3 },
  description:
    "Une tête de pilote dans un casque de course futuriste qui tourne lentement sur elle-même devant des néons : coque laquée noire qui reflète la lumière, queue aérodynamique et aileron, liseré de lumière, visière fumée derrière laquelle on devine le regard. Fonds : anneau de néon, mur de tubes, la course derrière, lignes de vitesse. Au drop il se tourne vers nous, la visière s'embrase.",
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
    // CPU side: how long it holds its gaze on us (seconds left)
    uFace: { value: 0 },
  }),
  update(u, f, p, dt, ctx) {
    const bar = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;
    u.uBg.value = p.bg === "tubes" ? 1 : p.bg === "race" ? 2 : p.bg === "speed" ? 3 : 0;
    const build = f.section === "build" ? f.buildProgress : 0;
    u.uCharge.value = approach(u.uCharge.value as number, build, 3, dt);
    if (f.drop) {
      u.uBlaze.value = 1;
      u.uFace.value = bar * 6;
    }
    u.uBlaze.value = (u.uBlaze.value as number) * Math.exp(-dt / (bar * 2.5));
    u.uKick.value = f.beat ? 0 : (u.uKick.value as number) + dt;
    // the tubes' sequence, one step a kick (and quicker through the build); the race and the lines run on
    if (f.beat) u.uSeq.value = (u.uSeq.value as number) + 1;
    u.uSeq.value = (u.uSeq.value as number) + dt * (0.5 + 3 * build);
    u.uRun.value = (u.uRun.value as number) + dt * (1 + 2.5 * build + 1.5 * (u.uBlaze.value as number));
    // the head: turning at its own pace; on the drop it turns to face the camera within a bar, holds, turns again
    let face = (u.uFace.value as number) - dt;
    u.uFace.value = face;
    const rot = u.uRotY.value as number;
    const cam = ctx.camera;
    if (face > 0 && cam) {
      const want = Math.atan2(cam.pos.x - cam.target.x, cam.pos.z - cam.target.z);
      u.uRotY.value = rot + toward(rot, want) * (1 - Math.exp(-dt * (3.5 / bar)));
    } else {
      face = 0;
      u.uRotY.value = rot + dt * ((Math.PI * 2) / 60);
    }
  },
  fragment: /* glsl */ `
uniform float uRotY;    // the head's turn
uniform float uBg;      // 0 ring, 1 tubes, 2 the race, 3 speed lines
uniform float uCharge;  // the build
uniform float uBlaze;   // the drop
uniform float uKick;    // seconds since the kick
uniform float uSeq;     // the tubes' sequence
uniform float uRun;     // the race's and the lines' clock
${ART_LIB}
${CAMERA_GLSL}
${CIRCUIT_GLSL}
float gMat;   // 0 the shell, 1 the visor, 2 scoops and chin, 3 the suit (collar, shoulders)

/** A world point in the head's frame (sdHead's: y up, facing +z), turned with it. */
vec3 toHead(vec3 p) { p.xz = rot(-uRotY) * p.xz; return p; }

/** The visor's window on the shell (negative inside it): a band with rounded corners wrapping round the front. */
float visorWin(vec3 q) {
  float phi = atan(q.x, q.z);
  vec2 d = abs(vec2(phi * .62, q.y - .12)) - vec2(.6, .15);
  return length(max(d + .07, 0.)) + min(max(d.x, d.y) + .07, 0.) - .07;
}

float shellD(vec3 q) { return sdEllipsoid(q - vec3(0., .18, -.07), vec3(.64, .72, .84)); }

/** The helmet and the bust, in the head's frame. */
float helmetD(vec3 q) {
  float shell = shellD(q);
  // the chin bar: the shell carried down and forward under the visor
  shell = smin(shell, sdEllipsoid(q - vec3(0., -.33, .26), vec3(.52, .36, .42)), .22);
  // the aerodynamic tail stretching back, the dorsal fin
  shell = smin(shell, sdEllipsoid(q - vec3(0., .32, -.74), vec3(.34, .19, .48)), .16);
  float fin = max(sdBox(q - vec3(0., .78, -.5), vec3(.02, .13, .38)), q.y - .84 + .3 * (q.z + .5));
  shell = smin(shell, fin, .035);
  // open at the bottom, a little higher at the back
  shell = max(shell, -(q.y + .62 + .12 * q.z));
  // the visor's window cut in the shell, the visor in it (a bubble standing a little proud)
  float win = visorWin(q);
  float cut = max(shell, -(win - .015));
  float visor = max(abs(sdEllipsoid(q - vec3(0., .18, -.07), vec3(.65, .73, .85))) - .01, win);
  // the suit: the neck in its balaclava, a collar, shoulders lost in the dark
  float neck = sdCapsule(q, vec3(0., -.42, -.08), vec3(0., -1.15, -.12), .21);
  float collar = length(vec2(length(q.xz - vec2(0., -.08)) - .29, q.y + .82)) - .08;
  float shoulders = sdEllipsoid(q - vec3(0., -1.38, -.08), vec3(1.05, .38, .5));
  float suit = smin(smin(neck, collar, .06), shoulders, .2);
  float d = cut;
  gMat = 0.;
  if (visor < d) { d = visor; gMat = 1.; }
  if (suit < d) { d = suit; gMat = 3.; }
  return d;
}

vec3 nrm(vec3 q, float e) {
  const vec2 k = vec2(1, -1);
  return normalize(k.xyy * helmetD(q + k.xyy * e) + k.yyx * helmetD(q + k.yyx * e) + k.yxy * helmetD(q + k.yxy * e) + k.xxx * helmetD(q + k.xxx * e));
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

vec3 background(vec3 ro, vec3 rd) {
  vec3 c = mix(vec3(.004, .005, .012), vec3(.0, .0, .003), smoothstep(-.3, .6, rd.y));
  if (uBg < .5) c += bgRing(ro, rd);
  else if (uBg < 1.5) c += bgTubes(ro, rd);
  else if (uBg < 2.5) c += bgRace(ro, rd);
  else c += bgSpeed(ro, rd);
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

vec3 helmetColor(vec3 p, vec3 rd, float t, float pa) {
  vec3 q = toHead(p);
  vec3 qd = toHead(rd);
  helmetD(q);
  float m = gMat;
  vec3 nq = nrm(q, max(.002, t * pa));
  // back to the world, for the reflections
  vec2 nxz = rot(uRotY) * nq.xz;
  vec3 n = normalize(vec3(nxz.x, nq.y, nxz.y));
  vec3 rr = reflect(rd, n);
  vec3 env = background(p, rr) + strips(rr);
  float fw = t * pa;
  // a soft key from the front-left, a rim of the moment's colour from behind
  vec3 key = vec3(.8, .85, 1.) * pow(max(dot(rr, normalize(vec3(-.6, .5, .6))), 0.), 30.) * .6;
  vec3 rim = uTint * pow(1. - max(dot(n, -rd), 0.), 3.) * .25 * (1. + uCharge + uBlaze);
  vec3 c;
  if (m < .5 || m > 1.5 && m < 2.5) {
    // graphite lacquer: deep, glossy, mirroring the neon; the studio's strips lighting it softly
    float f = fres(n, rd, .05);
    float dif = max(dot(n, normalize(gR * .95 - gF * .45)), 0.) + max(dot(n, normalize(-gR * .95 - gF * .3)), 0.) * .7 + max(n.y, 0.) * .4;
    c = vec3(.012, .013, .016) + vec3(.02, .022, .028) * dif + (env + key) * f * 1.4 + rim;
    // the livery: a line of light down the crown, a sweep along the flanks, the visor's rim
    float crown = neon(abs(abs(q.x) - .07), .018, fw) * step(.25, q.y + .4 * max(-q.z, 0.)) * step(-1.1, q.z);
    float sweep = neon(abs(q.y - (.0 - .26 * q.z)), .02, fw) * step(.33, abs(q.x)) * step(q.z, .32);
    // a broad white panel along the crown, between the two lines
    c += vec3(.5, .52, .56) * step(abs(q.x), .07) * step(.3, q.y + .4 * max(-q.z, 0.)) * step(-1.1, q.z) * (.04 + env.g * .3);
    float rimV = neon(abs(visorWin(q) + .012), .016, fw) * step(.1, q.z);
    float liv = (crown + sweep) * (.8 + 1.6 * uCharge + 4. * uBlaze);
    // the visor's rim: chrome catching the strips, a thread of light
    c += (env * .8 + vec3(.15)) * rimV * 1.2 + uTint * rimV * (.4 + 1.5 * uBlaze);
    c += mix(uTint, vec3(1.), .2) * liv;
    if (m > 1.5) {
      // the scoops: a single slit of light
      c *= .8;
      c += uTint * neon(abs(q.y + .3 - .1 * (q.z - .1)), .008, fw) * step(.42, abs(q.x)) * (.8 + 2. * uBlaze);
    }
    // a panel of the moment's colour along the flank, under the sweep
    float flank = step(.33, abs(q.x)) * step(q.y, -.03 - .26 * q.z) * step(-.2 - .26 * q.z, q.y) * step(-.75, q.z) * step(q.z, .3);
    c += uTint * flank * (.05 + .25 * f + .3 * uBlaze);
  } else if (m < 1.5) {
    // the smoked visor: a mirror of the background, the face glimpsed through it, the display's glow
    float f = fres(n, rd, .16);
    vec3 inside = throughVisor(q + qd * .01, qd);
    c = inside * (1. - f) * .9 + (env + key * 2.) * f * 1.5 + uTint * .02 * (1. + 4. * uBlaze);
    // a gradient tint across the smoked glass, darker at its top
    c *= mix(vec3(1.), vec3(.6, .7, 1.), smoothstep(-.05, .28, q.y));
    // the display's light rising inside the visor on the drop
    c += mix(uTint, vec3(1.), .3) * uBlaze * smoothstep(.1, -.08, q.y) * .6;
  } else {
    // the suit: matte, a piping of light round the collar
    c = vec3(.012, .012, .015) + env * fres(n, rd, .03) * .4 + rim * .6;
    c += uTint * neon(abs(q.y + .82), .015, fw) * step(length(q.xz), .45) * (.6 + uBlaze);
  }
  return c;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 ro = uCamPos;
  gF = normalize(uCamTarget - ro);
  gR = normalize(cross(gF, vec3(0., 1., 0.)));
  gU = cross(gR, gF);
  vec3 rd = normalize(uv.x * gR + uv.y * gU + uFocal * gF);
  float pa = 1. / (uRes.y * uFocal);
  vec3 col = background(ro, rd);
  // the bust: march within its bounding sphere
  vec3 bc = vec3(0., -.35, 0.);
  vec3 oc = ro - bc;
  float b = dot(oc, rd), cc = dot(oc, oc) - 2.2 * 2.2;
  float hdisc = b * b - cc;
  if (hdisc > 0.) {
    float t = max(-b - sqrt(hdisc), .01), t1 = -b + sqrt(hdisc);
    for (int i = 0; i < 110; i++) {
      vec3 q = toHead(ro + rd * t);
      float d = helmetD(q);
      if (d < .0008 * t) {
        col = helmetColor(ro + rd * t, rd, t, pa);
        break;
      }
      t += d * .9;
      if (t > t1) break;
    }
  }
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
