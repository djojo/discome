import * as THREE from "three";
import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { CIRCUIT_GLSL } from "./circuit.glsl";
import { FLIGHT_GLSL } from "./flight";
import { Cadrage, type Framing } from "./camera";
import { inside, LANES, PACK_MAX, Racers, TRACK_GLSL, trackX, trackY } from "./circuitTrack";
import { TRACK_SCENE_GLSL } from "./circuitScene.glsl";

const approach = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-dt * rate));

/** Where the stadium stands on the lap (s), its infield's half-length and half-width, the depth of its stands. */
const SA = 2020;
const A0 = 150;
const B0 = 46;
const DEPTH = 70;
/** The pack's half: two packs of six take turns through the arena. */
const HALF = PACK_MAX / 2;

/*
 * Framings in the stadium's frame: x across the track, y up, z backwards along it (z = SA - s): az = 0 is behind,
 * looking down the track. The stadium hugs the track's curve, so these follow it.
 */
const FRAMINGS: Framing[] = [
  // high in the stands, the track below
  { az: Math.PI / 2, el: 0.33, dist: 80, target: [0, 2, 0], focal: 1.65, weight: 2 },
  { az: -1.75, el: 0.36, dist: 85, target: [0, 6, -30], focal: 1.6 },
  // by the track, looking up at the crowd
  { az: Math.PI / 2, el: -0.18, dist: 92, target: [-75, 16, 10], focal: 1.8, weight: 2 },
  // from the gate, into the arena
  { az: 0, el: 0.02, dist: 60, target: [0, 4, 80], focal: 1.6 },
  // high above: the stadium in the city
  { az: 0.7, el: 0.95, dist: 520, target: [0, 0, 0], focal: 1.6 },
  // on the infield, the track across the view
  { az: 1.25, el: 0.1, dist: 40, target: [0, 1, 0], focal: 1.9 },
];

interface Pass {
  /** Time it started (seconds, the scene's clock), where its leader started, its speed; < 0: no pass. */
  t0: number;
  from: number;
  v: number;
}

interface ArenaState {
  racers: Racers;
  cadrage: Cadrage;
  passes: Pass[];
  offsets: number[];
  lanes: number[];
  next: number;
  clock: number;
  waveS: number;
  waveT: number;
  crowd: number;
  ola: number;
  olaAt: number;
  last: number;
  pos: THREE.Vector3;
  look: THREE.Vector3;
}

/** A point of the stadium's frame in the world (the lap origin is 0). */
function arenaPoint(x: number, y: number, z: number, out: THREE.Vector3) {
  const s = SA - z;
  return out.set(trackX(s) + x, trackY(s) + y, -s);
}

/**
 * L'Arène: the race seen from the stands. A giant stadium of black glass crowning a tower of the megacity, its bowl
 * hugging a bend of the track, which comes in through a gate of light at one end and leaves at the other. Tens of
 * thousands of spectators are points of light on the tiers (white, warm, the colour of the moment); a wave of light
 * runs round the bowl on every kick, phones flash on the hats. The drop: the pack bursts through the gate and crosses
 * the arena in a wake of trails, every light in the stands goes up at once; then a pack every two bars: the race never
 * stops. « Les Gradins »: the wait, the crowd's lights swaying, the empty track, a pack now and then. As the night
 * drifts the stands empty row by row: the race goes on for an empty arena.
 */
