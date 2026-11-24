import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { ARCANE_GLSL, arcaneParams, arcaneUniforms, updateArcane } from "./arcane.glsl";

/** The drop's strikes, in beats from the drop: struck, struck again, a stutter, then the pillar stands. */
const STRIKES = [0, 0.25, 0.75, 1];
/** With tamer flashes: a single strike. */
const SAFE_STRIKES = [0];

/**
 * The Gate: a lake of rainbow rings seen from above, mountains on the horizon, a tiny hooded figure standing at the
 * centre on a thread of light. A ring leaves the centre on every kick. Through the build a storm gathers over the
 * gate (clouds wheeling, lit from inside by distant flashes) and the thread thins and crackles. On the drop the
 * lightning strikes the figure in stutters, like thunder, then a pillar of white light stands in the gate, wide and
 * fringed with the spectrum, up into the clouds; a shockwave runs over the lake, the rings rush outward, the gate
 * opens (a rainbow vortex) and the figure stays a black shape cut out of the light. The kicks strike again for a
 * few bars while the pillar thins.
 */
export const arcanePortal = defineShaderScene({
  id: "arcane-portal",
  name: "Le Portail",
  energy: "medium",
  hdr: true,
  renderScale: 0.8,
  mask: true,
  description:
    "Lac d'anneaux arc-en-ciel, une minuscule silhouette au centre ; l'orage se forme pendant la montée, et au drop la foudre la frappe en saccades avant qu'une colonne de lumière ne s'installe dans le portail.",
  params: [paletteParam("cosmos"), ...arcaneParams(10, 0.5)],
  uniforms: () => ({
    ...arcaneUniforms(),
    uYaw: { value: 0 },
    uRing: { value: 0 },
    uRingTarget: { value: 0 },
    uColumn: { value: 0.15 },
    uOpen: { value: 0 },
    uPillar: { value: 0 },
    uStrike: { value: 0 },
    uMain: { value: 0 },
    uBolt: { value: 0 },
    uShake: { value: 0 },
    uShock: { value: 99 },
    uStorm: { value: 0 },
    uFlash: { value: 0 },
    uFlashAz: { value: 0 },
    uSafe: { value: 0 },
    // CPU side only: the drop's sequence
    uSeqT: { value: -1 },
    uSeqBeat: { value: 0.5 },
    uSeqNext: { value: 0 },
    uRestrike: { value: -1 },
    uPillarGoal: { value: 0 },
  }),
  update(u, f, p, dt) {
    updateArcane(u, f, p, dt);
    const safe = f.safeFlash;
    u.uSafe.value = safe ? 1 : 0;
    u.uYaw.value = f.time * 0.03;
    const beat = f.bpm > 0 ? 60 / f.bpm : 0.5;
    const bar = beat * 4;
    if (f.beat) u.uRingTarget.value = (u.uRingTarget.value as number) + 1;
    const r = u.uRing.value as number;
    u.uRing.value = r + ((u.uRingTarget.value as number) - r) * (1 - Math.exp(-dt * 5));

    const strike = (amp: number, shake: number) => {
      u.uStrike.value = Math.max(u.uStrike.value as number, amp);
      u.uBolt.value = Math.random() * 100;
      u.uShake.value = Math.max(u.uShake.value as number, shake);
    };

    // ---- The drop: the strikes, on the tempo, then the pillar
    if (f.drop) {
      u.uSeqT.value = 0;
      u.uSeqBeat.value = beat;
      u.uSeqNext.value = 0;
      u.uMain.value = Math.random() * 100;
      u.uColumn.value = 0;
      u.uPillar.value = 0;
      u.uPillarGoal.value = 0;
    }
    const seq = safe ? SAFE_STRIKES : STRIKES;
    let seqT = u.uSeqT.value as number;
    if (seqT >= 0) {
      seqT += dt;
      let next = u.uSeqNext.value as number;
      while (next < seq.length && seqT >= seq[next] * (u.uSeqBeat.value as number)) {
        if (next === 0) {
          // the first strike: the shockwave leaves, the rings rush outward
          u.uShock.value = 0;
          u.uRingTarget.value = (u.uRingTarget.value as number) + 6;
        }
        strike(safe ? 0.55 : 1, safe ? 0.3 : 1);
        next++;
        if (next === seq.length) {
          // the last one stays: the pillar stands in the gate, and the gate opens
          u.uPillarGoal.value = safe ? 1 : 1.3;
          u.uOpen.value = 1;
          u.uRestrike.value = f.time + 4 * bar;
          seqT = -1;
          break;
        }
      }
      u.uSeqNext.value = next;
      u.uSeqT.value = seqT;
    }
    // ...and the kicks strike again for a few bars, softer
    const restrike = u.uRestrike.value as number;
    if (!safe && f.beat && seqT < 0 && f.time < restrike && f.section === "drop") strike(0.45, 0.25);

    u.uStrike.value = (u.uStrike.value as number) * Math.exp(-dt / 0.07);
    u.uShake.value = (u.uShake.value as number) * Math.exp(-dt / 0.15);
    u.uShock.value = Math.min(99, (u.uShock.value as number) + dt);
    // the pillar: at once after the strikes (rising over a quarter second with tamer flashes), then thinning
    const goal = (u.uPillarGoal.value as number) * Math.exp(-dt / (bar * 1.4));
    u.uPillarGoal.value = goal;
    const pl = u.uPillar.value as number;
    u.uPillar.value = pl + (goal - pl) * (1 - Math.exp(-dt / (safe ? 0.25 : 0.02)));
    u.uOpen.value = (u.uOpen.value as number) * Math.exp(-dt / (bar * 2.5));

    // ---- The thread of light: it rises through the build (thinning, crackling), stays low otherwise
    const col = f.section === "build" ? 0.15 + 0.85 * f.buildProgress : f.section === "breakdown" ? 0.1 : 0.2;
    const c = u.uColumn.value as number;
    if (seqT < 0) u.uColumn.value = c + (col - c) * (1 - Math.exp(-dt / (c > col ? bar * 2 : 0.6)));

    // ---- The storm: it gathers through the build, stays over the drop, clears in a few bars
    const storm = f.section === "build" ? 0.3 + 0.7 * f.buildProgress : (u.uPillar.value as number) > 0.15 ? 0.8 : 0;
    const s = u.uStorm.value as number;
    u.uStorm.value = s + (storm - s) * (1 - Math.exp(-dt / (storm > s ? 1.5 : bar * 2)));
    // distant flashes inside the clouds, more and more often as the build rises
    if (f.section === "build" && Math.random() < dt * (0.4 + 3.5 * f.buildProgress) * (safe ? 0.3 : 1)) {
      u.uFlash.value = (0.35 + 0.65 * Math.random()) * (safe ? 0.5 : 1);
      // somewhere in the sky the camera sees (it looks at the gate from its orbit)
      const yaw = u.uYaw.value as number;
      u.uFlashAz.value = Math.atan2(-Math.cos(yaw), -Math.sin(yaw)) + (Math.random() - 0.5) * 1.4;
    }
    u.uFlash.value = (u.uFlash.value as number) * Math.exp(-dt / 0.12);
  },
  fragment: /* glsl */ `
uniform float uYaw;
uniform float uRing;
uniform float uColumn;   // the thread of light (height)
uniform float uOpen;     // the gate open: the rainbow vortex
uniform float uPillar;   // the pillar standing after the strikes (0..1.3)
uniform float uStrike;   // the strike's flash
uniform float uMain;     // the drop's lightning channel
uniform float uBolt;     // this strike's branches
uniform float uShake;    // the jolt of a strike
uniform float uShock;    // seconds since the first strike: the shockwave on the lake
uniform float uStorm;    // 0..1: the storm over the gate
uniform float uFlash;    // a distant flash in the clouds
uniform float uFlashAz;  // ...and where
uniform float uSafe;     // tamer flashes
${ART_LIB}
${ARCANE_GLSL}

const float S = .32;     // scale of the tiny figure
const float HEAD = .95;  // the top of its hood (world): where the lightning lands
const float CLOUDS = 14.;
float gPa;               // a pixel, per unit of distance

/** Mountain ridge on the horizon (elevation of the ridge per azimuth). */
float ridge(float az) {
  return .015 + .045 * vnoise(vec3(az * 2.2, 0., 1.)) + .02 * vnoise(vec3(az * 7., 3., 0.)) + .007 * vnoise(vec3(az * 23., 1., 2.));
}

/** Storm clouds over the gate: a slow vortex, lit from inside by the flashes, the strikes and the pillar. */
vec3 clouds(vec3 ro, vec3 rd, vec3 c) {
  if (uStorm < .01 || rd.y < .03) return c;
  vec2 xz = ro.xz + rd.xz * (CLOUDS - ro.y) / rd.y;
  float r = length(xz);
  float a = atan(xz.y, xz.x) + 2.5 / (1. + r * .15) - uTime * .06;
  vec2 sw = vec2(cos(a), sin(a)) * r;
  float dens = smoothstep(.3, .62, fbm3(vec3(sw * .06, uTime * .03 + 2.)));
  dens *= smoothstep(0., .06, rd.y) * smoothstep(1.5, 5., r);   // the eye of the storm, right over the gate
  float az = atan(rd.z, rd.x);
  float near = exp(-pow(mod(az - uFlashAz + 3.1416, 6.2832) - 3.1416, 2.) * 3.);
  vec3 lit = vec3(.55, .6, .95) * uFlash * near * 1.4
    + vec3(.75, .8, 1.) * uStrike * exp(-r * .05) * 1.6 * (1. - .5 * uSafe)
    + vec3(1., .95, .88) * min(uPillar, 1.) * exp(-r * .12) * .9;
  // their undersides catch a little of the light below: the thread, the rings
  lit += (vec3(.05, .06, .1) + uPal0 * .04) * (.6 + .8 * uColumn);
  vec3 cloud = uBase * .35 + vec3(.012, .014, .022) + lit * (.4 + .6 * dens);
  return mix(c, cloud, dens * uStorm * .92);
}

vec3 sky(vec3 ro, vec3 rd) {
  vec3 c = uBase * .6 + starfield(rd, .22 + .1 * uTreble);
  c += pal(.4 + uShift) * .08 * vnoise(rd * 2.5 + 1.) * smoothstep(0., .6, rd.y);
  // the storm darkens the sky; a strike lights it all at once
  c *= 1. - .6 * uStorm;
  c += vec3(.22, .25, .42) * uStrike * (1. - .6 * uSafe) * smoothstep(-.05, .3, rd.y);
  c = clouds(ro, rd, c);
  float az = atan(rd.z, rd.x);
  float h = ridge(az);
  if (rd.y > -.01 && rd.y < h) {
    // Mountains engraved in horizontal lines, blue with gold crests; a strike lights their crests
    float k = (h - rd.y) / h;
    float lines = .55 + .45 * smoothstep(.4, .6, fract(rd.y * 420.));
    c = mix(uPal0 * .3, uBase * .4, k) * lines + uInk * .35 * (1. - smoothstep(0., .08, k));
    c += vec3(.6, .65, 1.) * (uStrike * (1. - .5 * uSafe) + uFlash * .3) * (1. - k) * .5;
  }
  return c;
}

// ---------------------------------------------------------------- the lightning
/** Piecewise linear noise: lightning's sharp turns. */
float zig(float v, float s) {
  float i = floor(v);
  return mix(hash12(vec2(i, s)), hash12(vec2(i + 1., s)), fract(v)) - .5;
}
/** The channel's offset at height v: wide in the sky, closing onto the head. */
float channel(float v) {
  return (zig(v * .9, uMain) * 1.7 + zig(v * 2.7, uMain + 3.) * .55 + zig(v * 8.1, uBolt) * .12) * clamp((v - HEAD) / 2.5, 0., 1.);
}

/**
 * The bolt, from the clouds onto the figure's head, drawn in the vertical plane through the gate facing the camera:
 * a white-hot channel, a violet glow, and branches forking off it (new ones on every strike).
 */
vec3 bolt(vec3 ro, vec3 rd, float tmax, float amp) {
  if (amp < .01) return vec3(0.);
  vec3 n = normalize(vec3(ro.x, 0., ro.z));
  float den = dot(rd, n);
  if (abs(den) < 1e-4) return vec3(0.);
  float t = -dot(ro, n) / den;
  if (t < 0. || (tmax > 0. && t > tmax)) return vec3(0.);
  vec3 P = ro + rd * t;
  float v = P.y;
  if (v < HEAD - .05 || v > CLOUDS + 2.) return vec3(0.);
  float u = dot(P, normalize(cross(vec3(0., 1., 0.), n)));
  float w = max(.022, t * gPa * 1.2);
  float d = abs(u - channel(v));
  vec3 c = vec3(.88, .92, 1.) * exp(-d * d / (w * w)) * 3. + vec3(.5, .42, 1.) * (exp(-d * 2.5) * .3 + exp(-d * 12.) * .5);
  for (int j = 0; j < 3; j++) {
    float fj = float(j);
    float vb = HEAD + 2. + hash12(vec2(uBolt, fj)) * 9.;   // where it forks
    float len = 1.2 + hash12(vec2(fj, uBolt + 1.)) * 3.;
    if (v > vb || v < vb - len) continue;
    float k = (vb - v) / len;
    float xb = channel(vb) + (vb - v) * (hash12(vec2(uBolt + 2., fj)) - .5) * 2.4 + zig(v * 6., uBolt + fj * 7.) * .3 * k;
    float db = abs(u - xb);
    c += (vec3(.85, .88, 1.) * exp(-db * db / (w * w * .5)) * 1.7 + vec3(.45, .4, 1.) * exp(-db * 7.) * .25) * (1. - k);
  }
  // it comes out of the clouds, and it strikes: brightest where it lands
  c *= smoothstep(CLOUDS + 2., CLOUDS - 1., v) * (1. + 1.5 * exp(-(v - HEAD) * 2.));
  return c * amp;
}

// ---------------------------------------------------------------- the column
/** The thread of light, and after the strikes the pillar: wide, blinding, fringed with the spectrum, into the sky. */
vec3 column(vec3 ro, vec3 rd, float tmax) {
  float a = dot(rd.xz, rd.xz);
  float s = -dot(ro.xz, rd.xz) / max(a, 1e-4);
  if (s < 0. || (tmax > 0. && s > tmax)) return vec3(0.);
  float d = length(ro.xz + rd.xz * s);
  float y = ro.y + rd.y * s;
  float P = uPillar;
  float H = mix(.4 + 9. * uColumn, 60., smoothstep(0., .3, P));
  float inY = smoothstep(-.05, .1, y) * (1. - smoothstep(H * .7, H, y));
  // the thread: thinner and crackling as the storm gathers
  float crackle = mix(1., .3 + .7 * step(.45, hash12(vec2(floor(y * 3.), floor(uTime * 24.)))), uStorm);
  vec3 c = vec3(.75, .9, 1.) * exp(-d * d * mix(60., 260., uStorm)) * 1.4 * crackle
    + mix(vec3(.4, .7, 1.), spectral(fract(y * .15 - uTime * .3)), .4) * exp(-d * 5.) * .25 * (1. - .5 * uStorm);
  c *= .2 + uColumn;
  // the pillar: a sharp core of white light streaming upward, a thin spectral fringe, a wide glow
  float R = .2 + .1 * min(P, 1.);
  float stream = .8 + .35 * vnoise(vec3(d * 16., y * 1.4 - uTime * 7., 3.));
  float flick = .7 + .5 * step(.6, hash12(vec2(floor(y * 2.), floor(uTime * 18.))));
  vec3 pil = vec3(1., .97, .92) * (1. - smoothstep(R * .7, R, d)) * 2.2 * stream
    + spectral(clamp((d - R * .85) / (R * .6), 0., 1.)) * exp(-pow((d - R * 1.1) / (R * .3), 2.)) * 1.1 * flick
    + vec3(.5, .6, 1.) * (exp(-d * 4.) * .4 + exp(-d * 1.5) * .25);
  return (c + pil * P) * inY;
}

vec3 lake(vec3 p, vec3 rd) {
  float r = length(p.xz);
  vec3 c = uBase * .3 + starfield(reflect(rd, vec3(0., 1., 0.)), .2) * .5 * (1. - smoothstep(1.2, 2., r)) * (1. - .6 * uStorm);
  // The gate: a rainbow vortex in the central pool when it opens
  float a = atan(p.z, p.x);
  float vort = fract(a / 6.2831 * 3. + r * .8 - uTime * .6);
  c += spectral(vort) * uOpen * (1. - smoothstep(.4, 1.8, r)) * 1.4;
  // One wide rainbow ring per period, deep water in between
  float band = fract(r * .3 - uRing * .2);
  vec3 rc = spectral(band / .5) * smoothstep(0., .04, band) * (1. - smoothstep(.46, .5, band));
  rc += uPal0 * .07 * (1. - step(.5, 1. - band));
  float g = r * 18.;
  float lines = .6 + .4 * smoothstep(.25, .5, fract(g)) * (1. - smoothstep(.75, 1., fract(g)));
  lines = mix(lines, .8, smoothstep(.2, .6, fwidth(g)));
  c += rc * smoothstep(1.5, 2.2, r) * lines * (.45 + .5 * uBeat + 1.2 * uOpen);
  // the strike and the pillar light the water; the shockwave races out over it
  c += vec3(.55, .65, 1.) * uStrike * exp(-r * .45) * .55 * (1. - .5 * uSafe);
  c += vec3(1., .95, .9) * min(uPillar, 1.) * exp(-r * .8) * .6;
  c += vec3(.8, .9, 1.) * exp(-pow((r - uShock * 7.) / .7, 2.)) * exp(-uShock * 1.2) * 1.8;
  // ...and the water mirrors the bolt and the column
  vec3 rr = reflect(rd, vec3(0., 1., 0.));
  c += (bolt(p, rr, -1., uStrike) + column(p, rr, -1.)) * .3;
  return c;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  // the jolt of a strike: a short shake, smooth (never a random jitter)
  uv += vec2(sin(uTime * 61.) + .5 * sin(uTime * 97. + 1.), cos(uTime * 53.) + .5 * sin(uTime * 83.)) * .011 * uShake;
  setupFigure(0., 0., 0.);

  float focal = 1.45 + .06 * uShake;
  gPa = 1. / (uRes.y * focal);
  vec3 ro = vec3(sin(uYaw) * 9.5, 3., cos(uYaw) * 9.5);
  vec3 rd = lookAt(ro, vec3(0., 1.3, 0.)) * normalize(vec3(uv, focal));

  vec3 col = sky(ro, rd);
  float solid = 0.;
  float tl = rd.y < 0. ? -ro.y / rd.y : -1.;

  // The tiny figure stands at the centre (figure space: feet at y = FEET)
  float dmin;
  vec3 rof = ro / S + vec3(0., FEET, 0.);   // its feet on the water
  float tf = figMarch(rof, rd, dmin);
  float tfw = tf > 0. ? tf * S : -1.;
  if (tfw > 0. && (tl < 0. || tfw < tl)) {
    // a black shape cut out of the light: the column and the bolt stay behind it
    col = shadeFigure(rof + rd * tf, rd, 0.) * .12 * (1. - .7 * min(uPillar, 1.));
    solid = 1.;
  } else {
    if (tl > 0.) {
      float far = smoothstep(14., 40., tl);
      col = mix(lake(ro + rd * tl, rd), sky(ro, rd), far);
      solid = 1. - far;
    }
    col += figHalo(dmin) * .5;
    col += column(ro, rd, -1.);
    col += bolt(ro, rd, -1., uStrike);
    // the crown of light where it lands, around the head
    vec3 toI = vec3(0., HEAD, 0.) - ro;
    float dI = length(cross(rd, toI)) / length(toI);
    col += vec3(.9, .92, 1.) * (exp(-dI * 45.) * 1.6 + exp(-dI * 9.) * .3) * max(uStrike, min(uPillar, 1.) * .5);
  }

  gl_FragColor = vec4(hdrOut(col), solid);
}
`,
});
