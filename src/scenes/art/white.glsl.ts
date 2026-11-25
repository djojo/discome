/**
 * The white studio of the Porcelaine world, shared by its scenes (the only bright world): a seamless white cove with
 * no horizon, slightly brighter toward the top, and what a glaze reflects of it, the same white with two black flags
 * on the sides that draw the edges of a white form against the white. Needs the palette (uInk, uBase).
 */
export const WHITE_GLSL = /* glsl */ `
vec3 studioW(vec3 rd) {
  return uInk * mix(1.5, 1.95, smoothstep(-.6, .7, rd.y)) * vec3(1., .99, .975);
}
vec3 envW(vec3 r) {
  float az = atan(r.z, r.x);
  float flags = exp(-pow((az - 2.5) * 3.2, 2.)) + exp(-pow((az - .45) * 3.2, 2.));
  flags *= 1. - smoothstep(.35, .75, abs(r.y));
  return mix(studioW(r), uBase * .3, clamp(flags, 0., 1.));
}
`;
