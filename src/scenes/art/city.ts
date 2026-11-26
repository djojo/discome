import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { CIRCUIT_GLSL } from "./circuit.glsl";
import { FLIGHT_GLSL, flightParams } from "./flight";

const approach = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-dt * rate));

/**
 * La Cité de verre: a city without end, of towers of black glass whose edges are drawn in light. Racers stream along
 * lanes of light hung between the towers, at three heights, never stopping; rain falls; the wet ground below mirrors
 * it all. The camera glides slowly down an avenue at mid-height, tiny in the scale. On the kick the light climbs the
 * towers' edges from the ground; on the drop every edge blazes up to the sky and the camera rises. Extinction (the
 * breakdowns): the city goes dark, only the rain and the streams remain. As the night drifts, the streams thicken and
 * hurry and tower after tower goes out.
 */
export const city = defineShaderScene({
  id: "circuit-city",
  name: "La Cité de verre",
  energy: "calm",
  hdr: true,
  mask: true,
  renderScale: 0.7,
  flight: { cruise: 6, pump: 0.25 },
  description:
    "Une ville sans fin de tours de verre noir aux arêtes tracées de lumière ; des flux de bolides coulent sur des voies suspendues à trois hauteurs, la pluie tombe et le sol mouillé reflète tout. On glisse lentement dans une avenue, tout petit. Au kick la lumière remonte les arêtes depuis le sol ; au drop tout s'embrase jusqu'au ciel. « Extinction » : la ville s'éteint, il ne reste que la pluie et les flux.",
  params: [
    paletteParam("piste"),
    { type: "toggle", key: "dark", label: "Extinction (la ville s'éteint)", default: false },
    ...flightParams(1, 0.8),
  ],
  uniforms: () => ({
    uClimb: { value: 9 },
    uBlaze: { value: 0 },
    uDark: { value: 0 },
    uFlow: { value: 0 },
  }),
  update(u, f, p, dt) {
    const bar = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;
    u.uClimb.value = f.beat ? 0 : (u.uClimb.value as number) + dt;
    if (f.drop) u.uBlaze.value = 1.4;
    u.uBlaze.value = (u.uBlaze.value as number) * Math.exp(-dt / (bar * 1.6));
    u.uDark.value = approach(u.uDark.value as number, p.dark === true ? 1 : 0, 1.2, dt);
    // the streams never stop; faster as the night drifts
    u.uFlow.value = (u.uFlow.value as number) + dt * (1 + 1.2 * f.drift);
  },
  fragment: /* glsl */ `
uniform float uClimb;   // seconds since the kick: the light climbing the edges
uniform float uBlaze;   // the drop: every edge ablaze, fading
uniform float uDark;    // Extinction
uniform float uFlow;    // the streams' clock
${ART_LIB}
${FLIGHT_GLSL}
${CIRCUIT_GLSL}

const float CELL = 60.;
const float MAXW = 22.;
const float AVENUE = 45.;
vec4 gT;   // the tower: centre x, z, half-width, height

/** The tower of a cell (if any): none along the avenue. w < 0: none. */
vec4 towerOf(vec2 cell) {
  vec2 c = (cell + .5) * CELL;
  float h = hash12(cell * 1.7 + 3.1);
  if (abs(c.x) < AVENUE || h < .15) return vec4(c, -1., 0.);
  float w = 10. + 12. * hash12(cell + 9.2);
  float H = 50. + 380. * pow(hash12(cell + 4.4), 1.6) * (1. + .5 * smoothstep(200., 600., abs(c.x)));
  return vec4(c, w, H);
}

float cityD(vec3 p) {
  vec2 cell = floor(p.xz / CELL);
  vec2 lc = p.xz - (cell + .5) * CELL;
  // the neighbours' towers stand at least CELL/2 - MAXW from the cell's edge
  float bound = CELL * .5 - max(abs(lc.x), abs(lc.y)) + (CELL * .5 - MAXW);
  vec4 tw = towerOf(cell);
  if (tw.z < 0.) return bound;
  gT = tw;
  return min(sdBox(p - vec3(tw.x, tw.w * .5, tw.y), vec3(tw.z, tw.w * .5, tw.z)), bound);
}

float marchCity(vec3 ro, vec3 rd, float tmax, int steps) {
  float t = .5;
  for (int i = 0; i < 160; i++) {
    if (i >= steps) break;
    vec3 p = ro + rd * t;
    float d = cityD(p);
    if (d < .002 * t) return t;
    t += d;
    if (t > tmax || (p.y > 650. && rd.y > 0.)) break;
  }
  return -1.;
}

/** Whether a tower's lights are on (towers go out as the night drifts, all of them in Extinction). */
float towerOn(vec4 tw) { return step(uDrift * .65 + uDark * 1.1, hash12(tw.xy * .37 + 2.2)); }

/** A tower's face normal at p. */
vec3 towerN(vec3 p, vec4 tw) {
  vec3 q = p - vec3(tw.x, 0., tw.y);
  if (p.y > tw.w - .05) return vec3(0., 1., 0.);
  return abs(q.x) > abs(q.z) ? vec3(sign(q.x), 0., 0.) : vec3(0., 0., sign(q.z));
}

/** A tower's light at p: its edges, the light climbing them, its crown, sparse windows; the drop sets it ablaze. */
vec3 towerLight(vec3 p, vec4 tw, float fw) {
  vec3 q = p - vec3(tw.x, 0., tw.y);
  float w = tw.z;
  bool roof = p.y > tw.w - .05;
  float on = towerOn(tw);
  float e = w - min(abs(q.x), abs(q.z));
  if (roof) e = w - max(abs(q.x), abs(q.z));
  float edge = neon(e, .32, fw);
  float climb = exp(-pow((p.y - uClimb * 150.) / 12., 2.)) * exp(-uClimb * .7);
  vec3 c = uTint * edge * ((.8 + 2.4 * climb) * (.25 + .75 * on) * (1. - .8 * uDark) + 2.5 * uBlaze);
  // the crown
  c += mix(uTint, vec3(1.), .5) * neon(tw.w - p.y, .5, fw) * (.6 * on + 2. * uBlaze) * (1. - .7 * uDark);
  // floors, very faint; windows, sparse and warm
  float u = abs(q.x) > abs(q.z) ? q.z : q.x;
  c += mix(uTint, vec3(1.), .4) * neon(abs(fract(p.y / 4.) - .5) * 4., .04, fw) * .04 * on;
  vec2 wc = floor(vec2(u / 3., p.y / 4.));
  float win = step(.8, hash12(wc + tw.xy)) * (1. - smoothstep(.22, .34, length(fract(vec2(u / 3., p.y / 4.)) - .5)));
  c += vec3(1., .83, .58) * mix(win, .08, smoothstep(.5, 2., fw / 3.)) * .45 * on * (1. - uDark);
  // some towers wear bands of light every few floors
  float bands = step(.6, hash12(tw.xy + 5.5));
  c += mix(uTint, vec3(1.), .3) * neon(abs(fract(p.y / 36.) - .5) * 36., .35, fw) * bands * .5 * on * (1. - .8 * uDark);
  return c;
}

/**
 * The streams: racers hung on lanes of light at three heights, along the avenues (z) and across them (x), on some of
 * the streets between the towers; read where the ray crosses each height.
 */
vec3 flows(vec3 ro, vec3 rd, float tmax, float pa) {
  vec3 acc = vec3(0.);
  for (int k = 0; k < 3; k++) {
    float h = k == 0 ? 42. : k == 1 ? 88. : 150.;
    if (abs(rd.y) < 1e-4) continue;
    float t = (h - ro.y) / rd.y;
    if (t < 0. || t > tmax) continue;
    vec3 P = ro + rd * t;
    float fw = t * pa / max(abs(rd.y), .03);
    float sinA = max(abs(rd.y), .03);
    for (int a = 0; a < 2; a++) {
      // along z (a = 0) on streets x = n * CELL, or across (a = 1) on streets z = n * CELL; the avenue has its own
      float across = a == 0 ? P.x : P.z;
      float along = a == 0 ? P.z : P.x;
      float idx = floor(across / CELL + .5);
      float off = across - idx * CELL;
      float lane = hash12(vec2(idx, float(k * 2 + a) + 7.3));
      bool avenue = a == 0 && abs(P.x) < AVENUE;
      if (avenue) {
        // the avenue: two lanes each side, at every height
        float ax = abs(P.x);
        float li = ax < 27. ? 20. : 36.;
        off = ax - li;
        idx = li * sign(P.x);
        lane = 1.;
      }
      if (lane < .55) continue;
      float dir = hash12(vec2(idx, float(k) + 1.1)) < .5 ? -1. : 1.;
      float speed = 25. + 25. * hash12(vec2(idx, float(k) + 3.3));
      float x = (along + dir * uFlow * speed) / 14.;
      float cellR = floor(x);
      float m = fract(x);
      float car = step(.35 - .3 * uDrift, hash12(vec2(cellR, idx + float(k) * 9.))) * smoothstep(0., .1, m) * (1. - smoothstep(.25, .6, m));
      car = mix(car, .2, smoothstep(.3, 2., fw / 14.));
      float d = abs(off) * sinA;
      float line = neon(d, .3 * sinA, fw * sinA);
      vec3 cc = dir > 0. ? mix(uTint, vec3(1.), .6) : vec3(1., .18, .1);
      // the lane itself, faint, and its racers streaming
      acc += uTint * line * .08 + cc * line * car * 2.4;
    }
  }
  return acc;
}

/** The rain's haze, lit by the city from below. */
vec3 hazeC() { return mix(uTint, vec3(1., .6, .35), .35) * .07 * (1. - .7 * uDark) * (1. - .5 * uDrift); }

/** Rain, falling across the view in fine streaks. */
float rain(vec2 uv) {
  float r = 0.;
  for (int i = 0; i < 2; i++) {
    float s = i == 0 ? 90. : 160.;
    vec2 g = vec2(uv.x * s, uv.y * s * .08 + uTime * (i == 0 ? 9. : 13.));
    vec2 id = floor(g);
    float h = hash12(id + float(i) * 7.);
    float f = fract(g.y);
    r += step(.93, h) * smoothstep(.0, .1, f) * (1. - smoothstep(.1, .6, f)) * (1. - smoothstep(.2, .45, abs(fract(g.x) - .5)));
  }
  return r;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  uv *= rot(uBank * .3);
  uv += flightShake() * .5;
  // every visit at its own height, looking a little up or down
  vec3 ro = vec3(uSway * 14., 26. + 34. * fract(uSeed * .37) + (uDive > 0. ? uDive * 34. : uDive * 10.), -uTravel);
  vec3 ta = ro + vec3(uSway * 5., -9. + 16. * fract(uSeed * .71) + 10. * max(uDive, 0.), -60.);
  float focal = flightFocal(1.45);
  vec3 rd = lookAt(ro, ta) * normalize(vec3(uv, focal));
  float pa = 1. / (uRes.y * focal);

  float tG = rd.y < -1e-4 ? -ro.y / rd.y : 1e5;
  float t = marchCity(ro, rd, min(tG, 1800.), 150);
  vec3 col = nightSky(rd) * (1. - .6 * uDark) + uTint * .05 * uBlaze * smoothstep(-.1, .5, rd.y);
  float tEnd = 1e5;
  if (t > 0.) {
    vec3 p = ro + rd * t;
    cityD(p);
    vec4 tw = gT;
    vec3 n = towerN(p, tw);
    vec3 L = towerLight(p, tw, t * pa / max(abs(dot(n, rd)), .08));
    vec3 c = vec3(.004, .005, .008) + glassEnv(reflect(rd, n)) * fresnel(n, rd) * (1. - .6 * uDark) + L;
    // the rain's haze over the distance
    col = mix(c, col, 1. - exp(-t / 900.));
    col += hazeC() * (1. - exp(-t / 500.));
    tEnd = t;
  } else if (tG < 1e4) {
    // the wet ground: black glass, rippled by the rain, mirroring the towers' lights and the streams
    vec3 p = ro + rd * tG;
    vec3 n = normalize(vec3((vnoise(vec3(p.xz * .8, uTime * 3.)) - .5) * .06, 1., (vnoise(vec3(p.xz * .8 + 7., uTime * 3.)) - .5) * .06));
    vec3 rr = reflect(rd, n);
    float fr = fresnel(n, rd);
    vec3 c = vec3(.003, .004, .006);
    float tr = marchCity(p + n * .2, rr, 900., 60);
    vec3 refl = nightSky(rr) * (1. - .6 * uDark);
    if (tr > 0.) {
      vec3 q = p + rr * tr;
      cityD(q);
      refl = towerLight(q, gT, (tG + tr) * pa * 3.);
    }
    refl += flows(p, rr, tr > 0. ? tr : 900., pa * 2.);
    c += refl * (.25 + .75 * fr);
    col = mix(c, col, 1. - exp(-tG / 900.));
    col += hazeC() * (1. - exp(-tG / 500.));
    tEnd = tG;
  }
  col += flows(ro, rd, tEnd, pa);
  // the rain, lit by the city's glow
  col += mix(uTint, vec3(1.), .6) * rain(uv) * .05 * (1. - .5 * uDark);
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
