import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { num } from "../utils";
import { ART_LIB } from "./lib.glsl";

/** A nave of light arches in a single colour, haze and a wet mirror floor. */
export const cathedral = defineShaderScene({
  id: "cathedral",
  name: "Cathédrale",
  energy: "intense",
  renderScale: 0.7,
  description: "Nef d'arches lumineuses d'une seule couleur : chaque temps envoie une vague vers toi, le drop allume toute la nef.",
  params: [
    paletteParam("signalRed"),
    { type: "range", key: "speed", label: "Vitesse", min: 0, max: 3, step: 0.05, default: 1 },
    { type: "range", key: "haze", label: "Brume", min: 0, max: 2, step: 0.05, default: 1 },
  ],
  uniforms: () => ({ uTravel: { value: 0 }, uHaze: { value: 1 }, uBeatPhase: { value: 0 } }),
  update(u, f, p, dt) {
    u.uTravel.value = (u.uTravel.value as number) + dt * 1.1 * num(p.speed, 1) * (0.7 + f.bass * 0.6);
    u.uHaze.value = num(p.haze, 1);
    u.uBeatPhase.value = f.bpm > 0 ? f.beatPhase : (f.time * 2) % 1;
  },
  fragment: /* glsl */ `
uniform float uTravel;
uniform float uHaze;
uniform float uBeatPhase;
${ART_LIB}
float arch2(vec2 q) {
  float w = 1.05, h = .35, R = w * 1.55;
  float x = abs(q.x);
  vec2 v = vec2(x + (R - w), q.y - h);
  float tmax = acos((R - w) / R);
  float ang = atan(v.y, v.x);
  float arc;
  if (ang >= 0. && ang <= tmax) arc = abs(length(v) - R);
  else arc = min(length(vec2(x - w, q.y - h)), length(vec2(x, q.y - (h + R * sin(tmax)))));
  float pil = length(vec2(x - w, q.y - clamp(q.y, -1., h)));
  return min(arc, pil);
}
float frameD(vec3 p, out float id) {
  float S = 1.7;
  id = floor(p.z / S + .5);
  float z = p.z - S * id;
  return length(vec2(arch2(p.xy), z)) - .012;
}
float bright(float id, float camId) {
  float rel = camId - id;
  float pos = 9. * (1. - uBeatPhase);
  float wave = exp(-pow(rel - pos, 2.) * 1.2) * smoothstep(.2, .45, uBass);
  float breathe = .5 + .5 * sin(uTime * 1.3 + id * .4);
  float build = uBuild * step(.5, fract(uTime * 2. * (1. + 3. * uBuild))) * .8;
  return .35 + .2 * breathe + 2.2 * wave + build * 1.5 + 2.5 * uDrop;
}
void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  float camZ = -uTravel;
  vec3 ro = vec3(sin(uTime * .21) * .08, -.35, camZ);
  vec3 rd = normalize(vec3(uv.x, uv.y + .04, -1.6));
  rd.xz *= rot(sin(uTime * .17) * .05);
  float camId = floor(camZ / 1.7 + .5);
  vec3 acc = vec3(0.);
  float atten = 1.;
  float t = 0.;
  for (int i = 0; i < 140; i++) {
    vec3 p = ro + rd * t;
    if (p.y < -1. && rd.y < 0.) {
      ro = vec3(p.x, -1., p.z);
      rd.y = -rd.y;
      t = .01;
      atten *= .45;
      continue;
    }
    float id;
    float d = frameD(p, id);
    float stepL = max(d * .6, .02);
    acc += atten * uInk * bright(id, camId) * (.0025 / (.0012 + d * d * 5.)) * stepL * 9.;
    t += stepL;
    if (t > 26.) break;
  }
  vec3 col = acc;
  float lum = dot(col, vec3(.3, .59, .11));
  col = mix(col, uAccent * lum * 1.4, smoothstep(.6, 2.4, lum));
  col += uInk * .02 * uHaze * (1. + 2. * uDrop) * (1. - abs(uv.y) * 1.2);
  col = 1. - exp(-col * 1.3);
  col *= vignette(fc / uRes);
  col += grain(fc) * .03;
  gl_FragColor = vec4(col * letterbox(fc), 1.);
}
`,
});
