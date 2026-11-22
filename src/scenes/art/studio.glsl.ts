/**
 * The studio of the Mercure world: what liquid metal reflects. A pale room, darker toward the floor, a ring light
 * overhead with a dark centre (what lets a flat mirror show every ripple), two big white softboxes on the sides
 * (barely tinted by the palette at their edges) and the line of the horizon. Mercury reflects almost all of it:
 * this is what makes it read as liquid silver rather than black glass. Needs the palette uniforms and uTime.
 */
export const STUDIO_GLSL = /* glsl */ `
vec3 studio(vec3 r) {
  float az = atan(r.z, r.x) + uTime * .01;
  // a grey studio floor below (a floating drop shows it on its lower half), a pale room above
  vec3 c = mix(uInk * .2, uInk * .5, smoothstep(-.5, .8, r.y));
  c *= mix(.55, 1., smoothstep(-.25, .05, r.y));
  c += uInk * .9 * exp(-abs(r.y - .02) * 50.);
  // the ring light, and the dark centre of the ceiling
  c *= 1. - .75 * smoothstep(.93, .99, r.y);
  c += uInk * 2.2 * exp(-pow((r.y - .88) * 28., 2.));
  // two big softboxes
  float a1 = abs(mod(az - .9 + 3.14159, 6.28318) - 3.14159);
  float a2 = abs(mod(az + 2.2 + 3.14159, 6.28318) - 3.14159);
  float band = smoothstep(-.2, .1, r.y) * (1. - smoothstep(.55, .75, r.y));
  float s1 = smoothstep(.36, .3, a1) * band, s2 = smoothstep(.3, .24, a2) * band;
  c += mix(vec3(1.), uAccent, .3 * smoothstep(.2, .34, a1)) * 2.2 * s1;
  c += mix(vec3(1.), uPal1, .3 * smoothstep(.16, .28, a2)) * 1.9 * s2;
  return c;
}
`;
