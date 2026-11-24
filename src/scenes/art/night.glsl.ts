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

/** A crescent moon in direction md, and its faint glow. */
vec3 moon(vec3 rd, vec3 md) {
  float dm = acos(clamp(dot(rd, md), -1., 1.));
  vec3 off = normalize(md + vec3(.03, .02, 0.));
  float cres = (1. - smoothstep(.034, .038, dm)) * smoothstep(.03, .036, acos(clamp(dot(rd, off), -1., 1.)));
  return vec3(1., .93, .75) * cres * 1.4 + vec3(.6, .65, .9) * exp(-dm * 9.) * .08;
}

/** Rings of yarn colour on the ground round a centre, breathing out; petals (a mandala) with bloom. */
vec3 groundRings(vec2 xz, float breath, float bloom) {
  float r = length(xz);
  float a = atan(xz.y, xz.x);
  float rr = r * (1. + .08 * bloom * cos(a * 12.)) - breath * .25;
  float band = fract(rr * 1.6);
  float line = smoothstep(.0, .08, band) * (1. - smoothstep(.55, .63, band));
  // toward the horizon the rings get finer than a pixel: their average instead of a moire
  float fw = fwidth(rr * 1.6);
  float blur = smoothstep(.15, .5, fw);
  vec3 c = mix(yarn(fract(floor(rr * 1.6) * .17)) * line, yarn(fract(r * .05 + .3)) * .5, blur);
  float pet = abs(sin(a * 6. + r * .5));
  c += yarn(fract(r * .1 + .5)) * bloom * mix(1. - smoothstep(.0, .05, pet), .08, smoothstep(.02, .1, fwidth(pet))) * .8;
  return c * .55 * exp(-r * .09) + uBase * .4;
}
`;
