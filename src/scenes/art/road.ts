import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { ARCANE_GLSL, arcaneUniforms, updateArcane } from "./arcane.glsl";
import { FLIGHT_GLSL, flightParams } from "./flight";

/** Seconds on screen for the pyramid to come all the way (drops make it jump closer). */
const APPROACH = 90;

/**
 * The Way: a fast flight down a straight rainbow road toward the sacred pyramid. Seven lanes of spectral light
 * engraved with fine lines, neon edges, and an avenue of tall obelisks on either side, running all the way to the
 * pyramid; the road and its causeway hang in the cosmos, or cross a red desert.
 * The pyramid is never reached: over the scene it grows and rises out of the horizon, a step closer on every
 * drop. A wave of light runs down the road on the kick and lights the obelisks' tips on its way, sparks on the hats;
 * through the build their tips light up one by one toward the pyramid and its capstone glows; on the drop they all
 * blaze and the pyramid becomes a prism (a white beam in, a rainbow fanning across the sky).
 */
export const arcaneRoad = defineShaderScene({
  id: "arcane-road",
  name: "La Voie",
  energy: "medium",
  hdr: true,
  renderScale: 0.8,
  mask: true,
  flight: { cruise: 6, pump: 0.4 },
  description:
    "Vol rapide sur une route arc-en-ciel bordée d'une allée d'obélisques, vers la pyramide sacrée qui grossit sans jamais être atteinte ; une vague de lumière court sur la route au kick, les obélisques s'allument pendant la montée, la pyramide devient un prisme au drop.",
  params: [
    paletteParam("cosmos"),
    {
      type: "select",
      key: "ground",
      label: "Ambiance",
      options: [
        { value: "cosmos", label: "Cosmos" },
        { value: "desert", label: "Désert" },
      ],
      default: "cosmos",
    },
    ...flightParams(1, 1.2),
  ],
  uniforms: () => ({
    ...arcaneUniforms(),
    uNear: { value: 0 },
    uCap: { value: 0.3 },
    uBeam: { value: 0 },
    uWave: { value: 9 },
    uColor: { value: 1 },
    uDesert: { value: 0 },
    uLit: { value: 0 },
    // CPU side only
    uClock: { value: 0 },
    uJump: { value: 0 },
    uLast: { value: -99 },
  }),
  update(u, f, p, dt) {
    updateArcane(u, f, p, dt);
    u.uDesert.value = p.ground === "desert" ? 1 : 0;
    const bar = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;
    // Back on screen: the pyramid is far again (a little closer as the night drifts)
    if (f.time - (u.uLast.value as number) > 1.5) {
      u.uClock.value = 0;
      u.uJump.value = 0.15 * f.drift;
      u.uNear.value = 0.15 * f.drift;
      u.uBeam.value = 0;
    }
    u.uLast.value = f.time;
    u.uClock.value = (u.uClock.value as number) + dt;
    if (f.drop) u.uJump.value = (u.uJump.value as number) + 0.12;
    // The approach: its own clock, never the flight's speed; eased so that a jump reads as a lunge
    const near = Math.min(1, (u.uClock.value as number) / APPROACH + (u.uJump.value as number));
    const n = u.uNear.value as number;
    u.uNear.value = n + (near - n) * (1 - Math.exp(-dt * 1.5));
    // The capstone glows through the build, blazes on the drop
    const cap = f.section === "build" ? 0.3 + 1.2 * f.buildProgress : f.section === "breakdown" ? 0.15 : 0.3;
    const c = u.uCap.value as number;
    u.uCap.value = c + (cap - c) * (1 - Math.exp(-dt * 2));
    // The prism beam: full on the drop, fading over a few bars
    if (f.drop) u.uBeam.value = 1.3;
    u.uBeam.value = (u.uBeam.value as number) * Math.exp(-dt / (bar * 1.8));
    u.uWave.value = f.beat ? 0 : (u.uWave.value as number) + dt;
    // The obelisks' tips: lit one by one toward the pyramid through the build, all of them through the drop
    const lit = f.section === "build" ? f.buildProgress : f.section === "drop" ? 1 : 0;
    const l = u.uLit.value as number;
    u.uLit.value = l + (lit - l) * (1 - Math.exp(-dt * (lit > l ? 3 : 0.4)));
    // The rainbow fades to its lines in the breakdown
    const col = f.section === "breakdown" ? 0.12 : 1;
    const k = u.uColor.value as number;
    u.uColor.value = k + (col - k) * (1 - Math.exp(-dt * 0.8));
  },
  fragment: /* glsl */ `
uniform float uNear;     // 0..1: how close the pyramid has come
uniform float uCap;      // glow of its capstone
uniform float uBeam;     // the prism beam (drop)
uniform float uWave;     // seconds since the kick: a wave of light runs down the road
uniform float uColor;    // 1: rainbow lanes; low in the breakdown (only the lines)
uniform float uDesert;
uniform float uLit;      // 0..1: how far toward the pyramid the obelisks' tips are lit
${ART_LIB}
${ARCANE_GLSL}
${FLIGHT_GLSL}
const float RW = 1.75;      // half the road's width: 7 lanes of .5
const float PS = 40.;       // the pyramid's size
const float PH = .95;       // its height, for a base of 1
const float OB = 10.;       // an obelisk every OB on either side of the road
const float OX = RW + 2.4;  // their axis
const float PB = .5;        // the plinth's height
const float OH = 8.5;       // the shaft's height, above the plinth
const float XC = OX + 1.4;  // the causeway's outer edge (cosmos)
const float OFAR = 200.;    // the avenue runs this far (then into the haze)
vec3 gPyr;                  // the pyramid's base centre (world)
vec3 gApex;

// ---------------------------------------------------------------- the pyramid
/** The pyramid in its own frame: turned so that an edge faces the road, a face on each side (one refracting). */
vec3 toPyr(vec3 p) {
  vec3 q = (p - gPyr) / PS;
  q.xz *= rot(.62);
  return q;
}
float pyrD(vec3 p) { return sdPyramid(toPyr(p), PH) * PS; }

float pyrMarch(vec3 ro, vec3 rd) {
  vec3 c = gPyr + vec3(0., PS * PH * .45, 0.);
  vec3 oc = ro - c;
  float R = PS * .85;
  float b = dot(oc, rd), h = b * b - dot(oc, oc) + R * R;
  if (h < 0.) return -1.;
  float t = max(-b - sqrt(h), 0.), t1 = -b + sqrt(h);
  for (int i = 0; i < 64; i++) {
    float d = pyrD(ro + rd * t);
    if (d < .0015 * t) return t;
    t += d;
    if (t > t1) break;
  }
  return -1.;
}

vec3 pyrN(vec3 p) {
  const vec2 k = vec2(1, -1);
  const float e = .05;
  return normalize(k.xyy * pyrD(p + k.xyy * e) + k.yyx * pyrD(p + k.yyx * e) + k.yxy * pyrD(p + k.yxy * e) + k.xxx * pyrD(p + k.xxx * e));
}

/** Drawn like the Architect's head: horizontal lines of light, one face refracting a rainbow, a glowing capstone. */
vec3 pyrColor(vec3 p, vec3 n, float fp) {
  vec3 q = toPyr(p);
  float g = q.y * 30. - uTime * .4;
  float s = fract(g);
  float stripe = smoothstep(.3, .4, s) * (1. - smoothstep(.8, .9, s));
  stripe = mix(stripe, .4, smoothstep(.15, .6, fp * 30. / PS));   // finer than a pixel: their average
  float lit = .45 + .55 * clamp(dot(n, normalize(vec3(-.5, .6, .6))), 0., 1.);
  vec3 c = mix(vec3(.02), uInk * 1.15, stripe * lit);
  float prism = smoothstep(.3, .7, n.x);
  c = mix(c, spectral(clamp(q.y / PH + .1 * sin(q.z * 6. + uTime), 0., 1.)) * (.4 + .9 * stripe) * (1. + uHat * .6), prism * .85);
  c += vec3(1., .88, .5) * smoothstep(PH * .78, PH, q.y) * uCap * 1.6;
  // its underside, once it floats: dark stone
  return mix(c, uBase * .3 + vec3(.01), smoothstep(-.3, -.7, n.y));
}

// ---------------------------------------------------------------- obelisks
/** The avenue: an obelisk on its plinth every OB, on either side; q: in the nearest one's frame (base at y = 0). */
vec3 obFrame(vec3 p, out float cz) {
  vec3 q = vec3(abs(p.x) - OX, p.y, p.z);
  cz = floor(q.z / OB + .5) * OB;
  q.z -= cz;
  return q;
}
float obWidth(float y) { return mix(.42, .28, clamp(y / OH, 0., 1.)); }

float obelisk(vec3 p) {
  float cz;
  vec3 q = obFrame(p, cz);
  float plinth = sdBox(vec3(q.x, q.y - PB * .5, q.z), vec3(.64, PB * .5, .64));
  float y = q.y - PB;
  float w = obWidth(y);
  float shaft = sdBox(vec3(q.x, y - OH * .5, q.z), vec3(w, OH * .5, w)) * .95;   // tapered: a little slack
  float top = sdPyramid(vec3(q.x, y - OH, q.z) / .56, .9) * .56;                  // the pyramidion
  return min(plinth, min(shaft, top));
}

float obMarch(vec3 ro, vec3 rd, float tmax) {
  // start where the ray leaves the corridor between the two rows: nothing to find before
  // (no bounding plane in the distance: a ray grazing it would stop on it)
  float X = OX - .7;
  float t = .1;
  if (abs(ro.x) < X) {
    if (abs(rd.x) < 1e-4) return -1.;
    t = max((sign(rd.x) * X - ro.x) / rd.x, .1);
    if (t > tmax) return -1.;
  }
  float TOP = PB + OH + .6;
  for (int i = 0; i < 90; i++) {
    vec3 p = ro + rd * t;
    float d = obelisk(p);
    if (d < .001 * t) return t;
    // past the row and going away, or above the tips and rising: nothing more
    if ((abs(p.x) > OX + .8 && p.x * rd.x > 0.) || (p.y > TOP && rd.y > 0.)) break;
    t += d * .85;
    if (t > tmax) break;
  }
  return -1.;
}

vec3 obN(vec3 p) {
  const vec2 k = vec2(1, -1);
  const float e = .004;
  return normalize(k.xyy * obelisk(p + k.xyy * e) + k.yyx * obelisk(p + k.yyx * e) + k.yxy * obelisk(p + k.yxy * e) + k.xxx * obelisk(p + k.xxx * e));
}

/** One engraved sign in a cell (g: -.5..5): a cross of strokes, a bar or a ring, drawn from the cell's hash. */
float glyph(vec2 cell, vec2 g, float aa) {
  float h = hash12(cell), h2 = hash12(cell + 7.1);
  float v = max(abs(g.x - (h - .5) * .4) - .07, abs(g.y) - .34);
  float hz = max(abs(g.y - (h2 - .5) * .5) - .07, abs(g.x) - .3);
  float d = h2 < .25 ? abs(length(g) - .2) - .06 : h < .35 ? hz : min(v, hz);
  return 1. - smoothstep(-aa, aa, d);
}

/** How bright an obelisk's tip burns: the kick's wave passing, the build's countdown, the drop. */
float tipGlow(float cz, vec3 ro) {
  float zw = ro.z - 2. - uWave * 55.;
  float wave = exp(-pow((cz - zw) / 5., 2.)) * exp(-uWave * 1.1);
  float ahead = ro.z - cz;
  float lit = uLit * (1. - smoothstep(uLit * OFAR - 4., uLit * OFAR + 4., ahead));
  return max(max(wave * 1.3, lit * .9), uBeam);
}

vec3 obColor(vec3 p, vec3 n, vec3 rd, vec3 ro, float fp) {
  float cz;
  vec3 q = obFrame(p, cz);
  float y = q.y - PB;
  // dark stone, warmed by the pyramid's capstone
  vec3 L = normalize(gApex - p);
  float dif = clamp(dot(n, L), 0., 1.);
  vec3 c = uBase * .35 + vec3(.014) + vec3(1., .82, .55) * dif * (.05 + .1 * uCap);
  c += uInk * .05 * clamp(dot(n, normalize(vec3(-.4, .5, -.7))), 0., 1.);
  // signs engraved up the shaft in bands, glowing faintly with the ink colour (their average once sub-pixel)
  if (y > 0. && y < OH) {
    float fu = abs(n.x) > abs(n.z) ? q.z : q.x;
    vec2 cs = vec2(.15, .22);
    vec2 gc = vec2(fu, y) / cs;
    float by = fract(y / 2.4);
    float band = smoothstep(.1, .13, by) * (1. - smoothstep(.5, .53, by));
    float aa = fp / cs.x * 1.5;
    vec2 cell = floor(gc) + floor(cz / OB) * 13.;
    float mark = mix(glyph(cell, fract(gc) - .5, max(aa, .02)) * step(.3, hash12(cell + 3.7)), .16, smoothstep(.25, .6, aa));
    float climb = exp(-pow((fract(y / OH * .5 - uTime * .07 + cz * .011) - .5) * 7., 2.));
    c += uInk * mark * band * (.07 + .6 * climb + .3 * uBeat) * step(abs(fu), obWidth(y) - .03);
  }
  // a neon line on the vertical edges only (a whole face seen edge-on would light up otherwise)
  float w = obWidth(y);
  float edge = (1. - smoothstep(0., max(.02, fp * 1.5), w - min(abs(q.x), abs(q.z)))) * step(0., y) * step(y, OH);
  c += vec3(.3, .85, 1.) * edge * (.7 + .5 * uBeat);
  // the pyramidion: gold, burning when its turn comes
  if (y > OH - .01) {
    float g = tipGlow(cz, ro);
    c = mix(c, vec3(1., .78, .42) * (.12 + .5 * dif), .8) + vec3(1., .88, .55) * g * 2.6;
  }
  return c;
}

// ---------------------------------------------------------------- the road and the ground
/** The road at p (on y = 0); fp: a pixel there. */
vec3 roadColor(vec3 p, vec3 ro, float fp) {
  // a band of prism light: the spectrum across the road, seven faint seams along it
  float x = (p.x + RW) / (2. * RW);
  vec3 lc = spectral(x);
  float sw = max(.008, fp);
  float seam = (1. - smoothstep(0., sw, abs(fract(x * 7.) - .5) * 2. * RW / 7. - .004)) * .008 / sw;
  // fine lines of light engraved across, rushing by
  float lw = .016, W = max(lw, fp);
  float d = abs(fract(p.z / .45) - .5) * .45;
  float lines = (1. - smoothstep(lw * .5, lw * .5 + W, d)) * lw / W;
  lines = mix(lines, .04, smoothstep(.03, .15, fp));
  vec3 c = lc * uColor * (.1 + 1.4 * lines + .07 * seam) + uInk * (1. - uColor) * (lines + .15 * seam) * .8;
  // the wave of the kick, running away toward the pyramid
  float zw = ro.z - 2. - uWave * 55.;
  c += mix(uInk, lc, .5) * exp(-pow((p.z - zw) / 1.8, 2.)) * exp(-uWave * 1.1) * 1.4;
  // the neon edges
  float e = abs(abs(p.x) - RW);
  float ew = max(.02, fp);
  c += vec3(.3, .85, 1.) * (1. - smoothstep(0., ew, e)) * .02 / ew * 1.6;
  return c;
}

/** The causeway the obelisks stand on (cosmos): dark flagstones, a neon line along its outer edge. */
vec3 causewayColor(vec3 p, vec3 ro, float fp) {
  vec3 c = uBase * .3 + vec3(.012);
  // joints across, one at each obelisk and one between
  float S = OB * .5;
  float jz = abs(fract(p.z / S + .5) - .5) * S;
  float jw = max(.02, fp);
  c += uInk * (1. - smoothstep(0., jw, jz - .012)) * .024 / jw * .5;
  // the capstone's warm light on the stone, and the kick's wave crossing it
  c += vec3(1., .8, .5) * (.03 + .06 * uCap);
  float zw = ro.z - 2. - uWave * 55.;
  c += uInk * .25 * exp(-pow((p.z - zw) / 1.8, 2.)) * exp(-uWave * 1.1);
  // a pool of light at the foot of each obelisk whose tip burns
  float cz = floor(p.z / OB + .5) * OB;
  vec2 dq = vec2(abs(p.x) - OX, p.z - cz);
  c += vec3(1., .85, .55) * tipGlow(cz, ro) * exp(-dot(dq, dq) * 1.2) * .25;
  // the outer edge
  float ew = max(.02, fp);
  c += vec3(.3, .85, 1.) * (1. - smoothstep(0., ew, abs(abs(p.x) - XC))) * .02 / ew * 1.4;
  return c;
}

/** The red desert of the Mars palette: low dunes, lit from the pyramid. */
vec3 desertColor(vec3 p, float t) {
  vec2 xz = p.xz;
  float e = .08;
  float h0 = vnoise(vec3(xz * .3, 1.)) + .35 * vnoise(vec3(xz * 1.2, 4.));
  float hx = vnoise(vec3((xz + vec2(e, 0.)) * .3, 1.)) + .35 * vnoise(vec3((xz + vec2(e, 0.)) * 1.2, 4.));
  float hz = vnoise(vec3((xz + vec2(0., e)) * .3, 1.)) + .35 * vnoise(vec3((xz + vec2(0., e)) * 1.2, 4.));
  vec3 n = normalize(vec3(-(hx - h0) / e * .35, 1., -(hz - h0) / e * .35));
  vec3 L = normalize(gApex - p);
  float dif = clamp(dot(n, L), 0., 1.);
  vec3 c = uPal0 * (.18 + .7 * dif) + uBase * .5;
  // the neon of the road's edges spills on the sand
  c += vec3(.3, .85, 1.) * exp(-(abs(p.x) - RW) * 5.) * .25;
  return c;
}

// ---------------------------------------------------------------- the prism beam
/**
 * Light along the half-line from H in direction B (length len, widening from w0 to w1), seen by the ray:
 * white, or a rainbow sheet (colours across its width).
 */
vec3 shaft(vec3 ro, vec3 rd, vec3 H, vec3 B, float len, float w0, float w1, bool rainbow, float tmax) {
  vec3 w = ro - H;
  float b = dot(rd, B), d = dot(rd, w), e = dot(B, w);
  float den = max(1. - b * b, 1e-4);
  float sc = (b * e - d) / den;
  float tc = (e - b * d) / den;
  if (sc < 0. || (tmax > 0. && sc > tmax) || tc < 0. || tc > len) return vec3(0.);
  vec3 diff = ro + rd * sc - (H + B * tc);
  float wdt = mix(w0, w1, tc / len);
  vec3 up = normalize(cross(B, cross(vec3(0., 1., 0.), B)));
  float across = dot(diff, up) / wdt;
  float side = length(diff - up * dot(diff, up)) / wdt;
  float inside = (1. - smoothstep(.8, 1., abs(across))) * (1. - smoothstep(.5, 1., side));
  vec3 c = rainbow ? spectral(across * .5 + .5) * 1.6 : vec3(1.3);
  return c * inside * (1. - smoothstep(len * .6, len, tc)) * smoothstep(0., w0 * 2., tc);
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  uv *= rot(uBank);
  uv += flightShake();
  float alt = .6 + (uDive > 0. ? uDive * 2.2 : uDive * .3);
  vec3 ro = vec3(uSway * .6, max(alt, .25), -uTravel);
  vec3 ta = ro + vec3(uSway * .2, -.05 - .25 * max(uDive, 0.), -4.);
  float focal = flightFocal(1.5);
  vec3 rd = lookAt(ro, ta) * normalize(vec3(uv, focal));
  float pa = 1. / (uRes.y * focal);

  // The pyramid, far ahead and never reached: it comes closer and rises with uNear
  float near = smoothstep(0., 1., uNear);
  float D = mix(170., 122., near);
  gPyr = vec3(0., mix(-.6, .03, near) * PS * PH, ro.z - D);
  // in the breakdown it floats, swaying gently
  gPyr.y += (1. - uColor) * 1.5 * sin(uTime * .4);
  gApex = gPyr + vec3(0., PS * PH, 0.);

  // the night around: stars (the world's nebula shows through), a glow on the horizon
  vec3 col = starfield(rd, .18 + .1 * uTreble) * .8;
  col += mix(pal(.3 + uShift), uPal1, uDesert) * .12 * exp(-abs(rd.y) * 14.);
  // the desert's dusk: a warm sky low on the horizon
  col += uDesert * (uPal0 * .35 * exp(-max(rd.y, 0.) * 5.) + uPal1 * .12 * exp(-max(rd.y, 0.) * 18.));
  float solid = 0.;
  float tEnd = 400.;

  float tg = rd.y < -1e-4 ? -ro.y / rd.y : 1e5;
  float to = obMarch(ro, rd, min(tg, OFAR));
  float tp = pyrMarch(ro, rd);
  if (tp > 0. && tg < tp && uDesert > .5) tp = -1.;   // hidden by the desert
  if (to > 0. && (tp < 0. || to < tp)) {
    vec3 p = ro + rd * to;
    // far off, the avenue melts into the night's haze (no edge where the march stops)
    float haze = smoothstep(50., OFAR, to);
    col = mix(obColor(p, obN(p), rd, ro, to * pa), col, haze * haze);
    solid = 1. - haze * haze;
    tEnd = to;
  } else if (tp > 0. && (tg > tp || abs((ro + rd * tg).x) > RW)) {
    vec3 p = ro + rd * tp;
    vec3 c = pyrColor(p, pyrN(p), tp * pa);
    // rising out of the void: what is still below the horizon fades into the dark
    float up = uDesert > .5 ? 1. : smoothstep(-PS * .35, PS * .05, p.y);
    col = mix(col, c, up);
    solid = up;
    tEnd = tp;
  } else if (tg < 1e4) {
    vec3 p = ro + rd * tg;
    float fp = tg * pa / sqrt(max(-rd.y, .02));
    float far = smoothstep(50., 150., tg);
    if (abs(p.x) < RW + .02) {
      vec3 c = roadColor(p, ro, fp);
      col = mix(c, col, far);
      solid = 1. - far;
      tEnd = tg;
    } else if (uDesert > .5) {
      col = mix(desertColor(p, tg), col, smoothstep(60., 200., tg));
      solid = 1. - smoothstep(120., 220., tg);
      tEnd = tg;
    } else if (abs(p.x) < XC) {
      col = mix(causewayColor(p, ro, fp), col, far);
      solid = 1. - far;
      tEnd = tg;
    } else {
      // the void under the causeway: its edge's neon glows into it
      col += vec3(.3, .85, 1.) * exp(-(abs(p.x) - XC) * 4.) * .3 * (1. - far);
    }
  }
  // the capstone's glow
  vec3 toA = gApex - ro;
  float da = length(cross(rd, toA)) / length(toA);
  col += vec3(1., .88, .5) * exp(-da * 60.) * uCap * .8 * step(0., dot(rd, toA));
  // the sparks of the hats along the edges
  for (int s = 0; s < 2; s++) {
    float sx = (s == 0 ? 1. : -1.) * (RW + .12);
    if (abs(rd.x) > 1e-4) {
      float t = (sx - ro.x) / rd.x;
      if (t > 0. && t < tEnd) {
        vec3 q = ro + rd * t;
        float cz = floor(q.z / 1.2);
        float h = hash12(vec2(cz, float(s) + 2.));
        vec2 o = vec2(q.z - (cz + .5) * 1.2, q.y - .1 - .12 * h);
        float on = step(.75, hash12(vec2(cz, floor(uTime * 8.) + float(s))));
        float r = max(.035, t * pa);
        col += mix(vec3(1.), spectral(h), .5) * (1. - smoothstep(0., r, length(o))) * .035 / r * on * uHat * 2.5;
      }
    }
  }
  // the prism on the drop: white light falling into the capstone, a rainbow fanning across the sky
  if (uBeam > .01) {
    vec3 B = normalize(vec3(1., .12, .5));
    col += uBeam * shaft(ro, rd, gApex, normalize(vec3(-.3, 1., -.2)), 400., PS * .03, PS * .05, false, tEnd);
    col += uBeam * shaft(ro, rd, gApex, B, 300., PS * .05, PS * 1.2, true, tEnd);
  }
  gl_FragColor = vec4(hdrOut(col), solid);
}
`,
});
