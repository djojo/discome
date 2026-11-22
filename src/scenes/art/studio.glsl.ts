/**
 * The studio of the Mercure world: what liquid metal reflects. A dark room, a ring light overhead, two tall strips
 * (warm accent, cold second colour of the palette), a thin line on the horizon, a warm bounce from the floor.
 * Colour only ever comes from these reflections. Needs the palette uniforms and uTime.
 */
export const STUDIO_GLSL = /* glsl */ `
vec3 studio(vec3 r) {
  float az = atan(r.z, r.x) + uTime * .03;
  // grey walls, darker toward the floor: what makes liquid metal read as silver rather than black glass
  vec3 c = mix(uBase * .6 + uInk * .1, uBase + uInk * .34, smoothstep(-.4, .7, r.y));
  // a ring light overhead (its dark centre is what lets a flat mirror show every ripple), a soft ceiling
  c += uInk * (2.4 * exp(-pow((r.y - .88) * 30., 2.)) + .15 * smoothstep(.5, .9, r.y));
  float a1 = abs(mod(az - .9 + 3.14159, 6.28318) - 3.14159);
  float a2 = abs(mod(az + 2.2 + 3.14159, 6.28318) - 3.14159);
  float band = smoothstep(-.35, .05, r.y) * (1. - smoothstep(.5, .8, r.y));
  c += uAccent * 3. * exp(-a1 * a1 * 60.) * band;
  c += uPal1 * 2.6 * exp(-a2 * a2 * 45.) * band;
  c += uInk * .8 * exp(-abs(r.y - .02) * 60.);
  c += uAccent * .08 * (1. - smoothstep(-.7, -.1, r.y));
  return c;
}
`;
