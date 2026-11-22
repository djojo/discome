import * as THREE from "three";
import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";

/** Lanes on each side of the middle one. */
const LANES = 5;
const NL = LANES * 2 + 1;
/** The most followers a file can hold. */
const MAX_FOLLOWERS = 14;

const FRAMINGS: Framing[] = [
  // tracking alongside, low, in profile: the lanes stacked in depth
  { az: Math.PI / 2, el: 0.06, dist: 14, target: [0, 0.8, 1], focal: 2.3, weight: 3 },
  // from behind the runners, toward the heart
  { az: 0.04, el: 0.07, dist: 18, target: [0, 1.4, -10], focal: 1.4, weight: 3 },
  // high above all the lanes
  { az: 0.5, el: 1.05, dist: 13, target: [0, 0, 1], focal: 1.6, weight: 2 },
  // close on the middle runner and its file, from the front (the lanes beside it are kept clear ahead)
  { az: Math.PI - 0.25, el: 0.1, dist: 4, target: [0, 0.95, 0.6], focal: 1.8, weight: 2 },
];

/**
 * The race: white figures run in lanes on an endless track toward a great glowing heart that never comes
 * closer (the track is a treadmill). Behind each runner, a file of small figures follows it: its followers.
 * The heart beats lub-dub on the kick; strides quicken through the build; on the drop the heart bursts into a
 * rain of small hearts, a runner stumbles and its followers go to the others. As the night drifts, more
 * runners, and some of them tire and fall behind.
 */
