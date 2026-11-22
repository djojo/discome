import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { num } from "../utils";
import { ART_LIB, MARCH } from "./lib.glsl";

/** Organic matter, translucent and pearly, that breathes with the music. */
export const flesh = defineShaderScene({
  id: "flesh",
  name: "Chair",
  energy: "calm",
  renderScale: 0.7,
  mask: true,
  description: "Matière organique translucide et nacrée : contractions sur les basses, frémissement sur les aigus.",
  params: [
    paletteParam("flesh"),
    { type: "range", key: "breath", label: "Respiration", min: 0, max: 2, step: 0.05, default: 1 },
    { type: "range", key: "detail", label: "Relief", min: 0.6, max: 2, step: 0.05, default: 1.1 },
  ],
  uniforms: () => ({ uBreath: { value: 1 }, uDetail: { value: 1.1 } }),
  update(u, _f, p) {
    u.uBreath.value = num(p.breath, 1);
    u.uDetail.value = num(p.detail, 1.1);
  },
  fragment: /* glsl */ `
uniform float uBreath;
uniform float uDetail;
${ART_LIB}
float map(vec3 p) {
  p.xz *= rot(uTime * .07);
  p.xy *= rot(uTime * .05);
  float pulse = 1. + (.035 * uBeat * smoothstep(.2, .5, uBass) + .09 * uDrop) * uBreath;
  float d = length(p) - pulse * .9;
  d -= (fbm3(p * uDetail + vec3(0., uTime * .12, 0.)) - .5) * (.5 + uHat * .04);
  d = smin(d, length(p - vec3(1.05 * sin(uTime * .3), .6 * cos(uTime * .23), .4)) - .34, .38);
  d = smin(d, length(p - vec3(-.9, -.7 * sin(uTime * .27), .5 * cos(uTime * .31))) - .27, .32);
  return d * .7;
}
${MARCH}
void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 ro = vec3(0., 0., 4.4);
  vec3 rd = normalize(vec3(uv, -2.));
  vec3 col = uBase + uAccent * .12 * exp(-length(uv - vec2(.05, .1)) * 2.);
  float tt = march(ro, rd, 7.);
  if (tt > 0.) {
    vec3 p = ro + rd * tt;
    vec3 n = calcNormal(p);
    float ao = calcAO(p, n);
    vec3 F = normalize(vec3(-.5, .25, .8));
    vec3 L = normalize(vec3(.45, .7, -.6));
    float dif = clamp(dot(n, F) * .5 + .5, 0., 1.);
    float sss = clamp(map(p + L * .3) / .3, 0., 1.);
    float fre = pow(1. - clamp(dot(n, -rd), 0., 1.), 3.);
    vec3 glow = mix(uAccent, vec3(1., .42, .3), .6);
    col = mix(uPal1 * .55, uInk, dif * dif) * (.12 + .68 * dif);
    col *= mix(uAccent * 1.2, vec3(1.), ao * ao);
    col += glow * sss * (.25 + .45 * uBass);
    col += glow * pow(fre, 1.5) * clamp(dot(n, L) + .4, 0., 1.) * .9;
    float s = pow(clamp(dot(reflect(-F, n), -rd), 0., 1.), 28.);
    vec3 irid = .5 + .5 * cos(6.2831 * (fre * 1.3 + vec3(0., .33, .67)));
    col += s * .3 * mix(vec3(1.), irid, .6) + fre * irid * .1;
  }
  col = aces(col * 1.1);
  col *= vignette(fc / uRes);
  col += grain(fc) * .035;
  gl_FragColor = vec4(col, step(0., tt));
}
`,
});
