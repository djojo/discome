import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { num } from "../utils";
import { ART_LIB } from "./lib.glsl";

/** Brutalist concrete towers under a single low sun; the sun changes side on every drop. */
export const monolith = defineShaderScene({
  id: "monolith",
  name: "Monolithe",
  energy: "calm",
  renderScale: 0.6,
  mask: true,
  description: "Architecture brutaliste, un seul soleil rasant : les blocs montent sur les basses, le soleil change de côté à chaque drop.",
  params: [
    paletteParam("concrete"),
    { type: "range", key: "speed", label: "Vitesse", min: 0, max: 2, step: 0.05, default: 1 },
    { type: "range", key: "sun", label: "Hauteur du soleil", min: 0.05, max: 0.6, step: 0.01, default: 0.2 },
  ],
  uniforms: () => ({ uTravel: { value: 0 }, uSunAz: { value: 0.7 }, uSunTarget: { value: 0.7 }, uSunEl: { value: 0.2 }, uBar: { value: 0 } }),
  update(u, f, p, dt) {
    u.uTravel.value = (u.uTravel.value as number) + dt * 0.45 * num(p.speed, 1);
    if (f.drop) u.uSunTarget.value = (u.uSunTarget.value as number) + 2.1;
    const az = u.uSunAz.value as number;
    u.uSunAz.value = az + ((u.uSunTarget.value as number) - az) * (1 - Math.exp(-dt * 1.5));
    u.uSunEl.value = num(p.sun, 0.2);
    u.uBar.value = f.bar;
  },
  fragment: /* glsl */ `
uniform float uTravel;
uniform float uSunAz;
uniform float uSunEl;
uniform float uBar;
${ART_LIB}
vec3 gSun;
float cellH(vec2 c) {
  float rise = step(.62, hash12(c + uBar * 7.31)) * uBass * .7;
  float h = hash12(c);
  return .6 + h * h * 4. + rise;
}
float block(vec2 c, vec3 p, vec2 cs) {
  if (abs(c.x + .5) <= 1. || hash12(c * 1.7 + 3.1) <= .25) return 1e3;
  vec2 lp = p.xz - (c + .5) * cs;
  vec2 off = (vec2(hash12(c + 5.), hash12(c + 9.)) - .5) * .7;
  vec2 sz = vec2(.32 + .45 * hash12(c + 2.), .32 + .45 * hash12(c + 7.));
  float h = cellH(c);
  return sdBox(vec3(lp.x - off.x, p.y - h, lp.y - off.y), vec3(sz.x, h, sz.y));
}
float map(vec3 p) {
  float d = p.y;
  vec2 cs = vec2(2.6);
  vec2 c = floor(p.xz / cs);
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) d = min(d, block(c + vec2(i, j), p, cs));
  return d;
}
float marchB(vec3 ro, vec3 rd) {
  float t = .02;
  for (int i = 0; i < 110; i++) {
    float d = map(ro + rd * t);
    if (d < .001 * t) return t;
    t += d;
    if (t > 45.) break;
  }
  return -1.;
}
float shadow(vec3 ro, vec3 rd) {
  float res = 1., t = .05;
  for (int i = 0; i < 40; i++) {
    float h = map(ro + rd * t);
    res = min(res, 14. * h / t);
    t += clamp(h, .03, .5);
    if (res < .01 || t > 20.) break;
  }
  return clamp(res, 0., 1.);
}
vec3 nrm(vec3 p) { const vec2 e = vec2(.002, 0.); return normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx))); }
void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  float az = uSunAz + .35 * sin(uTime * .05);
  gSun = normalize(vec3(cos(az) * .9, uSunEl, sin(az) * .9));
  vec3 ro = vec3(0., .45, -uTravel);
  vec3 ta = ro + vec3(.25 * sin(uTime * .1), 1.25, -4.);
  vec3 rd = lookAt(ro, ta) * normalize(vec3(uv, 1.25));
  vec3 sky = mix(uInk * .9, uBase * 1.6, clamp(rd.y * 1.6, 0., 1.));
  sky += uAccent * pow(max(dot(rd, gSun), 0.), 24.) * .55;
  vec3 col = sky;
  float t = marchB(ro, rd);
  if (t > 0.) {
    vec3 p = ro + rd * t;
    vec3 n = nrm(p);
    float sh = shadow(p + n * .01, gSun);
    float dif = clamp(dot(n, gSun), 0., 1.) * sh;
    float amb = .5 + .5 * n.y;
    float conc = .92 + .08 * vnoise(p * 2.3);
    vec3 alb = uInk * .9 * conc;
    col = alb * (dif * uAccent * 3.3 * (1. + uDrop) + amb * uBase * 1.8);
    col = mix(col, sky, 1. - exp(-t * .028));
  }
  float l = dot(col, vec3(.3, .59, .11));
  col = mix(vec3(l), col, .78);
  col = mix(col * vec3(.92, .96, 1.06), col * vec3(1.06, 1., .92), smoothstep(.1, .7, l));
  col = aces(col * .95);
  col *= vignette(fc / uRes);
  col += grain(fc) * .04;
  gl_FragColor = vec4(col * letterbox(fc), step(0., t));
}
`,
});
