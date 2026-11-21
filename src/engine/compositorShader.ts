/**
 * Final pass: mixes the outgoing (A) and incoming (B) scenes with the active
 * transition, then merges the layer (L) on top.
 * Transition and blend codes follow the order of TRANSITIONS / BLEND_MODES.
 */
export const COMPOSITOR_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const COMPOSITOR_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uA;
uniform sampler2D uB;
uniform sampler2D uL;
uniform float uHasB;
uniform float uHasL;
uniform float uProgress;
uniform int uTransition;
uniform int uLayerMode;
uniform float uLayerOpacity;
uniform float uTime;
uniform vec2 uRes;
uniform float uTension;
uniform float uBeatPulse;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 A(vec2 uv) { return texture2D(uA, uv).rgb; }
vec3 B(vec2 uv) { return texture2D(uB, uv).rgb; }

vec3 zoomBlurB(vec2 uv, float amount) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float s = 1.0 - amount * float(i) / 8.0;
    acc += B(0.5 + (uv - 0.5) * s);
  }
  return acc / 8.0;
}

vec3 transition(vec2 uv) {
  float p = clamp(uProgress, 0.0, 1.0);
  if (uHasB < 0.5) return A(uv);

  if (uTransition == 0) return B(uv);

  if (uTransition == 1) return mix(A(uv), B(uv), smoothstep(0.0, 1.0, p));

  if (uTransition == 2) {
    // Punch: A rushes toward the viewer, B lands from a zoomed, blurred state, white hit in between
    vec3 a = A(0.5 + (uv - 0.5) * (1.0 - 0.35 * p));
    vec3 b = zoomBlurB(0.5 + (uv - 0.5) * (1.0 - 0.25 * (1.0 - p)), 0.3 * (1.0 - p));
    float hit = exp(-pow((p - 0.3) * 8.0, 2.0));
    return mix(a, b, smoothstep(0.2, 0.45, p)) + hit * 0.55;
  }

  if (uTransition == 3) {
    // Glitch: blocks flip from A to B, rows slide, RGB channels split
    float intensity = sin(p * 3.14159);
    float t = floor(uTime * 24.0);
    vec2 cell = floor(uv * vec2(18.0, 10.0));
    float row = hash(vec2(cell.y, t));
    vec2 guv = uv + vec2((row - 0.5) * 0.18 * intensity * step(0.55, row), 0.0);
    float s = 0.015 * intensity;
    vec3 a = vec3(A(guv + vec2(s, 0.0)).r, A(guv).g, A(guv - vec2(s, 0.0)).b);
    vec3 b = vec3(B(guv + vec2(s, 0.0)).r, B(guv).g, B(guv - vec2(s, 0.0)).b);
    return mix(a, b, step(hash(cell + t), p));
  }

  if (uTransition == 4) {
    // Luma wipe: dark areas of A give way first
    float l = luma(A(uv));
    float th = p * 1.3 - 0.15;
    return mix(A(uv), B(uv), smoothstep(l - 0.15, l + 0.15, th));
  }

  if (uTransition == 5) {
    // Iris: B opens from the centre with a glowing ring
    vec2 d = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    float r = length(d);
    float R = p * 1.15;
    float inside = 1.0 - smoothstep(R - 0.03, R, r);
    float ring = smoothstep(R - 0.06, R, r) * (1.0 - smoothstep(R, R + 0.015, r));
    return mix(A(uv), B(uv), inside) + ring * (1.0 - p) * 0.8;
  }

  // Flash: A burns to white, white resolves into B
  float w = 1.0 - abs(p * 2.0 - 1.0);
  vec3 base = p < 0.5 ? A(uv) : B(uv);
  return mix(base, vec3(1.0), pow(w, 1.4));
}

vec3 blendLayer(vec3 base, vec3 l) {
  if (uLayerMode == 0) return base + l;
  if (uLayerMode == 1) return 1.0 - (1.0 - clamp(base, 0.0, 1.0)) * (1.0 - clamp(l, 0.0, 1.0));
  if (uLayerMode == 2) return abs(base - l);
  if (uLayerMode == 3) return base * l;
  return base * smoothstep(0.05, 0.4, luma(l));
}

void main() {
  // Build-up tension: the frame pushes in on every beat and lifts toward white
  float push = uTension * (0.35 + 0.65 * uBeatPulse);
  vec2 uv = 0.5 + (vUv - 0.5) * (1.0 - 0.07 * push);
  vec3 col = transition(uv);
  col += vec3(0.35) * uTension * uTension * uBeatPulse;
  if (uHasL > 0.5) col = mix(col, blendLayer(col, texture2D(uL, vUv).rgb), uLayerOpacity);
  gl_FragColor = vec4(col, 1.0);
}
`;