export const race = defineShaderScene({
  id: "race",
  name: "La Course",
  energy: "medium",
  renderScale: 0.75,
  camera: { framings: FRAMINGS, glideBars: 2 },
  description:
    "Des silhouettes courent sur une piste sans fin vers un grand cœur lumineux qui ne se rapproche jamais, chacune suivie d'une file de petites silhouettes. Le cœur bat au kick ; au drop il éclate en pluie de cœurs et un coureur tombe.",
  params: [paletteParam("mono")],
  uniforms: () => ({
    // per lane: occupied, followers (the last one grows or shrinks), z offset, cadence (< .8: tired)
    uLane: { value: Array.from({ length: NL }, () => new THREE.Vector4()) },
    uRun: { value: 0 },
    uScroll: { value: 0 },
    uHeart: { value: 0 },
    uEcho: { value: 9 },
    uGlow: { value: 0.6 },
    uBurst: { value: 99 },
    uFall: { value: 99 },
    uFallLane: { value: 99 },
    // state kept on the CPU side only
    uCad: { value: 1.35 },
    uDub: { value: 0 },
    uLast: { value: -99 },
    uBase: { value: new Array<number>(NL).fill(0) },
    uTarget: { value: new Array<number>(NL).fill(0) },
  }),
  update(u, f, _p, dt) {
    const lanes = u.uLane.value as THREE.Vector4[];
    const base = u.uBase.value as number[];
    const target = u.uTarget.value as number[];
    // Back on screen: a new field of runners (more of them, and more tired ones, as the night drifts)
    if (f.time - (u.uLast.value as number) > 1.5) {
      for (let i = 0; i < NL; i++) {
        const mid = i === LANES;
        const occ = mid || Math.random() < 0.6 + 0.4 * f.drift;
        const n = occ ? Math.round(Math.pow(Math.random(), 1.4) * 9) : 0;
        base[i] = target[i] = mid ? Math.max(n, 4) : n;
        const tired = !mid && occ && Math.random() < 0.35 * f.drift;
        // the runners beside the middle one stay a little behind it, clear of the close framing in front
        const z = mid ? 0 : Math.abs(i - LANES) === 1 ? 0.3 + 0.9 * Math.random() : (Math.random() - 0.5) * 2.4;
        lanes[i].set(occ ? 1 : 0, base[i], z, tired ? 0.72 : 0.88 + 0.24 * Math.random());
      }
      u.uFall.value = u.uBurst.value = u.uFallLane.value = 99;
    }
    u.uLast.value = f.time;

    // Stride: their own cadence, quicker through the build and the drop, and over the night
    const push = f.section === "build" ? f.buildProgress : f.section === "drop" ? 1 : 0;
    const cadTarget = 1.35 * (1 + 0.55 * push + 0.25 * f.drift);
    const cad = (u.uCad.value as number) + (cadTarget - (u.uCad.value as number)) * (1 - Math.exp(-dt * 0.8));
    u.uCad.value = cad;
    u.uRun.value = (u.uRun.value as number) + dt * Math.PI * 2 * cad;
    u.uScroll.value = (u.uScroll.value as number) + dt * 2.6 * cad;
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
  },
  fragment: /* glsl */ `
uniform vec4 uLane[${NL}];
uniform float uRun;       // stride clock (radians)
uniform float uScroll;    // the track's travel
uniform float uHeart;     // the heartbeat, lub-dub
uniform float uEcho;      // seconds since the last beat: an outline spreads from the heart
uniform float uGlow;      // the heart's glow, rising through the build
uniform float uBurst;     // seconds since the drop
uniform float uFall;      // seconds since the stumble
uniform float uFallLane;
${ART_LIB}
${CAMERA_GLSL}
const float NLS = ${LANES}.;
const float LW = 1.25;    // lane width
const float S = .62;      // follower spacing
const float FS = .38;     // follower scale
const float ZH = -45., HY = 5.5, HSZ = 4.5;  // the heart: far ahead, high, big
const float TW = (NLS + .5) * LW;            // half the track's width
float gMat;               // 0 runner, 1 follower

vec3 dirA(float a) { return vec3(0., -cos(a), -sin(a)); }   // from straight down, toward the front (-z)

/** A runner, feet at y = 0, running toward -z. ph: stride phase; down: 0 running, 1 fallen on the track. */
float runner(vec3 q, float ph, float down) {
  float lean = .2 + 1.35 * down;
  vec3 up = vec3(0., cos(lean), -sin(lean));
  vec3 pel = vec3(0., .95 + .045 * cos(2. * ph) * (1. - down) - .82 * down, -.3 * down);
  float d = sdCapsule(q, pel, pel + up * .45, .125);
  d = smin(d, sdEllipsoid(q - pel - up * .36, vec3(.19, .14, .11)), .08);
  d = smin(d, sdCapsule(q, pel + up * .5, pel + up * .62, .045), .04);
  d = smin(d, sdEllipsoid(q - pel - up * .75 - vec3(0., 0., .03), vec3(.082, .105, .095)), .04);
  for (int k = 0; k < 2; k++) {
    float sd = k == 0 ? 1. : -1.;
    float p = ph + float(k) * 3.14159;
    // the leg: thigh swinging, knee folding on the way forward
    float a = mix(.8 * sin(p), -1.4, down);
    float b = mix(.25 + 1.3 * pow(.5 + .5 * cos(p + .25), 2.5), .1, down);
    vec3 hip = pel + vec3(sd * .09, -.02, 0.);
    vec3 knee = hip + .45 * dirA(a);
    vec3 ank = knee + .45 * dirA(a - b);
    d = smin(d, sdCapsule(q, hip, knee, .07), .05);
    d = min(d, sdCapsule(q, knee, ank, .05));
    d = min(d, sdCapsule(q, ank, ank + .14 * dirA(a - b + 1.4), .04));
    // the arm on the same side swings against it, elbow bent
    float c = mix(-.5 * sin(p) + .3 * lean, 1.5, down);
    vec3 sh = pel + up * .48 + vec3(sd * .19, 0., 0.);
    vec3 el = sh + .28 * dirA(c);
    d = smin(d, sdCapsule(q, sh, el, .045), .04);
    d = min(d, sdCapsule(q, el, el + .26 * dirA(c + mix(1.4, .1, down)), .04));
  }
  return d;
}

float map(vec3 p) {
  float outside = max(abs(p.x) - TW, p.y - 2.1);
  if (outside > 0.) return outside + .05;
  float li = clamp(floor(p.x / LW + .5), -NLS, NLS);
  vec4 L = uLane[int(li + NLS)];
  // never step past the lane's edge: the next lane may hold a runner
  float edge = LW * .5 - abs(p.x - li * LW) + .05;
  gMat = 0.;
  if (L.x < .5) return max(edge, .05);
  float h = hash12(vec2(li, 3.7) + uSeed);
  float zr = L.z;
  float down = 0.;
  if (abs(li - uFallLane) < .5 && uFall < 16.) {
    // the stumble: down in a moment, carried away behind by the track, then running back
    down = smoothstep(0., .7, uFall) * (1. - smoothstep(9., 10., uFall));
    zr += 14. * (smoothstep(.3, 5., uFall) - smoothstep(10., 16., uFall));
  }
  // a tired runner drifts back, and catches up again
  if (L.w < .8) zr += 7. * smoothstep(.3, 1., .5 + .5 * sin(uTime * .06 + h * 6.28));
  float ph = uRun * L.w + h * 6.28;
  vec3 q = vec3(p.x - li * LW, p.y, p.z - zr);
  float rb = sdBox(q - vec3(0., .9, -.3 - .5 * down), vec3(.45, .95, .75 + .5 * down));
  float d = rb > .3 ? rb : runner(q, ph, down);
  // its followers, in a file behind it
  float n = L.y;
  if (n > .01) {
    float cnt = ceil(n);
    float tz = q.z - .65;
    float tb = sdBox(vec3(q.x, q.y - .45, tz - (cnt - 1.) * S * .5), vec3(.4, .5, (cnt - 1.) * S * .5 + .4));
    if (tb < d) {
      float i = clamp(floor(tz / S + .5), 0., cnt - 1.);
      float sc = FS * (i > cnt - 1.5 ? n - cnt + 1. : 1.);
      vec3 fq = vec3(q.x - .07 * sin(i * 2.3 + li), q.y, tz - i * S);
      float fd = 1e3;
      if (sc > .01) {
        float fb = sdBox(fq - vec3(0., .45 * sc / FS, 0.), vec3(.25, .45, .35) * sc / FS);
        fd = fb > .2 ? fb : runner(fq / sc, ph * 1.25 + i * 1.7, 0.) * sc;
      }
      // inside the file, the next follower is at least as far as this one's cell edge
      // (kept well above the hit threshold, or the cell edges would show from afar)
      if (tz > -S * .5 && tz < (cnt - .5) * S) fd = min(fd, S * .5 - abs(tz - i * S) + .06);
      if (fd < d) { d = fd; gMat = 1.; }
    }
  }
  return min(d, edge);
}

vec3 calcN(vec3 p) {
  const vec2 k = vec2(1, -1);
  const float e = .002;
  return normalize(k.xyy * map(p + k.xyy * e) + k.yyx * map(p + k.yyx * e) + k.yxy * map(p + k.yxy * e) + k.xxx * map(p + k.xxx * e));
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
  return vec2(max(1. - smoothstep(0., .5, uBurst), back), uBurst < .5 ? 1. + 3. * uBurst : mix(.2, 1., back));
}

/** The heart seen at hp (on its plane, in heart units); fp: a pixel there. Only the glow when glowOnly. */
float heartLight(vec2 hp, float fp, bool glowOnly) {
  vec2 hs = heartState();
  float s = hs.y * (1. + .06 * uHeart);
  float d = sdHeart(hp / s + vec2(0., .6)) * s;
  float glow = exp(-max(d, 0.) * 4.) * .3 + (d < 0. ? .08 + .12 * smoothstep(0., -.35, d) : 0.);
  if (glowOnly) return glow * (1. + uHeart) * uGlow * hs.x;
  float w = max(.01, fp);
  float line = (1. - smoothstep(0., w, abs(d))) * .01 / w;
  float echo = (1. - smoothstep(0., w * 1.5, abs(d - uEcho * .7))) * .01 / w * exp(-uEcho * 1.6);
  return ((line * 1.6 + glow) * (1. + uHeart) * uGlow + echo) * hs.x;
}

/** After the drop: small hearts raining on the track, then fading where they lie. */
float smallHearts(vec3 ro, vec3 rd, float tEnd, float pa, vec3 cr, vec3 cu) {
  if (uBurst > 9.) return 0.;
  const float C = 1.3;
  vec2 cell = floor(ro.xz / C);
  vec2 st = vec2(rd.x < 0. ? -1. : 1., rd.z < 0. ? -1. : 1.);
  vec2 inv = 1. / max(abs(rd.xz), vec2(1e-5));
  vec2 tM = ((cell + max(st, 0.)) * C - ro.xz) * st * inv;
  vec2 tD = C * inv;
  float acc = 0.;
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
        acc += (1. - smoothstep(0., w, sdHeart(q + vec2(0., .6)))) * (1. - smoothstep(0., 2.5, t - 2.02));
      }
    }
    if (min(tM.x, tM.y) > tEnd) break;
    if (tM.x < tM.y) { cell.x += st.x; tM.x += tD.x; }
    else { cell.y += st.y; tM.y += tD.y; }
  }
  return acc;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 ro = uCamPos;
  mat3 cam = lookAt(ro, uCamTarget);
  vec3 rd = cam * normalize(vec3(uv, uFocal));
  float pa = 1. / (uRes.y * uFocal);
  float tg = rd.y < -1e-4 ? -ro.y / rd.y : 1e5;

  // the runners, only where the ray crosses their slab
  float tt = -1.;
  {
    vec3 bc = vec3(0., 1.05, 9.), bh = vec3(TW + .1, 1.1, 12.5);
    vec3 m = 1. / rd, n = m * (ro - bc), k = abs(m) * bh;
    vec3 t1 = -n - k, t2 = -n + k;
    float tn = max(max(t1.x, t1.y), t1.z), tf = min(min(min(t2.x, t2.y), t2.z), tg);
    if (tn < tf && tf > 0.) {
      float t = max(tn, .05);
      for (int i = 0; i < 120; i++) {
        float d = map(ro + rd * t);
        if (d < .0007 * t) { tt = t; break; }
        t += d * .9;
        if (t > tf) break;
      }
    }
  }
  vec3 col = vec3(0.);
  float tEnd = 200.;
  vec2 hs = heartState();
  if (tt > 0.) {
    vec3 p = ro + rd * tt;
    map(p);
    float mat = gMat;
    vec3 n = calcN(p);
    // lit by the heart ahead, a little by the night above; a rim of light when seen against it
    vec3 Ld = normalize(vec3(0., HY + 4., ZH) - p);
    float hl = uGlow * (1. + .5 * uHeart) * max(hs.x, .35);
    float dif = max(dot(n, Ld), 0.);
    float rim = pow(1. - abs(dot(n, rd)), 3.);
    vec3 c = uInk * (.08 + .22 * (.5 + .5 * n.y) + .85 * dif * hl + rim * .5 * (.3 + .7 * max(dot(rd, Ld), 0.)) * hl);
    if (mat > .5) c *= .55;
    col = c * exp(-tt * .02);
    tEnd = tt;
  } else if (tg < 200.) {
    vec3 p = ro + rd * tg;
    float fp = tg * pa / sqrt(max(-rd.y, .02));
    float onTrack = 1. - smoothstep(TW, TW + .2, abs(p.x));
    // lane lines, and marks across the lanes sliding back under the runners
    float lw = .02, Wd = max(lw, fp);
    float lines = (1. - smoothstep(0., Wd, abs(fract(p.x / LW) - .5) * LW)) * lw / Wd;
    float marks = (1. - smoothstep(0., Wd, abs(fract((p.z - uScroll) / 2.5) - .5) * 2.5)) * lw / Wd;
    col = uInk * (lines * .5 + marks * .25) * onTrack * exp(-tg * .035);
    // the track is wet: the heart's glow in it
    vec3 rr = vec3(rd.x, -rd.y, rd.z);
    if (rr.z < -1e-3) {
      vec3 hp = p + rr * ((ZH - p.z) / rr.z);
      col += uInk * .22 * heartLight((hp.xy - vec2(0., HY)) / HSZ, 0., true) * onTrack;
    }
    tEnd = tg;
  }
  // the heart, far ahead
  if (rd.z < -1e-3) {
    float th = (ZH - ro.z) / rd.z;
    if (th > 0. && th < tEnd) col += uInk * heartLight((ro.xy + rd.xy * th - vec2(0., HY)) / HSZ, th * pa / HSZ, false);
  }
  col += uInk * smallHearts(ro, rd, tEnd, pa, cam[0], cam[1]);
  // the burst lights up the night for an instant
  col += uInk * .3 * exp(-uBurst * 3.);
  col = aces(col * 1.1);
  col *= vignette(fc / uRes);
  gl_FragColor = vec4(col, 1.);
}
`,
});
