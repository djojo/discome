import * as THREE from "three";
import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";
import { STUDIO_GLSL } from "./studio.glsl";

const FRAMINGS: Framing[] = [
  // close, skimming the surface: the relief of the waves against the light
  { az: -0.4, el: 0.12, dist: 1.8, target: [0.3, 0, -0.2], focal: 2, weight: 3 },
  { az: 2.2, el: 0.2, dist: 1.4, target: [0.9, 0, 0.5], focal: 2.1, weight: 3 },
  // macro on the folds near the centre
  { az: 0.8, el: 0.35, dist: 1.1, target: [0.15, 0, 0.1], focal: 2.2, weight: 2 },
  { az: -1.9, el: 0.28, dist: 2.4, target: [-0.8, 0, 0.6], focal: 2, weight: 2 },
  // from above: the whole figure, like a mandala in a dish
  { az: 0.3, el: 1.4, dist: 9, target: [0, 0, 0], focal: 1.8, weight: 1 },
];

/** Bands of the 64-band spectrum feeding the four patterns, low to high. */
const GROUPS = [
  [0, 8],
  [8, 20],
  [20, 36],
  [36, 64],
];

/**
 * Onde: a dish of mercury vibrating in standing waves, like the figures of cymatics. Four patterns (squares,
 * hexagons, eight- and twelve-fold) each driven by a part of the spectrum: the music draws the geometry. On the
 * kick a drop falls and sends its rings; on the drop the patterns jump to a more complex mode.
 * Variant « Pics »: black ferrofluid, whose spikes rise with the bass.
 */
