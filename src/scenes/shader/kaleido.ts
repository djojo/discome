import { defineShaderScene } from "./defineShaderScene";
import { paletteParam } from "../palettes";
import { num } from "../utils";

export const kaleido = defineShaderScene({
  id: "kaleido",
  name: "Kaléidoscope",
  description: "Fractale repliée en kaléidoscope, pulsée par le kick.",
  params: [
    paletteParam("acid"),
    { type: "range", key: "segments", label: "Miroirs", min: 2, max: 16, step: 1, default: 8 },
    { type: "range", key: "zoom", label: "Zoom", min: 0.3, max: 3, step: 0.05, default: 1 },
    { type: "range", key: "complexity", label: "Complexité", min: 1, max: 6, step: 1, default: 4 },
    { type: "range", key: "spin", label: "Rotation", min: -2, max: 2, step: 0.05, default: 0.5 },
    { type: "range", key: "hueSpeed", label: "Vitesse des couleurs", min: 0, max: 2, step: 0.05, default: 0.6 },
  ],
  uniforms: () => ({
    uSegments: { value: 8 },
    uZoom: { value: 1 },
    uIter: { value: 4 },
    uSpin: { value: 0 },
    uHue: { value: 0 },
  }),
  update(u, f, p, dt) {
    u.uSegments.value = num(p.segments, 8);
    u.uZoom.value = num(p.zoom, 1);
    u.uIter.value = num(p.complexity, 4);
    u.uSpin.value = (u.uSpin.value as number) + dt * num(p.spin) * (0.3 + f.mid);
    u.uHue.value = (u.uHue.value as number) + dt * num(p.hueSpeed) * (0.2 + f.volume * 0.6);
  },
  fragment: /* glsl */ `
uniform float uSegments;
uniform float uZoom;
uniform float uIter;
uniform float uSpin;
uniform float uHue;

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
  uv *= rot(uSpin);

  // Kaleidoscope fold
  float seg = 6.2831853 / uSegments;
  float a = atan(uv.y, uv.x);
  float r = length(uv);
  a = abs(mod(a + seg * 0.5, seg) - seg * 0.5);
  uv = vec2(cos(a), sin(a)) * r;
  uv *= uZoom * (1.0 - 0.18 * uBeat - 0.08 * uBass);

  vec2 uv0 = uv;
  vec3 col = vec3(0.0);
  float t = uEnergy * 0.5;
  for (float i = 0.0; i < 6.0; i++) {
    if (i >= uIter) break;
    uv = fract(uv * (1.45 + 0.12 * uBass)) - 0.5;
    float d = length(uv) * exp(-length(uv0));
    vec3 c = pal(length(uv0) + i * 0.4 + uHue);
    d = sin(d * (8.0 + 3.0 * uMid) + t) / 8.0;
    d = abs(d);
    d = pow((0.007 + 0.01 * uTreble + 0.008 * uBeat) / d, 1.2);
    col += c * d;
  }
  col = col / (1.0 + col * 0.3);
  gl_FragColor = vec4(col, 1.0);
}
`,
});