export const arena = defineShaderScene({
  id: "circuit-arena",
  name: "L'Arène",
  energy: "intense",
  hdr: true,
  mask: true,
  renderScale: 0.65,
  description:
    "La course vue des gradins : un stade géant de verre noir dans la mégapole, la piste qui entre par une porte de lumière et ressort à l'autre bout, des dizaines de milliers de spectateurs réduits à des points de lumière ; une ola court autour des gradins au kick. Au drop la meute jaillit et traverse l'arène, tous les points s'allument ; puis une meute toutes les deux mesures. « Les Gradins » : l'attente, la piste vide, une meute de temps en temps.",
  params: [paletteParam("piste"), { type: "toggle", key: "wait", label: "Les Gradins (l'attente)", default: false }],
  uniforms: () => {
    const st: ArenaState = {
      racers: new Racers(),
      cadrage: new Cadrage(FRAMINGS, 3),
      passes: [
        { t0: -1, from: 0, v: 0 },
        { t0: -1, from: 0, v: 0 },
      ],
      offsets: [0, 7, 14, 22, 31, 41],
      lanes: [LANES[2], LANES[3], LANES[1], LANES[4], LANES[0], LANES[2]],
      next: 0,
      clock: 0,
      waveS: -1e4,
      waveT: 99,
      crowd: 0,
      ola: 99,
      olaAt: 0,
      last: -99,
      pos: new THREE.Vector3(),
      look: new THREE.Vector3(),
    };
    return {
      uState: { value: st },
      ...st.racers.uniforms(),
      uLeap: { value: new THREE.Vector3(0, 1, 0) },
      uClear: { value: new THREE.Vector2(SA - 330, SA + 330) },
      uCamP: { value: new THREE.Vector3() },
      uCamR: { value: new THREE.Vector3(1, 0, 0) },
      uCamU: { value: new THREE.Vector3(0, 1, 0) },
      uCamF: { value: new THREE.Vector3(0, 0, -1) },
      uFocalV: { value: 1.7 },
      uWave: { value: new THREE.Vector2(-1e4, 0) },
      uRail: { value: 0 },
      uBoost: { value: 0 },
      uBurn: { value: 1 },
      uGantry: { value: new THREE.Vector3() },
      uCrowd: { value: 0 },
      uOla: { value: new THREE.Vector2(99, 0) },
      uSafe: { value: 0 },
    };
  },
  update(u, f, p, dt) {
    const st = u.uState.value as ArenaState;
    const bar = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;
    const wait = p.wait === true;
    if (f.time - st.last > 1.5) {
      st.cadrage.reset(Math.random() * 100);
      st.passes.forEach((ps) => (ps.t0 = -1));
      st.next = 0;
      st.crowd = 0;
      // a new order on the grid of lanes
      st.lanes.sort(() => Math.random() - 0.5);
    }
    st.last = f.time;
    st.clock += dt;
    u.uSafe.value = f.safeFlash ? 1 : 0;

    // the packs: on the drop one bursts through the gate, then one every two bars; waiting, one a phrase
    const start = (v: number) => {
      const ps = st.passes[st.next];
      st.next = (st.next + 1) % st.passes.length;
      ps.t0 = st.clock;
      ps.from = SA - A0 - DEPTH - 25;
      ps.v = v;
    };
    if (f.drop) {
      start(105);
      st.crowd = 1;
    } else if (f.downbeat && !wait && f.section === "drop" && f.bar % 2 === 0) start(95);
    else if (f.downbeat && f.phraseBar === 0 && (wait || f.section !== "drop")) start(wait ? 70 : 85);
    st.crowd *= Math.exp(-dt / (bar * 2));
    u.uCrowd.value = st.crowd;
    u.uBoost.value = st.crowd * 0.6;
    for (let k = 0; k < st.passes.length; k++) {
      const ps = st.passes[k];
      for (let j = 0; j < HALF; j++) {
        const i = k * HALF + j;
        if (ps.t0 < 0) {
          st.racers.hide(i);
          continue;
        }
        const from = ps.from - st.offsets[j];
        const s = from + ps.v * (st.clock - ps.t0);
        if (s > SA + 500) {
          st.racers.hide(i);
          if (j === HALF - 1) ps.t0 = -1;
          continue;
        }
        const lane = st.lanes[j];
        st.racers.place(i, s, 0, (q) => lane + 0.9 * inside(q), 0, (i + k) % 4, 30 + ps.v * 0.45, null, from);
      }
    }

    // the crowd: a wave of light round the bowl on every kick
    if (f.beat) {
      st.ola = 0;
      st.olaAt = Math.random() * Math.PI * 2;
    }
    st.ola += dt;
    (u.uOla.value as THREE.Vector2).set(st.ola, st.olaAt);
    if (f.beat) {
      st.waveS = SA - A0 - DEPTH;
      st.waveT = 0;
    }
    st.waveT += dt;
    st.waveS += dt * 160;
    (u.uWave.value as THREE.Vector2).set(st.waveS, Math.exp(-st.waveT * 1.3));

    // the camera: a framing of the stadium (in its own frame, following the bend)
    const cad = st.cadrage;
    cad.update(f, dt);
    arenaPoint(cad.pos.x, cad.pos.y, cad.pos.z, st.pos);
    arenaPoint(cad.target.x, cad.target.y, cad.target.z, st.look);
    const F = (u.uCamF.value as THREE.Vector3).subVectors(st.look, st.pos).normalize();
    const R = (u.uCamR.value as THREE.Vector3).crossVectors(F, new THREE.Vector3(0, 1, 0)).normalize();
    (u.uCamU.value as THREE.Vector3).crossVectors(R, F);
    (u.uCamP.value as THREE.Vector3).copy(st.pos);
    u.uFocalV.value = cad.focal;
    u.uBurn.value = approach(u.uBurn.value as number, 0.6 + 0.4 * st.crowd, 3, dt);
  },
  fragment: /* glsl */ `
#define CLEAR_ZONE
uniform vec3 uCamP;
uniform vec3 uCamR;
uniform vec3 uCamU;
uniform vec3 uCamF;
uniform float uFocalV;
uniform float uCrowd;   // the drop: every light in the stands up at once
uniform vec2 uOla;      // seconds since the kick, the angle the wave started from
uniform float uSafe;
${ART_LIB}
${FLIGHT_GLSL}
${CIRCUIT_GLSL}
${TRACK_GLSL}
${TRACK_SCENE_GLSL}

const float SA = ${SA}.;
const float A0 = ${A0}.;
const float B0 = ${B0}.;
const float DEPTH = ${DEPTH}.;
const float TREAD = 1.7;
const float RISE = .99;
vec4 gA;     // the stadium's hit: across, up, along (its frame), distance out from the infield's edge

/** A point in the stadium's frame: across the track's centre, up from its height, along it from the stadium's middle. */
vec3 toArena(vec3 p) {
  float s = -p.z;
  return vec3(p.x - trackX(s), p.y - trackY0(s), s - SA);
}

/** Distance out from the infield's elliptical edge (metres, negative inside the infield). */
float outFromEdge(vec2 xz) {
  vec2 r = vec2(B0, A0);
  float e = length(xz / r);
  float g = length(xz / (r * r));
  return (e - 1.) * e / max(g, 1e-5);
}

/** The stands rising in steps, their tower, the infield, the roof ring, the tunnels through for the track. */
float arenaD(vec3 p) {
  vec3 a = toArena(p);
  if (abs(a.z) > A0 + DEPTH + 40.) return abs(a.z) - A0 - DEPTH - 20.;
  float d = outFromEdge(a.xz);
  // the stands: a stair from the infield's edge to the top, the mass beneath it down to the city
  float stair = -4. + (floor(max(d, 0.) / TREAD) + 1.) * RISE;
  float stands = max(max(a.y - stair, -d), d - DEPTH);
  // the infield: a slab under the track's level
  float infield = max(d, abs(a.y + 5.) - 1.);
  // the roof ring over the upper stands
  float roof = max(max(abs(a.y - 47.) - .8, 38. - d), d - DEPTH - 6.);
  // tunnels through the stands for the track, at both ends
  float tunnel = max(abs(a.x) - 9., a.y - 10.);
  stands = max(stands, -tunnel);
  float r = min(min(stands, infield), roof) * .6;
  gA = vec4(a, d);
  gMat = stands < infield && stands < roof ? 9. : infield < roof ? 10. : 11.;
  return r;
}

float sceneD(vec3 p) {
  float d = mapD(p);
  float m = gMat;
  vec3 tq = gTq;
  vec4 ga;
  float da = arenaD(p);
  ga = gA;
  if (da < d) return da;
  gMat = m;
  gTq = tq;
  gA = ga;
  return d;
}

vec3 nrmArena(vec3 p, float e) {
  const vec2 k = vec2(1, -1);
  return normalize(k.xyy * arenaD(p + k.xyy * e) + k.yyx * arenaD(p + k.yyx * e) + k.yxy * arenaD(p + k.yxy * e) + k.xxx * arenaD(p + k.xxx * e));
}

/** The crowd on a tread: a point of light per seat (white, warm, the moment's colour), the wave, the flashes. */
vec3 crowd(vec3 a, float d, float fw) {
  float row = floor(d / TREAD);
  float rows = floor(DEPTH / TREAD);
  vec2 r = vec2(B0 + d, A0 + d);
  float th = atan(a.z / r.y, a.x / r.x);
  float per = 6.2831853 * sqrt((r.x * r.x + r.y * r.y) * .5);
  float u = th / 6.2831853 * per;
  float seat = floor(u / .9);
  vec2 o = vec2((fract(u / .9) - .5) * .9, fract(d / TREAD) * TREAD - .9);
  float h = hash12(vec2(seat, row));
  // the stands empty row by row as the night drifts, from the top
  float there = step(.12, h) * step(row, rows * (1. - .9 * uDrift));
  // the people: each seat a figure lit by the floodlights (their average from afar)
  float person = 1. - smoothstep(.28, .4, max(abs(o.x) * 1.2, abs(o.y + .15) * .8));
  vec3 cloth = mix(vec3(.5, .5, .55), vec3(.6, .45, .35), hash12(vec2(seat + 7., row))) * (.5 + .5 * hash12(vec2(row, seat * 3.)));
  vec3 people = cloth * mix(person, .42, smoothstep(.15, .6, fw)) * .16 * there * (1. + .8 * uCrowd);
  // a light held up by some (a phone, a band): white, warm, the moment's colour
  float holds = step(.5, h);
  vec3 c = h < .7 ? vec3(1., .95, .9) : h < .85 ? vec3(1., .72, .4) : uTint;
  float glow = .5 + .5 * sin(uTime * (.6 + h) + h * 40.);
  // the wave round the bowl
  float dth = abs(mod(th - uOla.y - uOla.x * 2.2 + 3.14159, 6.2831853) - 3.14159);
  float ola = exp(-dth * dth / .02) * exp(-uOla.x * .5);
  float flash = step(.985, hash12(vec2(seat * 1.3 + row, floor(uTime * 9.)))) * (uHat + uCrowd);
  float k = (.35 + .25 * glow + 2.5 * ola + 1.5 * uCrowd * (uSafe > .5 ? .5 : 1.)) + flash * 4.;
  return people * (1. + 2.5 * ola) + c * dotL(length(o - vec2(0., .5)), .24, fw) * k * there * holds * 4.;
}

vec3 arenaColor(vec3 p, vec3 rd, float t, float pa) {
  float m = gMat;
  vec4 ga = gA;
  vec3 a = ga.xyz;
  float d = ga.w;
  vec3 n = nrmArena(p, max(.02, t * pa));
  float fw = t * pa / max(abs(dot(n, rd)), .1);
  vec3 c = vec3(.005, .006, .009) + glassEnv(reflect(rd, n)) * fresnel(n, rd) * .7;
  if (m < 9.5) {
    // the floodlights on the stands
    c += vec3(.03, .033, .04) * (.6 + .4 * max(n.y, 0.)) * (1. + uCrowd);
    if (n.y > .6) c += crowd(a, d, fw);
    else {
      // a riser: dark glass, a line of light every few rows; the outer wall: lines of light up the facade
      float row = floor(d / TREAD);
      c += uTint * neon(abs(fract(a.y / RISE) - .5) * RISE, .03, fw) * step(.5, fract(row / 6.)) * .4 * step(d, DEPTH - 1.);
      if (d > DEPTH - 1.) {
        float u = atan(a.z / (A0 + DEPTH), a.x / (B0 + DEPTH)) * 220.;
        c += uTint * neon(abs(fract(u / 12.) - .5) * 12., .12, fw) * .6;
        c += mix(uTint, vec3(1.), .5) * neon(abs(a.y - 30.5), .3, fw) * .8;
      }
    }
    // the gates: arches of light where the track goes through
    float gate = abs(length(vec2(a.x, a.y + 1.)) - 9.5);
    c += mix(uTint, vec3(1.), .4) * neon(gate, .18, fw) * step(abs(abs(a.z) - A0 - 2.), 3.) * 3. * (1. + 2. * uCrowd);
  } else if (m < 10.5) {
    // the infield: dark, rings of light echoing the bowl
    float e = length(a.xz / vec2(B0, A0));
    c += uTint * neon(abs(fract(e * 4.) - .5) / 4. * B0, .12, fw) * .35 * (1. + uCrowd);
  } else {
    // the roof ring: floodlights along its inner edge
    float u = atan(a.z / (A0 + 40.), a.x / (B0 + 40.)) * 140.;
    float lamp = dotL(length(vec2((fract(u / 8.) - .5) * 8., a.y - 46.2)), .5, fw);
    c += vec3(1., .97, .9) * lamp * 8. * step(d, 40.5);
  }
  return c;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 ro = uCamP;
  vec3 rd = normalize(uv.x * uCamR + uv.y * uCamU + uFocalV * uCamF);
  float pa = 1. / (uRes.y * uFocalV);
  float t = .05;
  bool hit = false;
  for (int i = 0; i < 170; i++) {
    vec3 p = ro + rd * t;
    float d = sceneD(p);
    if (d < .0012 * t) { hit = true; break; }
    t += d;
    if (t > 1400.) break;
  }
  vec3 col = nightSky(rd);
  vec4 city = cityBelow(ro, rd, pa);
  col = mix(col, city.rgb, city.a);
  float tEnd = 1e4;
  if (hit) {
    vec3 p = ro + rd * t;
    tEnd = t;
    vec3 c = gMat > 8.5 ? arenaColor(p, rd, t, pa) : shadeHit(p, rd, t, pa);
    col = mix(c, col, smoothstep(700., 1400., t));
  }
  // the floodlights' haze over the arena
  col += vec3(.9, .95, 1.) * .015 * (1. + uCrowd);
  col += trailsLight(ro, rd, tEnd, pa, 1.);
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
