/**
 * The shamanic night of the Canyon world, shared by its scenes: yarn colours (the palette, stepped, as in a yarn
 * painting), a night sky whose stars wind round the zenith into spiral arms, and rings of colour breathing on the
 * ground. Needs ART_LIB and the palette.
 */
export const NIGHT_GLSL = /* glsl */ `
/** Colour of the yarn: the palette, stepped. */
vec3 yarn(float x) { return pal(floor(x * 6.) / 6. + .05); }

/** The night sky; twist winds the stars and the spiral arms of light round the zenith. */
vec3 nightSky(vec3 rd, float twist) {
  vec3 c = mix(uBase * 1.6 + uPal1 * .05, uBase * .6, smoothstep(0., .6, rd.y));
  float el = asin(clamp(rd.y, -1., 1.));
  float z = 1.5708 - el;
  float a = atan(rd.z, rd.x) + twist * z * 1.6 + uTime * .015;
  vec2 g = vec2(a * 14., z * 30.);
  vec2 id = floor(g);
  vec2 f = fract(g) - .5;
  float h = hash12(id + 7.);
  if (h > .72) {
    vec2 o = (vec2(hash12(id + 1.3), hash12(id + 2.7)) - .5) * .6;
    float tw = .5 + .5 * sin(uTime * (1. + 3. * h) + h * 50.);
    float sz = .05 + .07 * h * h;
    c += mix(vec3(1.), yarn(h), .6) * (1. - smoothstep(0., sz, length((f - o) * vec2(1., .8)))) * tw * smoothstep(-.02, .15, rd.y);
  }
  float arms = sin(a * 3. - log(z + .05) * 4.);
  c += yarn(fract(z * .5 + uTime * .01)) * (1. - smoothstep(.0, .35, abs(arms))) * .14 * smoothstep(.2, 1.5, twist) * smoothstep(.0, .3, rd.y);
  return c;
}

/** Rings of yarn colour on the ground round a centre, breathing out; petals (a mandala) with bloom. */
vec3 groundRings(vec2 xz, float breath, float bloom) {
  float r = length(xz);
  float a = atan(xz.y, xz.x);
  float rr = r * (1. + .08 * bloom * cos(a * 12.)) - breath * .25;
  float band = fract(rr * 1.6);
  float line = smoothstep(.0, .08, band) * (1. - smoothstep(.55, .63, band));
  vec3 c = yarn(fract(floor(rr * 1.6) * .17)) * line;
  c += yarn(fract(r * .1 + .5)) * bloom * (1. - smoothstep(.0, .05, abs(sin(a * 6. + r * .5)))) * .8;
  return c * .55 * exp(-r * .09) + uBase * .4;
}
`;
