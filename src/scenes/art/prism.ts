import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { ARCANE_GLSL, arcaneParams, arcaneUniforms, updateArcane } from "./arcane.glsl";

/**
 * The Three: hooded monks in red, blue and gold robes, a prism beam crossing their empty hoods.
 * The 7 stripes of the beam are 7 frequency bands, bass at the top (red), treble at the bottom (violet).
 * On the drop the beam widens and the robes burn in their own colours, one monk per beat.
 */
export const arcanePrism = defineShaderScene({
  id: "arcane-prism",
  name: "Les Trois",
  energy: "intense",
  hdr: true,
  renderScale: 0.8,
  mask: true,
  description:
    "Trois moines encapuchonnés traversés par un rayon prismatique : chaque bande de couleur est une bande de fréquences ; au drop, les robes s'embrasent.",
  params: [paletteParam("cosmos"), ...arcaneParams(12, 0.25)],
  uniforms: () => ({ ...arcaneUniforms(), uBeam: { value: 0.4 }, uBeatIdx: { value: 0 } }),
  update(u, f, p, dt) {
    updateArcane(u, f, p, dt);
    const bar = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;
    const target = 0.35 + 0.3 * (f.section === "build" ? f.buildProgress : 0);
    if (f.drop) u.uBeam.value = 1.4;
    const b = u.uBeam.value as number;
    u.uBeam.value = b + (target - b) * (1 - Math.exp(-dt / (b > target ? bar * 2 : 0.5)));
    u.uBeatIdx.value = f.beatInBar % 3;
  },
  fragment: /* glsl */ `
uniform float uBeam;
uniform float uBeatIdx;
${ART_LIB}
${ARCANE_GLSL}

const vec3 STEP = vec3(2.25, 0., -1.1);
const vec3 FACE = vec3(0., .84, .3);

vec3 monkColor(float i) {
  return i < -.5 ? vec3(1., .26, .2) : i < .5 ? vec3(.2, .45, 1.) : vec3(1., .72, .2);
}

float bandAt(float k) {
  if (k < .5) return uBands[0];
  if (k < 1.5) return uBands[1];
  if (k < 2.5) return uBands[2];
  if (k < 3.5) return uBands[3];
  if (k < 4.5) return uBands[4];
  if (k < 5.5) return uBands[5];
  return uBands[6];
}

/** Retro rainbow, red at the top, one stripe per frequency band, dark seams in between. */
vec3 prismBeam(vec3 ro, vec3 rd, float tmax) {
  vec3 H = FACE;
  vec3 B = normalize(STEP);
  vec3 w = ro - H;
  float b = dot(rd, B), d = dot(rd, w), e = dot(B, w);
  float den = max(1. - b * b, 1e-4);
  float sc = (b * e - d) / den;
  float tc = (e - b * d) / den;
  if (sc < 0. || (tmax > 0. && sc > tmax)) return vec3(0.);
  vec3 diff = ro + rd * sc - (H + B * tc);
  vec3 up = normalize(cross(B, cross(vec3(0., 1., 0.), B)));
  float wdt = .16 + .14 * uBeam;
  float y = dot(diff, up) / wdt;
  float side = length(diff - up * dot(diff, up)) / wdt;
  if (abs(y) > 1. || side > 1.) return vec3(0.);
  float x = (1. - (y * .5 + .5)) * 7.;
  float k = floor(x);
  float band = bandAt(k);
  float seam = smoothstep(0., .1, fract(x)) * (1. - smoothstep(.9, 1., fract(x)));
  vec3 c = spectral(k / 6.) * mix(vec3(1.), vec3(.95, .9, .8), .25);
  float edge = 1. - smoothstep(.7, 1., side);
  return c * (.25 + 1.4 * band) * seam * edge * (.6 + .6 * uBeam);
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  setupFigure(0., 0., 0.);

  vec3 ro = vec3(.4 * sin(uTime * .05), .3, 8.);
  vec3 rd = lookAt(ro, vec3(0., .1, -.3)) * normalize(vec3(uv, 1.55));

  // Black paper with a few stars and a warm haze
  vec3 col = uBase * .5 + starfield(rd, .1) * .5 + vec3(.05, .03, .02) * vnoise(rd * 4.);
  float solid = 0.;
  float tbest = -1., ibest = 0., dmin = 1e3;
  for (int i = -1; i <= 1; i++) {
    float fi = float(i);
    float dm;
    float t = figMarch(ro - STEP * fi, rd, dm);
    dmin = min(dmin, dm);
    if (t > 0. && (tbest < 0. || t < tbest)) { tbest = t; ibest = fi; }
  }
  if (tbest > 0.) {
    vec3 mc = monkColor(ibest);
    float lit = 1. + uDrop * 1.5 + (abs(ibest + 1. - uBeatIdx) < .5 ? .6 * uBeat : 0.);
    setCloth(mc * lit);
    col = shadeFigure(ro - STEP * ibest + rd * tbest, rd, 0.);
    solid = 1.;
  } else {
    col += figHalo(dmin) * .6;
  }
  col += prismBeam(ro, rd, tbest);

  gl_FragColor = vec4(hdrOut(col), solid);
}
`,
});
