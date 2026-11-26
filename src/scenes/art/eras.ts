import * as THREE from "three";
import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { CIRCUIT_GLSL } from "./circuit.glsl";
import { FLIGHT_GLSL } from "./flight";
import { LAP, Pack, TRACK_GLSL, trackDX, trackFrame, trackPoint, type TrackFrame } from "./circuitTrack";
import { TRACK_SCENE_GLSL } from "./circuitScene.glsl";

const approach = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-dt * rate));

/** Metres per second at cruise. */
const CRUISE = 36;
/** The camera's height above the deck (the retro eras draw a flat road seen from it). */
const EYE = 1.3;

interface ErasState {
  pack: Pack;
  offset: number;
  /** The era on screen, the one coming, the wipe between them (0..1). */
  era: number;
  next: number;
  wipe: number;
  waveS: number;
  waveT: number;
  last: number;
  frame: TrackFrame;
  pos: THREE.Vector3;
  look: THREE.Vector3;
}

/**
 * Générations: the same race through the ages of the video game. Big pixels and a road of stripes, sprites for the
 * racers (the 8-bit era); glowing phosphor lines (the vector era); flat polygons in the fog (the first 3D); the
 * Circuit's full light. On the groove a single era, another on every return; through the build the eras pass, each
 * by a wipe on a strong beat; on the drop, the full render. Forty years of the same race: only the graphics change.
 */
