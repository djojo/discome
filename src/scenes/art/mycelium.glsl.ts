/**
 * Shared GLSL of the Mycélium world (include after ART_LIB): the moonlit night, the layered mist, the glowing
 * threads of mycelium that carry a pulse of light on every kick (the world's signature: a network), and the points
 * of living light floating in the air (fireflies, spores, will-o'-the-wisps). Every scene of the world is
 * photographic (`hdr: true`): these return linear light.
 */
export const MYCELIUM_GLSL = /* glsl */ `
// ---- the trip (see mycTrip.ts): how deep it is (0..1, following the track), where the enchanted colours are,
// and the breath (a swell over two bars, -1..1)
uniform float uTrip;
uniform float uTripHue;
uniform float uBreath;

/** The enchanted colours: violet, turquoise, gold, magenta, sliding along (t: 0..1 round them). */
vec3 tripPal(float t) {
  float x = fract(t + uTripHue) * 4.;
  vec3 c0 = vec3(.38, .12, 1.), c1 = vec3(.06, .85, .72), c2 = vec3(1., .6, .1), c3 = vec3(1., .14, .55);
  float f = smoothstep(0., 1., fract(x));
  if (x < 1.) return mix(c0, c1, f);
  if (x < 2.) return mix(c1, c2, f);
  if (x < 3.) return mix(c2, c3, f);
  return mix(c3, c0, f);
}

/** A thin film's sheen (a soap bubble, a beetle's wing): its colours turn with the angle (c: cos of it) and k. */
vec3 iridescence(float c, float k) {
  float x = k + c * 1.7;
  return .5 + .5 * cos(6.2832 * (x + vec3(0., .33, .67)));
}

/** The enchanted night: the moon's silver turned toward the drifting colours, more as the trip deepens. */
vec3 enchant(vec3 moon) {
  float l = dot(moon, vec3(.3, .5, .2));
  return mix(moon, tripPal(.05) * l * 1.4 + moon * .25, .3 + .45 * uTrip);
}

/** An aurora toward rd: curtains of the enchanted colours rippling across the sky (stronger with the trip). */
vec3 aurora(vec3 rd) {
  if (rd.y < .02) return vec3(0.);
  vec3 acc = vec3(0.);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 p = rd.xz / (rd.y + .15) * (.5 + .2 * fi);
    float n = vnoise(vec3(p * 1.2 + vec2(uTime * .02 * (1. + fi), fi * 7.), fi * 3. + uTime * .03));
    float curtain = smoothstep(.42, .72, n) * smoothstep(.02, .25, rd.y) * exp(-rd.y * 1.6);
    float rays = .55 + .45 * sin(p.x * 26. + n * 9. + uTime * .2);
    acc += tripPal(n * .6 + fi * .23) * curtain * rays;
  }
  return acc * (.06 + .3 * uTrip);
}

/** A limb from a to b, tapering from ra to rb. */
float sdTaper(vec3 p, vec3 a, vec3 b, float ra, float rb) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.);
  return length(pa - ba * h) - mix(ra, rb, h);
}

/** The night sky toward rd: deep blue-black, a few thin clouds, stars at a pixel's size (pa: a pixel, in radians). */
vec3 mycSky(vec3 rd, vec3 md, vec3 moonC, float pa) {
  float up = max(rd.y, 0.);
  vec3 col = mix(vec3(.010, .016, .030), vec3(.002, .004, .010), smoothstep(0., .6, up));
  // the glow round the moon, wide and faint, and the horizon a little lighter
  float c = max(dot(rd, md), 0.);
  col += moonC * (.05 * pow(c, 6.) + .18 * pow(c, 60.) + .5 * pow(c, 900.));
  col += vec3(.010, .014, .020) * exp(-up * 9.);
  // stars: points in cells of the direction, one pixel wide whatever the cell (no shimmer)
  vec3 q = rd * 160.;
  vec3 ic = floor(q);
  vec3 o = vec3(hash13(ic), hash13(ic + 7.1), hash13(ic + 3.3));
  float h = hash13(ic + 11.7);
  if (h > .72) {
    vec3 v = q - ic - .2 - .6 * o;
    float r = max(.06, pa * 160. * .9);
    float b = (.06 * .06) / (r * r) * exp(-dot(v, v) / (r * r));
    col += vec3(.75, .82, 1.) * b * (.4 + 1.6 * (h - .72) / .28) * smoothstep(.02, .15, rd.y) * (1. - .8 * pow(c, 30.));
  }
  // thin clouds drifting, lit along their edges near the moon
  if (rd.y > .01) {
    vec2 cp = rd.xz / (rd.y + .08) * 1.4 + vec2(uTime * .012, uTime * .004);
    float n = fbm3(vec3(cp, 3.1)) * .7 + .3 * vnoise(vec3(cp * 3.1, 8.2));
    float cl = smoothstep(.48, .78, n) * smoothstep(.0, .25, rd.y);
    col = mix(col, moonC * (.012 + .35 * pow(c, 12.) + 1.4 * pow(c, 120.)), cl * .85);
  }
  return col;
}

/** The moon's disc toward rd (md its direction, rm its radius in radians), soft at the limb: 0 off it. */
float mycMoon(vec3 rd, vec3 md, float rm, float pa) {
  float a = acos(clamp(dot(rd, md), -1., 1.));
  float disc = 1. - smoothstep(rm - pa * 1.5, rm + pa * 1.5, a);
  if (disc <= 0.) return 0.;
  // a few darker seas, a darker limb
  vec3 t = normalize(cross(md, vec3(0., 1., 0.)));
  vec3 b = cross(t, md);
  vec2 m = vec2(dot(rd, t), dot(rd, b)) / rm;
  float sea = smoothstep(.45, .7, vnoise(vec3(m * 2.3, 4.1)) * .6 + vnoise(vec3(m * 5.1, 9.3)) * .4);
  return disc * (1. - .35 * sea) * (.75 + .25 * sqrt(max(1. - dot(m, m), 0.)));
}

/**
 * The mist between ro and ro + rd*t: exponential in height (thick on the ground, thin above). dens: at the ground,
 * k: how fast it thins with height. Returns the fraction of the light it holds back (0..1).
 */
float mycFog(vec3 ro, vec3 rd, float t, float dens, float k) {
  float a = dens * exp(-k * ro.y);
  float b = k * rd.y;
  float od = abs(b) > 1e-4 ? a * (1. - exp(-b * t)) / b : a * t;
  return 1. - exp(-od);
}

/** Distance to the nearest edge of a cellular pattern, in its own units (two closest seeds). */
float mycEdge(vec2 x) {
  vec2 i0 = floor(x);
  float d1 = 9., d2 = 9.;
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 c = i0 + vec2(i, j);
      vec2 o = vec2(hash12(c), hash12(c + 5.3));
      float d = length(x - c - .15 - .7 * o);
      if (d < d1) { d2 = d1; d1 = d; }
      else if (d < d2) d2 = d;
    }
  return (d2 - d1) * .5;
}

/** A thin line at distance e (metres), tw wide, w a pixel: never thinner than a pixel, its light kept (no shimmer). */
float mycLine(float e, float tw, float w) {
  float r = max(tw, w * .75);
  return (tw / r) * exp(-e * e / (r * r));
}

/**
 * Mycelium on a surface (p in metres on it, w: a pixel there): fine wandering strands, broken into lengths (a strand
 * runs, stops, another starts), finer ones between them; 0..1. Far away they melt into a faint glow.
 */
float mycThreads(vec2 p, float w) {
  vec2 q = p + .12 * vec2(vnoise(vec3(p * 3.1, 1.3)), vnoise(vec3(p * 3.1, 7.9)));
  float e1 = mycEdge(q * 4.) / 4.;
  float e2 = mycEdge(q * 11. + 4.7) / 11.;
  float m1 = smoothstep(.4, .65, vnoise(vec3(p * 2.2, 3.7)));
  float m2 = smoothstep(.5, .72, vnoise(vec3(p * 5.3, 9.1)));
  return clamp(mycLine(e1, .005, w) * m1 + .5 * mycLine(e2, .0035, w) * m2, 0., 1.);
}

/** A pulse of light travelling along a thread: at s (its way along it), age seconds after the kick that sent it. */
float mycPulse(float s, float age, float speed, float w) {
  float x = (s - age * speed) / w;
  return exp(-x * x) * exp(-age * .9);
}

/**
 * Points of light floating in cells of size c along the ray, up to tmax (the hit): world-stable (they keep their
 * place as the camera moves), drifting, falling by fall cells a second, twinkling. dens: how many cells hold one,
 * sz: their size; never thinner than a pixel (pa), the energy kept. Colours between ca and cb.
 */
vec3 mycMotes(vec3 ro, vec3 rd, float tmax, float c, float dens, float sz, float pa, float fall, vec3 ca, vec3 cb, float tw, float foc, float bok);
vec3 mycMotes(vec3 ro, vec3 rd, float tmax, float c, float dens, float sz, float pa, float fall, vec3 ca, vec3 cb, float tw) {
  return mycMotes(ro, rd, tmax, c, dens, sz, pa, fall, ca, cb, tw, 1., 0.);
}
/** The same, out of focus away from foc (bok: how fast they blur, a soft disc of the same light). */
vec3 mycMotes(vec3 ro, vec3 rd, float tmax, float c, float dens, float sz, float pa, float fall, vec3 ca, vec3 cb, float tw, float foc, float bok) {
  vec3 q = ro / c;
  vec3 ip = floor(q);
  vec3 st = sign(rd) + vec3(equal(rd, vec3(0.)));
  vec3 dd = abs(1. / max(abs(rd), vec3(1e-5)));
  vec3 sd = (st * (ip - q) + st * .5 + .5) * dd;
  vec3 acc = vec3(0.);
  for (int i = 0; i < 20; i++) {
    vec3 h = vec3(hash13(ip + .5), hash13(ip + 17.3), hash13(ip + 41.9));
    if (h.x < dens) {
      float fy = fract(h.z * 7.1 - uTime * fall * (.6 + .8 * h.y));
      vec3 o = vec3(h.y, fy, fract(h.y * 13.7 + h.z));
      vec3 pos = (ip + .15 + .7 * o) * c + c * .1 * sin(uTime * (.3 + .4 * h.yzx) + h.zxy * 6.28);
      float tc = dot(pos - ro, rd);
      if (tc > .05 && tc < tmax) {
        vec3 v = ro + rd * tc - pos;
        float r = max(max(sz, pa * tc * 1.2), bok * abs(tc - foc) / foc);
        r = min(r, c * .3);
        float edge = smoothstep(0., .12, fy) * smoothstep(1., .88, fy);
        float g = (sz * sz) / (r * r) * exp(-dot(v, v) / (r * r)) * edge;
        g *= 1. - tw + tw * (.5 + .5 * sin(uTime * (1.7 + 3. * h.z) + h.y * 40.));
        acc += mix(ca, cb, h.z) * g;
      }
    }
    vec3 m = step(sd.xyz, sd.yzx) * step(sd.xyz, sd.zxy);
    if (min(min(sd.x, sd.y), sd.z) * c > tmax + c) break;
    sd += m * dd;
    ip += m * st;
  }
  return acc;
}

/**
 * Living patterns crawling on a surface (p: 2D coordinates on it, in metres; w: a pixel there): thin organic lines,
 * the contours of a warped field that drifts and breathes; patches of them spread as the trip deepens. Returns their
 * light (0..1) and in .y a hue along the enchanted colours.
 */
vec2 tripFlow(vec2 p, float w) {
  float t = uTime * .12;
  vec2 q = p * .8;
  q += .7 * vec2(vnoise(vec3(q * .6, t)), vnoise(vec3(q * .6 + 3.1, t + 1.7)));
  float n = vnoise(vec3(q * 1.4, t * .8)) * .65 + vnoise(vec3(q * 3.3, t * 1.3 + 4.)) * .35;
  // (few contours, well apart: at a scene's own lower resolution, crowded thin lines would blur into bands)
  float bands = 2.5 + 2.5 * uTrip;
  // distance to the nearest contour, in metres (the field changes about 1.2 a metre)
  float e = abs(fract(n * bands + uTime * .05) - .5) / (bands * 1.2);
  float line = mycLine(e, .015, w);
  // where they grow: patches that widen with the trip
  float cover = smoothstep(.62 - .55 * uTrip, .82 - .45 * uTrip, vnoise(vec3(p * .25, 2.3 + t * .3)));
  return vec2(line * cover, n * .7 + p.x * .02);
}
`;
