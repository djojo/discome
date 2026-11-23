/**
 * The one tone curve of the photographic scenes (Narkowicz's fit of ACES): linear light, unbounded, to screen values.
 * The compositor applies it to every scene that hands over its light (SceneMeta.hdr), so they all share the same
 * contrast and the same roll-off of the highlights.
 */
export const TONE_GLSL = /* glsl */ `
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }
/** Back from screen values to linear light: marks drawn in screen values over a photographic scene. */
vec3 acesInv(vec3 y) {
  y = clamp(y, 0., .999);
  vec3 a = 2.51 - 2.43 * y, b = .03 - .59 * y, c = -.14 * y;
  return (-b + sqrt(b * b - 4. * a * c)) / (2. * a);
}
`;
