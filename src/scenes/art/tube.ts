import * as THREE from "three";
import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { CIRCUIT_GLSL } from "./circuit.glsl";
import { FLIGHT_GLSL } from "./flight";
import { HOVER, LAP, PACK_MAX, Racers, TRACK_GLSL, trackPoint, trackRoll, weave } from "./circuitTrack";
import { TRACK_SCENE_GLSL } from "./circuitScene.glsl";

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const approach = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-dt * rate));
const hashF = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
/** An angle brought back to -π..π. */
const wrap = (a: number) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));

/** Metres per second at cruise. */
const CRUISE = 38;
/** The tube's radius on the groove, and at the end of the build. */
const R_WIDE = 8;
const R_TIGHT = 4.6;

interface TubeRacer {
  angle: number;
  spiral: number;
  lane: number;
  phase: number;
  base: number;
  swing: number;
  rate: number;
  clock: number;
  colour: number;
}

interface TubeState {
  racers: Racers;
  pack: TubeRacer[];
  offset: number;
  /** The tube's span along the track (absolute s); its end is set on the drop. */
  start: number;
  end: number;
  radius: number;
  /** The camera's angle round the tube's axis, and which way it turns. */
  theta: number;
  dir: number;
  /** Seconds since we left the tube (< 0: still in it). */
  out: number;
  waveS: number;
  waveT: number;
  boost: number;
  last: number;
  pos: THREE.Vector3;
  look: THREE.Vector3;
}

/** Where something rides at s: round the wall at `angle` (radius r from the axis) until the tube's end, then on the deck. */
function rideAt(s: number, st: TubeState, angle: number, r: number, lane: number): [number, number, number] {
  const k = smooth(st.end, st.end + 70, s);
  const a = wrap(angle) * (1 - k);
  const R = st.radius;
  const x = r * Math.sin(a) * (1 - k) + lane * k;
  const y = R - r * Math.cos(a);
  return [x, y + (HOVER - (R - r)) * k, a];
}

/**
 * Le Tube: the track plunges into a tube of glass and the race rides its walls all round, the camera with it; the
 * world turns around us, the city wheeling past through the glass, rings of light girdling the tube. The kick sends
 * a wave of light running ahead through the rings; through the build the tube closes in and the pack with it; on the
 * drop we burst out of its mouth into the open sky, rolling back upright, and rise above the race: its trails strung
 * out over the city.
 */
