import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { ARCANE_GLSL, arcaneParams, arcaneUniforms, updateArcane } from "./arcane.glsl";

/**
 * The Architect: a pyramid-headed mage in a cosmic robe, holding a red crystal over a lake of rainbow rings.
 * On the drop the pyramid becomes a prism: a white beam goes in, a rainbow comes out.
 */
export const arcaneArchitect = defineShaderScene({
  id: "arcane-architect",
  name: "L'Architecte",
  energy: "medium",
  renderScale: 0.8,
  mask: true,
  description:
    "Mage à tête de pyramide, robe de lignes et d'étoiles, au-dessus d'un lac d'anneaux arc-en-ciel ; au drop, la pyramide devient un prisme.",
  params: [paletteParam("cosmos"), ...arcaneParams()],
  uniforms: () => ({
    ...arcaneUniforms(),
    uYaw: { value: -0.45 },
    uRing: { value: 0 },
    uRingTarget: { value: 0 },
    uBeam: { value: 0 },
    uLift: { value: 0.2 },
  }),
  update(u, f, p, dt) {
    updateArcane(u, f, p, dt);
    u.uYaw.value = -0.45 + 0.25 * Math.sin(f.time * 0.05);
    // Each kick sends the rings a step outward
    if (f.beat) u.uRingTarget.value = (u.uRingTarget.value as number) + 1;
    const r = u.uRing.value as number;
    u.uRing.value = r + ((u.uRingTarget.value as number) - r) * (1 - Math.exp(-dt * 6));
    const bar = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;
    // The prism beam: a flicker that grows through the build, full blast on the drop, fading over a few bars
    const target = f.section === "build" ? 0.3 * f.buildProgress * (0.6 + 0.4 * f.beatPulse) : 0;
    if (f.drop) u.uBeam.value = 1.3;
    const b = u.uBeam.value as number;
    u.uBeam.value = b + (target - b) * (1 - Math.exp(-dt / (b > target ? bar * 1.6 : 0.3)));
    // The crystal rises through the build
    const lift = f.section === "build" ? 0.2 + 0.8 * f.buildProgress : f.section === "drop" ? 0.75 : 0.2;
    const l = u.uLift.value as number;
    u.uLift.value = l + (lift - l) * (1 - Math.exp(-dt * 1.5));
  },
  fragment: /* glsl */ `
uniform float uYaw;
uniform float uRing;
uniform float uBeam;
uniform float uLift;
${ART_LIB}
${ARCANE_GLSL}

vec3 gCrystal;

float crystalD(vec3 p) {
  vec3 q = p - gCrystal;
  q.xz *= rot(uTime * .6);
  q.y = -q.y;
  return sdPyramid(q / .26, 1.) * .26;
}

/** Inverted red crystal held over the hand. */
float crystalMarch(vec3 ro, vec3 rd) {
  vec3 c = gCrystal - vec3(0., .13, 0.);
  vec3 oc = ro - c;
  float b = dot(oc, rd), h = b * b - dot(oc, oc) + .1;
  if (h < 0.) return -1.;
  float t = max(-b - sqrt(h), 0.);
  for (int i = 0; i < 32; i++) {
    float d = crystalD(ro + rd * t);
    if (d < .001) return t;
    t += d;
    if (t > -b + sqrt(h)) break;
  }
  return -1.;
}

/** Dark water around the figure, then wide rainbow rings travelling outward. */
vec3 lake(vec3 p, vec3 rd) {
  float r = length(p.xz);
  vec3 c = uBase * .35;
  c += starfield(reflect(rd, vec3(0., 1., 0.)), .2) * .45 * (1. - smoothstep(1.2, 2.2, r));
  float band = fract(r * .3 - uRing * .2);
  vec3 rc = spectral(band) * smoothstep(0., .05, band) * (1. - smoothstep(.9, 1., band));
  // engraved concentric lines, faded where they get too fine
  float g = r * 16.;
  float lines = .6 + .4 * smoothstep(.25, .5, fract(g)) * (1. - smoothstep(.75, 1., fract(g)));
  lines = mix(lines, .8, smoothstep(.2, .6, fwidth(g)));
  c += rc * smoothstep(1.3, 2., r) * exp(-r * .12) * lines * (.42 + .45 * uBeat + uDrop);
  // the figure's shadow
  c *= .3 + .7 * smoothstep(.3, 1.3, length(p.xz - vec2(.1, .2)));
  return c;
}

/** The prism beam: white light into the head, a rainbow out of it. */
vec3 beam(vec3 ro, vec3 rd, float tmax) {
  vec3 H = vec3(0., .98, .05);
  vec3 B = normalize(vec3(1., .08, .5));
  vec3 w = ro - H;
  float b = dot(rd, B), d = dot(rd, w), e = dot(B, w);
  float den = max(1. - b * b, 1e-4);
  float sc = (b * e - d) / den;
  float tc = (e - b * d) / den;
  if (sc < 0. || (tmax > 0. && sc > tmax)) return vec3(0.);
  vec3 diff = ro + rd * sc - (H + B * tc);
  vec3 up = normalize(cross(B, cross(vec3(0., 1., 0.), B)));
  float wdt = tc > 0. ? .06 + .14 * uBeam : .025 + .03 * uBeam;
  float across = dot(diff, up) / wdt;
  float side = length(diff - up * dot(diff, up)) / wdt;
  float inside = (1. - smoothstep(.8, 1., abs(across))) * (1. - smoothstep(.5, 1., side));
  vec3 c = tc > 0. ? spectral(across * .5 + .5) * 1.6 : vec3(1.2);
  return c * inside * uBeam * exp(-abs(tc) * .06) * smoothstep(0., .25, abs(tc));
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  setupFigure(1., 1., uLift);
  gCrystal = gHand + vec3(0., .3, 0.);

  vec3 ro = vec3(sin(uYaw) * 6.2, .3, cos(uYaw) * 6.2);
  vec3 rd = lookAt(ro, vec3(0., .05, 0.)) * normalize(vec3(uv, 1.55));

  vec3 col = uBase * .6 + starfield(rd, .2 + .1 * uTreble);
  col += pal(.35 + uShift) * .07 * vnoise(rd * 3. + uTime * .02) * smoothstep(-.1, .5, rd.y);
  float solid = 0.;

  float dmin;
  float tf = figMarch(ro, rd, dmin);
  float tg = rd.y < 0. ? (FEET - ro.y) / rd.y : -1.;
  if (tf > 0.) {
    col = shadeFigure(ro + rd * tf, rd, 0.);
    solid = 1.;
  } else {
    if (tg > 0.) {
      col = lake(ro + rd * tg, rd);
      solid = 1.;
    }
    col += figHalo(dmin);
  }

  // The crystal and its glow
  vec3 red = vec3(1., .16, .22);
  float tc = crystalMarch(ro, rd);
  if (tc > 0. && (tf < 0. || tc < tf)) {
    vec3 p = ro + rd * tc;
    float s = fract(p.y * 60.);
    col = red * (.35 + 1.4 * smoothstep(.4, .5, s) * (1. - smoothstep(.85, .95, s))) * (1. + uBeat);
    solid = 1.;
  }
  float dc = length(cross(rd, gCrystal - ro));
  col += red * exp(-dc * 9.) * (.25 + .7 * uBeat + uBeam);

  col += beam(ro, rd, tf);

  // On the drop, stars fly out of the robe
  if (uDrop > .02) {
    vec2 g = uv * 34. + vec2(0., -uTime * 3.);
    vec2 id = floor(g);
    vec2 o = (vec2(hash12(id + 3.1), hash12(id + 7.7)) - .5) * .6;
    float h = hash12(id);
    float sp = (1. - smoothstep(0., .1, length(fract(g) - .5 - o))) * step(.8, h);
    col += sp * exp(-dot(uv * vec2(1.6, .9), uv * vec2(1.6, .9)) * 3.) * uDrop * mix(vec3(1.), spectral(h), .6) * 1.5;
  }

  col = aces(col);
  col *= vignette(fc / uRes);
  gl_FragColor = vec4(col, solid);
}
`,
});
