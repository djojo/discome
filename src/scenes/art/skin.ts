import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB, MARCH } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";
import { HEAD_GLSL, headParam, headUniforms, setHead, TITLE_HEAD } from "./heads";
import { DETAIL_GLSL } from "./detail.glsl";

const FRAMINGS: Framing[] = [
  { az: 0, el: 0.02, dist: 3.2, target: [0, 0, 0], focal: 1.9, weight: 3 },
  { az: 0.45, el: 0.08, dist: 3, target: [0, 0, 0.1], focal: 1.9, weight: 2 },
  // close, grazing: the skin's relief in the raking light
  { az: -0.6, el: 0.05, dist: 2.2, target: [0, 0.05, 0.2], focal: 2.1, weight: 2 },
  { az: 0.2, el: 0.3, dist: 3.4, target: [0, -0.1, 0], focal: 1.9, weight: 1 },
  // The night's title: from the front, so that it always reads
  { az: 0, el: 0.02, dist: 4, target: [0, 0, 0], focal: 1.9, weight: 3, tag: "title" },
  { az: 0.22, el: 0.08, dist: 4.1, target: [0, 0, 0], focal: 1.9, weight: 2, tag: "title" },
  { az: -0.26, el: -0.04, dist: 3.9, target: [0, 0, 0], focal: 1.9, weight: 2, tag: "title" },
];

/**
 * Membrane: a skin of nacre, close up, breathing slowly; something presses from underneath and the skin stretches
 * over it (a face, or the night's title), thin enough there to let the light behind it through. The build presses
 * harder; on the kick a pulse of light runs out along the veins; on the drop the light floods through the skin.
 */
