import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { num } from "../utils";
import { ART_LIB } from "./lib.glsl";
import { MYCELIUM_GLSL } from "./mycelium.glsl";

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const approach = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-dt * rate));

/** No opening yet: the shaft goes on for ever. */
const NO_OPEN = -1e9;

/**
 * La Chute: the fall down the burrow. A winding shaft of earth without end, its strata streaming up past the camera,
 * roots hanging into it, stones and specks of glowing fungus in its walls, the mycelium running down them and carrying
 * the kicks' pulses up and down the shaft. Now and then an old thing floats by, turning slowly: a pocket watch, a
 * key, a small door, a little bottle with a glowing drink. Slow on the groove, faster and faster through the build
 * (dust, the walls a blur); on the drop the shaft opens just below through the roof of an immense cavern full of
 * glowing mushrooms and threads of mycelium, the fall slows to a float, and the camera sinks slowly into it.
 */
export const fall = defineShaderScene({
  id: "myc-fall",
  name: "La Chute",
  energy: "medium",
  hdr: true,
  mask: true,
  renderScale: 0.65,
  description:
    "La chute dans le terrier : un puits de terre sans fin, ses strates qui défilent, des racines, des pierres et du mycélium lumineux ; de vieux objets flottent en tournant (une montre, une clé, une petite porte, un flacon). La chute accélère pendant la montée ; au drop, le puits s'ouvre sur une caverne immense pleine de champignons lumineux et la chute ralentit.",
  params: [paletteParam("boismort"), { type: "range", key: "pace", label: "Vitesse de chute", min: 0.3, max: 2, step: 0.05, default: 1 }],
  uniforms: () => ({
    uFall: { value: 0 },
    uSpeed: { value: 2 },
    uSpin: { value: 0 },
    uTilt: { value: 0.25 },
    uOpen: { value: NO_OPEN },
    uKick: { value: 9 },
    uKickB: { value: 9 },
    uBurst: { value: 99 },
    uSafe: { value: 0 },
    uLast: { value: -99 },
  }),
  motion: (u) => Math.min(1, Math.max(0, ((u.uSpeed.value as number) - 4) / 10)),
  update(u, f, p, dt) {
    // Back on screen: at the top of the shaft again
    if (f.time - (u.uLast.value as number) > 1.5) {
      u.uFall.value = 0;
      u.uOpen.value = NO_OPEN;
      u.uBurst.value = 99;
      u.uSpeed.value = 2;
    }
    u.uLast.value = f.time;
    u.uSafe.value = f.safeFlash ? 1 : 0;
    if (f.beat) {
      u.uKickB.value = u.uKick.value;
      u.uKick.value = 0;
    } else {
      u.uKick.value = (u.uKick.value as number) + dt;
      u.uKickB.value = (u.uKickB.value as number) + dt;
    }
    const pace = num(p.pace, 1);
    let speed = u.uSpeed.value as number;
    if (f.drop) {
      u.uBurst.value = 0;
      // the shaft ends just below: the camera bursts through the cavern's roof (in about half a second)
      u.uOpen.value = -(u.uFall.value as number) - 1.5 - speed * 0.4;
    } else u.uBurst.value = Math.min(99, (u.uBurst.value as number) + dt);
    const opened = (u.uOpen.value as number) > NO_OPEN / 2;
    const build = f.section === "build" ? f.buildProgress : 0;
    const target = opened ? 1.6 : (f.section === "breakdown" ? 1.2 : 2.2 + 13 * build * build) * pace;
    // falling quicker is gradual; the cavern's float catches the camera fast
    speed = approach(speed, target, opened ? 1.4 : target > speed ? 0.9 : 0.6, dt);
    u.uSpeed.value = speed;
    u.uFall.value = (u.uFall.value as number) + speed * dt;
    // the camera turns slowly round the shaft's axis; looks down the shaft, out over the cavern once in it
    u.uSpin.value = (u.uSpin.value as number) + dt * (0.06 + 0.015 * speed);
    const burst = u.uBurst.value as number;
    const out = opened ? smooth(0, 1.8, burst) : 0;
    const tilt = 0.22 + 0.1 * Math.sin(f.time * 0.13) + 0.75 * out + (out > 0 ? 0 : 0.05 * Math.sin(f.time * 0.31));
    u.uTilt.value = approach(u.uTilt.value as number, tilt, 1.5, dt);
  },
  fragment: /* glsl */ `
uniform float uFall;    // how far the camera has fallen (it is at y = -uFall)
uniform float uSpeed;   // metres a second
uniform float uSpin;    // the camera's turn round the shaft
uniform float uTilt;    // from looking straight down (0) toward the horizontal
uniform float uOpen;    // where the shaft opens into the cavern (very low: not yet)
uniform float uKick;
uniform float uKickB;
uniform float uBurst;
uniform float uSafe;
${ART_LIB}
${MYCELIUM_GLSL}
const float R0 = 2.4;     // the shaft's radius
const float OBJ = 16.;    // a floating thing every so many metres
float gMat;               // 0 earth, 1 root, 2 stone, 3 a thing (gObj: which), 4 cavern rock, 5 a giant mushroom
float gObj;

/** The shaft winds slowly as it goes down: its axis at height y. */
vec2 axisAt(float y) { return vec2(1.3 * sin(y * .035) + .5 * sin(y * .091 + 1.7), 1.1 * cos(y * .029) + .4 * sin(y * .077)); }

/** The shaft's radius at height y, angle a: lumpy earth. */
float radiusAt(float y, float a) {
  vec3 q = vec3(cos(a) * 2., y * .35, sin(a) * 2.);
  return R0 + .35 * vnoise(q) + .14 * vnoise(q * 3.1);
}

/** The things floating in the shaft: k-th, at y_k; its place (offset from the axis) and kind. */
vec4 thingAt(float k) {
  float h = hash12(vec2(k, 7.3));
  float a = h * 6.28;
  float y = -(k * OBJ + 8.);
  return vec4(cos(a) * 1.15, y, sin(a) * 1.15, floor(fract(h * 13.7) * 4.));
}

float sdTorus(vec3 p, float R, float r) { return length(vec2(length(p.xz) - R, p.y)) - r; }

/** One thing (q: its own frame, turning): a pocket watch, a key, a small door, a bottle. */
float thing(vec3 q, float kind) {
  if (kind < .5) {
    // a pocket watch: a thick disc, its bow and crown
    float disc = max(length(q.xy) - .2, abs(q.z) - .035);
    disc = min(disc, sdTorus(vec3(q.x, q.z, q.y - .26), .055, .012));
    disc = min(disc, sdCapsule(q, vec3(0., .2, 0.), vec3(0., .235, 0.), .02));
    return disc;
  } else if (kind < 1.5) {
    // a key: its bow (a ring), its shaft, its bit
    float k = sdTorus(vec3(q.x, q.z, q.y - .2), .07, .016);
    k = min(k, sdCapsule(q, vec3(0., .13, 0.), vec3(0., -.22, 0.), .017));
    k = min(k, sdBox(q - vec3(.04, -.18, 0.), vec3(.04, .035, .01)));
    return k;
  } else if (kind < 2.5) {
    // a small door, its rounded top and its knob
    vec3 d = q;
    float door = sdBox(d - vec3(0., -.06, 0.), vec3(.2, .26, .03));
    door = min(door, max(length(d.xy - vec2(0., .2)) - .2, abs(d.z) - .03));
    door = min(door, length(q - vec3(.12, -.05, .05)) - .025);
    return door;
  }
  // a little bottle
  float b = sdCapsule(q, vec3(0., -.12, 0.), vec3(0., .05, 0.), .085);
  b = smin(b, sdCapsule(q, vec3(0., .05, 0.), vec3(0., .2, 0.), .028), .05);
  b = min(b, sdCapsule(q, vec3(0., .2, 0.), vec3(0., .25, 0.), .034));
  return b;
}

mat3 spinM(float t, float k) {
  vec3 a = normalize(vec3(sin(k * 3.1), 1., cos(k * 1.7)));
  float c = cos(t), s = sin(t);
  return mat3(c + a.x * a.x * (1. - c), a.x * a.y * (1. - c) + a.z * s, a.x * a.z * (1. - c) - a.y * s,
              a.y * a.x * (1. - c) - a.z * s, c + a.y * a.y * (1. - c), a.y * a.z * (1. - c) + a.x * s,
              a.z * a.x * (1. - c) + a.y * s, a.z * a.y * (1. - c) - a.x * s, c + a.z * a.z * (1. - c));
}

/** The cavern below the shaft: its floor, and the field of giant glowing mushrooms on it (mat: 0 floor, 5 mushroom). */
float cavern(vec3 p, out float mat) {
  mat = 0.;
  float fl = uOpen - 120.;
  float d = p.y - fl - 2. * vnoise(vec3(p.xz * .05, 1.));
  vec2 c = floor(p.xz / 18. + .5);
  vec2 l = p.xz - c * 18.;
  float h = hash12(c + 3.3);
  if (h < .75) {
    vec2 o = (vec2(h, fract(h * 7.1)) - .5) * 3.;
    float H = 8. + 16. * fract(h * 3.7), Rc = 2.5 + 2.5 * fract(h * 9.1);
    vec3 q = vec3(l.x - o.x, p.y - fl, l.y - o.y);
    float stem = max(length(q.xz) - Rc * .13, q.y - H);
    float cap = sdEllipsoid(q - vec3(0., H, 0.), vec3(Rc, Rc * .4, Rc));
    cap = max(cap, -(q.y - H + .1 - .4 * Rc * .4 * dot(q.xz, q.xz) / (Rc * Rc)));
    float m = min(stem, cap) * .9;
    if (m < d) { d = m; mat = 5.; }
  }
  // (the next cell's mushrooms stand at least 2.5 inside it)
  float border = 9. - max(abs(l.x), abs(l.y));
  return min(d, border + 2.5);
}

float map(vec3 p) {
  gMat = 0.;
  vec2 ax = axisAt(p.y);
  vec2 rq = p.xz - ax;
  float r = length(rq);
  float a = atan(rq.y, rq.x);
  float R = radiusAt(p.y, a);
  // air: the shaft, and once it opens the cavern below its roof
  float d = max((R - r) * .7, uOpen - p.y);
  // the roof's rock round the hole, stalactites under it
  if (p.y < uOpen + .5 && p.y > uOpen - 6.) {
    // stalactites under the roof
    vec2 sc = floor(p.xz / 4.) + .5;
    vec2 sl = p.xz - sc * 4.;
    float hs = hash12(sc + 1.7);
    float Ls = 1. + 4. * hs;
    float sy = uOpen - p.y;
    float st = length(sl - (vec2(hs, fract(hs * 5.3)) - .5) * 2.) - .5 * (1. - sy / Ls);
    st = max(st * .8, sy - Ls);
    if (r > R + .5 && st < d) { d = st; gMat = 4.; }
    // (the next cells' ones stand at least half a metre inside them)
    d = min(d, 2. - max(abs(sl.x), abs(sl.y)) + .5);
  }
  // roots hanging from the walls, inward and down (this stretch's and the one above); nearer the axis than 1.25, a
  // bound to where they end (none reaches further in); across the wall, to the next sector's (each stands well
  // inside its own)
  if (p.y > uOpen) {
    float fs = fract((a + 3.1416) / .6283);
    d = min(d, r < 1.25 ? 1.25 - r + .05 : min(fs, 1. - fs) * .6283 * r + .25);
  }
  if (r > 1.2 && p.y > uOpen) {
    for (int j = 0; j < 2; j++) {
      float cy = floor(p.y / 1.6) + float(j);
      float sec = floor((a + 3.1416) / .6283);
      float h = hash12(vec2(cy, sec) + 4.1);
      if (h > .55) continue;
      float ar = (sec + .2 + .6 * fract(h * 7.7)) * .6283 - 3.1416;
      float yr = cy * 1.6 + 1.6 * fract(h * 3.3);
      vec2 dir = vec2(cos(ar), sin(ar));
      vec2 axr = axisAt(yr);
      // (rooted just inside the wall: the wall's own bumps never leave them hanging in the air)
      vec3 s0 = vec3(axr + dir * (R0 + .55), yr).xzy;
      float L = .6 + 1.1 * fract(h * 5.9);
      vec3 s1 = s0 + vec3(-dir.x * L * .5, -L * .45, -dir.y * L * .5);
      vec3 s2 = s1 + vec3(-dir.x * L * .15 + .1 * dir.y, -L * .5, -dir.y * L * .15 - .1 * dir.x);
      float rt = min(sdTaper(p, s0, s1, .05, .025), sdTaper(p, s1, s2, .025, .006));
      if (rt < d) { d = rt; gMat = 1.; }
    }
  }
  // stones in the walls
  if (r > R - .4 && p.y > uOpen) {
    vec2 g = vec2(a * R0, p.y) / .7;
    vec2 gi = floor(g);
    float hs = hash12(gi + 9.2);
    if (hs < .35) {
      vec2 gc = (gi + .3 + .4 * vec2(hs * 3., fract(hs * 7.)) ) * .7;
      float ac = gc.x / R0;
      vec2 axs = axisAt(gc.y);
      vec3 c = vec3(axs + vec2(cos(ac), sin(ac)) * (R + .02), gc.y).xzy;
      float st = length(p - c) - (.08 + .14 * fract(hs * 11.));
      if (st < d) { d = st; gMat = 2.; }
    }
  }
  // a floating thing, the nearest one
  float k = floor((-p.y - 8.) / OBJ + .5);
  vec4 th = thingAt(k);
  vec3 tc = vec3(axisAt(th.y) + th.xz, th.y).xzy;
  vec3 tq = p - tc;
  if (dot(tq, tq) < 1.) {
    float o = thing(spinM(uTime * (.4 + .2 * fract(k * .37)) + k, k) * tq, th.w);
    if (o < d) { d = o; gMat = 3.; gObj = th.w; }
  } else d = min(d, length(tq) - .5);
  if (p.y < uOpen + 1.) {
    float cm;
    float cv = cavern(p, cm);
    if (cv < d) { d = cv; gMat = cm; }
  }
  return d;
}

/** The giant whose cell is c (none: false), its base on the floor. */
bool giantAt(vec2 c, out vec2 b) {
  float h = hash12(c + 3.3);
  b = c * 18. + (vec2(h, fract(h * 7.1)) - .5) * 3.;
  return h < .75;
}
/** The cavern's network: a wandering strand of mycelium from each giant to its neighbours. */
float cavNet(vec2 x, float w) {
  vec2 k0 = floor(x / 18.);
  float best = 0.;
  for (int e = 0; e < 5; e++) {
    vec2 ka = k0, kb;
    if (e == 0) kb = k0 + vec2(1., 0.);
    else if (e == 1) kb = k0 + vec2(0., 1.);
    else if (e == 2) { ka = k0 + vec2(1., 0.); kb = k0 + vec2(1., 1.); }
    else if (e == 3) { ka = k0 + vec2(0., 1.); kb = k0 + vec2(1., 1.); }
    else kb = k0 + vec2(1., 1.);
    vec2 a, b;
    if (!giantAt(ka, a) || !giantAt(kb, b)) continue;
    float hl = hash12(ka * 3.7 + kb * 1.3);
    if (hl > (e == 4 ? .4 : .85)) continue;
    vec2 pa = x - a, ba = b - a;
    float L = length(ba);
    float t = clamp(dot(pa, ba) / (L * L), 0., 1.);
    vec2 nn = vec2(-ba.y, ba.x) / L;
    float wander = sin(t * 3.1416) * (2.5 * sin(t * 7. + hl * 20.) + 3. * (hl - .4));
    best = max(best, mycLine(abs(dot(pa - ba * t, nn) - wander), .15, w));
  }
  return best;
}

vec3 nrm(vec3 p, float e) {
  const vec2 k = vec2(1, -1);
  return normalize(k.xyy * map(p + k.xyy * e) + k.yyx * map(p + k.yyx * e) + k.yxy * map(p + k.yxy * e) + k.xxx * map(p + k.xxx * e));
}

/** The earth's strata at height y: dark soil, red clay, pale chalk, in uneven layers. */
vec3 strata(float y, float a) {
  float s = y * .9 + .8 * vnoise(vec3(a * 2., y * .2, 1.));
  float b = fract(s * .37);
  vec3 soil = vec3(.05, .035, .025), clay = vec3(.12, .055, .035), chalk = vec3(.2, .18, .15);
  vec3 c = b < .5 ? soil : b < .78 ? clay : chalk;
  return c * (.7 + .5 * vnoise(vec3(a * 9., y * 3., 4.)));
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  float y0 = -uFall;
  vec3 ro = vec3(axisAt(y0), y0).xzy;
  // looking down the shaft, turning; out over the cavern once in it
  vec3 hz = vec3(cos(uSpin), 0., sin(uSpin));
  vec3 fw = normalize(vec3(0., -cos(uTilt), 0.) + hz * sin(uTilt) + vec3(axisAt(y0 - 6.) - axisAt(y0), 0.).xzy * .15);
  vec3 side = vec3(-hz.z, 0., hz.x);
  vec3 rt = normalize(side - fw * dot(side, fw));
  vec3 up = cross(rt, fw);
  // the lens opens with the speed
  float focal = 1.2 - .35 * smoothstep(3., 13., uSpeed);
  vec3 rd = normalize(rt * uv.x + up * uv.y + fw * focal);
  float pa = 1. / (uRes.y * focal);
  vec3 glowC = uTint * uTint * 1.3;
  bool inCave = uOpen > -1e8;

  float t = .05, tmax = inCave ? 260. : 90.;
  bool hit = false;
  for (int i = 0; i < 140; i++) {
    float d = map(ro + rd * t);
    if (d < max(.0008, t * pa * .7)) { hit = true; break; }
    t += d * .85;
    if (t > tmax) break;
  }
  float tHit = min(t, tmax);
  float flash = uSafe > .5 ? .3 : 1.;
  vec3 col = vec3(0.);
  // light: a cold glow from far above (the hole's mouth), fading as the camera falls
  vec3 skyL = mix(uInk, vec3(.7, .8, 1.), .4) * (.15 + .5 * exp(-uFall * .02));
  if (hit) {
    vec3 p = ro + rd * t;
    map(p);
    float mat = gMat, kind = gObj;
    vec3 n = nrm(p, max(.0015, t * pa));
    vec2 rq = p.xz - axisAt(p.y);
    float a = atan(rq.y, rq.x);
    float fwid = t * pa / max(abs(dot(n, rd)), .15);
    float top = max(n.y, 0.) * .6 + .4;
    float dy = abs(p.y - y0);
    float pulse = mycPulse(dy, uKick, 7., 1.2) + .6 * mycPulse(dy, uKickB, 7., 1.2);
    vec3 alb;
    vec3 emit = vec3(0.);
    if (mat < .5) {
      alb = strata(p.y, a);
      // the mycelium in veins running down the walls (wavering, broken), and specks of glowing fungus
      float u = a * R0 * 2. + .9 * vnoise(vec3(a * R0 * .7, p.y * .25, 3.));
      float th = mycLine(abs(fract(u) - .5) * .5, .006, fwid) * smoothstep(.55, .75, vnoise(vec3(a * R0 * 2., p.y * 1.1, 9.)));
      emit += glowC * th * (.25 + 4. * pulse);
      vec2 g = floor(vec2(a * R0 * 3., p.y * 3.));
      float hs = hash12(g + 3.1);
      if (hs > .93) {
        vec2 lc = fract(vec2(a * R0 * 3., p.y * 3.)) - .5;
        emit += glowC * 1.5 * exp(-dot(lc, lc) * 40.) * (.6 + .8 * uHat * fract(hs * 9.));
      }
    } else if (mat < 1.5) {
      alb = vec3(.06, .045, .035);
    } else if (mat < 2.5) {
      alb = vec3(.09, .085, .08);
    } else if (mat < 3.5) {
      // old things: brass (the watch, the key), dark wood (the door), glass with a glowing drink (the bottle)
      if (kind < 1.5) {
        alb = vec3(.55, .38, .14);
        vec3 rf = reflect(rd, n);
        emit += vec3(.9, .7, .35) * pow(max(dot(rf, vec3(0., 1., 0.)), 0.), 6.) * .5 + glowC * .25 * max(-rf.y, 0.);
      } else if (kind < 2.5) {
        alb = vec3(.09, .05, .03);
      } else {
        alb = vec3(.05, .07, .06);
        emit += glowC * (.6 + .4 * uHat) * pow(1. - max(dot(n, -rd), 0.), 2.) + glowC * .35;
      }
    } else if (mat < 4.5) {
      // the cavern's roof and its stalactites, glowworms all over them
      alb = vec3(.05, .045, .04);
      vec2 g = floor(p.xz * 2.);
      float hs = hash12(g + 7.7);
      if (hs > .8) emit += vec3(.45, .9, 1.) * glowC * .8 * (.5 + .5 * sin(uTime * (1. + hs * 3.) + hs * 30.));
    } else {
      // a giant mushroom far below: dark, its cap glowing through, brightest at the rim, its gills under it
      vec2 c = floor(p.xz / 18. + .5);
      float h = hash12(c + 3.3);
      vec2 o = (vec2(h, fract(h * 7.1)) - .5) * 3.;
      float Rc = 2.5 + 2.5 * fract(h * 9.1);
      float k = clamp(length(p.xz - c * 18. - o) / Rc, 0., 1.);
      vec3 gc = mix(glowC, pal(fract(h + .2 + k * .3)) * .6, .3);
      alb = vec3(.02, .018, .022);
      emit += gc * (.03 + 1.1 * pow(k, 4.) + 1.3 * smoothstep(.2, -.6, n.y)) * (1. + .6 * pulse);
    }
    // the cavern's floor: veins of mycelium between the giants, and the finer threads
    if (inCave && p.y < uOpen - 100. && mat < .5) {
      alb = vec3(.025, .025, .02);
      float vein = cavNet(p.xz, fwid);
      float th = mycThreads(p.xz * .6, fwid * .6);
      float ring = uBurst < 99. ? exp(-pow((length(p.xz - ro.xz) - uBurst * 9.) / 5., 2.)) * exp(-uBurst * .1) * flash : 0.;
      emit += glowC * (vein * (.8 + 3. * pulse + 6. * ring) + th * .4 + .01);
    }
    // the light: a cold glow from above, and a soft light falling with the camera (the walls rushing past)
    vec3 lv = ro + fw * .6 - p;
    float ld2 = dot(lv, lv);
    vec3 fill = mix(uInk, vec3(1., .85, .65), .35) * 2.4 * max(dot(n, lv * inversesqrt(ld2)), 0.) / (1. + ld2 * .05);
    vec3 light = skyL * top + glowC * .08 + fill * (inCave && p.y < uOpen ? .1 : 1.);
    col = alb * light + emit;
  } else if (inCave) {
    col = uBase * .5;
  }
  // dust in the shaft (streaking past with the speed); the cavern's haze, lit by what glows in it
  float haze = inCave && ro.y < uOpen + 2. ? 1. - exp(-tHit * .006) : 1. - exp(-tHit * .03);
  vec3 hazeC = inCave ? glowC * .025 + skyL * .015 : skyL * .04;
  col = mix(col, hazeC, haze);
  col += mycMotes(ro, rd, tHit, 1.2, .25, .006, pa, -.02, skyL * 1.5, glowC, .4) * 1.5;
  // the moment it bursts through the roof
  if (uBurst < 3.) col += glowC * .3 * exp(-uBurst * 1.5) * flash;
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
