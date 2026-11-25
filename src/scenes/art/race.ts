import * as THREE from "three";
import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Lanes on each side of the middle one. */
const LANES = 5;
const NL = LANES * 2 + 1;
/** The most followers a file can hold. */
const MAX_FOLLOWERS = 14;

// Every framing looks toward the heart, or down on the track it lights: the figures are always against the light.
const FRAMINGS: Framing[] = [
  // low, in profile, from outside the track: the lanes stacked in depth against the bright horizon
  { az: 1.27, el: 0.02, dist: 15, target: [0, 0.9, -1], focal: 2.2, weight: 3 },
  // far behind them, a long lens toward the heart: the silhouettes small against the glow, their shadows coming at us
  { az: 0.03, el: 0.035, dist: 38, target: [0, 1.6, -10], focal: 2.6, weight: 3 },
  // high above: the black figures and their long shadows on the bright track
  { az: 0.2, el: 1.12, dist: 15, target: [0, 0, 5], focal: 1.5, weight: 2 },
  // three-quarter back, close on the middle runner (the lanes beside it run a little ahead), the heart over its shoulder
  { az: 0.42, el: 0.22, dist: 4.6, target: [0, 1.15, 0], focal: 1.7, weight: 2 },
];

/**
 * The race, in shadow play: black figures run in lanes on an endless wet track toward a great white heart standing
 * on the horizon, the only light, which never comes closer (the track is a treadmill). Behind each runner, a file of
 * small figures follows it: its followers. Everything is backlit: the figures are pure silhouettes, their long
 * shadows stretch back toward us on the bright track. The heart beats lub-dub on the kick and the light breathes with
 * it; strides quicken through the build; on the drop the heart bursts in a wave of white and a rain of small black
 * hearts, a runner stumbles and its followers go to the others. As the night drifts, more runners, and some tire.
 */
