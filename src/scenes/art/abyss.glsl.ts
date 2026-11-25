/**
 * The deep water the Chair world's creatures live in, shared by its scenes (they cover the whole frame with it
 * instead of letting a world background through): an abyssal dark that barely lightens toward the surface, a very
 * distant glow from above, a faint veil of caustics up there, and marine snow drifting down in three depths. The
 * snow glints a little on the hats and brightens on the drop. Needs ART_LIB (vnoise, hash12) and the palette.
 * snowAmt: 0 for a scene that draws its own snow.
 */
export const ABYSS_GLSL = /* glsl */ `
vec3 deepWater(vec3 rd, vec2 uv, float snowAmt) {
  float up = smoothstep(-.5, .9, rd.y);
  vec3 c = mix(uBase * .35, uBase * 1.1 + uInk * .05, up);
  // a far glow from the surface, straight above
  c += mix(uInk, uAccent, .3) * .06 * pow(max(rd.y, 0.), 3.);
  // caustics: a slow, faint veil of light, only up toward the surface
  float k = vnoise(vec3(rd.xz / max(.25, rd.y + .6) * 3., uTime * .12));
  float k2 = vnoise(vec3(rd.xz / max(.25, rd.y + .6) * 5.3 + 4., uTime * .17));
  c += uInk * .05 * pow(1. - abs(k - k2), 8.) * smoothstep(.1, .8, rd.y);
  // marine snow, in three depths
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 g = uv * (12. + fi * 8.) + vec2(fi * 3.7, uTime * (.04 + fi * .025));
    vec2 id = floor(g);
    float h = hash12(id + fi * 11.);
    if (h > .86) {
      vec2 o = (vec2(hash12(id + 2.1), hash12(id + 5.3)) - .5) * .7;
      float glint = 1. + 2.5 * uHat * step(.7, hash12(id + floor(uTime * 6.))) + 2. * uDrop;
      c += vec3(.8, .86, .95) * (1. - smoothstep(.02, .08, length(fract(g) - .5 - o))) * (.08 + .06 * fi) * glint * snowAmt;
    }
  }
  return c;
}
`;
