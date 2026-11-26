import * as THREE from "three";
import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { num } from "../utils";
import { ART_LIB } from "./lib.glsl";
import { CIRCUIT_GLSL } from "./circuit.glsl";
import { FLIGHT_GLSL, flightParams } from "./flight";
import { LAP, Pack, PACK_MAX, packUniforms, TRACK_GLSL, trackFrame, trackPoint, TRAIL_PTS, type Leap, type TrackFrame } from "./circuitTrack";

const approach = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-dt * rate));

/** Metres per second at cruise (the scene's speed and the flight's multiplier on top). */
const CRUISE = 40;

/** Laps run over the night, every circuit scene together: the gantry's lights count them, then start again. */
let laps = 0;

interface RaceState {
  pack: Pack;
  /** Where in the lap this visit started (a new stretch of the circuit on every return). */
  offset: number;
  lap: number;
  leap: Leap | null;
  waveS: number;
  waveT: number;
  rail: number;
  boost: number;
  last: number;
  frame: TrackFrame;
  pos: THREE.Vector3;
  look: THREE.Vector3;
}

/**
 * Le Circuit: the race of the future, high above a megacity at night. An anti-gravity track of black glass with rails
 * of light, banked into its turns, rolling over long hills and twisting into corkscrews (the world turns around it),
 * through hoops of light; the camera rides it just above the deck in the middle of a pack of racers, each leaving two
 * trails of light. The kick sends a wave of light running ahead down the track (the boost pads light up as it
 * passes); through the build the rails' lights race ahead and the camera drops low; on the drop the track falls away
 * ahead and the pack flies over the void, the city far below, to land beyond. The race never ends: the same lap again
 * and again, one more light on the finish gantry every time it passes.
 */
