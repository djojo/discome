import { TONE_GLSL } from "@/engine/tone";

/**
 * Shared GLSL for the "art direction" scenes (ported from the mood-board mock-ups).
 * The shader-scene header already provides the audio uniforms, `pal()`, palette roles
 * (uBase / uInk / uAccent) and `rot()`.
 */
export const ART_LIB = /* glsl */ `
#define PI 3.14159265
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3) { p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm3(vec3 p) { float a = .5, s = 0.; for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= .5; } return s; }
float sdEllipsoid(vec3 p, vec3 r) { float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.) / k1; }
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) { vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h) - r; }
float sdBox(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.); }
float smin(float a, float b, float k) { float h = clamp(.5 + .5 * (b - a) / k, 0., 1.); return mix(b, a, h) - k * h * (1. - h); }
float smax(float a, float b, float k) { return -smin(-a, -b, k); }
mat3 lookAt(vec3 ro, vec3 ta) { vec3 f = normalize(ta - ro); vec3 r = normalize(cross(f, vec3(0, 1, 0))); vec3 u = cross(r, f); return mat3(r, u, f); }
${TONE_GLSL}
/**
 * The end of a photographic scene (SceneMeta.hdr): its light, linear and unbounded. The compositor tone-maps it like
 * every other scene, frames it with the world's vignette and lets its real highlights bloom. Where the GPU has no float
 * targets (LDR_OUT), the scene tone-maps itself.
 */
vec3 hdrOut(vec3 c) {
#ifdef LDR_OUT
  return aces(c);
#else
  return clamp(c, 0., 64.);
#endif
}
float letterbox(vec2 fc) {
  if (uRes.x / uRes.y < 1.5) return 1.;
  float lb = (1. - (uRes.x / 2.39) / uRes.y) * .5;
  float y = fc.y / uRes.y;
  return step(lb, y) * step(y, 1. - lb);
}

/* Sculpted head: smooth volumes, closed eyes, nothing it doesn't need. Faces +z, y up. */
float sdHead(vec3 p) {
  vec3 q = vec3(abs(p.x), p.y, p.z);
  float d = sdEllipsoid(p - vec3(0., .17, -.1), vec3(.45, .6, .57));
  d = smin(d, sdEllipsoid(p - vec3(0., -.15, .07), vec3(.36, .54, .46)), .2);
  d = smin(d, sdEllipsoid(p - vec3(0., -.56, .17), vec3(.17, .15, .24)), .17);
  d = smin(d, sdEllipsoid(q - vec3(.245, -.06, .25), vec3(.11, .1, .15)), .13);
  d = smax(d, -sdEllipsoid(q - vec3(.15, .02, .52), vec3(.105, .055, .1)), .075);
  d = smin(d, sdEllipsoid(q - vec3(.15, .012, .462), vec3(.08, .04, .058)), .035);
  d = smin(d, sdEllipsoid(q - vec3(.145, .115, .46), vec3(.12, .028, .065)), .09);
  d = smin(d, sdCapsule(p, vec3(0., .04, .51), vec3(0., -.185, .6), .032), .06);
  d = smin(d, sdEllipsoid(p - vec3(0., -.205, .585), vec3(.055, .042, .052)), .045);
  d = smin(d, sdEllipsoid(q - vec3(.043, -.225, .535), vec3(.032, .026, .034)), .035);
  d = smin(d, sdEllipsoid(p - vec3(0., -.365, .515), vec3(.098, .025, .048)), .04);
  d = smin(d, sdEllipsoid(p - vec3(0., -.425, .5), vec3(.082, .028, .048)), .04);
  d = smax(d, -sdEllipsoid(p - vec3(0., -.395, .56), vec3(.088, .005, .044)), .01);
  d = smin(d, sdEllipsoid(q - vec3(.44, -.02, -.05), vec3(.033, .115, .072)), .045);
  d = smin(d, sdCapsule(p, vec3(0., -.55, -.12), vec3(0., -1.6, -.2), .23), .15);
  return d;
}
`;

/** Normal, ambient occlusion and sphere-tracing for a scene that defines \`float map(vec3)\`. */
export const MARCH = /* glsl */ `
/** The normal, sampled over a distance h: about a pixel (calcNormalE) averages out relief the screen cannot show. */
vec3 calcNormalE(vec3 p, float h) {
  const vec2 k = vec2(1, -1);
  return normalize(k.xyy * map(p + k.xyy * h) + k.yyx * map(p + k.yyx * h) + k.yxy * map(p + k.yxy * h) + k.xxx * map(p + k.xxx * h));
}
vec3 calcNormal(vec3 p) { return calcNormalE(p, .0015); }
float calcAO(vec3 p, vec3 n) {
  float occ = 0., sca = 1.;
  for (int i = 0; i < 5; i++) { float h = .02 + .11 * float(i); float d = map(p + h * n); occ += (h - d) * sca; sca *= .85; }
  return clamp(1. - 2.2 * occ, 0., 1.);
}
float march(vec3 ro, vec3 rd, float tmax) {
  float t = .05;
  for (int i = 0; i < 120; i++) {
    float d = map(ro + rd * t);
    if (abs(d) < .0008 * t) return t;
    t += d * .85;
    if (t > tmax) break;
  }
  return -1.;
}
`;
