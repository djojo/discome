import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { ARCANE_GLSL, arcaneParams, arcaneUniforms, updateArcane } from "./arcane.glsl";

/**
 * The Gate: a lake of rainbow rings seen from above, mountains on the horizon, a tiny hooded figure
 * standing in a column of light. A ring leaves the centre on every kick; the column grows through the build;
 * on the drop the gate opens (a rainbow vortex) and the rings rush outward.
 */
export const arcanePortal = defineShaderScene({
  id: "arcane-portal",
  name: "Le Portail",
  energy: "medium",
  renderScale: 0.8,
  mask: true,
  description:
    "Lac d'anneaux arc-en-ciel, montagnes à l'horizon, une minuscule silhouette dans une colonne de lumière ; un anneau part à chaque kick, le portail s'ouvre au drop.",
  params: [paletteParam("cosmos"), ...arcaneParams(10, 0.5)],
  uniforms: () => ({
    ...arcaneUniforms(),
    uYaw: { value: 0 },
    uRing: { value: 0 },
    uRingTarget: { value: 0 },
    uColumn: { value: 0.15 },
    uOpen: { value: 0 },
  }),
  update(u, f, p, dt) {
    updateArcane(u, f, p, dt);
    u.uYaw.value = f.time * 0.03;
    if (f.beat) u.uRingTarget.value = (u.uRingTarget.value as number) + 1;
    if (f.drop) u.uRingTarget.value = (u.uRingTarget.value as number) + 6;
    const r = u.uRing.value as number;
    u.uRing.value = r + ((u.uRingTarget.value as number) - r) * (1 - Math.exp(-dt * 5));
    const bar = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;
    const col = f.section === "build" ? 0.15 + 0.85 * f.buildProgress : f.section === "breakdown" ? 0.1 : 0.2;
    if (f.drop) {
      u.uColumn.value = 1.2;
      u.uOpen.value = 1;
    }
    const c = u.uColumn.value as number;
    u.uColumn.value = c + (col - c) * (1 - Math.exp(-dt / (c > col ? bar * 2 : 0.6)));
    u.uOpen.value = (u.uOpen.value as number) * Math.exp(-dt / (bar * 2.5));
  },
  fragment: /* glsl */ `
uniform float uYaw;
uniform float uRing;
uniform float uColumn;
uniform float uOpen;
${ART_LIB}
${ARCANE_GLSL}

const float S = .32; // scale of the tiny figure

/** Mountain ridge on the horizon (elevation of the ridge per azimuth). */
float ridge(float az) {
  return .015 + .045 * vnoise(vec3(az * 2.2, 0., 1.)) + .02 * vnoise(vec3(az * 7., 3., 0.)) + .007 * vnoise(vec3(az * 23., 1., 2.));
}

vec3 sky(vec3 rd) {
  vec3 c = uBase * .6 + starfield(rd, .22 + .1 * uTreble);
  c += pal(.4 + uShift) * .08 * vnoise(rd * 2.5 + 1.) * smoothstep(0., .6, rd.y);
  float az = atan(rd.z, rd.x);
  float h = ridge(az);
  if (rd.y > -.01 && rd.y < h) {
    // Mountains engraved in horizontal lines, blue with gold crests
    float k = (h - rd.y) / h;
    float lines = .55 + .45 * smoothstep(.4, .6, fract(rd.y * 420.));
    c = mix(uPal0 * .3, uBase * .4, k) * lines + uInk * .35 * (1. - smoothstep(0., .08, k));
  }
  return c;
}

vec3 lake(vec3 p, vec3 rd) {
  float r = length(p.xz);
  vec3 c = uBase * .3 + starfield(reflect(rd, vec3(0., 1., 0.)), .2) * .5 * (1. - smoothstep(1.2, 2., r));
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
  return c;
}

/** Column of light rising from the centre. */
vec3 column(vec3 ro, vec3 rd, float tmax) {
  float a = dot(rd.xz, rd.xz);
  float s = -dot(ro.xz, rd.xz) / max(a, 1e-4);
  if (s < 0. || (tmax > 0. && s > tmax)) return vec3(0.);
  float d = length(ro.xz + rd.xz * s);
  float y = ro.y + rd.y * s;
  float H = .4 + 9. * uColumn;
  float inY = smoothstep(-.05, .1, y) * (1. - smoothstep(H * .7, H, y));
  vec3 c = vec3(.75, .9, 1.) * exp(-d * d * 60.) * 1.4 + mix(vec3(.4, .7, 1.), spectral(fract(y * .15 - uTime * .3)), .4) * exp(-d * 5.) * .25;
  return c * inY * (.2 + uColumn + uOpen);
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  setupFigure(0., 0., 0.);

  vec3 ro = vec3(sin(uYaw) * 9.5, 3., cos(uYaw) * 9.5);
  vec3 rd = lookAt(ro, vec3(0., 1.3, 0.)) * normalize(vec3(uv, 1.45));

  vec3 col = sky(rd);
  float solid = 0.;
  float tl = rd.y < 0. ? -ro.y / rd.y : -1.;

  // The tiny figure stands at the centre (figure space: feet at y = FEET)
  float dmin;
  vec3 rof = ro / S - vec3(0., FEET, 0.);
  float tf = figMarch(rof, rd, dmin);
  float tfw = tf > 0. ? tf * S : -1.;
  if (tfw > 0. && (tl < 0. || tfw < tl)) {
    col = shadeFigure(rof + rd * tf, rd, 0.) * .3;
    solid = 1.;
  } else {
    if (tl > 0.) {
      float far = smoothstep(14., 40., tl);
      col = mix(lake(ro + rd * tl, rd), sky(rd), far);
      solid = 1. - far;
    }
    col += figHalo(dmin) * .8;
  }
  col += column(ro, rd, tfw);

  col = aces(col);
  col *= vignette(fc / uRes);
  gl_FragColor = vec4(col, solid);
}
`,
});
