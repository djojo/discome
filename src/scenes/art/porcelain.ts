import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { num } from "../utils";
import { ART_LIB, MARCH } from "./lib.glsl";

/** A white ceramic head, split by an inner light that opens on the bass and bursts on the drop. */
export const porcelain = defineShaderScene({
  id: "porcelain",
  name: "Porcelaine",
  tag: "Visage",
  energy: "calm",
  renderScale: 0.75,
  mask: true,
  description: "Visage de céramique fendu par une lumière intérieure : les basses l'entrouvrent, le drop l'ouvre.",
  params: [
    paletteParam("porcelain"),
    { type: "range", key: "open", label: "Ouverture", min: 0, max: 2, step: 0.05, default: 1 },
    { type: "range", key: "turn", label: "Rotation du visage", min: 0, max: 1.5, step: 0.05, default: 1 },
    { type: "toggle", key: "cinema", label: "Format cinéma 2.39", default: true },
  ],
  uniforms: () => ({ uOpen: { value: 1 }, uTurn: { value: 1 }, uCinema: { value: 1 } }),
  update(u, _f, p) {
    u.uOpen.value = num(p.open, 1);
    u.uTurn.value = num(p.turn, 1);
    u.uCinema.value = p.cinema === false ? 0 : 1;
  },
  fragment: /* glsl */ `
uniform float uOpen;
uniform float uTurn;
uniform float uCinema;
${ART_LIB}
float gGap, gYaw, gPitch;
vec3 toHead(vec3 p) { p.y += .12; p.yz *= rot(gPitch); p.xz *= rot(gYaw); return p; }
float map(vec3 p) {
  vec3 h = toHead(p);
  float dl = max(sdHead(h + vec3(gGap, 0., 0.)), h.x + gGap);
  float dr = max(sdHead(h - vec3(gGap, 0., 0.)), gGap - h.x);
  return min(dl, dr);
}
${MARCH}
void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  float t = uTime;
  gGap = .002 + (.012 * uBass * uBass + .07 * uDrop) * uOpen;
  gYaw = sin(t * .21) * .55 * uTurn;
  gPitch = -.06 + sin(t * .13) * .06;
  vec3 ro = vec3(.35, .1, 4.6);
  vec3 rd = lookAt(ro, vec3(0., -.22, 0.)) * normalize(vec3(uv, 1.95));
  vec3 col = uBase * .9 + uInk * .07 * exp(-2.4 * length(uv - vec2(.3, .12)));
  float tt = march(ro, rd, 8.);
  if (tt > 0.) {
    vec3 p = ro + rd * tt;
    vec3 n = calcNormal(p);
    vec3 h = toHead(p);
    float ao = calcAO(p, n);
    vec3 L = normalize(vec3(-.65, .6, .55));
    float dif = clamp(dot(n, L) * .85 + .15, 0., 1.);
    dif *= dif * (3. - 2. * dif);
    float spe = pow(clamp(dot(reflect(-L, n), -rd), 0., 1.), 48.);
    float fre = pow(1. - clamp(dot(n, -rd), 0., 1.), 5.);
    col = uInk * (dif * vec3(1.1, 1.04, .96) + vec3(.06, .065, .08) * (.5 + .5 * n.y)) * ao;
    col += spe * .3 + fre * vec3(.22, .24, .28) * ao;
    col += pow(clamp(dot(n, normalize(vec3(.9, .25, -.5))), 0., 1.), 3.) * .15;
    float seam = abs(abs(h.x) - gGap);
    float cutFace = (1. - smoothstep(0., .003, seam)) * step(.004, gGap);
    float depth = max(0., -sdHead(vec3(0., h.yz)));
    vec3 inner = uAccent * (.25 + 2.2 * exp(-depth * 9.)) * (1. + 2. * uDrop) + mix(uAccent, vec3(1.), .7) * exp(-depth * 40.) * uDrop;
    col = mix(col, inner, cutFace);
    col += uAccent * exp(-seam * 110.) * (.35 + 1.6 * uBeat * uBass + 3. * uDrop);
  }
  col = aces(col * 1.05);
  col *= vignette(fc / uRes);
  float lb = uCinema > .5 ? letterbox(fc) : 1.;
  // Letterbox bars stay opaque: the background never shows through them
  gl_FragColor = vec4(col * lb, max(step(0., tt), 1. - lb));
}
`,
});