export const tube = defineShaderScene({
  id: "circuit-tube",
  name: "Le Tube",
  energy: "medium",
  hdr: true,
  mask: true,
  renderScale: 0.65,
  flight: { cruise: CRUISE, pump: 0.3 },
  description:
    "La piste plonge dans un tube de verre : la meute roule sur sa paroi tout autour, et la ville tourne derrière le verre. Des anneaux de lumière ceinturent le tube et s'allument en vague au kick ; pendant la montée le tube se resserre ; au drop on jaillit de sa bouche dans le ciel ouvert, et on s'élève au-dessus de la course tendue en traînées sur la ville.",
  params: [paletteParam("piste")],
  uniforms: () => {
    const st: TubeState = {
      racers: new Racers(),
      pack: [],
      offset: 0,
      start: 0,
      end: 1e9,
      radius: R_WIDE,
      theta: 0,
      dir: 1,
      out: -1,
      waveS: -1e4,
      waveT: 99,
      boost: 0,
      last: -99,
      pos: new THREE.Vector3(),
      look: new THREE.Vector3(),
    };
    return {
      uState: { value: st },
      ...st.racers.uniforms(),
      uLeap: { value: new THREE.Vector3(0, 1, 0) },
      uTube: { value: new THREE.Vector3(-1e6, -1e6, R_WIDE) },
      uCamP: { value: new THREE.Vector3() },
      uCamR: { value: new THREE.Vector3(1, 0, 0) },
      uCamU: { value: new THREE.Vector3(0, 1, 0) },
      uCamF: { value: new THREE.Vector3(0, 0, -1) },
      uWave: { value: new THREE.Vector2(-1e4, 0) },
      uRail: { value: 0 },
      uBoost: { value: 0 },
      uBurn: { value: 0.4 },
      uGantry: { value: new THREE.Vector3() },
    };
  },
  update(u, f, _p, dt, ctx) {
    const st = u.uState.value as TubeState;
    const fl = ctx.flight!;
    const bar = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;
    // back on screen: inside the tube again, somewhere else on the circuit, another pack round us
    if (f.time - st.last > 1.5) {
      const seed = Math.random() * 100;
      st.offset = Math.random() * LAP - fl.travel;
      const s = fl.travel + st.offset;
      st.start = s - 300;
      st.end = 1e9;
      st.out = -1;
      st.theta = Math.random() * Math.PI * 2;
      st.dir = Math.random() < 0.5 ? -1 : 1;
      st.boost = 0;
      st.pack = Array.from({ length: PACK_MAX }, (_, i) => ({
        angle: (i / PACK_MAX) * Math.PI * 2 + hashF(seed + i) * 0.5,
        spiral: (hashF(seed + i * 2.7) - 0.5) * 0.02,
        lane: [-2.4, 2.4, -0.8, 0.8, -1.6, 1.6][i % 6],
        phase: hashF(seed + i * 4.1) * 6.283,
        base: 6 + i * 8 + hashF(seed + i * 3.3) * 5,
        swing: 4 + 8 * hashF(seed + i * 5.5),
        rate: 0.05 + 0.08 * hashF(seed + i * 6.6),
        clock: hashF(seed + i * 7.7) * 40,
        colour: (i + Math.floor(seed)) % 4,
      }));
    }
    st.last = f.time;
    const s = fl.travel + st.offset;
    const s0 = Math.floor(s / LAP) * LAP;

    // the drop: out of the tube's mouth, just ahead
    if (f.drop && st.out < 0) {
      st.end = s + 22;
      st.out = 0;
      st.boost = 1;
    }
    if (st.out >= 0 && s > st.end) st.out += dt;
    st.boost *= Math.exp(-dt / (bar * 0.9));
    const inBuild = f.section === "build" && st.out < 0;
    // the tube closes in through the build
    st.radius = approach(st.radius, inBuild ? R_WIDE + (R_TIGHT - R_WIDE) * f.buildProgress : R_WIDE, 1.5, dt);
    (u.uTube.value as THREE.Vector3).set(st.start - s0, Math.min(st.end - s0, 1e6), st.radius);

    // the camera rides the wall round the axis, faster through the build; out of the tube it rolls back upright and rises
    if (st.out < 0) {
      const w = inBuild ? 0.15 + 0.6 * f.buildProgress : f.section === "breakdown" ? 0.06 : 0.14;
      st.theta += dt * w * st.dir;
    } else {
      st.theta = approach(st.theta, Math.round(st.theta / (Math.PI * 2)) * Math.PI * 2, 2.2, dt);
    }
    const rise = 22 * smooth(0, bar * 2, st.out);
    const camR = st.radius - 1.25;
    const [cx, cy, ca] = rideAt(s, st, st.theta, camR, 0);
    const up = (u.uCamU.value as THREE.Vector3);
    const roll = trackRoll(s);
    const ux = -Math.sin(ca);
    const uy = Math.cos(ca);
    trackPoint(s, s0, cx + ux * rise, cy + uy * rise, null, st.pos);
    const ahead = 16 + 30 * smooth(0, bar * 2, st.out);
    const [tx, ty] = rideAt(s + ahead, st, st.theta, st.radius - 0.9, 0);
    trackPoint(s + ahead, s0, tx + ux * rise * 0.35, ty + uy * rise * 0.35, null, st.look);
    up.set(Math.cos(roll) * ux + Math.sin(roll) * uy, -Math.sin(roll) * ux + Math.cos(roll) * uy, 0);
    const F = (u.uCamF.value as THREE.Vector3).subVectors(st.look, st.pos).normalize();
    const R = (u.uCamR.value as THREE.Vector3).crossVectors(F, up).normalize();
    up.crossVectors(R, F);
    (u.uCamP.value as THREE.Vector3).copy(st.pos);

    // the pack round the walls (closer through the build), then out on the deck with long trails over the city
    const count = Math.min(PACK_MAX, Math.round(8 + 2 * f.drift));
    const spread = inBuild ? 1 - 0.45 * f.buildProgress : 1;
    const trail = st.out >= 0 ? 30 + 110 * smooth(0, bar * 2, st.out) : 18 + 40 * fl.speedNorm;
    for (let i = 0; i < PACK_MAX; i++) {
      const r = st.pack[i];
      r.clock += dt * r.rate;
      if (i >= count) {
        st.racers.hide(i);
        continue;
      }
      const rs = s + (r.base + r.swing * Math.sin(r.clock)) * spread;
      const wallR = st.radius - HOVER;
      st.racers.placeAround(
        i,
        rs,
        s0,
        (x) => rideAt(x, st, r.angle + r.spiral * x, wallR, r.lane + weave(x, r.phase)),
        r.colour,
        trail,
      );
    }

    // the kick's wave, running ahead through the rings
    const v = CRUISE * fl.speed;
    if (f.beat) {
      st.waveS = s + 3;
      st.waveT = 0;
    }
    st.waveT += dt;
    st.waveS += dt * (v + 150);
    (u.uWave.value as THREE.Vector2).set(st.waveS - s0, Math.exp(-st.waveT * 1.3));
    u.uBoost.value = st.boost;
    const burn = inBuild ? 0.35 + 0.65 * f.buildProgress : 0.4;
    u.uBurn.value = approach(u.uBurn.value as number, Math.max(burn, st.boost), 3, dt);
  },
  fragment: /* glsl */ `
#define TUBE
uniform vec3 uCamP;
uniform vec3 uCamR;
uniform vec3 uCamU;
uniform vec3 uCamF;
${ART_LIB}
${FLIGHT_GLSL}
${CIRCUIT_GLSL}
${TRACK_GLSL}
${TRACK_SCENE_GLSL}

/** Where the tube's wall is at q (track frame): how far outside it (< 0 inside), and the point's angle round the axis. */
float tubeSide(vec3 q) {
  if (q.z <= uTube.x || q.z >= uTube.y) return 1e3;
  return length(vec2(q.x, q.y - uTube.z)) - uTube.z;
}

/** The tube's glass at q (seen from inside or out): faint reflections, lines of light along it, the kick's band, the racers' glow. */
vec3 glassColor(vec3 p, vec3 q, vec3 rd, float t, float pa) {
  vec2 qq = vec2(q.x, q.y - uTube.z);
  float r = length(qq);
  float rl = trackRoll(q.z);
  float c = cos(rl), s = sin(rl);
  vec2 nl = -qq / max(r, 1e-3);
  vec3 n = normalize(vec3(c * nl.x + s * nl.y, -s * nl.x + c * nl.y, 0.));
  if (dot(n, rd) > 0.) n = -n;
  float fw = t * pa / max(abs(dot(n, rd)), .08);
  vec3 g = glassEnv(reflect(rd, n)) * fresnel(n, rd) * .6;
  // lines of light along the tube, dashed, streaming
  float a = atan(qq.x, -qq.y);
  float seg = 6.2831853 * uTube.z / 16.;
  float dl = abs(fract(a / 6.2831853 * 16. + .5) - .5) * seg;
  float dash = smoothstep(.2, .35, fract(q.z / 9.)) * (1. - smoothstep(.75, .9, fract(q.z / 9.)));
  g += mix(uTint, vec3(1.), .3) * neon(dl, .025, fw) * (.25 + .35 * dash) * (1. + 1.5 * uBuild);
  // a fine honeycomb in the glass (only where the screen resolves it)
  vec2 hc = vec2(a * uTube.z, q.z) / 1.4;
  vec2 hq = vec2(hc.x + hc.y * .577, hc.y * 1.155);
  vec2 hf = fract(hq) - .5;
  float hex = abs(max(abs(hf.x), max(abs(hf.y), abs(hf.x + hf.y))) - .45) * 1.4;
  g += mix(uTint, vec3(1.), .4) * neon(hex, .012, fw) * .1 * (1. - smoothstep(.04, .15, fw));
  // the kick's band running through
  g += uTint * exp(-pow((q.z - uWave.x) / 3., 2.)) * uWave.y * .5;
  // the racers' glow on the wall they ride
  for (int i = 0; i < PACK_MAX; i++) {
    if (uRacerP[i].w < 0.) continue;
    vec3 o = p - uRacerP[i].xyz;
    g += racerCol(uRacerP[i].w) * exp(-dot(o, o) * .35) * .35 * (.6 + .5 * uBurn);
  }
  return g;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  uv += flightShake();
  float focal = flightFocal(1.3);
  vec3 ro = uCamP;
  vec3 rd = normalize(uv.x * uCamR + uv.y * uCamU + focal * uCamF);
  float pa = 1. / (uRes.y * focal);

  // the march, watching for the moment the ray crosses the tube's glass
  float t = .05, tPrev = .05;
  bool hit = false;
  float side0 = tubeSide(toTrack(ro));
  float sidePrev = side0;
  float tX = -1.;
  for (int i = 0; i < 160; i++) {
    vec3 p = ro + rd * t;
    float d = mapD(p);
    vec3 q = gTq;
    if (tX < 0.) {
      float side = tubeSide(q);
      if (side < 500. && sidePrev < 500. && sign(side) != sign(sidePrev)) tX = mix(tPrev, t, sidePrev / (sidePrev - side));
      sidePrev = side;
    }
    if (d < .0012 * t) { hit = true; break; }
    tPrev = t;
    // inside the tube, don't step clean through the glass far beyond it
    t += tX < 0. && sidePrev < 0. ? min(d, -sidePrev + .3) : d;
    if (t > 650.) break;
  }
  vec3 col = nightSky(rd);
  vec4 city = cityBelow(ro, rd, pa);
  col = mix(col, city.rgb, city.a);
  float tEnd = 1e4;
  if (hit) {
    tEnd = t;
    vec3 c = shadeHit(ro + rd * t, rd, t, pa);
    col = mix(c, col, smoothstep(320., 650., t));
  }
  // through the glass: the world beyond dimmed and tinted, the glass's own light on top
  if (tX > 0. && tX < tEnd) {
    vec3 pX = ro + rd * tX;
    col = col * mix(vec3(.55), uTint * .5 + .3, .15) + glassColor(pX, toTrack(pX), rd, tX, pa);
  }
  // a faint glow of light inside the tube
  if (side0 < 0.) col += uTint * .03 * (1. - exp(-min(tX > 0. ? tX : tEnd, 200.) / 50.));
  col += trailsLight(ro, rd, tEnd, pa, 1.);
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
