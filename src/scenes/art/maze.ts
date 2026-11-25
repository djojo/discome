import * as THREE from "three";
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

/** A cell of the maze, in metres. */
const C = 3;
const EYE = 1.6;
/** How high the camera rises above the maze on the drop. */
const ABOVE = 46;

/*
 * The maze is the same on both sides, bit for bit: an integer hash (GLSL uint, JS Math.imul) decides for each cell
 * whether it opens north or east (a "binary tree" maze: perfect, endless, every cell knows its own walls). The camera
 * walks it on the CPU with the same rule, so it never walks into a hedge.
 */
const hashU = (v: number) => {
  let x = v >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
};
const openN = (i: number, j: number, seed: number) =>
  (hashU((Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ Math.imul(seed, 83492791)) >>> 0) & 1) === 1;

interface Walk {
  seed: number;
  /** The cells the camera goes through: the one it comes from, the one it turns in, the next two. */
  cells: [number, number][];
  /** Along the curve round the turning cell, 0..1. */
  u: number;
}

const nextCell = (c: [number, number], seed: number): [number, number] => (openN(c[0], c[1], seed) ? [c[0], c[1] + 1] : [c[0] + 1, c[1]]);
const centre = (c: [number, number]) => new THREE.Vector2((c[0] + 0.5) * C, (c[1] + 0.5) * C);

/** On the curve through cell b (from the middle of a→b to the middle of b→c), at u. */
function curve(a: [number, number], b: [number, number], c: [number, number], u: number, out: THREE.Vector2) {
  const pa = centre(a), pb = centre(b), pc = centre(c);
  const m0 = pa.add(pb).multiplyScalar(0.5);
  const m1 = pc.add(centre(b)).multiplyScalar(0.5);
  const w0 = (1 - u) * (1 - u), w1 = 2 * u * (1 - u), w2 = u * u;
  return out.set(w0 * m0.x + w1 * pb.x + w2 * m1.x, w0 * m0.y + w1 * pb.y + w2 * m1.y);
}
const turnLength = (a: [number, number], c: [number, number]) => (a[0] !== c[0] && a[1] !== c[1] ? C * 0.81 : C);

/**
 * Le Labyrinthe: an endless maze of tall dark hedges under the moon, walked at a man's height; mist lies in the
 * alleys, fireflies, the mycelium runs along the middle of every alley and carries the kicks' pulses away through it.
 * There is no way out. Through the build the walk quickens, the hedges grow taller and the light sinks; on the drop
 * the camera rises out of it at once, then slows: the maze runs to the horizon in every direction, the mist in its
 * alleys, a wave of light running through them all. After the hold it sinks back slowly into the alleys.
 */
