import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { num } from "../utils";
import { ART_LIB, MARCH } from "./lib.glsl";

/** A chrome mask rising from a bath of liquid metal; colour only exists in the reflections. */
export const mercury = defineShaderScene({
  id: "mercury",
  name: "Mercure",
  tag: "Visage",
  energy: "medium",
  renderScale: 0.7,
  mask: true,
  description: "Masque chromé qui émerge d'un bain de métal liquide ; les basses font des ondes, le drop soulève le bain.",
  params: [
    paletteParam("mercury"),
    { type: "range", key: "swell", label: "Houle", min: 0, max: 2, step: 0.05, default: 1 },
    { type: "range", key: "orbit", label: "Orbite de la caméra", min: 0, max: 2, step: 0.05, default: 1 },
  ],
  uniforms: () => ({ uSwell: { value: 1 }, uAngle: { value: 0 } }),
  update(u, _f, p, dt) {
    u.uSwell.value = num(p.swell, 1);
    u.uAngle.value = (u.uAngle.value as number) + dt * 0.06 * num(p.orbit, 1);
  },
  fragment: /* glsl */ `
uniform float uSwell;
uniform float uAngle;
${ART_LIB}
float liquidH(vec2 xz) {
  float r = length(xz);
  float w = .035 * sin(r * 9. - uTime * 2.6) * exp(-r * .55) * (.25 + uBass) * uSwell;
  w += uDrop * .14 * sin(r * 5. - uTime * 7.) * exp(-r * .45) * uSwell;
  w += .012 * sin(xz.x * 3.1 + uTime * .7) * sin(xz.y * 2.7 - uTime * .5);
  return -.32 + w;
}
float map(vec3 p) {
  float lq = (p.y - liquidH(p.xz)) * .75;
  vec3 h = p - vec3(0., .02 + .04 * sin(uTime * .4) - uDrop * .1, 0.);
  h.xz *= rot(sin(uTime * .17) * .35);
  h.yz *= rot(.5);
  return smin(lq, sdHead(h), .16);
}
${MARCH}
vec3 env(vec3 r) {
  float az = atan(r.z, r.x) + uTime * .07;
  float el = r.y;
  vec3 c = uBase * 1.3 + uInk * .27 * smoothstep(-.05, .95, el) + uAccent * .04 * (1. - smoothstep(-.4, .1, el));
  float a1 = abs(mod(az - .8 + PI, 2. * PI) - PI);
  c += uAccent * 3.6 * (1. - smoothstep(.015, .04, abs(el - .28))) * (1. - smoothstep(.5, .75, a1));
  float a2 = abs(mod(az + 2.3 + PI, 2. * PI) - PI);
  c += uPal1 * 3. * (1. - smoothstep(.02, .05, abs(el - .08))) * (1. - smoothstep(.7, .95, a2));
  c += vec3(1.) * 1.1 * smoothstep(.9, .98, el);
  return c;
}
void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 ro = vec3(sin(uAngle) * 3.6, .45, cos(uAngle) * 3.6);
  vec3 rd = lookAt(ro, vec3(0., -.05, 0.)) * normalize(vec3(uv, 2.1));
  vec3 bg = uBase;
  vec3 col = bg;
  float tt = march(ro, rd, 14.);
  if (tt > 0.) {
    vec3 p = ro + rd * tt;
    vec3 n = calcNormal(p);
    float fre = pow(1. - clamp(dot(n, -rd), 0., 1.), 5.);
    col = env(reflect(rd, n)) * mix(uInk * .85, vec3(1.), fre);
    col *= .55 + .45 * calcAO(p, n);
    col = mix(col, bg, smoothstep(4., 12., tt));
  }
  col = aces(col);
  col *= vignette(fc / uRes);
  gl_FragColor = vec4(col, step(0., tt));
}
`,
});