export const wave = defineShaderScene({
  id: "mercury-wave",
  name: "Onde",
  energy: "medium",
  renderScale: 0.8,
  mask: true,
  camera: { framings: FRAMINGS, glideBars: 3 },
  description:
    "Bain de mercure qui vibre en ondes stationnaires, comme la cymatique : chaque partie du spectre dessine son motif ; une goutte tombe au kick, le motif se complexifie au drop. Variante Pics : un ferrofluide noir.",
  params: [
    paletteParam("mercury"),
    {
      type: "select",
      key: "variant",
      label: "Variante",
      options: [
        { value: "waves", label: "Ondes" },
        { value: "spikes", label: "Pics" },
      ],
      default: "waves",
    },
  ],
  uniforms: () => ({
    uAmp: { value: new THREE.Vector4(0.5, 0.4, 0.3, 0.2) },
    uLevelA: { value: 0 },
    uLevelB: { value: 0 },
    uMix: { value: 0 },
    uDrops: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, -99, 0)) },
    uSpike: { value: 0.1 },
    uPics: { value: 0 },
    // CPU side only
    uLow: { value: 0 },
    uBurst: { value: 0 },
  }),
  update(u, f, p, dt) {
    u.uPics.value = p.variant === "spikes" ? 1 : 0;
    // The four patterns follow their part of the spectrum, smoothly (never a flicker)
    const amp = u.uAmp.value as THREE.Vector4;
    const quiet = f.section === "breakdown" ? 0.5 : 1;
    const vals = GROUPS.map(([a, b]) => {
      let s = 0;
      for (let i = a; i < b; i++) s += f.bands[i] ?? 0;
      return s / (b - a);
    });
    const comp = ["x", "y", "z", "w"] as const;
    comp.forEach((k, i) => {
      const target = (0.35 + 0.9 * Math.min(1, vals[i])) * quiet;
      const cur = amp[k];
      amp[k] = cur + (target - cur) * (1 - Math.exp(-dt * (target > cur ? 8 : 2)));
    });
    // The drop: the patterns move to the next, more complex mode
    if (f.drop) {
      u.uLevelB.value = ((u.uLevelA.value as number) + 1) % 3;
      u.uMix.value = 0.0001;
      u.uBurst.value = 1;
    }
    const m = u.uMix.value as number;
    if (m > 0) {
      const next = Math.min(1, m + dt / 0.8);
      if (next >= 1) {
        u.uLevelA.value = u.uLevelB.value;
        u.uMix.value = 0;
      } else u.uMix.value = next;
    }
    // A drop of mercury falls on every kick (in the oldest slot)
    if (f.beat) {
      const drops = u.uDrops.value as THREE.Vector4[];
      let k = 0;
      for (let i = 1; i < drops.length; i++) if (drops[i].z < drops[k].z) k = i;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 2.2;
      drops[k].set(Math.cos(a) * r, Math.sin(a) * r, f.time + 0.45, 0.7 + 0.3 * Math.random());
    }
    // Pics: the spikes rise with the bass, twitch on the kick, shoot up on the drop
    const b = u.uLow.value as number;
    const low = b + (f.bass - b) * (1 - Math.exp(-dt * (f.bass > b ? 10 : 2.5)));
    u.uLow.value = low;
    const bar = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;
    u.uBurst.value = (u.uBurst.value as number) * Math.exp(-dt / bar);
    u.uSpike.value = 0.06 + 0.9 * low + 0.12 * f.beatPulse + 0.9 * (u.uBurst.value as number);
  },
  fragment: /* glsl */ `
uniform vec4 uAmp;        // the four patterns' amplitudes
uniform float uLevelA;    // complexity of the patterns (0..2), moving to uLevelB on the drop
uniform float uLevelB;
uniform float uMix;
uniform vec4 uDrops[4];   // falling drops: x, z, impact time, strength
uniform float uSpike;     // Pics: height of the spikes
uniform float uPics;
${ART_LIB}
${CAMERA_GLSL}
${STUDIO_GLSL}
const float RP = 3.;      // the dish's radius

/**
 * A standing wave on a round dish, centred like the figures of cymatics: rings (k) times petals (m), fading
 * from the centre like a Bessel mode.
 */
float mode(float r, float th, float k, float m, float spin) {
  // (the petals fade in from the centre, where their angle has no meaning)
  return cos(k * r) * cos(m * (th + spin)) / sqrt(1. + .15 * k * r) * smoothstep(.05, .5, r);
}

/** The four patterns at one level of complexity (more rings and petals as it rises). */
float patterns(vec2 p, float lv) {
  float r = length(p), th = atan(p.y, p.x);
  float ks = 1. + .3 * lv;
  float s = uTime * .04;
  float breathe = .75 + .25 * cos(uTime * 1.7);
  float h = uAmp.x * cos(5. * ks * r) / sqrt(1. + .75 * ks * r);
  h += uAmp.y * mode(r, th, 8. * ks, 6. + 2. * lv, s);
  h += uAmp.z * mode(r, th, 13. * ks, 8. + 2. * lv, -s * 1.3);
  h += uAmp.w * mode(r, th, 19. * ks, 12. + 2. * lv, s * .7);
  return h * .11 * breathe;
}

/** The surface of the mercury: the patterns, the rings of the drops, calm at the dish's edge. */
float height(vec2 p) {
  float h = patterns(p, uLevelA);
  if (uMix > 0.) h = mix(h, patterns(p, uLevelB), smoothstep(0., 1., uMix));
  for (int i = 0; i < 4; i++) {
    vec4 d = uDrops[i];
    float age = uTime - d.z;
    if (age > 0. && age < 3.) {
      float r = length(p - d.xy) - age * 1.3;
      h += d.w * .02 * sin(r * 16.) * exp(-r * r * 9.) * exp(-age * 1.2);
    }
  }
  return h * (1. - smoothstep(RP - .5, RP - .05, length(p)));
}

vec3 heightN(vec2 p) {
  const float e = .01;
  return normalize(vec3(height(p - vec2(e, 0.)) - height(p + vec2(e, 0.)), 2. * e, height(p - vec2(0., e)) - height(p + vec2(0., e))));
}

/** Liquid chrome under the studio's lights; ink tints the dark, the lights keep their colour. */
vec3 chrome(vec3 n, vec3 rd) {
  float fre = pow(1. - clamp(dot(n, -rd), 0., 1.), 5.);
  return studio(reflect(rd, n)) * mix(uInk * .85, vec3(1.), fre);
}

/** The falling drops (before they hit): small chrome beads. */
vec4 fallingDrops(vec3 ro, vec3 rd) {
  float best = 1e5;
  vec3 col = vec3(0.);
  for (int i = 0; i < 4; i++) {
    vec4 d = uDrops[i];
    float age = uTime - d.z;
    if (age < 0. && age > -.45) {
      vec3 c = vec3(d.x, -age * 7. + .05, d.y);
      vec3 oc = ro - c;
      float b = dot(oc, rd), h = b * b - dot(oc, oc) + .0049;
      if (h > 0.) {
        float t = -b - sqrt(h);
        if (t > 0. && t < best) {
          best = t;
          col = chrome(normalize(ro + rd * t - c), rd);
        }
      }
    }
  }
  return vec4(col, best);
}

// ---------------------------------------------------------------- Pics: ferrofluid
float spikesD(vec3 p) {
  vec2 q = p.xz * rot(uTime * .04);
  const float S = .34;
  const vec2 s = vec2(1., 1.7320508);
  vec2 a = mod(q / S, s) - s * .5;
  vec2 b = mod(q / S - s * .5, s) - s * .5;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  vec2 c = q / S - g;
  float r = length(c * S);
  float H = uSpike * (1. - smoothstep(.4, 2.5, r)) * (.8 + .4 * hash12(floor(c * 2. + .5)));
  // a spike with concave flanks and a sharp tip, flowing into the pool
  if (H < .01) return p.y;
  float y = clamp(p.y / H, 0., 1.);
  // small spikes have small feet: no creases between the cells where the field fades out
  float prof = min(.17, H * .55) * pow(1. - y, 1.8);
  float spike = max((length(g * S) - prof) * .55, p.y - H);
  return smin(p.y, spike, .07);
}

float spikesMarch(vec3 ro, vec3 rd) {
  float top = uSpike * 1.25 + .1;
  if (ro.y > top && rd.y >= 0.) return -1.;
  float t = ro.y > top ? (ro.y - top) / -rd.y : .05;
  for (int i = 0; i < 90; i++) {
    vec3 p = ro + rd * t;
    float d = spikesD(p);
    if (d < .0008 * t) return t;
    t += d * .7;
    if (t > 30. || p.y > top + .05 && rd.y > 0.) break;
  }
  return -1.;
}

vec3 spikesN(vec3 p) {
  const vec2 k = vec2(1, -1);
  const float e = .002;
  return normalize(k.xyy * spikesD(p + k.xyy * e) + k.yyx * spikesD(p + k.yyx * e) + k.yxy * spikesD(p + k.yxy * e) + k.xxx * spikesD(p + k.xxx * e));
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 ro = uCamPos;
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));
  vec3 col = uBase * .8 + uInk * .04 * exp(-2. * length(uv));
  float solid = 0.;

  if (uPics > .5) {
    float t = spikesMarch(ro, rd);
    if (t > 0.) {
      vec3 p = ro + rd * t;
      vec3 n = spikesN(p);
      float fre = pow(1. - clamp(dot(n, -rd), 0., 1.), 4.);
      // black and glossy: only the lights draw it
      col = studio(reflect(rd, n)) * mix(.18, .95, fre);
      float fade = 1. - smoothstep(RP - .3, RP + 1.5, length(p.xz));
      col *= fade;
      solid = fade;
    }
  } else if (rd.y < -1e-4) {
    // the surface: marched as a relief (seen from close, its folds stand out against the light)
    const float HM = .12;
    float t = (ro.y - HM) / -rd.y;
    t = max(t, 0.);
    vec3 p = ro + rd * t;
    float tEndW = -(ro.y + HM) / rd.y;
    for (int i = 0; i < 72; i++) {
      float d = p.y - height(p.xz);
      if (abs(d) < .0004 * t || t > tEndW) break;
      t += d * .5;
      p = ro + rd * t;
    }
    float r = length(p.xz);
    if (r < RP + .08) {
      vec3 n = heightN(p.xz);
      // the dish's chrome rim
      float rim = 1. - smoothstep(.0, .07, abs(r - RP));
      if (rim > 0.) {
        vec2 o = p.xz / max(r, 1e-4);
        float x = clamp((r - RP) / .07, -1., 1.);
        n = normalize(mix(n, vec3(o.x * x, sqrt(max(1. - x * x, 0.)), o.y * x), rim));
      }
      col = chrome(n, rd);
      solid = 1.;
    }
  }
  if (uPics < .5) {
    vec4 fd = fallingDrops(ro, rd);
    if (fd.w < 1e4) {
      col = fd.rgb;
      solid = 1.;
    }
  }
  col = aces(col);
  col *= vignette(fc / uRes);
  gl_FragColor = vec4(col, solid);
}
`,
});