export const race = defineShaderScene({
  id: "race",
  name: "La Course",
  energy: "medium",
  hdr: true,
  // the whole frame is the scene: its light reaches every pixel, the world's background stays behind it
  mask: true,
  renderScale: 0.75,
  camera: { framings: FRAMINGS, glideBars: 2 },
  description:
    "Ombres chinoises : des silhouettes noires courent sur une piste mouillée vers un grand cœur blanc posé sur l'horizon, qui ne se rapproche jamais, chacune suivie d'une file de petites silhouettes ; leurs longues ombres s'étirent vers nous. Le cœur bat au kick ; au drop il éclate en vague de lumière et en pluie de petits cœurs noirs, et un coureur tombe.",
  params: [paletteParam("mono")],
  uniforms: () => ({
    // per lane: occupied, followers (the last one grows or shrinks), where its runner is, its stride phase
    uLane: { value: Array.from({ length: NL }, () => new THREE.Vector4()) },
    uScroll: { value: 0 },
    uHeart: { value: 0 },
    uEcho: { value: 9 },
    uGlow: { value: 0.6 },
    uBurst: { value: 99 },
    uFallLane: { value: 99 },
    uDown: { value: 0 },
    uSafe: { value: 0 },
    // state kept on the CPU side only
    uRun: { value: 0 },
    uFall: { value: 99 },
    uCad: { value: 1.35 },
    uDub: { value: 0 },
    uLast: { value: -99 },
    uBase: { value: new Array<number>(NL).fill(0) },
    uTarget: { value: new Array<number>(NL).fill(0) },
    // per lane: its place, its cadence (< .8: tired), its own offset in the stride
    uZ: { value: new Array<number>(NL).fill(0) },
    uLaneCad: { value: new Array<number>(NL).fill(1) },
    uLanePh: { value: new Array<number>(NL).fill(0) },
  }),
  update(u, f, _p, dt) {
    const lanes = u.uLane.value as THREE.Vector4[];
    const base = u.uBase.value as number[];
    const target = u.uTarget.value as number[];
    const zs = u.uZ.value as number[];
    const cads = u.uLaneCad.value as number[];
    const phs = u.uLanePh.value as number[];
    // Back on screen: a new field of runners (more of them, and more tired ones, as the night drifts)
    if (f.time - (u.uLast.value as number) > 1.5) {
      for (let i = 0; i < NL; i++) {
        const mid = i === LANES;
        const side = Math.abs(i - LANES);
        const occ = mid || Math.random() < 0.6 + 0.4 * f.drift;
        const n = occ ? Math.round(Math.pow(Math.random(), 1.4) * 9) : 0;
        base[i] = target[i] = mid ? Math.max(n, 4) : n;
        // only the outer lanes tire: a runner dropping back never passes the close framing's camera
        const tired = side >= 3 && occ && Math.random() < 0.5 * f.drift;
        // the runners beside the middle one stay a little ahead of it, clear of the close framing from behind
        zs[i] = mid ? 0 : side === 1 ? -0.4 - 0.9 * Math.random() : (Math.random() - 0.5) * 2.4;
        cads[i] = tired ? 0.72 : 0.88 + 0.24 * Math.random();
        phs[i] = Math.random() * Math.PI * 2;
        lanes[i].set(occ ? 1 : 0, base[i], zs[i], phs[i]);
      }
      u.uFall.value = u.uBurst.value = u.uFallLane.value = 99;
    }
    u.uLast.value = f.time;
    u.uSafe.value = f.safeFlash ? 1 : 0;

    // Stride: their own cadence, quicker through the build and the drop, and over the night
    const push = f.section === "build" ? f.buildProgress : f.section === "drop" ? 1 : 0;
    const cadTarget = 1.35 * (1 + 0.55 * push + 0.25 * f.drift);
    const cad = (u.uCad.value as number) + (cadTarget - (u.uCad.value as number)) * (1 - Math.exp(-dt * 0.8));
    u.uCad.value = cad;
    u.uRun.value = (u.uRun.value as number) + dt * Math.PI * 2 * cad;
    // the track carries a planted foot back as fast as the stride does (0.72 m over the 38 % of a stride on the ground)
    u.uScroll.value = (u.uScroll.value as number) + dt * 1.9 * cad;
    const glow = 0.55 + 0.6 * push + 0.3 * f.drift;
    u.uGlow.value = (u.uGlow.value as number) + (glow - (u.uGlow.value as number)) * (1 - Math.exp(-dt * 2));

    // The heart: lub on the kick, dub a moment later
    let hb = (u.uHeart.value as number) * Math.exp(-dt * 7);
    if (f.beat) {
      hb = Math.max(hb, 1);
      u.uDub.value = 0.17;
      u.uEcho.value = 0;
    }
    const dub = u.uDub.value as number;
    if (dub > 0) {
      if (dub - dt <= 0) hb = Math.max(hb, 0.7);
      u.uDub.value = dub - dt;
    }
    u.uHeart.value = hb;
    u.uEcho.value = (u.uEcho.value as number) + dt;

    // The drop: the heart bursts, a runner stumbles, and its followers go to the runners beside it
    const fallen = (u.uFallLane.value as number) + LANES;
    if (f.drop) {
      u.uBurst.value = 0;
      const others = lanes.map((_, i) => i).filter((i) => lanes[i].x > 0 && i !== LANES);
      const k = others.length ? others[Math.floor(Math.random() * others.length)] : LANES;
      u.uFall.value = 0;
      u.uFallLane.value = k - LANES;
      let l = k - 1;
      while (l >= 0 && !lanes[l].x) l--;
      let r = k + 1;
      while (r < NL && !lanes[r].x) r++;
      const give = target[k];
      target[k] = 0;
      if (l >= 0 && r < NL) {
        target[l] = Math.min(MAX_FOLLOWERS, target[l] + Math.ceil(give / 2));
        target[r] = Math.min(MAX_FOLLOWERS, target[r] + Math.floor(give / 2));
      } else if (l >= 0) target[l] = Math.min(MAX_FOLLOWERS, target[l] + give);
      else if (r < NL) target[r] = Math.min(MAX_FOLLOWERS, target[r] + give);
    } else {
      u.uBurst.value = (u.uBurst.value as number) + dt;
      const was = u.uFall.value as number;
      u.uFall.value = was + dt;
      // Back on its feet (it runs back from behind): a few followers again
      if (was < 12 && was + dt >= 12 && fallen >= 0 && fallen < NL) target[fallen] = Math.max(1, Math.round(base[fallen] / 2));
    }
    // The files change one follower at a time
    for (let i = 0; i < NL; i++) {
      const c = lanes[i].y;
      lanes[i].y = c + Math.max(-2.5 * dt, Math.min(1.5 * dt, target[i] - c));
    }
    // Where each runner is now: a tired one drifts back and catches up again; the one that stumbled goes down, is
    // carried away behind by the track, then runs back. Its stride phase (wrapped over 4 strides: the followers
    // run 1.25 times faster, and stay continuous)
    const fall = u.uFall.value as number;
    const fl = (u.uFallLane.value as number) + LANES;
    const run = u.uRun.value as number;
    u.uDown.value = fall < 16 ? smooth(0, 0.7, fall) * (1 - smooth(9, 10, fall)) : 0;
    for (let i = 0; i < NL; i++) {
      let z = zs[i];
      if (cads[i] < 0.8) z += 7 * smooth(0.3, 1, 0.5 + 0.5 * Math.sin(f.time * 0.06 + phs[i]));
      if (i === fl && fall < 16) z += 14 * (smooth(0.3, 5, fall) - smooth(10, 16, fall));
      lanes[i].z = z;
      lanes[i].w = (run * cads[i] + phs[i]) % (Math.PI * 8);
    }
  },
  fragment: /* glsl */ `
uniform vec4 uLane[${NL}]; // occupied, followers, the runner's z, its stride phase
uniform float uScroll;    // the track's travel
uniform float uHeart;     // the heartbeat, lub-dub
uniform float uEcho;      // seconds since the last beat: an outline spreads from the heart
uniform float uGlow;      // the light's level, rising through the build
uniform float uBurst;     // seconds since the drop
uniform float uFallLane;  // the lane whose runner stumbled
uniform float uDown;      // how far down it is
uniform float uSafe;      // 1: flashes tamed (one soft ramp, never a pop)
${ART_LIB}
${CAMERA_GLSL}
const float NLS = ${LANES}.;
const float LW = 1.25;    // lane width
const float S = .62;      // follower spacing
const float FS = .38;     // follower scale
const float ZH = -60., HY = 4.6, HSZ = 6.;   // the heart: far ahead, standing on the horizon
const float TW = (NLS + .5) * LW;            // half the track's width
const float K = 7.;       // the light is low, straight ahead: a shadow is 7 times as long as its caster is high
const float SA = .14142;  // sine of the light's elevation, 1 / sqrt(1 + K²)
const float THR = .75;    // a figure is hit within this many pixels; its edge fades over the next 1.2
const float STANCE = .38; // share of the stride a foot is on the ground

float gObj;               // distance to the figures alone (no cell bounds): what the hit and the edges read
float gPose = -99.;       // which figure the joints below hold (lane, + 16 × (follower + 1))
vec3 gHd;                 // toward the heart, from the camera
float gLight;             // the light's level now
vec2 gHs;                 // the heart's visibility and size

// the figure being posed: its joints, feet at y = 0, running toward -z
vec3 jPel, jUp, jFw;
vec3 jHip[2], jKnee[2], jAnk[2], jToe[2], jSh[2], jEl[2], jHand[2];

/**
 * The pose of a runner at stride phase ph; down: 0 running, 1 fallen on the track. The feet follow a stride (planted
 * and carried back by the track, then the heel kicks up and the leg swings through) and the knees are solved from them,
 * so a planted foot stays on the ground. The arms swing against the legs, elbows bent. Not full: only the hips and
 * the ankles (a follower's shadow).
 */
void pose(float ph, float down, bool full) {
  float u0 = fract(ph * .15915);
  const float lean = .13;
  jUp = vec3(0., cos(lean), -sin(lean));
  jFw = vec3(0., -sin(lean), -cos(lean));
  // the body sinks a little on each footfall, rises in the flight between
  jPel = vec3(0., .925 - .03 * cos(12.566 * (u0 - .19)), 0.);
  for (int k = 0; k < 2; k++) {
    float sd = k == 0 ? 1. : -1.;
    float u = fract(u0 + .5 * float(k));
    vec2 f;
    if (u < STANCE) {
      float s = u / STANCE;
      f = vec2(mix(-.28, .44, s), .085 + .08 * smoothstep(.55, 1., s));
    } else {
      float s = (u - STANCE) / (1. - STANCE);
      f = vec2(mix(.44, -.32, smoothstep(.15, .88, s)) + .04 * smoothstep(.88, 1., s),
               mix(.165, .085, s) + .38 * sin(3.1416 * pow(s, .7)) * (1. - .4 * s));
    }
    vec3 hip = jPel + vec3(sd * .088, -.04, 0.);
    vec3 v = vec3(sd * .1, f.y, f.x) - hip;
    float l = length(v);
    vec3 dir = v / l;
    l = min(l, .905);
    jHip[k] = hip;
    jAnk[k] = hip + dir * l;
    if (!full) continue;
    float ca = (.2116 + l * l - .2025) / (.92 * l);
    vec3 n = normalize(vec3(0., -dir.z, dir.y));
    vec3 knee = hip + .46 * (dir * ca + n * sqrt(max(1. - ca * ca, 0.)));
    vec3 ank = hip + dir * l;
    vec3 sh = (ank - knee) / .45;
    vec3 swing = normalize(vec3(0., -sh.z - .3, sh.y));
    vec3 stand = normalize(vec3(0., .03 - ank.y, -max(.18 - ank.y, .03)));
    float w = 1. - smoothstep(STANCE, STANCE + .1, u) + smoothstep(.93, 1., u);
    jKnee[k] = knee;
    jToe[k] = ank + .17 * normalize(mix(swing, stand, w));
    // the arm swings against the leg on its side, elbow bent
    float pa = u < STANCE ? .5 * u / STANCE : .5 + .5 * (u - STANCE) / (1. - STANCE);
    float th = .05 - .5 * cos(6.2832 * pa);
    float eb = th + 1.5 + .25 * max(th, 0.);
    vec3 s = jPel + jUp * .45 + vec3(sd * .18, 0., 0.);
    vec3 e = s + .27 * vec3(sd * .1, -cos(th), -sin(th));
    jSh[k] = s;
    jEl[k] = e;
    jHand[k] = e + .24 * vec3(-sd * .2, -cos(eb), -sin(eb));
  }
  if (down > 0.) {
    // fallen face down, along the track, arms thrown ahead
    jPel = mix(jPel, vec3(0., .13, .15), down);
    jUp = normalize(mix(jUp, vec3(0., .08, -1.), down));
    jFw = normalize(mix(jFw, vec3(0., -1., .08), down));
    for (int k = 0; k < 2; k++) {
      float sd = k == 0 ? 1. : -1.;
      jHip[k] = mix(jHip[k], vec3(sd * .09, .11, .17), down);
      jKnee[k] = mix(jKnee[k], vec3(sd * .11, .1, .62), down);
      jAnk[k] = mix(jAnk[k], vec3(sd * .12, .09, 1.06), down);
      jToe[k] = mix(jToe[k], vec3(sd * .12, .03, 1.2), down);
      jSh[k] = mix(jSh[k], vec3(sd * .175, .17, -.31), down);
      jEl[k] = mix(jEl[k], vec3(sd * .32, .07, -.45), down);
      jHand[k] = mix(jHand[k], vec3(sd * .26, .05, -.68), down);
    }
  }
}

/** A limb from a to b, tapering from ra to rb, its muscle swelling (by bulge, pushed toward off) in its upper part. */
float limb(vec3 p, vec3 a, vec3 b, float ra, float rb, float bulge, vec3 off) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.);
  float s = sin(3.1416 * sqrt(h));
  return length(pa - ba * h - off * s) - mix(ra, rb, h) - bulge * s;
}
float sdTaper(vec3 p, vec3 a, vec3 b, float ra, float rb) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.);
  return length(pa - ba * h) - mix(ra, rb, h);
}

/** The posed runner: only its outline will show, so its volumes are sculpted for the silhouette. lod: a follower. */
float runner(vec3 q, bool lod) {
  vec3 pel = jPel, up = jUp, fw = jFw;
  // standing, the trunk and arms are all above .8 and the legs all below 1: each half is drawn only near it
  bool lying = up.y < .95;
  float d;
  if (lying || q.y > .6) {
    // pelvis, belly, ribcage: wider at the chest than at the waist
    d = sdEllipsoid(q - pel - up * .03, vec3(.14, .11, .105));
    d = smin(d, sdCapsule(q, pel + up * .08, pel + up * .26, .115), .07);
    d = smin(d, sdEllipsoid(q - pel - up * .36 - fw * .015, vec3(.16, .16, .105)), .08);
    if (!lod) {
      // the shoulders sloping down from the neck, and the neck
      vec3 nb = pel + up * .52;
      d = smin(d, sdCapsule(q, nb, jSh[0], .05), .06);
      d = smin(d, sdCapsule(q, nb, jSh[1], .05), .06);
      d = smin(d, sdCapsule(q, nb, pel + up * .6 + fw * .03, .054), .04);
    }
    d = smin(d, sdEllipsoid(q - pel - up * .685 - fw * .04, vec3(.08, .1, .094)), lod ? .07 : .035);
    for (int k = 0; k < 2; k++) {
      // upper arm, forearm, fist
      d = smin(d, sdTaper(q, jSh[k], jEl[k], .047, .036), .04);
      d = smin(d, sdTaper(q, jEl[k], jHand[k], .036, .027), .025);
      if (!lod) d = smin(d, length(q - jHand[k]) - .04, .02);
    }
  } else d = .78 - q.y;   // (well beyond the blends' width: it never swells the legs)
  if (lying || q.y < 1.12) {
    for (int k = 0; k < 2; k++) {
      vec3 kn = jKnee[k], an = jAnk[k];
      vec3 sh = (an - kn) / .45;
      // thigh (the quadriceps forward), shin with its calf (behind), foot from the heel
      d = smin(d, limb(q, jHip[k], kn, .078, .05, .008, fw * .012), .06);
      d = smin(d, limb(q, kn, an, .05, .03, .011, vec3(0., sh.z, -sh.y) * .014), .025);
      if (!lod) d = smin(d, sdTaper(q, an + vec3(0., -.04, .03), jToe[k], .036, .022), .03);
    }
  }
  return d;
}

/** A lane's runner: where it is, whether it is down, its stride phase (worked out on the CPU). */
void laneState(float li, vec4 L, out float zr, out float down, out float ph) {
  zr = L.z;
  down = abs(li - uFallLane) < .5 ? uDown : 0.;
  ph = L.w;
}

/** The boxes holding a lane's runner and its file of n followers: nothing of that lane is nearer. */
float laneBox(vec3 q, float n, float down) {
  float d = sdBox(q - vec3(0., .9 - .6 * down, .08 + .25 * down), vec3(.42, .92 - .62 * down, .62 + .62 * down));
  if (n > .01) {
    float cnt = ceil(n);
    d = min(d, sdBox(vec3(q.x, q.y - .36, q.z - .65 - (cnt - 1.) * S * .5), vec3(.26, .38, (cnt - 1.) * S * .5 + .32)));
  }
  return d;
}

float map(vec3 p) {
  gObj = 1e3;
  float outside = max(abs(p.x) - TW, p.y - 2.);
  if (outside > 0.) return outside + .05;
  float li = clamp(floor(p.x / LW + .5), -NLS, NLS);
  vec4 L = uLane[int(li + NLS)];
  // never step past the lane's edge unless the lane beyond holds nothing near (rays running along the lanes,
  // in the long views, would crawl along their edges)
  float o = p.x - li * LW;
  float edge = LW * .5 - abs(o) + .05;
  if (edge < .25) {
    float nl = li + sign(o);
    float near = edge + LW;
    if (abs(nl) <= NLS) {
      vec4 Ln = uLane[int(nl + NLS)];
      if (Ln.x > .5) {
        float zn, dn, pn;
        laneState(nl, Ln, zn, dn, pn);
        near = min(near, laneBox(vec3(p.x - nl * LW, p.y, p.z - zn), Ln.y, dn));
      }
    }
    edge = min(max(edge, near), LW * .5 + abs(o));
  }
  if (L.x < .5) return max(edge, .05);
  float zr, down, ph;
  laneState(li, L, zr, down, ph);
  vec3 q = vec3(o, p.y, p.z - zr);
  float d = sdBox(q - vec3(0., .9 - .6 * down, .08 + .25 * down), vec3(.42, .92 - .62 * down, .62 + .62 * down));
  if (d < .3) {
    // (a ray's steps near a figure mostly pose the same one again)
    if (gPose != li) { pose(ph, down, true); gPose = li; }
    d = runner(q, false);
  }
  float bound = edge;
  // its followers, in a file behind it
  float n = L.y;
  if (n > .01) {
    float cnt = ceil(n);
    float tz = q.z - .65;
    float tb = sdBox(vec3(q.x, q.y - .36, tz - (cnt - 1.) * S * .5), vec3(.26, .38, (cnt - 1.) * S * .5 + .32));
    if (tb < d) {
      float i = clamp(floor(tz / S + .5), 0., cnt - 1.);
      float sc = FS * (i > cnt - 1.5 ? n - cnt + 1. : 1.);
      vec3 fq = vec3(q.x - .07 * sin(i * 2.3 + li), q.y, tz - i * S);
      if (sc > .01) {
        float fd = sdBox(fq - vec3(0., .9, .08) * sc, vec3(.42, .92, .62) * sc);
        if (fd < .2) {
          float key = li + 16. * (i + 1.);
          if (gPose != key) { pose(ph * 1.25 + i * 1.7, 0., true); gPose = key; }
          fd = runner(fq / sc, true) * sc;
        }
        d = min(d, fd);
      }
      // inside the file, the next follower is at least as far as this one's cell edge
      // (kept well above the hit threshold, or the cell edges would show from afar)
      // (and only as near as the file itself: above it, the rays need not crawl)
      if (tz > -S * .5 && tz < (cnt - .5) * S) bound = min(bound, max(S * .5 - abs(tz - i * S) + .06, tb));
    }
  }
  gObj = d;
  return min(d, bound);
}

/** The shadow of segment a-b (radius r) cast on the ground, at ground point p (in light space): distance / penumbra. */
float shadowSeg(vec2 p, vec3 a, vec3 b, float r, float w0) {
  vec2 A = vec2(a.x, (a.z + a.y * K) * SA), B = vec2(b.x, (b.z + b.y * K) * SA);
  vec2 pa = p - A, ba = B - A;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0., 1.);
  // sharp at the feet, softer as the caster rises above the ground
  return (length(pa - ba * h) - r) / (w0 + .03 * mix(a.y, b.y, h));
}
/** The posed figure's shadow at ground point q (its own frame): < -1 in full shadow, > 1 in the light. */
float figShadow(vec2 q, bool lod, float w0) {
  // the light is straight ahead along the track: a shadow falls back along it; squeezing z by the light's sine makes
  // the shadow of a ball a disc, so the shadow of a capsule is a 2D capsule
  vec2 p = vec2(q.x, q.y * SA);
  float s = shadowSeg(p, jPel, jPel + jUp * .5, .15, w0);
  s = min(s, shadowSeg(p, jPel + jUp * .62, jPel + jUp * .72, .08, w0));
  for (int k = 0; k < 2; k++) {
    if (lod) {
      // a follower: small and far below, a leg is one stroke
      s = min(s, shadowSeg(p, jHip[k], jAnk[k], .06, w0));
      continue;
    }
    s = min(s, shadowSeg(p, jHip[k], jKnee[k], .07, w0));
    s = min(s, shadowSeg(p, jKnee[k], jAnk[k], .045, w0));
    s = min(s, shadowSeg(p, jAnk[k], jToe[k], .03, w0));
    s = min(s, shadowSeg(p, jSh[k], jEl[k], .042, w0));
    s = min(s, shadowSeg(p, jEl[k], jHand[k], .035, w0));
  }
  return s;
}
/** How much of the heart's light the runners and their files hold off ground point g (x, z): 0..1. */
float laneShadow(vec2 g) {
  gPose = -99.;
  float li = clamp(floor(g.x / LW + .5), -NLS, NLS);
  vec4 L = uLane[int(li + NLS)];
  if (L.x < .5) return 0.;
  float zr, down, ph;
  laneState(li, L, zr, down, ph);
  vec2 q = vec2(g.x - li * LW, g.y - zr);
  if (abs(q.x) > .5) return 0.;
  float s = 1e3;
  if (q.y > -.9 && q.y < 1.8 * K + 1.3) {
    pose(ph, down, true);
    s = figShadow(q, false, .006);
  }
  float n = L.y;
  if (n > .01 && abs(q.x) < .3) {
    float cnt = ceil(n), tz = q.y - .65;
    float hi = min(cnt - 1., floor((tz + .35) / S));
    float lo = max(0., ceil((tz - FS * 1.8 * K - .3) / S));
    for (int j = 0; j < 10; j++) {
      float i = hi - float(j);
      if (i < lo) break;
      float sc = FS * (i > cnt - 1.5 ? n - cnt + 1. : 1.);
      if (sc < .01) continue;
      vec2 fq = vec2(q.x - .07 * sin(i * 2.3 + li), tz - i * S) / sc;
      if (j < 3) {
        // the nearest ones, whose legs still show at their feet
        pose(ph * 1.25 + i * 1.7, 0., false);
        s = min(s, figShadow(fq, true, .006 / sc));
      } else {
        // further back, only their trunks and heads reach this far: no stride to pose
        vec2 p = vec2(fq.x, fq.y * SA);
        const vec3 P0 = vec3(0., .925, 0.), U0 = vec3(0., .9916, -.1296);
        s = min(s, shadowSeg(p, P0, P0 + U0 * .5, .15, .006 / sc));
        s = min(s, shadowSeg(p, P0 + U0 * .62, P0 + U0 * .72, .08, .006 / sc));
      }
    }
  }
  return 1. - smoothstep(-1., 1., s);
}

float dot2(vec2 v) { return dot(v, v); }
/** A heart, tip at the origin, about 1.2 tall. */
float sdHeart(vec2 p) {
  p.x = abs(p.x);
  if (p.y + p.x > 1.) return sqrt(dot2(p - vec2(.25, .75))) - .35355;
  return sqrt(min(dot2(p - vec2(0., 1.)), dot2(p - .5 * max(p.x + p.y, 0.)))) * sign(p.x - p.y);
}

/** The heart's visibility and size: it bursts on the drop, then forms again. */
vec2 heartState() {
  if (uBurst > 6.) return vec2(1.);
  float back = smoothstep(2.5, 5.5, uBurst);
  // tamed, it melts into the swell of light instead of flaring up
  float T = uSafe > .5 ? 1.2 : .5;
  float vis = max(1. - smoothstep(0., T, uBurst), back);
  return vec2(vis, uBurst < T ? 1. + (uSafe > .5 ? .2 : 1.5) * uBurst / T : mix(.2, 1., back));
}

/** The heart seen at hp (on its plane, in heart units); fp: a pixel there. A white light, its halo, an outline on the kick. */
float heartLight(vec2 hp, float fp) {
  float s = gHs.y * (1. + .05 * uHeart);
  float d = sdHeart(hp / s + vec2(0., .6)) * s;
  float w = max(fp, .002);
  float fill = 1. - smoothstep(-w, w, d);
  float dd = max(d, 0.);
  float halo = exp(-dd * 12.) * .45 + exp(-dd * 3.) * .15;
  float echo = (1. - smoothstep(0., w * 1.5, abs(d - uEcho * 1.1))) * exp(-uEcho * 2.) * 1.5;
  float beat = 1. + .5 * uHeart * (1. - .4 * uSafe);
  return (mix(halo * gLight * beat, 6. * beat, fill) + echo * (1. - fill)) * gHs.x;
}

/** The sky's light in direction rd: dark above, the horizon lit, brighter and brighter toward the heart. */
float sky(vec3 rd) {
  float c = max(dot(rd, gHd), 0.);
  float hz = exp(-max(rd.y, 0.) * 4.5);
  float c2 = c * c, c8 = c2 * c2;
  c8 *= c8;
  float c64 = c8 * c8;
  c64 *= c64;
  c64 *= c64;
  return gLight * (.015 + hz * (.5 + .35 * c2 + .2 * c8) + .1 * c64);
}
/** The haze toward rd: the horizon's light. */
float haze(vec3 rd) { return sky(vec3(rd.x, min(rd.y, 0.), rd.z)); }
/** The haze between a figure t away and us: never enough to grey it out against the light. */
float figHaze(float hz, float t) { return min(hz, .5) * (1. - exp(-t * .004)); }

/** Small black hearts raining on the track after the drop, then lying there and fading: coverage, and the nearest's distance. */
vec2 smallHearts(vec3 ro, vec3 rd, float tEnd, float pa, vec3 cr, vec3 cu) {
  if (uBurst > 9.) return vec2(0.);
  const float C = 1.3;
  vec2 cell = floor(ro.xz / C);
  vec2 st = vec2(rd.x < 0. ? -1. : 1., rd.z < 0. ? -1. : 1.);
  vec2 inv = 1. / max(abs(rd.xz), vec2(1e-5));
  vec2 tM = ((cell + max(st, 0.)) * C - ro.xz) * st * inv;
  vec2 tD = C * inv;
  float acc = 0., near = 1e3;
  for (int i = 0; i < 26; i++) {
    vec3 h = vec3(hash12(cell + 1.3 + uSeed), hash12(cell * 1.7 + 4.1), hash12(cell * .7 + 8.3));
    float t = uBurst - .35 - h.x * 1.6;
    if (t > 0.) {
      vec3 c = vec3((cell.x + .2 + .6 * h.y) * C + .15 * sin(t * 3. + h.x * 6.), max(9. - 2.2 * t * t, .06), (cell.y + .2 + .6 * h.z) * C);
      float s = dot(c - ro, rd);
      if (abs(c.x) < TW && s > .1 && s < tEnd) {
        vec3 o = ro + rd * s - c;
        vec2 q = vec2(dot(o, cr), dot(o, cu)) / .1;
        q *= rot(sin(t * 2. + h.y * 6.) * .5);
        float w = max(.06, s * pa / .1);
        // (thinning out with distance: the rain is only drawn over the first cells)
        float a = (1. - smoothstep(-w, w, sdHeart(q + vec2(0., .6)))) * (1. - smoothstep(0., 2.5, t - 2.02)) * (1. - smoothstep(13., 21., s));
        if (a > .01) near = min(near, s);
        acc += a;
      }
    }
    if (min(tM.x, tM.y) > tEnd) break;
    if (tM.x < tM.y) { cell.x += st.x; tM.x += tD.x; }
    else { cell.y += st.y; tM.y += tD.y; }
  }
  return vec2(min(acc, 1.), near);
}

/** The drop's wave of white: it runs out from the heart over the frame and ebbs; tamed, one soft swell of light. */
float flood(vec3 rd) {
  if (uBurst > 6.) return 0.;
  if (uSafe > .5) return .7 * smoothstep(0., 1.4, uBurst) * (1. - smoothstep(1.6, 5.5, uBurst));
  float ang = acos(clamp(dot(rd, gHd), -1., 1.));
  float tp = uBurst - ang / 1.8;   // since the wave went by
  return 2.4 * smoothstep(-.1, .2, tp) * exp(-max(tp, 0.) * 1.3);
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 ro = uCamPos;
  mat3 cam = lookAt(ro, uCamTarget);
  vec3 rd = cam * normalize(vec3(uv, uFocal));
  float pa = 1. / (uRes.y * uFocal);
  gHd = normalize(vec3(0., HY, ZH) - ro);
  gHs = heartState();
  gLight = (.55 + .5 * uGlow) * (1. + .16 * uHeart * (1. - .5 * uSafe)) * (.8 + .2 * gHs.x);
  float tg = rd.y < -1e-4 ? -ro.y / rd.y : 1e5;
  float hzRd = haze(rd);
  // a pixel's footprint on the ground, along each axis (taken here, where every pixel runs it)
  vec2 gw = fwidth((ro + rd * min(tg, 1e3)).xz);

  // the figures, only where the ray crosses their slab: hit, or the nearest miss in pixels (the edge's coverage)
  float tt = -1., m = 1e3, tm = 0.;
  {
    vec3 bc = vec3(0., 1.05, 9.), bh = vec3(TW + .1, 1.1, 12.5);
    vec3 im = 1. / rd, n = im * (ro - bc), k = abs(im) * bh;
    vec3 t1 = -n - k, t2 = -n + k;
    float tn = max(max(t1.x, t1.y), t1.z), tf = min(min(min(t2.x, t2.y), t2.z), tg);
    if (tn < tf && tf > 0.) {
      float t = max(tn, .05);
      for (int i = 0; i < 120; i++) {
        float d = map(ro + rd * t);
        float px = gObj / (t * pa);
        if (px < m) { m = px; tm = t; }
        if (px < THR) { tt = t; break; }
        t += d * .9;
        if (t > tf) break;
      }
    }
  }
  float cov = tt > 0. ? 1. : 1. - smoothstep(THR, THR + 1.2, m);

  // what is behind them: the lit track, or the sky and the heart
  vec3 col = vec3(0.);
  float tEnd = tt > 0. ? tt : 200.;
  if (cov < 1.) {
    float lum;
    if (tg < 1e4) {
      vec3 p = ro + rd * tg;
      float onTrack = 1. - smoothstep(TW, TW + max(gw.x, .02), abs(p.x));
      // lane lines, and marks across the lanes sliding back under the runners: painted, one pixel
      const float lw = .02;
      vec2 Wd = max(vec2(lw), gw);
      float lines = (1. - smoothstep(0., Wd.x, abs(fract(p.x / LW) - .5) * LW)) * lw / Wd.x;
      float marks = (1. - smoothstep(0., Wd.y, abs(fract((p.z - uScroll) / 2.5) - .5) * 2.5)) * lw / Wd.y;
      float alb = mix(.22, .68, onTrack) * (1. + (lines * .7 + marks * .35) * onTrack);
      float sh = onTrack > 0. && p.z > -4. && p.z < 32. ? laneShadow(p.xz) * onTrack : 0.;
      // lit by the heart straight ahead (the shadows fall back toward us), a little by the sky
      lum = alb * gLight * (.85 * (1. - .94 * sh) + .1);
      // the track is wet: the sky in it, and the heart's glow drawn out into a path toward us
      vec3 rr = vec3(rd.x, -rd.y, rd.z);
      float F = .02 + .98 * pow(1. - abs(rd.y), 5.);
      float ax = rr.x / min(-rr.z, -.05) - gHd.x / -gHd.z, ay = rr.y - gHd.y;
      float path = rr.z < -.05 ? exp(-ax * ax * 1500. - ay * ay * 45.) * 2. * gHs.x * gLight : 0.;
      lum += F * mix(.3, .7, onTrack) * (sky(rr) + path) * (1. - .7 * sh);
      lum = mix(lum, hzRd, 1. - exp(-tg * .006));
      tEnd = min(tEnd, tg);
    } else {
      lum = sky(rd);
    }
    // the heart, far ahead, above the ground
    if (rd.z < -1e-3) {
      float th = (ZH - ro.z) / rd.z;
      if (th > 0. && th < tg) lum += heartLight((ro.xy + rd.xy * th - vec2(0., HY)) / HSZ, th * pa / HSZ);
    }
    // a one-pixel rim where the light wraps round the figures' edges
    float rx = (m - THR - .9) * 2.;
    float rim = tt > 0. ? 0. : exp(-rx * rx) * .5 * (.4 + .6 * max(dot(rd, gHd), 0.));
    col = uInk * lum * (1. + rim);
  }
  // the figures: black, only the haze between them and us
  col = mix(col, uInk * figHaze(hzRd, tt > 0. ? tt : tm), cov);

  // the drop: a wave of white floods the frame (the silhouettes hold), then black hearts rain against the light
  col += uInk * flood(rd) * gLight * (1. - .97 * cov);
  vec2 sh = smallHearts(ro, rd, tEnd, pa, cam[0], cam[1]);
  col = mix(col, uInk * figHaze(hzRd, sh.y), sh.x);
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
