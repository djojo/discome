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
// post-effects
uniform sampler2D uPrev;
uniform float uHasPrev;
uniform float uTrails;
uniform float uChroma;
uniform float uScan;
uniform float uCrt;
uniform float uGrain;
uniform float uVhs;
uniform float uVignette;
uniform float uHue;
uniform float uSat;
uniform float uContrast;
uniform float uBright;
uniform float uMirror;
uniform float uPoster;
uniform float uStrobe;
uniform int uStrobeMode;
// background (fond)
uniform sampler2D uBg;
uniform sampler2D uBg2;
uniform float uHasBg;
uniform float uBgMix;
uniform float uBgOpacity;
uniform float uBgTint;
uniform float uBgBlur;
uniform vec3 uBgInk;
uniform float uMaskA;
uniform float uMaskB;
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

  float w = 1.0 - abs(p * 2.0 - 1.0);
  vec3 base = p < 0.5 ? A(uv) : B(uv);
  // Dip: A fades to black, B rises out of it (used between worlds)
  if (uTransition == 7) return base * (1.0 - smoothstep(0.0, 0.85, w));
  // Flash: A burns to white, white resolves into B
  return mix(base, vec3(1.0), pow(w, 1.4));
}

vec3 blendLayer(vec3 base, vec3 l) {
  if (uLayerMode == 0) return base + l;
  if (uLayerMode == 1) return 1.0 - (1.0 - clamp(base, 0.0, 1.0)) * (1.0 - clamp(l, 0.0, 1.0));
  if (uLayerMode == 2) return abs(base - l);
  if (uLayerMode == 3) return base * l;
  return base * smoothstep(0.05, 0.4, luma(l));
}

vec3 bgTap(vec2 uv) { return mix(texture2D(uBg, uv).rgb, texture2D(uBg2, uv).rgb, uBgMix); }

/** Soft, recoloured background: a small blur on top of the low-res render, then a duotone in the world's ink. */
vec3 background(vec2 uv) {
  vec2 px = uBgBlur / uRes;
  vec3 c = bgTap(uv) * .36;
  c += (bgTap(uv + vec2(px.x, 0.)) + bgTap(uv - vec2(px.x, 0.)) + bgTap(uv + vec2(0., px.y)) + bgTap(uv - vec2(0., px.y))) * .12;
  c += (bgTap(uv + px) + bgTap(uv - px) + bgTap(uv + vec2(px.x, -px.y)) + bgTap(uv + vec2(-px.x, px.y))) * .04;
  float l = luma(c);
  c = mix(c, uBgInk * l, uBgTint);
  return c * uBgOpacity;
}

/** Silhouette of the main scene (scenes that write it in alpha); 0 = free for the background. */
float cover(vec2 uv) {
  float a = uMaskA > 0.5 ? texture2D(uA, uv).a : 0.0;
  if (uHasB < 0.5) return a;
  float b = uMaskB > 0.5 ? texture2D(uB, uv).a : 0.0;
  return mix(a, b, smoothstep(0.0, 1.0, clamp(uProgress, 0.0, 1.0)));
}

vec3 composite(vec2 uv) {
  vec3 col = transition(uv);
  // The background lives in the dark areas of the main scene, and never inside its subject
  if (uHasBg > 0.5) col += background(uv) * (1.0 - smoothstep(0.03, 0.35, luma(col))) * (1.0 - cover(uv));
  if (uHasL > 0.5) col = mix(col, blendLayer(col, texture2D(uL, uv).rgb), uLayerOpacity);
  return col;
}

vec2 barrel(vec2 uv, float k) {
  vec2 c = uv * 2.0 - 1.0;
  c *= 1.0 + k * 0.18 * dot(c, c);
  return c * 0.5 + 0.5;
}

vec2 mirrorFold(vec2 uv, float n) {
  if (n < 1.5) return uv;
  float aspect = uRes.x / uRes.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  float seg = 6.2831853 / n;
  float a = abs(mod(atan(p.y, p.x) + seg * 0.5, seg) - seg * 0.5);
  p = vec2(cos(a), sin(a)) * length(p);
  return p / vec2(aspect, 1.0) + 0.5;
}

vec3 hueShift(vec3 c, float deg) {
  float a = radians(deg);
  vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

void main() {
  // Build-up tension: the frame pushes in on every beat and lifts toward white
  float push = uTension * (0.35 + 0.65 * uBeatPulse);
  vec2 uv = 0.5 + (vUv - 0.5) * (1.0 - 0.07 * push);

  uv = barrel(uv, uCrt);
  vec2 edge = abs(uv - 0.5) * 2.0;
  float inside = 1.0 - step(1.0, max(edge.x, edge.y));
  uv = mirrorFold(uv, uMirror);

  // Tape: per-line jitter + a tracking band drifting up the screen
  if (uVhs > 0.0) {
    float line = floor(uv.y * 240.0);
    float jitter = (hash(vec2(line, floor(uTime * 24.0))) - 0.5) * 0.006;
    float band = 1.0 - smoothstep(0.0, 0.035, abs(uv.y - fract(uTime * 0.11)));
    uv.x += (jitter + band * 0.03) * uVhs;
  }

  // Chromatic aberration: channels pulled apart radially, harder on the kick
  float ca = uChroma * (0.004 + 0.012 * uBeatPulse) + uVhs * 0.004;
  vec3 col;
  if (ca > 0.0001) {
    vec2 off = (uv - 0.5) * ca * 2.0 + vec2(uVhs * 0.002, 0.0);
    col = vec3(composite(uv + off).r, composite(uv).g, composite(uv - off).b);
  } else {
    col = composite(uv);
  }

  col += vec3(0.35) * uTension * uTension * uBeatPulse;

  // Grading
  col += uBright;
  col = (col - 0.5) * uContrast + 0.5;
  col = mix(vec3(luma(col)), col, uSat);
  if (abs(uHue) > 0.5) col = hueShift(col, uHue);
  if (uPoster > 0.0) {
    float levels = mix(12.0, 3.0, uPoster);
    col = floor(clamp(col, 0.0, 1.0) * levels + 0.5) / levels;
  }

  // Light trails: keep the brighter of now and a slightly zoomed previous frame
  if (uHasPrev > 0.5) col = max(col, texture2D(uPrev, 0.5 + (vUv - 0.5) * 0.985).rgb * uTrails);

  // Screen texture
  col *= 1.0 - uScan * 0.4 * (0.5 + 0.5 * sin(gl_FragCoord.y * 2.0));
  col += (hash(gl_FragCoord.xy + fract(uTime) * 413.0) - 0.5) * (0.18 * uGrain + 0.08 * uVhs);
  col *= 1.0 - uVignette * smoothstep(0.25, 0.85, length((vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0)) * 0.9);

  if (uStrobe > 0.0) {
    if (uStrobeMode == 1) col = mix(col, vec3(1.0), uStrobe);
    else col = mix(col, 1.0 - clamp(col, 0.0, 1.0), step(0.5, uStrobe));
  }

  gl_FragColor = vec4(max(col, 0.0) * inside, 1.0);
}
`;