export const eras = defineShaderScene({
  id: "circuit-eras",
  name: "Générations",
  energy: "medium",
  hdr: true,
  mask: true,
  renderScale: 0.7,
  flight: { cruise: CRUISE, pump: 0.3 },
  // the speed blur only in the full render (it would smear the pixels and the phosphor lines)
  motion: (u) => u.uMotion.value as number,
  description:
    "La même course à travers les âges du jeu vidéo : gros pixels et route en bandes, puis lignes vectorielles phosphorescentes, puis polygones plats dans le brouillard, puis le rendu complet du Circuit. En groove une seule époque, différente à chaque retour ; pendant la montée les époques passent, chacune par un balayage sur un temps fort ; au drop, le rendu complet.",
  params: [paletteParam("phosphore")],
  uniforms: () => {
    const pack = new Pack();
    const st: ErasState = {
      pack,
      offset: 0,
      era: 0,
      next: 0,
      wipe: 1,
      waveS: -1e4,
      waveT: 99,
      last: -99,
      frame: { pos: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), fwd: new THREE.Vector3() },
      pos: new THREE.Vector3(),
      look: new THREE.Vector3(),
    };
    return {
      uState: { value: st },
      ...pack.uniforms(),
      uLeap: { value: new THREE.Vector3(0, 1, 0) },
      uCamP: { value: new THREE.Vector3() },
      uCamR: { value: new THREE.Vector3(1, 0, 0) },
      uCamU: { value: new THREE.Vector3(0, 1, 0) },
      uCamF: { value: new THREE.Vector3(0, 0, -1) },
      uS: { value: 0 },
      uCamX: { value: 0 },
      uDX: { value: 0 },
      uEra: { value: new THREE.Vector3(0, 0, 1) },
      uWave: { value: new THREE.Vector2(-1e4, 0) },
      uRail: { value: 0 },
      uBoost: { value: 0 },
      uBurn: { value: 0.4 },
      uGantry: { value: new THREE.Vector3() },
      uMotion: { value: 0 },
    };
  },
  update(u, f, _p, dt, ctx) {
    const st = u.uState.value as ErasState;
    const fl = ctx.flight!;
    const bar = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;
    // back on screen: another stretch of the circuit, another era to start from
    if (f.time - st.last > 1.5) {
      st.offset = Math.random() * LAP - fl.travel;
      st.pack.reseed(Math.random() * 100);
      st.era = st.next = Math.floor(Math.random() * 3);
      st.wipe = 1;
    }
    st.last = f.time;
    const s = fl.travel + st.offset;
    const s0 = Math.floor(s / LAP) * LAP;

    // the eras: through the build they pass one by one toward the full render; on the drop, the full render
    let want = st.next;
    if (f.drop) want = 3;
    else if (f.section === "build") want = Math.max(st.next, Math.min(2, Math.floor(f.buildProgress * 3)));
    if (want !== st.next && st.wipe >= 1 && (f.drop || f.downbeat || (f.beat && f.beatInBar === 2))) {
      st.era = st.next;
      st.next = want;
      st.wipe = 0;
    }
    st.wipe = Math.min(1, st.wipe + dt / (f.drop || want === 3 ? bar * 0.25 : bar * 0.5));
    if (st.wipe >= 1) st.era = st.next;
    (u.uEra.value as THREE.Vector3).set(st.era, st.next, st.wipe);
    u.uMotion.value = st.era === 3 && st.next === 3 ? fl.motion : 0;

    // the camera: just above the deck, as in Le Circuit (the retro eras read the same s and sway)
    const sway = fl.sway * 1.6;
    trackPoint(s, s0, sway, EYE, null, st.pos);
    trackPoint(s + 16, s0, sway * 0.6, EYE - 0.6, null, st.look);
    const fr = trackFrame(s, s0, st.frame);
    const F = (u.uCamF.value as THREE.Vector3).subVectors(st.look, st.pos).normalize();
    const R = (u.uCamR.value as THREE.Vector3).crossVectors(F, fr.up).normalize();
    (u.uCamU.value as THREE.Vector3).crossVectors(R, F);
    (u.uCamP.value as THREE.Vector3).copy(st.pos);
    u.uS.value = s - s0;
    u.uCamX.value = sway;
    u.uDX.value = trackDX(s);

    st.pack.update(dt, s, s0, Math.round(7 + 2 * f.drift), 16 + 40 * fl.speedNorm, 1, null, f.time);
    if (f.beat) {
      st.waveS = s + 4;
      st.waveT = 0;
    }
    st.waveT += dt;
    st.waveS += dt * (CRUISE * fl.speed + 140);
    (u.uWave.value as THREE.Vector2).set(st.waveS - s0, Math.exp(-st.waveT * 1.3));
    u.uBoost.value = f.dropPulse;
    const burn = f.section === "build" ? 0.35 + 0.65 * f.buildProgress : 0.4;
    u.uBurn.value = approach(u.uBurn.value as number, Math.max(burn, f.dropPulse), 3, dt);
  },
  fragment: /* glsl */ `
uniform vec3 uCamP;
uniform vec3 uCamR;
uniform vec3 uCamU;
uniform vec3 uCamF;
uniform float uS;       // the camera along the track (from the lap origin)
uniform float uCamX;    // and across it
uniform float uDX;      // the track's heading at the camera (the retro road is drawn along it)
uniform vec3 uEra;      // the era shown, the one coming, the wipe (0..1, top to bottom)
uniform vec3 uRacerT[12];
${ART_LIB}
${FLIGHT_GLSL}
${CIRCUIT_GLSL}
${TRACK_GLSL}
${TRACK_SCENE_GLSL}

const float EYE = ${EYE.toFixed(2)};
const float FOC = 1.35;
const float HZ = .08;    // the retro eras' horizon (screen)

/** The road's centre at depth z, across the camera's line of sight (the retro eras' flat road). */
float roadX(float z) { return trackX(uS + z) - trackX(uS) - uDX * z - uCamX; }

// ------------------------------------------------------------------ the 8-bit era
/** A racer from behind, as a sprite: 0 nothing, 1 its body, 2 its outline, 3 its engines. */
float sprite(vec2 q) {
  // q: 16 x 8 pixels, x 0..16 left to right, y 0..8 bottom to top
  vec2 c = floor(q);
  if (c.x < 0. || c.x > 15. || c.y < 0. || c.y > 7.) return 0.;
  float ax = abs(c.x - 7.5);
  if (c.y <= 1. && (ax > 4.5 && ax < 7.)) return 3.;
  float w = c.y <= 2. ? 7.5 : c.y == 3. ? 6.5 : c.y == 4. ? 4.5 : c.y == 5. ? 2.5 : c.y == 6. ? 1.5 : -1.;
  if (c.y < 1. || ax > w) return 0.;
  return ax > w - 1. || c.y == 2. ? 2. : 1.;
}

vec3 era8(vec2 fc) {
  // virtual pixels: 180 rows over the screen
  float P = uRes.y / 180.;
  vec2 pc = (floor(fc / P) + .5) * P;
  vec2 uv = (pc - .5 * uRes) / uRes.y;
  vec3 col;
  float stepK = step(.5, fract(uTime * 2.));
  if (uv.y > HZ) {
    // the sky in bands, a skyline of the city in a few colours, its window pixels
    float b = floor((uv.y - HZ) * 14.);
    col = mix(vec3(.05, .02, .12), vec3(.0, .0, .04), clamp(b / 6., 0., 1.));
    // a band of the city's glow on the horizon, and pixel stars
    col = mix(col, mix(uTint, vec3(1., .3, .5), .5) * .55, step(b, 0.) * .6);
    vec2 stc = floor(pc / (P * 1.));
    col += vec3(.8) * step(.996, hash12(stc)) * step(.15, uv.y - HZ);
    float sx = floor((uv.x + uS * .0004) * 60.);
    float hgt = HZ + .02 + .14 * pow(hash12(vec2(sx, 3.)), 2.);
    if (uv.y < hgt) {
      col = vec3(.12, .04, .2);
      vec2 wv = floor(vec2((uv.x + uS * .0004) * 240., uv.y * 180.));
      col = mix(col, vec3(1., .8, .3), step(.86, hash12(wv)) * step(.5, mod(wv.x, 2.)));
    }
    col += uTint * .15 * uBeat * step(uv.y, HZ + .03);
  } else {
    float z = EYE * FOC / max(HZ - uv.y, 1e-3);
    float s = uS + z;
    float cx = roadX(z) / z * FOC;
    float hw = TRACK_W / z * FOC;
    float dx = abs(uv.x - cx);
    float stripe = step(.5, fract(s / 6.));
    if (dx < hw) {
      col = mix(vec3(.07, .07, .1), vec3(.11, .11, .15), stripe);
      if (dx < hw * .04 && stripe > .5) col = vec3(.85);
      // the kick: the road's bands light up
      col += uTint * .25 * uBeat * stripe;
    } else if (dx < hw * 1.16) col = stripe > .5 ? uTint : vec3(.9);
    else col = mix(vec3(.01, .01, .04), vec3(.03, .02, .08), stripe);
  }
  // the racers, nearest last
  float best = 1e9;
  for (int i = 0; i < 12; i++) {
    if (uRacerP[i].w < 0.) continue;
    float z = uRacerT[i].x - uS;
    if (z < 2. || z > 400.) continue;
    float sx = (roadX(z) + uRacerT[i].y) / z * FOC;
    float sy = HZ - EYE * FOC / z;
    float wpx = 1.3 / z * FOC / 8.;   // a sprite pixel
    vec2 q = vec2((uv.x - sx) / wpx + 8., (uv.y - sy) / wpx);
    float k = sprite(q);
    if (k > 0. && z < best) {
      best = z;
      vec3 rc = racerCol(uRacerT[i].z);
      col = k > 2.5 ? mix(rc, vec3(1.), .5 + .5 * stepK) : k > 1.5 ? rc : rc * .3;
    }
  }
  // few colours, scanlines
  col = floor(col * 5. + .5) / 5.;
  col *= .78 + .22 * mod(floor(fc.y / P), 2.);
  return col * 1.2;
}

// ------------------------------------------------------------------ the vector era
float lineD(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0., 1.));
}

vec3 eraVector(vec2 uv) {
  float px = 1. / uRes.y;
  float d = 1e3;
  // the horizon, and a line of mountains / towers drawn above it
  d = min(d, abs(uv.y - HZ));
  float mx = (uv.x + uS * .0003) * 9.;
  float m0 = floor(mx), mf = fract(mx);
  float h0 = .01 + .13 * pow(hash12(vec2(m0, 1.)), 1.5);
  float peak = .5 + .4 * (hash12(vec2(m0, 7.)) - .5);
  float ym = HZ + (mf < peak ? mix(0., h0 + .03, mf / peak) : mix(h0 + .03, 0., (mf - peak) / (1. - peak)));
  d = min(d, abs(uv.y - ym) * .7);
  if (uv.y < HZ) {
    // the road's edges and its centre dashes, at this row's depth (distance across the line, slope-corrected)
    float z = EYE * FOC / max(HZ - uv.y, 1e-3);
    float z2 = EYE * FOC / max(HZ - uv.y - px * 4., 1e-3);
    for (int e = -1; e <= 1; e++) {
      float off = float(e) * TRACK_W;
      float x1 = (roadX(z) + off) / z * FOC, x2 = (roadX(z2) + off) / z2 * FOC;
      float slope = (x2 - x1) / (px * 4.);
      float dl = abs(uv.x - x1) / sqrt(1. + slope * slope);
      if (e == 0) dl += step(.45, fract((uS + z) / 10.)) * 1e3;
      d = min(d, dl);
    }
    // the racers: an arrow from behind, in wire
    for (int i = 0; i < 12; i++) {
      if (uRacerP[i].w < 0.) continue;
      float zr = uRacerT[i].x - uS;
      if (zr < 2. || zr > 400.) continue;
      float sx = (roadX(zr) + uRacerT[i].y) / zr * FOC;
      float sy = HZ - EYE * FOC / zr;
      float w = 1.1 / zr * FOC, h = .45 / zr * FOC;
      vec2 a = vec2(sx - w * .5, sy), b = vec2(sx + w * .5, sy), c = vec2(sx, sy + h);
      d = min(d, min(lineD(uv, a, b), min(lineD(uv, b, c), lineD(uv, c, a))));
    }
  }
  vec3 ph = mix(uInk, uTint, .35);
  float core = 1. - smoothstep(px * .6, px * 1.6, d);
  float glow = exp(-d / (px * 6.)) * .35;
  float flick = .92 + .08 * sin(uTime * 60.);
  return ph * (core * 1.6 + glow) * flick * (1. + .6 * uBeat);
}

// ------------------------------------------------------------------ the first 3D: flat polygons in the fog
vec3 eraPoly(vec2 fc) {
  float P = 3.;
  vec2 pc = (floor(fc / P) + .5) * P;
  vec2 uv = (pc - .5 * uRes) / uRes.y;
  vec3 rd = normalize(uv.x * uCamR + uv.y * uCamU + FOC * uCamF);
  vec3 ro = uCamP;
  vec3 fogC = mix(vec3(.12, .06, .2), uTint * .3, .25) * (1. + .5 * uBeat);
  vec3 col = mix(fogC, vec3(.02, .01, .06), smoothstep(0., .4, rd.y));
  float t = .05;
  bool hit = false;
  for (int i = 0; i < 90; i++) {
    float d = mapD(ro + rd * t);
    if (d < .003 * t) { hit = true; break; }
    t += d;
    if (t > 380.) break;
  }
  if (hit) {
    vec3 p = ro + rd * t;
    float m = gMat;
    vec3 n = m > 4.5 && m < 5.5 ? normalize(p - uRacerP[int(gRacer + .5)].xyz + vec3(0., -.1, 0.)) : nrmTrack(p, .05);
    if (m > 5.5 && m < 6.5) { towersD(p); vec3 q = p - vec3(gTower.x, 0., gTower.y); n = abs(q.x) > abs(q.z) ? vec3(sign(q.x), 0., 0.) : vec3(0., 0., sign(q.z)); }
    // facets: the normal snapped, the light in a few steps
    n = normalize(floor(n * 2.5 + .5));
    vec3 L = normalize(vec3(-.4, .8, .35));
    float sh = floor((.35 + .65 * max(dot(n, L), 0.)) * 4.) / 4.;
    vec3 alb = m < .5 ? vec3(.3, .32, .42) : m < 1.5 ? uTint : m < 3.5 ? uTint * .8 : m < 4.5 ? vec3(.5) : m < 5.5 ? racerCol(uRacerP[int(gRacer + .5)].w) : vec3(.28, .26, .34);
    vec3 c = alb * sh;
    if (m < .5) c *= .8 + .2 * step(.5, fract(gTq.z / 8.));
    col = mix(c, fogC, smoothstep(60., 380., t));
  }
  col = floor(col * 8. + .5) / 8.;
  return col * 1.1;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  // which era here: the new one above the wipe's front (it runs down the screen)
  float front = .5 - uEra.z * 1.1;
  float era = uv.y > front ? uEra.y : uEra.x;
  vec3 col;
  if (era < .5) col = era8(fc);
  else if (era < 1.5) col = eraVector(uv);
  else if (era < 2.5) col = eraPoly(fc);
  else {
    vec2 u2 = uv + flightShake();
    float focal = flightFocal(FOC);
    vec3 rd = normalize(u2.x * uCamR + u2.y * uCamU + focal * uCamF);
    col = renderTrack(uCamP, rd, 1. / (uRes.y * focal));
  }
  // the wipe's front: a bright scanline, torn sideways
  if (uEra.z < 1.) col += mix(uTint, vec3(1.), .5) * exp(-abs(uv.y - front) * 140.) * 1.5;
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