export const skin = defineShaderScene({
  id: "flesh-skin",
  name: "Membrane",
  energy: "calm",
  hdr: true,
  renderScale: 0.75,
  camera: { framings: FRAMINGS, glideBars: 2 },
  description:
    "Une peau de nacre qui respire, filmée de près ; quelque chose pousse dessous (un visage, ou le titre de la soirée) et la tend jusqu'à laisser passer la lumière ; une impulsion court dans les veines au kick.",
  params: [paletteParam("flesh"), headParam("humain")],
  uniforms: () => ({
    ...headUniforms(),
    uPress: { value: 0 },
    uGlow: { value: 0 },
    uWave: { value: 9 },
    uTitle: { value: 0 },
  }),
  update(u, f, p, dt, ctx) {
    const title = p.head === TITLE_HEAD;
    setHead(u, p.head ?? "humain", "", p);
    u.uTitle.value = title ? 1 : 0;
    if (ctx.camera) ctx.camera.allow = title ? (fr) => fr.tag === "title" : (fr) => fr.tag !== "title";
    const bar = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;
    // What lies under the skin presses through the build, hardest on the drop, and sinks back in the breakdown
    const press = f.section === "build" ? 0.3 + 0.7 * f.buildProgress : f.section === "drop" ? 1 : f.section === "breakdown" ? 0 : 0.3;
    const pr = u.uPress.value as number;
    u.uPress.value = pr + (press - pr) * (1 - Math.exp(-dt / (bar * 2)));
    u.uGlow.value = f.drop ? 1 : (u.uGlow.value as number) * Math.exp(-dt / (bar * 1.5));
    u.uWave.value = f.beat ? 0 : (u.uWave.value as number) + dt;
  },
  fragment: /* glsl */ `
uniform float uPress;  // how hard the subject presses from under the skin
uniform float uGlow;   // the drop: the light floods through
uniform float uWave;   // seconds since the last kick
uniform float uTitle;  // the night's title under the skin
${ART_LIB}
${HEAD_GLSL}
${CAMERA_GLSL}
${DETAIL_GLSL}

/** The bare membrane: it breathes (a slow swell every ~6 s) and wrinkles very slowly. */
float memZ(vec2 xy) {
  float breath = .5 + .5 * sin(uTime * 1.05 + uSeed);
  return (.02 * breath + .015 * uPress) * exp(-dot(xy, xy) * .3) + (fbm3(vec3(xy * 1.3, uTime * .04 + uSeed)) - .5) * .03;
}

/** Into the subject's frame: just under the skin, rising with the pressure. */
vec3 toSubject(vec3 p) {
  float z0 = uTitle > .5 ? .03 - uHeadRelief.x * .2 + uPress * .05 : -.5 + uPress * .12;
  vec3 h = vec3(p.x, p.y + .05, p.z - z0);
  h.xz *= rot(.05 * sin(uTime * .07 + uSeed));
  return h;
}

float map(vec3 p) {
  float plane = (p.z - memZ(p.xy)) * .8;
  if (uHeadOn > 2.5) return plane;
  // the skin draped over what lies beneath
  return smin(plane, headD(toSubject(p)), uTitle > .5 ? .05 : .11);
}
${MARCH}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 ro = uCamPos;
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));
  vec3 col = uBase * .5;
  float t = march(ro, rd, 12.);
  if (t > 0.) {
    vec3 p = ro + rd * t;
    vec3 n = calcNormalE(p, clamp(t / (uRes.y * uFocal) * .8, .0008, .003));
    float ao = .5 + .5 * calcAO(p, n);
    // close up, the wet skin is finely uneven: its highlight breaks into a glisten
    float pix = pixelSize(t, n, rd);
    vec3 nm = bumpNoise(n, p, 30., .05, pix);
    vec3 L = normalize(vec3(-.55, .5, .7));
    float dif = clamp(dot(nm, L) * .8 + .2, 0., 1.);
    float fre = pow(1. - abs(dot(nm, -rd)), 2.);
    // how far the skin is pushed out by what lies beneath: there it is stretched thin
    float lift = p.z - memZ(p.xy);
    float thin = smoothstep(0., uTitle > .5 ? .06 : .22, lift);
    vec3 flesh = mix(uPal1 * .5, uInk * .7, .35 + .3 * vnoise(p * 2.5 + uSeed));
    vec3 c = flesh * (.1 + .65 * dif) * ao;
    // the light behind shows through the stretched skin, red, brighter with the bass and flooding on the drop
    c += uAccent * thin * (.45 + .4 * uBass + 1.6 * uGlow) * 1.3 + vec3(1., .55, .5) * thin * thin * (.3 + .6 * uGlow);
    // a pearl film, and the wet highlight
    vec3 film = .5 + .5 * cos(6.2831 * (fre * 1.4 + vec3(0., .33, .67) + p.x * .15 + p.y * .1));
    c += film * (.04 + .3 * fre);
    c += vec3(1., .95, .92) * pow(max(dot(reflect(rd, nm), L), 0.), 50.) * .3;
    // veins under the skin, running out from the centre and wavering, fading where the skin is stretched; on the
    // kick a pulse of light runs out along them
    float r = length(p.xy);
    float va = atan(p.y, p.x) * 7. + fbm3(vec3(p.xy * 1.2, uSeed)) * 5. + r * .6;
    float vs = abs(sin(va));
    float vein = pow(1. - vs, 10.) * smoothstep(.35, .65, fbm3(vec3(p.xy * .7, 4.1 + uSeed))) * smoothstep(.15, .6, r);
    float pulse = exp(-pow((r - uWave * 1.8) * 4., 2.)) * exp(-uWave * 1.1);
    c = mix(c, uAccent * .25 + uPal1 * .05, vein * .45 * (1. - thin));
    c += mix(uAccent, vec3(1., .82, .78), .4) * vein * pulse * 2.2;
    // close up, finer veinlets between them, soft and coming and going (no hard isolines: they read as doodles)
    float fa = atan(p.y, p.x) * 23. + fbm3(vec3(p.xy * 2.6, 2.3 + uSeed)) * 7. + r * 2.;
    float fine = pow(1. - abs(sin(fa)), 14.) * smoothstep(.45, .7, fbm3(vec3(p.xy * 1.8, 7.7 + uSeed))) * resolved(.012, pix);
    c = mix(c, uAccent * .22, fine * .3 * (1. - thin));
    // the skin fades into the dark away from the centre: an intimate close-up
    col = mix(col, c, 1. - smoothstep(1.4, 3.2, r));
  }
  gl_FragColor = vec4(hdrOut(col * 1.1), 1.);
}
`,
});
