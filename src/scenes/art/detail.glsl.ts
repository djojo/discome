/**
 * Fine detail that only shows when the screen can resolve it. `pix` is the size of one pixel on the surface
 * (pixelSize below): a relief smaller than a few pixels fades out instead of shimmering, so close up a surface gains
 * its pores, grain and ripples while from afar it stays clean. Needs ART_LIB and CAMERA_GLSL (uRes, uFocal).
 */
export const DETAIL_GLSL = /* glsl */ `
/** The size of one pixel on a surface at distance t (a surface seen at a grazing angle spreads a pixel wider). */
float pixelSize(float t, vec3 n, vec3 rd) { return t / (uRes.y * uFocal) / max(abs(dot(n, rd)), .25); }

/** How visible a detail of a given size is: nothing under two pixels, fully from five. */
float resolved(float size, float pix) { return smoothstep(2., 5., size / pix); }

/** The normal n bent by a relief of value noise of frequency f (slope a), only where the relief is resolved. */
vec3 bumpNoise(vec3 n, vec3 q, float f, float a, float pix) {
  float vis = resolved(1. / f, pix);
  if (vis < .01) return n;
  vec3 x = q * f;
  const float e = .3;
  float h0 = vnoise(x);
  vec3 g = (vec3(vnoise(x + vec3(e, 0., 0.)), vnoise(x + vec3(0., e, 0.)), vnoise(x + vec3(0., 0., e))) - h0) / e;
  g -= n * dot(g, n);
  return normalize(n - g * a * vis);
}
`;
