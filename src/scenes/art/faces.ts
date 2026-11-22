import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { num } from "../utils";
import { ART_LIB, MARCH } from "./lib.glsl";

/** Head turned by `gYaw` and lowered a touch so it sits well in a portrait or 16:9 frame. */
const HEAD_MAP = /* glsl */ `
float gYaw;
vec3 toHead(vec3 p) { p.y += .1; p.xz *= rot(gYaw); return p; }
float map(vec3 p) { return sdHead(toHead(p)); }
${MARCH}
`;

/** Wide frames get a slightly longer lens so the head keeps the same presence. */
const CAMERA = /* glsl */ `
float focal = uRes.x / uRes.y > 1.2 ? 2.6 : 2.15;
vec3 ro = vec3(0., .05, 3.4);
vec3 rd = lookAt(ro, vec3(0., -.12, 0.)) * normalize(vec3(uv, focal));
`;

export const topoHead = defineShaderScene({
  id: "topo-head",
  name: "Topographie",
  tag: "Visage",
  energy: "medium",
  renderScale: 0.85,
  mask: true,
  description: "Le visage n'existe que par ses lignes de niveau ; au drop, elles basculent en profondeur.",
  params: [
    paletteParam("mono"),
    { type: "range", key: "density", label: "Densité des lignes", min: 10, max: 60, step: 1, default: 26 },
    { type: "range", key: "turn", label: "Rotation du visage", min: 0, max: 1.5, step: 0.05, default: 1 },
  ],
  uniforms: () => ({ uDensity: { value: 26 }, uTurn: { value: 1 } }),
  update(u, _f, p) {
    u.uDensity.value = num(p.density, 26);
    u.uTurn.value = num(p.turn, 1);
  },
  fragment: /* glsl */ `
uniform float uDensity;
uniform float uTurn;
${ART_LIB}
${HEAD_MAP}
void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  gYaw = sin(uTime * .25) * .75 * uTurn;
  ${CAMERA}
  vec3 col = uBase;
  float tt = march(ro, rd, 8.);
  if (tt > 0.) {
    vec3 p = ro + rd * tt;
    vec3 n = calcNormal(p);
    vec3 h = toHead(p);
    float dm = smoothstep(.35, .8, uDrop);
    float f = mix(h.y, h.z, dm) * uDensity + uBass * .5 * sin(h.x * 6. - uTime * 2.);
    float w = fwidth(f);
    float dist = abs(fract(f + .5) - .5);
    float line = 1. - smoothstep(.5 * w, 1.6 * w, dist);
    float light = .2 + .8 * clamp(dot(n, normalize(vec3(-.5, .5, .75))), 0., 1.);
    col = mix(uBase, uInk, line * light);
  }
  gl_FragColor = vec4(col, step(0., tt)); // alpha = silhouette, keeps the background behind the face
}
`,
});

export const profileHead = defineShaderScene({
  id: "profile-head",
  name: "Profil",
  tag: "Visage",
  energy: "calm",
  renderScale: 0.85,
  mask: true,
  description: "Seul le contour du profil, éclairé à contre-jour ; un second contour d'accent s'allume à la montée et au drop.",
  params: [
    paletteParam("porcelain"),
    { type: "range", key: "sweep", label: "Balayage de la lumière", min: 0, max: 2, step: 0.05, default: 1 },
  ],
  uniforms: () => ({ uSweep: { value: 1 } }),
  update(u, _f, p) {
    u.uSweep.value = num(p.sweep, 1);
  },
  fragment: /* glsl */ `
uniform float uSweep;
${ART_LIB}
${HEAD_MAP}
void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  gYaw = -PI * .5 + sin(uTime * .2) * .12;
  float focal = uRes.x / uRes.y > 1.2 ? 2.6 : 2.15;
  vec3 ro = vec3(0., .05, 4.);
  vec3 rd = lookAt(ro, vec3(0., -.12, 0.)) * normalize(vec3(uv, focal));
  vec3 col = uBase + uInk * .025 * exp(-length(uv - vec2(.12, .15)) * 1.6);
  float tt = march(ro, rd, 8.);
  if (tt > 0.) {
    vec3 p = ro + rd * tt;
    vec3 n = calcNormal(p);
    float edge = 1. - abs(dot(n, -rd));
    vec3 Lb = normalize(vec3(-.55 + .25 * sin(uTime * .3 * uSweep), .35, -1.));
    float rim = pow(edge, 2.) * clamp(dot(n, Lb) * .8 + .35, 0., 1.);
    rim = smoothstep(.1, .5, rim);
    col = uInk * rim * (1.1 + .7 * uBeat * uBass);
    col += uInk * .04 * clamp(dot(n, normalize(vec3(-.3, .5, .8))), 0., 1.);
    vec3 Lr = normalize(vec3(.8, .1, -.6));
    float rimR = smoothstep(.1, .5, pow(edge, 2.) * clamp(dot(n, Lr) * .8 + .2, 0., 1.));
    col += uAccent * rimR * (uDrop * 2. + uBuild * .8);
  }
  gl_FragColor = vec4(col, step(0., tt)); // alpha = silhouette, keeps the background behind the face
}
`,
});

export const halftoneHead = defineShaderScene({
  id: "halftone-head",
  name: "Trame",
  tag: "Visage",
  energy: "medium",
  renderScale: 0.9,
  mask: true,
  description: "Visage en demi-teinte de sérigraphie : la lumière tourne, le drop inverse l'image.",
  params: [
    paletteParam("porcelain"),
    { type: "range", key: "cells", label: "Finesse de la trame", min: 30, max: 120, step: 1, default: 62 },
    { type: "range", key: "turn", label: "Rotation du visage", min: 0, max: 1.5, step: 0.05, default: 1 },
  ],
  uniforms: () => ({ uCells: { value: 62 }, uTurn: { value: 1 } }),
  update(u, _f, p) {
    u.uCells.value = num(p.cells, 62);
    u.uTurn.value = num(p.turn, 1);
  },
  fragment: /* glsl */ `
uniform float uCells;
uniform float uTurn;
${ART_LIB}
${HEAD_MAP}
void main() {
  vec2 fc = gl_FragCoord.xy;
  float cell = max(4., uRes.y / uCells);
  vec2 cc = (floor(fc / cell) + .5) * cell;
  vec2 uv = (cc - .5 * uRes) / uRes.y;
  gYaw = sin(uTime * .22) * .6 * uTurn;
  ${CAMERA}
  float s = 0.;
  float tt = march(ro, rd, 8.);
  if (tt > 0.) {
    vec3 p = ro + rd * tt;
    vec3 n = calcNormal(p);
    float a = uTime * .35;
    vec3 L = normalize(vec3(cos(a) * .8, .45, .65 + .3 * sin(a)));
    s = clamp(dot(n, L), 0., 1.) * (.4 + .6 * calcAO(p, n));
    s = pow(s, .8);
  }
  vec2 local = (fc - cc) / cell;
  float r = sqrt(s) * .62 * (1. + .12 * uBeat * uBass);
  float dotm = 1. - smoothstep(r - .07, r + .07, length(local));
  vec3 col = mix(uBase * .5, uInk, dotm);
  if (uDrop > .7) col = uInk - col * .95;
  gl_FragColor = vec4(col, step(0., tt)); // alpha = silhouette, keeps the background behind the face
}
`,
});