export const race = defineShaderScene({
  id: "circuit-track",
  name: "Le Circuit",
  energy: "intense",
  hdr: true,
  mask: true,
  renderScale: 0.7,
  flight: { cruise: CRUISE, pump: 0.3 },
  description:
    "Une piste anti-gravité de verre noir suspendue très haut au-dessus d'une mégapole de nuit : virages relevés, bosses, tire-bouchons, anneaux de lumière. On roule au ras de la piste dans une meute de bolides aux traînées lumineuses ; au kick une vague de lumière file devant, au drop la piste se dérobe et la meute vole au-dessus du vide. Le même tour revient sans fin, une lumière de plus au portique à chaque passage.",
  params: [
    paletteParam("piste"),
    { type: "toggle", key: "cruise", label: "Croisière (moins de bolides, caméra plus haute)", default: false },
    ...flightParams(1, 1),
  ],
  uniforms: () => {
    const pack = new Pack();
    const st: RaceState = {
      pack,
      offset: 0,
      lap: 0,
      leap: null,
      waveS: -1e4,
      waveT: 99,
      rail: 0,
      boost: 0,
      last: -99,
      frame: { pos: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), fwd: new THREE.Vector3() },
      pos: new THREE.Vector3(),
      look: new THREE.Vector3(),
    };
    return {
      uState: { value: st },
      ...packUniforms(pack),
      uLeap: { value: new THREE.Vector3(0, 1, 0) },
      uCamP: { value: new THREE.Vector3() },
      uCamR: { value: new THREE.Vector3(1, 0, 0) },
      uCamU: { value: new THREE.Vector3(0, 1, 0) },
      uCamF: { value: new THREE.Vector3(0, 0, -1) },
      uWave: { value: new THREE.Vector2(-1e4, 0) },
      uRail: { value: 0 },
      uBoost: { value: 0 },
      uBurn: { value: 0.3 },
      uLamps: { value: 0 },
      uCruiseV: { value: 0 },
    };
  },
  update(u, f, p, dt, ctx) {
    const st = u.uState.value as RaceState;
    const fl = ctx.flight!;
    const bar = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;
    const cruise = p.cruise === true;
    // back on screen: another stretch of the circuit, another pack
    if (f.time - st.last > 1.5) {
      st.offset = Math.random() * LAP - fl.travel;
      st.pack.reseed(Math.random() * 100);
      st.leap = null;
      st.boost = 0;
      st.lap = Math.floor((fl.travel + st.offset) / LAP);
    }
    st.last = f.time;
    const s = fl.travel + st.offset;
    const lap = Math.floor(s / LAP);
    if (lap > st.lap) laps++;
    st.lap = lap;
    const s0 = lap * LAP;
    const v = CRUISE * num(p.speed, 1) * fl.speed;

    // the drop: the track falls away ahead, the pack flies over the void and lands beyond
    if (f.drop) {
      const len = Math.min(700, Math.max(260, CRUISE * num(p.speed, 1) * 4 * bar * 2));
      st.leap = { start: s + 35, len, open: 0 };
      st.boost = 1;
    }
    if (st.leap) {
      st.leap.open = approach(st.leap.open, 1, 4, dt);
      if (s > st.leap.start + st.leap.len + 160) st.leap = null;
    }
    st.boost *= Math.exp(-dt / (bar * 0.9));
    const leap = st.leap;
    const lp = u.uLeap.value as THREE.Vector3;
    if (leap) lp.set(leap.start - s0, leap.len, leap.open);
    else lp.set(0, 1, 0);

    // the camera: just above the deck (higher in Croisière), lower through the build, swaying across the lanes
    const sway = fl.sway * 2.3;
    const h = (cruise ? 3.2 : 1.25) * (1 + 0.3 * Math.min(fl.dive, 0));
    trackPoint(s, s0, sway, h, leap, st.pos);
    trackPoint(s + (cruise ? 26 : 15), s0, sway * 0.6, h - (cruise ? 1.6 : 0.65), leap, st.look);
    const fr = trackFrame(s, s0, st.frame);
    const F = (u.uCamF.value as THREE.Vector3).subVectors(st.look, st.pos).normalize();
    // the track's up, turned by the flight's bank on its slaloms (not its barrel rolls: the corkscrews are the track's)
    const up = fr.up.clone().applyAxisAngle(F, fl.move === "roll" ? 0 : fl.bank);
    const R = (u.uCamR.value as THREE.Vector3).crossVectors(F, up).normalize();
    (u.uCamU.value as THREE.Vector3).crossVectors(R, F);
    (u.uCamP.value as THREE.Vector3).copy(st.pos);

    // the pack: denser as the night drifts (the race consumes everything)
    const count = Math.min(PACK_MAX, Math.round((cruise ? 4 : 8) + 2 * f.drift));
    st.pack.update(dt, s, s0, count, 16 + 46 * fl.speedNorm, cruise ? 1.5 : 1, leap, f.time);

    // the kick's wave of light, running ahead faster than the pack
    if (f.beat) {
      st.waveS = s + 4;
      st.waveT = 0;
    }
    st.waveT += dt;
    st.waveS += dt * (v + 140);
    (u.uWave.value as THREE.Vector2).set(st.waveS - s0, Math.exp(-st.waveT * 1.3));
    // the rails' lights: still on the groove (they stream by), racing ahead through the build
    st.rail += dt * v * (f.section === "build" ? 0.4 + 1.6 * f.buildProgress : 0);
    u.uRail.value = st.rail - s0;
    u.uBoost.value = st.boost;
    const burn = f.section === "build" ? 0.3 + 0.7 * f.buildProgress : f.section === "breakdown" ? 0.15 : 0.35;
    u.uBurn.value = approach(u.uBurn.value as number, Math.max(burn, st.boost), 3, dt);
    u.uLamps.value = laps % 11;
    u.uCruiseV.value = cruise ? 1 : 0;
  },
  fragment: /* glsl */ `
#define PACK_MAX ${PACK_MAX}
#define TRAIL_PTS ${TRAIL_PTS}
uniform vec4 uRacerP[PACK_MAX];   // a racer: position (world, lap origin), w: its colour (< 0: none)
uniform vec3 uRacerR[PACK_MAX];
uniform vec3 uRacerU[PACK_MAX];
uniform vec3 uRacerF[PACK_MAX];
uniform vec3 uTrailL[PACK_MAX * TRAIL_PTS];
uniform vec3 uTrailR[PACK_MAX * TRAIL_PTS];
uniform vec3 uCamP;
uniform vec3 uCamR;
uniform vec3 uCamU;
uniform vec3 uCamF;
uniform vec2 uWave;      // the kick's wave: where along the track, how bright
uniform float uRail;     // the rails' lights' offset (they race ahead through the build)
uniform float uBoost;    // the drop's boost, fading
uniform float uBurn;     // how hard the engines burn
uniform float uLamps;    // lights lit on the finish gantry (the laps)
uniform float uCruiseV;
${ART_LIB}
${FLIGHT_GLSL}
${CIRCUIT_GLSL}
${TRACK_GLSL}

float gMat;     // 0 the deck's glass, 1 a rail, 2 the deck's edge and underside, 3 a hoop, 4 the gantry, 5 a racer
float gRacer;
vec3 gTq;       // the hit in the track's frame

/** Turn a colour's hue (a: 0..1 of a turn) around the grey axis. */
vec3 hueTurn(vec3 c, float a) {
  const vec3 k = vec3(.57735);
  float ca = cos(a * 6.2831853);
  return max(c * ca + cross(k, c) * sin(a * 6.2831853) + k * dot(k, c) * (1. - ca), 0.);
}
/** A racer's colour: the colour of the moment, its opposite, white, a third. */
vec3 racerCol(float k) {
  vec3 t = uTint;
  return k < .5 ? t : k < 1.5 ? hueTurn(t, .5) * .9 + .05 : k < 2.5 ? mix(t, vec3(1.), .7) : hueTurn(t, .25);
}

/** The track and what stands on it, in its frame (deck, rails, the hoops every 100 m, the finish gantry). */
float trackD(vec3 p) {
  vec3 q = toTrack(p);
  gTq = q;
  float deck = max(abs(q.x) - TRACK_W, abs(q.y + .3) - .3);
  float rail = max(abs(abs(q.x) - TRACK_W + .12) - .12, abs(q.y - .09) - .09);
  float d = min(deck, rail);
  float m = deck < rail ? (q.y > -.02 && abs(q.x) < TRACK_W - .2 ? 0. : 2.) : 1.;
  // hoops of light arching over the track
  float ds = mod(q.z + 50., 100.) - 50.;
  float hoop = max(length(vec2(length(vec2(q.x, q.y + .3)) - 6.6, ds)) - .06, -(q.y + .3));
  if (hoop < d) { d = hoop; m = 3.; }
  // the finish gantry, once a lap: two pillars and a beam carrying the lap lights
  float dg = mod(q.z + LAP * .5, LAP) - LAP * .5;
  if (abs(dg) < 12.) {
    vec3 g = vec3(abs(q.x) - TRACK_W - .8, q.y - 3.8, dg);
    float pil = sdBox(g, vec3(.35, 4.1, .35));
    float beam = sdBox(vec3(q.x, q.y - 7.9, dg), vec3(TRACK_W + 1.15, .45, .4));
    float gt = min(pil, beam);
    if (gt < d) { d = gt; m = 4.; }
  }
  gMat = m;
  return d;
}

/** The pack (world): the nearest racer's body. */
float racersD(vec3 p) {
  float d = 1e9;
  for (int i = 0; i < PACK_MAX; i++) {
    vec4 rp = uRacerP[i];
    if (rp.w < 0.) continue;
    vec3 o = p - rp.xyz;
    float b = length(o) - 1.45;
    if (b > .4) { d = min(d, b); continue; }
    vec3 c = vec3(dot(o, uRacerR[i]), dot(o, uRacerU[i]), dot(o, uRacerF[i]));
    float dc = craftD(c);
    if (dc < d) { d = dc; gRacer = float(i); }
  }
  return d;
}

/*
 * The megacity's towers beside the track: black glass rising from the city far below, some topping out under the
 * track, some above it. One per cell of TC metres on either side (or none), well clear of the track.
 */
const float TC = 90.;
vec4 gTower;     // the hit tower: centre x, z, half-width, top
float towersD(vec3 p) {
  float cz = floor(-p.z / TC + .5);
  float sc = cz * TC;
  float xc = trackX(sc);
  float side = p.x > xc ? 1. : -1.;
  float h1 = hash12(vec2(cz, side)), h2 = hash12(vec2(cz * 1.3, side + 4.)), h3 = hash12(vec2(cz * .7, side - 2.));
  // bounds: the next cell's tower (beyond the cell's edge), the other side's (beyond the track)
  float bound = min(TC * .5 - abs(-p.z - sc) + 30., abs(p.x - xc) + 18.);
  if (h1 < .3) return bound;
  float w = 5. + 9. * h2;
  float top = -50. + 115. * h3;
  vec3 c = vec3(xc + side * (34. + 90. * fract(h1 * 7.3)), (top + CITY_Y) * .5, -sc);
  gTower = vec4(c.x, c.z, w, top);
  return min(sdBox(p - c, vec3(w, (top - CITY_Y) * .5, w)), bound);
}

float mapD(vec3 p) {
  float dt = trackD(p);
  // the track's frame stretches distances (its slopes, its roll far from its axis): step carefully
  dt /= 1.15 + .04 * length(gTq.xy);
  float m = gMat;
  vec3 tq = gTq;
  float dr = racersD(p);
  if (dr < dt) { dt = dr; m = 5.; }
  float dw = towersD(p);
  if (dw < dt) { dt = dw; m = 6.; }
  gMat = m;
  gTq = tq;
  return dt;
}

/** A tower: black glass, its vertical edges drawn in light, faint floors, a crown of light at its top. */
vec3 towerColor(vec3 p, vec3 rd, float t, float pa) {
  vec4 tw = gTower;
  vec3 q = p - vec3(tw.x, 0., tw.y);
  float w = tw.z;
  vec3 n = abs(q.x) > abs(q.z) ? vec3(sign(q.x), 0., 0.) : vec3(0., 0., sign(q.z));
  if (p.y > tw.w - .05) n = vec3(0., 1., 0.);
  float fw = t * pa / max(abs(dot(n, rd)), .08);
  vec3 c = vec3(.004, .005, .008) + glassEnv(reflect(rd, n)) * fresnel(n, rd);
  float e = w - min(abs(q.x), abs(q.z));
  c += uTint * neon(e, .1, fw) * (.9 + 1.5 * uBoost);
  float fl = abs(fract(p.y / 4.) - .5) * 4.;
  c += mix(uTint, vec3(1.), .5) * neon(fl, .03, fw) * .05;
  vec2 wc = floor(vec2((abs(q.x) > abs(q.z) ? q.z : q.x) / 2.5, p.y / 4.));
  float win = step(.9, hash12(wc + tw.xy)) * (1. - smoothstep(.2, .32, length(fract(vec2((abs(q.x) > abs(q.z) ? q.z : q.x) / 2.5, p.y / 4.)) - .5)));
  c += vec3(1., .85, .6) * mix(win, .04, smoothstep(.5, 2., fw / 2.5)) * .25;
  c += mix(uTint, vec3(1.), .4) * neon(tw.w - p.y, .25, fw) * 1.5;
  return c;
}

vec3 nrmTrack(vec3 p, float e) {
  const vec2 k = vec2(1, -1);
  return normalize(k.xyy * trackD(p + k.xyy * e) + k.yyx * trackD(p + k.yyx * e) + k.yxy * trackD(p + k.yxy * e) + k.xxx * trackD(p + k.xxx * e));
}

/** A segment of light (a to b) seen by the ray, up to tmax: its glow. w: its core's radius; fade0/1 at its ends. */
float segLight(vec3 ro, vec3 rd, vec3 a, vec3 b, float w, float tmax, float pa, float fade0, float fade1) {
  vec3 ba = b - a, wo = ro - a;
  float bb = dot(ba, ba), bd = dot(ba, rd), dw = dot(rd, wo), ew = dot(ba, wo);
  float den = max(bb - bd * bd, 1e-6);
  float h = clamp((ew - bd * dw) / den, 0., 1.);
  float t = max(dot(a + ba * h - ro, rd), 0.);
  if (t > tmax) return 0.;
  vec3 diff = ro + rd * t - a - ba * h;
  float d = length(diff);
  float r = max(w, t * pa * .9);
  float core = (w / r) * exp(-d * d / (r * r));
  return (core * 1.8 + .1 * halo(d, r * 4.)) * mix(fade0, fade1, h);
}

/** Every trail of the pack seen by a ray (reflections: dimmer and wider). */
vec3 trailsLight(vec3 ro, vec3 rd, float tmax, float pa, float wide) {
  vec3 acc = vec3(0.);
  float w = (.025 + .022 * uSpeed) * wide;
  for (int i = 0; i < PACK_MAX; i++) {
    if (uRacerP[i].w < 0.) continue;
    // the whole trail far from the ray: nothing to add
    vec3 o = uRacerP[i].xyz - ro;
    float along = dot(o, rd);
    if (along < -80.) continue;
    vec3 col = racerCol(uRacerP[i].w);
    float sum = 0.;
    for (int k = 0; k < TRAIL_PTS - 1; k++) {
      int j = i * TRAIL_PTS + k;
      float f0 = 1. - float(k) / float(TRAIL_PTS - 1), f1 = 1. - float(k + 1) / float(TRAIL_PTS - 1);
      f0 *= f0; f1 *= f1;
      sum += segLight(ro, rd, uTrailL[j], uTrailL[j + 1], w, tmax, pa, f0, f1);
      sum += segLight(ro, rd, uTrailR[j], uTrailR[j + 1], w, tmax, pa, f0, f1);
    }
    acc += col * sum;
  }
  return acc * (.9 + .5 * uBurn);
}

/** The deck's top: black glass reflecting the night and every trail; its markings, pads and the lights' spill. */
vec3 deckColor(vec3 p, vec3 q, vec3 n, vec3 rd, float t, float pa) {
  float fw = t * pa / max(abs(dot(n, rd)), .06);
  float fr = fresnel(n, rd);
  vec3 rr = reflect(rd, n);
  vec3 c = vec3(.005, .006, .01);
  c += glassEnv(rr) * fr;
  c += trailsLight(p + n * .02, rr, 120., pa, 1.6) * (.15 + .85 * fr);
  float ax = abs(q.x);
  // lane lines, dashed, faint
  float lane = neon(abs(abs(q.x) - 1.4), .03, fw) + neon(abs(abs(q.x) - 2.8), .03, fw);
  lane *= step(.45, fract(q.z / 6.));
  c += mix(uTint, vec3(1.), .5) * lane * .12;
  // boost pads every 40 m: three chevrons pointing ahead, lit by the kick's wave and the drop
  float pz = mod(q.z + 20., 40.) - 20.;
  float waveK = exp(-pow((q.z - uWave.x) / 4., 2.)) * uWave.y;
  if (abs(pz) < 2.6 && ax < 1.3) {
    float v = abs(fract((pz + .8 * ax) / 1.7) - .5) * 1.7;
    float ch = neon(v, .18, fw);
    c += uTint * ch * (.12 + 2.5 * waveK + 1.5 * uBoost);
  }
  // the wave itself crossing the deck
  c += uTint * waveK * .35 * (1. - smoothstep(TRACK_W - .5, TRACK_W, ax));
  // the rails' light spilling onto the glass
  c += uTint * exp(-(TRACK_W - .2 - ax) * 1.6) * .14 * (1. + uBoost);
  // the racers' levitation: a pool of their colour under each one
  for (int i = 0; i < PACK_MAX; i++) {
    if (uRacerP[i].w < 0.) continue;
    vec3 o = p - uRacerP[i].xyz;
    float dn = dot(o, n);
    vec3 lat = o - n * dn;
    float fwd = dot(lat, uRacerF[i]);
    float side = dot(lat, uRacerR[i]);
    float pool = exp(-(side * side / .5 + fwd * fwd / 2.2)) * exp(-max(-dn - .2, 0.) * 2.);
    c += racerCol(uRacerP[i].w) * pool * .55 * (.6 + .5 * uBurn);
  }
  // the finish line, under the gantry
  float dg = mod(q.z + LAP * .5, LAP) - LAP * .5;
  float chk = step(.5, fract(q.x / .7 + step(.5, fract(dg / 1.4)) * .5));
  c += vec3(.9) * (1. - step(1.4, abs(dg))) * mix(.06, .5, chk);
  return c;
}

/** The rails: dark kerbs, a strip of light along their inner face, its dashes; sparks on the hats. */
vec3 railColor(vec3 q, vec3 n, vec3 rd, float t, float pa) {
  float fw = t * pa / max(abs(dot(n, rd)), .1);
  vec3 c = vec3(.006) + glassEnv(reflect(rd, n)) * fresnel(n, rd);
  float inner = TRACK_W - .24 - abs(q.x);
  float strip = neon(abs(q.y - .09), .045, fw) * smoothstep(.06, 0., abs(inner));
  float dash = smoothstep(.35, .5, fract((q.z - uRail) / 7.)) * (1. - smoothstep(.85, 1., fract((q.z - uRail) / 7.)));
  float waveK = exp(-pow((q.z - uWave.x) / 6., 2.)) * uWave.y;
  c += uTint * strip * (1.1 + .9 * dash + 3. * waveK + 2. * uBoost);
  // the top edge, a thin line
  c += uTint * neon(abs(q.y - .18), .012, fw) * .8;
  // sparks on the hats
  float cell = floor(q.z * 1.5);
  float spark = step(.93, hash12(vec2(cell, floor(uTime * 12.) + sign(q.x))));
  c += vec3(1.) * spark * uHat * 3. * smoothstep(.05, .0, abs(q.y - .18));
  return c;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  uv += flightShake();
  float focal = flightFocal(1.35);
  vec3 ro = uCamP;
  vec3 rd = normalize(uv.x * uCamR + uv.y * uCamU + focal * uCamF);
  float pa = 1. / (uRes.y * focal);

  // the march: the track (in its own frame) and the pack
  float t = .05;
  bool hit = false;
  for (int i = 0; i < 150; i++) {
    vec3 p = ro + rd * t;
    float d = mapD(p);
    if (d < .0012 * t) { hit = true; break; }
    t += d;
    if (t > 650.) break;
  }

  vec3 col = nightSky(rd);
  vec4 city = cityBelow(ro, rd, pa);
  col = mix(col, city.rgb, city.a);
  float tEnd = 1e4;
  if (hit) {
    vec3 p = ro + rd * t;
    tEnd = t;
    vec3 c;
    if (gMat > 5.5) {
      towersD(p);
      c = towerColor(p, rd, t, pa);
    } else if (gMat > 4.5) {
      // a racer
      int i = int(gRacer + .5);
      vec4 rp = uRacerP[i];
      vec3 R = uRacerR[i], U = uRacerU[i], F = uRacerF[i];
      vec3 o = p - rp.xyz;
      vec3 cp = vec3(dot(o, R), dot(o, U), dot(o, F));
      const vec2 k = vec2(1, -1);
      const float e = .004;
      vec3 nl = normalize(k.xyy * craftD(cp + k.xyy * e) + k.yyx * craftD(cp + k.yyx * e) + k.yxy * craftD(cp + k.yxy * e) + k.xxx * craftD(cp + k.xxx * e));
      vec3 rdl = vec3(dot(rd, R), dot(rd, U), dot(rd, F));
      c = craftColor(cp, nl, rdl, racerCol(rp.w), uBurn, t * pa);
    } else {
      float m = gMat;
      vec3 q = gTq;
      if (m < .5) {
        // the deck's top
        vec3 n = nrmTrack(p, max(.01, t * pa * 2.));
        c = deckColor(p, q, n, rd, t, pa);
      } else {
        vec3 n = nrmTrack(p, max(.004, t * pa * 2.));
        float fw = t * pa / max(abs(dot(n, rd)), .1);
        if (m < 1.5) c = railColor(q, n, rd, t, pa);
        else if (m < 2.5) {
          // the deck's edge and underside: dark, a line of light under its centre, the levitation's emitters
          c = vec3(.004) + glassEnv(reflect(rd, n)) * fresnel(n, rd) * .5;
          c += uTint * neon(abs(abs(q.x) - TRACK_W), .03, fw) * smoothstep(-.2, -.5, q.y) * .6;
          float em = mod(q.z + 10., 20.) - 10.;
          c += uTint * halo(length(vec2(q.x, em)), .6) * step(q.y, -.55) * (.5 + uBoost);
        } else if (m < 3.5) {
          // a hoop: a tube of light, flashing as the wave runs through it
          float waveK = exp(-pow((q.z - uWave.x) / 8., 2.)) * uWave.y;
          float face = pow(abs(dot(n, rd)), 1.5);
          c = mix(uTint, vec3(1.), .3 * face) * (.25 + 1.4 * face) * (1. + 3. * waveK + 2. * uBoost);
        } else {
          // the gantry: dark, its lap lights along the beam (one more every lap, then they start again)
          c = vec3(.005) + glassEnv(reflect(rd, n)) * fresnel(n, rd);
          if (q.y > 7.4) {
            float lx = (q.x + TRACK_W) / (2. * TRACK_W) * 10.;
            float li = floor(lx);
            float lamp = 1. - smoothstep(.2, .32, length(vec2(fract(lx) - .5, (q.y - 7.9) * 1.6)));
            float on = step(li, uLamps - 1.) * step(0., li) * step(li, 9.);
            c += mix(vec3(.25, .02, .01), mix(uTint, vec3(1.), .6) * 3., on) * lamp * step(abs(q.x), TRACK_W);
          }
          c += uTint * neon(abs(abs(q.x) - TRACK_W - .45), .03, fw) * step(q.y, 7.4);
        }
      }
    }
    // far off, the track melts into the night
    col = mix(c, col, smoothstep(320., 650., t));
  }
  // the trails of light, the engines' glow
  col += trailsLight(ro, rd, tEnd, pa, 1.);
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