export const maze = defineShaderScene({
  id: "myc-maze",
  name: "Le Labyrinthe",
  energy: "medium",
  hdr: true,
  mask: true,
  renderScale: 0.65,
  description:
    "Un labyrinthe sans fin de hautes haies sombres sous la lune, parcouru à hauteur d'homme ; la brume dans les allées, le mycélium au milieu de chacune. On ne trouve pas la sortie : la montée presse le pas et grandit les haies ; au drop, la caméra s'élève et découvre le labyrinthe jusqu'à l'horizon, parcouru d'une vague de lumière.",
  params: [
    paletteParam("boismort"),
    { type: "range", key: "pace", label: "Pas", min: 0.3, max: 2, step: 0.05, default: 1 },
    { type: "range", key: "mist", label: "Brume", min: 0, max: 2, step: 0.05, default: 1 },
  ],
  uniforms: () => ({
    uEye: { value: new THREE.Vector3(0, EYE, 0) },
    uLook: { value: new THREE.Vector3(0, EYE, 1) },
    uMaze: { value: 1 },
    uHedge: { value: 3.4 },
    uDim: { value: 1 },
    uRise: { value: 0 },
    uKick: { value: 9 },
    uKickB: { value: 9 },
    uBurst: { value: 99 },
    uMist: { value: 1 },
    uSafe: { value: 0 },
    // CPU only
    uWalk: { value: null as Walk | null },
    uLastSeed: { value: -1 },
    uStep: { value: 0 },
    uHead: { value: 0 },
    uLast: { value: -1 },
  }),
  update(u, f, p, dt) {
    const bar = f.bpm > 0 ? 240 / f.bpm : 2;
    // Back on screen (a new seed): a new maze, from its first cell, no drop in progress
    let walk = u.uWalk.value as Walk | null;
    if (!walk || u.uLastSeed.value !== u.uSeed.value) {
      u.uLastSeed.value = u.uSeed.value;
      const seed = Math.floor((u.uSeed.value as number) * 997) % 100000;
      const a: [number, number] = [0, 0];
      const b = nextCell(a, seed);
      const c = nextCell(b, seed);
      const d = nextCell(c, seed);
      walk = { seed, cells: [a, b, c, d, nextCell(d, seed)], u: 0 };
      u.uWalk.value = walk;
      u.uMaze.value = seed;
      u.uBurst.value = 99;
      u.uLast.value = -1;
    }
    u.uSafe.value = f.safeFlash ? 1 : 0;
    if (f.beat) {
      u.uKickB.value = u.uKick.value;
      u.uKick.value = 0;
    } else {
      u.uKick.value = (u.uKick.value as number) + dt;
      u.uKickB.value = (u.uKickB.value as number) + dt;
    }
    if (f.drop) u.uBurst.value = 0;
    else u.uBurst.value = Math.min(99, (u.uBurst.value as number) + dt);
    const burst = u.uBurst.value as number;
    // the drop: up out of the maze at once (two bars, slowing), held, then sinking back slowly
    const rise = burst < 99 ? 1 - Math.pow(1 - Math.min(1, burst / (bar * 2)), 3) : 0;
    const fall = burst < 99 ? smooth(bar * 9, bar * 16, burst) : 1;
    u.uRise.value = rise * (1 - fall);
    const r = u.uRise.value as number;

    // the walk: quicker through the build, slower in the breakdown, almost still up above
    const build = f.section === "build" ? f.buildProgress : 0;
    const pace = num(p.pace, 1) * (f.section === "breakdown" ? 0.6 : 1 + 1.4 * build * build) * (1 - 0.85 * r);
    u.uStep.value = approach(u.uStep.value as number, pace, 1.5, dt);
    const speed = 1.3 * (u.uStep.value as number);
    const [a0, , c0] = walk.cells;
    walk.u += (speed * dt) / turnLength(a0, c0);
    while (walk.u >= 1) {
      walk.u -= 1;
      walk.cells.shift();
      walk.cells.push(nextCell(walk.cells[walk.cells.length - 1], walk.seed));
    }
    const [a, b, c, d, e] = walk.cells;
    const pos = curve(a, b, c, walk.u, new THREE.Vector2());
    // looking well ahead along the way (already into the next turn: never at the wall of this one), the heading
    // turning smoothly
    const la = walk.u + 1.3;
    const ahead =
      la < 1
        ? curve(a, b, c, la, new THREE.Vector2())
        : la < 2
          ? curve(b, c, d, la - 1, new THREE.Vector2())
          : curve(c, d, e, la - 2, new THREE.Vector2());
    const want = Math.atan2(ahead.y - pos.y, ahead.x - pos.x);
    let head = u.uHead.value as number;
    let dh = want - head;
    dh -= Math.PI * 2 * Math.round(dh / (Math.PI * 2));
    head = (u.uLast.value as number) < 0 ? want : head + dh * (1 - Math.exp(-dt * 2.5));
    u.uHead.value = head;
    u.uLast.value = 1;
    const fwd = new THREE.Vector2(Math.cos(head), Math.sin(head));
    const bob = 0.025 * Math.sin(f.time * 2 * Math.PI * 0.9 * (u.uStep.value as number));
    const y = EYE + bob + (ABOVE - EYE) * r * r * (3 - 2 * r);
    (u.uEye.value as THREE.Vector3).set(pos.x, y, pos.y);
    // up above, looking down on the maze ahead and out to the horizon
    const down = 1.25 * r;
    (u.uLook.value as THREE.Vector3).set(pos.x + fwd.x * 3, y - 0.1 - down, pos.y + fwd.y * 3);

    // the build: the hedges grow, the light sinks
    u.uHedge.value = approach(u.uHedge.value as number, 3.4 + 1.8 * smooth(0, 1, build), build > 0 ? 1 : 0.25, dt);
    u.uDim.value = approach(u.uDim.value as number, 1 - 0.45 * build, 2, dt);
    u.uMist.value = num(p.mist, 1);
  },
  fragment: /* glsl */ `
uniform vec3 uEye;
uniform vec3 uLook;
uniform float uMaze;    // the maze's seed (an integer)
uniform float uHedge;   // the hedges' height
uniform float uDim;     // the moonlight (sinks through the build)
uniform float uRise;    // 1: up above the maze (the drop)
uniform float uKick;
uniform float uKickB;
uniform float uBurst;
uniform float uMist;
uniform float uSafe;
${ART_LIB}
${MYCELIUM_GLSL}
const float C = ${C}.;
const float T = .9;       // a hedge's thickness
uint gSeed;
vec3 gMd;

uint hashU(uint x) { x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
/** The same rule as the walk's (the CPU side): does cell c open north? (if not, it opens east) */
bool openN(ivec2 c) { return (hashU(uint(c.x) * 73856093u ^ uint(c.y) * 19349663u ^ gSeed * 83492791u) & 1u) == 1u; }

float box2(vec2 p, vec2 b) { vec2 q = abs(p) - b; return length(max(q, 0.)) + min(max(q.x, q.y), 0.); }

/** The hedges seen from above (2D, in metres): their distance; o: which walls stand round the cell (N, E, S, W). */
float walls2(vec2 p, out bvec4 o) {
  ivec2 c = ivec2(floor(p / C));
  vec2 l = p - vec2(c) * C;
  bool n = openN(c);
  // own walls: north if it does not open north, east if it does (it then does not open east)
  o = bvec4(!n, n, !openN(c - ivec2(0, 1)), openN(c - ivec2(1, 0)));
  // pillars at the four corners
  vec2 k = vec2(l.x < C * .5 ? 0. : C, l.y < C * .5 ? 0. : C);
  float d = box2(l - k, vec2(T * .5));
  if (o.x) d = min(d, box2(l - vec2(C * .5, C), vec2(C * .5, T * .5)));
  if (o.y) d = min(d, box2(l - vec2(C, C * .5), vec2(T * .5, C * .5)));
  if (o.z) d = min(d, box2(l - vec2(C * .5, 0.), vec2(C * .5, T * .5)));
  if (o.w) d = min(d, box2(l - vec2(0., C * .5), vec2(T * .5, C * .5)));
  return d;
}

/** The hedges: walls of leaves, their tops rounded; a bound to the cell's border (other cells' hedges are past it). */
float map(vec3 p) {
  bvec4 o;
  float d2 = walls2(p.xz, o);
  vec2 w = vec2(d2 + .08, p.y - uHedge);
  float d = min(max(w.x, w.y), 0.) + length(max(w, 0.)) - .08;
  // leaves: lumps on the surface (only near it; turned, so the noise's grid never shows)
  if (d < .5) {
    vec3 q = mat3(.8, .36, -.48, -.6, .48, -.64, 0., .8, .6) * p;
    d -= .07 * (vnoise(q * 3.3) - .5) + .035 * (vnoise(q * 9.1 + 4.) - .5);
  }
  vec2 l = mod(p.xz, C);
  float border = min(min(l.x, C - l.x), min(l.y, C - l.y));
  return min(d * .75, border + T * .5);
}

vec3 nrm(vec3 p, float e) {
  const vec2 k = vec2(1, -1);
  return normalize(k.xyy * map(p + k.xyy * e) + k.yyx * map(p + k.yyx * e) + k.yxy * map(p + k.yxy * e) + k.xxx * map(p + k.xxx * e));
}

float softShadow(vec3 ro, vec3 rd) {
  float res = 1., t = .05;
  for (int i = 0; i < 12; i++) {
    vec3 x = ro + rd * t;
    if (x.y > uHedge + .3) break;
    float h = map(x);
    res = min(res, 8. * h / t);
    t += clamp(h, .08, .8);
    if (res < .02) break;
  }
  return clamp(res, 0., 1.);
}

/** Along the middle of every alley: the strands of mycelium (distance to the lines from the cell's centre to its openings). */
float alleys(vec2 p) {
  bvec4 o;
  walls2(p, o);
  vec2 l = mod(p, C) - C * .5;
  float d = 1e3;
  if (!o.x) d = min(d, box2(l - vec2(0., C * .25), vec2(0., C * .25)));
  if (!o.y) d = min(d, box2(l - vec2(C * .25, 0.), vec2(C * .25, 0.)));
  if (!o.z) d = min(d, box2(l + vec2(0., C * .25), vec2(0., C * .25)));
  if (!o.w) d = min(d, box2(l + vec2(C * .25, 0.), vec2(C * .25, 0.)));
  // a wandering strand, not a ruled line
  return abs(d + .06 * sin(p.x * 2.3 + p.y * 1.7)) ;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  gSeed = uint(uMaze);
  gMd = normalize(vec3(.45 + .3 * fract(uMaze * .013), .42, .8));
  vec3 moonC = mix(uInk, vec3(.8, .88, 1.), .4) * uDim;
  vec3 glowC = uTint * uTint * 1.3;
  vec3 ro = uEye;
  // (a wide lens in the alleys; wider still up above: the maze below and the horizon)
  float focal = mix(1.15, 1., uRise);
  vec3 rd = lookAt(ro, uLook) * normalize(vec3(uv, focal));
  float pa = 1. / (uRes.y * focal);

  // the floor of the alleys: a plane; the hedges marched. From high up, start at the hedges' tops; far away, the maze
  // is read flat (its tops and alleys), no march
  float tF = rd.y < -1e-4 ? -ro.y / rd.y : 1e5;
  float tmax = min(tF, 260.);
  float t = -1., t0 = .05;
  bool flatFar = false;
  if (ro.y > uHedge + .5) {
    if (rd.y >= 0.) tmax = -1.;
    else {
      t0 = (ro.y - uHedge - .4) / -rd.y;
      if (t0 > 70.) flatFar = true;
    }
  }
  float tHit = tmax;
  // what the ray meets: 1 a hedge, 2 the floor, 3 nothing it could reach (lost among the hedges), 0 the sky
  int what = 0;
  if (tmax > 0. && !flatFar) {
    float tt = t0;
    what = 3;
    for (int i = 0; i < 140; i++) {
      vec3 x = ro + rd * tt;
      if (x.y > uHedge + .5 && rd.y > 0.) { what = 0; break; }
      float d = map(x);
      if (d < max(.001, tt * pa * .7)) { t = tt; what = 1; break; }
      tt += d * .9;
      if (tt > tmax) { what = tmax < tF ? 0 : 2; break; }
    }
    tHit = what == 1 ? t : what == 2 ? tF : what == 3 ? tt : tmax;
  }
  if (flatFar) what = 2;
  if (what == 0) tHit = 260.;

  // the drop's wave through the alleys, from under the camera
  float front = uBurst * 22.;
  float flash = uSafe > .5 ? .3 : 1.;
  vec2 eye2 = ro.xz;

  vec3 col;
  if (what == 1 || what == 2) {
    vec3 p;
    vec3 n;
    bool hedge;
    if (flatFar) {
      // far below, read flat at the hedges' tops
      p = ro + rd * t0;
      bvec4 o;
      hedge = walls2(p.xz, o) < 0.;
      n = vec3(0., 1., 0.);
      tHit = t0;
    } else if (t > 0.) {
      p = ro + rd * t;
      hedge = true;
      n = nrm(p, max(.002, t * pa));
    } else {
      p = ro + rd * tF;
      hedge = false;
      n = vec3(0., 1., 0.);
    }
    float fw = tHit * pa / max(abs(dot(n, rd)), .15);
    float rg = length(p.xz - eye2);
    float pulse = mycPulse(rg, uKick, 6., 1.6) + .6 * mycPulse(rg, uKickB, 6., 1.6);
    float wave = uBurst < 99. ? exp(-pow((rg - front) / 4., 2.)) * exp(-uBurst * .12) * flash : 0.;
    float passed = uBurst < 99. ? smoothstep(front, front - 8., rg) * exp(-uBurst * .08) : 0.;
    vec3 emit = vec3(0.);
    vec3 alb;
    float sh = 1.;
    if (hedge) {
      // leaves: dark green, here and there a leaf catching the moon; silver on top; the mycelium climbs their foot
      vec3 q = mat3(.8, .36, -.48, -.6, .48, -.64, 0., .8, .6) * p;
      float lf = vnoise(q * 7.) * .5 + vnoise(q * 23.) * .5;
      float glint = smoothstep(.62, .8, vnoise(q * 31. + 2.));
      alb = mix(vec3(.025, .055, .025), vec3(.06, .12, .05), lf) + vec3(.06, .09, .06) * glint;
      float top = smoothstep(uHedge - .5, uHedge, p.y);
      alb = mix(alb, vec3(.08, .14, .08), top);
      float th = mycThreads(vec2(p.x + p.z, p.y * .35) * 1.6, fw) * smoothstep(.7, 0., p.y);
      emit += glowC * th * (.12 + 2.5 * pulse + 2. * passed + 3. * wave);
      // (far below, the tops read flat: a little lighter, the moon on them)
      if (flatFar) alb = vec3(.07, .12, .07) * (.7 + .6 * vnoise(vec3(p.xz * 2., 3.)));
    } else {
      // the alleys' floor: moss and gravel, the strand of mycelium along the middle
      float m = vnoise(vec3(p.xz * 4., 1.)) * .6 + vnoise(vec3(p.xz * 13., 5.)) * .4;
      alb = mix(vec3(.05, .055, .04), vec3(.1, .1, .08), m);
      float line = mycLine(alleys(p.xz), .025, fw);
      emit += glowC * line * (.35 + 4. * pulse + 3. * passed + 5. * wave);
      emit += glowC * mycThreads(p.xz * 1.5, fw * 1.5) * (.04 + 1.2 * pulse);
      sh = tHit < 40. ? softShadow(p + vec3(0., .02, 0.), gMd) : .5;
    }
    if (flatFar && !hedge) {
      // a far alley, seen flat: dark between the tops, its strand of light
      float line = mycLine(alleys(p.xz), .025, fw);
      alb = vec3(.015, .02, .015);
      emit = glowC * line * (.35 + 4. * pulse + 3. * passed + 5. * wave);
    }
    float dif = max(dot(n, gMd), 0.);
    // the moon, and the sky's light from above (the alleys' floors darker than the hedges' tops)
    float sky = .5 * max(n.y, 0.) + .5 * smoothstep(0., uHedge, p.y);
    col = alb * (moonC * 3.5 * dif * sh + uInk * (.45 + sky) * uDim) + emit;
    col += moonC * pow(1. - max(dot(n, -rd), 0.), 3.) * .06 * float(hedge);
  } else if (what == 3) {
    // deep among the hedges: their dark mass
    col = vec3(.008, .014, .009) * uDim;
  } else {
    col = mycSky(rd, gMd, moonC, pa) + moonC * 2.2 * mycMoon(rd, gMd, .05, pa);
  }

  // the mist: lying in the alleys (thick below a metre and a half), lit by the moon and the strands under it
  float lowF = mycFog(ro, rd, tHit, .25 * uMist, 1.3);
  float cm = max(dot(rd, gMd), 0.);
  vec3 mistC = moonC * (.09 + .6 * pow(cm, 10.)) + glowC * .04 * (1. + 2. * uRise);
  col = mix(col, mistC, lowF * .85);
  // and far away, the night's haze
  float fo = 1. - exp(-tHit * .006 * uMist);
  col = mix(col, moonC * (.025 + .6 * pow(cm, 8.)) + uBase * .4, fo);
  // fireflies in the alleys
  col += mycMotes(ro, rd, tHit, 2.2, .06, .02, pa, .015, glowC, uInk, .8) * 1.4;
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
