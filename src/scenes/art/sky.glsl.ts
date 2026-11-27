/**
 * Olympe, the white paradise, shared by the world's scenes: a white sky without a horizon, a sea of clouds, the low
 * pale-gold sun and its shafts, the white marble of the gods, the sky that drifts inside their stone (a double
 * exposure, as in a collage) and the canon of proportions drawn over their faces in graphite. Needs ART_LIB and the
 * palette: uInk (marble white), uPal1 (the pale sky), uAccent (pale gold), uBase (graphite).
 *
 * Every value is linear light, high key: the white of the sky sits around 1.8 (the compositor's tone curve makes it
 * paper white), shadows stay light. The night slowly tarnishes it all (uDrift): greyer clouds, a weathered marble.
 */
export const SKY_GLSL = /* glsl */ `
/** The low sun (toward it), and the key light that models the statues (the white sky's brightest side). */
vec3 gSun = normalize(vec3(-.55, .2, -1.));
vec3 gKey = normalize(vec3(-.6, .62, .55));
/** The sea of clouds: the level of its floor, how far it has drifted. */
float gSeaY = -3.;
vec2 gSeaDrift = vec2(0.);

float tarnish() { return .6 * uDrift; }

/** The white sky toward rd: white at the horizon, the pale sky above, the sun's halo and disc, high streaks. */
vec3 skyO(vec3 rd) {
  vec3 pale = mix(uInk, uPal1, .75);
  vec3 c = mix(uInk * 2.5, pale * 1.9, smoothstep(-.05, .75, rd.y));
  c = mix(c, c * vec3(.82, .83, .86), tarnish());
  float s = max(dot(rd, gSun), 0.);
  c += uAccent * (.12 * pow(s, 4.) + .45 * pow(s, 40.)) + vec3(3.) * smoothstep(.9994, .9997, s);
  if (rd.y > .02) {
    vec2 q = rd.xz / (rd.y + .12);
    float n = fbm3(vec3(q.x * .45 + uTime * .003, q.y * 1.7, 2.3));
    c += uInk * .22 * smoothstep(.5, .78, n) * smoothstep(.02, .3, rd.y);
  }
  return c;
}

/** Shafts of light fanning out round the sun: 0..1, soft streaks that turn slowly (k: how tight round the sun). */
float sunRays(vec3 rd, float k) {
  float c = dot(rd, gSun);
  if (c < .3) return 0.;
  vec3 t = normalize(cross(gSun, vec3(0., 1., 0.)));
  vec3 b = cross(t, gSun);
  float a = atan(dot(rd, b), dot(rd, t));
  float n = fbm3(vec3(cos(a) * 4., sin(a) * 4., uTime * .04));
  return smoothstep(.38, .72, n) * pow(c, k);
}

// ---- the sea of clouds: a soft height field (big rounded masses, smaller billows), flowing slowly

/** 2D value noise (the sea is marched at every pixel: it must stay cheap). */
float vnoise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3. - 2. * f);
  return mix(mix(hash12(i), hash12(i + vec2(1., 0.)), f.x), mix(hash12(i + vec2(0., 1.)), hash12(i + vec2(1., 1.)), f.x), f.y);
}

/** Rounded domes on a jittered grid, as the heaped tops of cumulus (0 between them, up to about 1). */
float domes(vec2 x) {
  vec2 i = floor(x), f = fract(x);
  float h = 0.;
  for (int a = -1; a <= 1; a++)
    for (int b = -1; b <= 1; b++) {
      vec2 o = vec2(float(a), float(b));
      vec2 c = o + vec2(hash12(i + o), hash12(i + o + 5.3)) - f;
      float r = .6 + .45 * hash12(i + o + 9.1);
      h = max(h, r * r - dot(c, c));
    }
  return sqrt(max(h, 0.));
}

float seaH(vec2 x) {
  vec2 q = x * .085 + gSeaDrift;
  float n = .65 * vnoise2(q) + .35 * vnoise2(q * 2.1 + 3.7);
  // the swell of the sea, heaped with domes where it rises, and finer billows on them
  return gSeaY + 2.2 * smoothstep(.25, .8, n) + 1.6 * domes(x * .32 + gSeaDrift * 3.) * (.35 + .65 * n)
    + .35 * vnoise2(x * .9 + uTime * .02);
}
const float SEA_TOP = 4.2;

/** Where the ray meets the sea of clouds (t), or -1 before tmax. */
float seaHit(vec3 ro, vec3 rd, float tmax) {
  float top = gSeaY + SEA_TOP;
  float t = 0.;
  if (ro.y > top) {
    if (rd.y >= -1e-4) return -1.;
    t = (ro.y - top) / -rd.y;
  }
  if (t > tmax) return -1.;
  float tp = t, dp = 1.;
  for (int i = 0; i < 40; i++) {
    vec3 p = ro + rd * t;
    float d = p.y - seaH(p.xz);
    if (d < 0.) return mix(tp, t, dp / (dp - d));
    if (t > tmax || (p.y > top && rd.y > 0.)) break;
    tp = t;
    dp = d;
    t += max(d * .6, .05 + t * .01);
  }
  return -1.;
}

vec3 seaN(vec2 x, float e) {
  float h = seaH(x);
  return normalize(vec3(h - seaH(x + vec2(e, 0.)), e, h - seaH(x + vec2(0., e))));
}

/** The clouds' top at p, seen along rd from t away: lit white, blue-grey in the hollows, silver against the sun. */
vec3 seaShade(vec3 p, vec3 rd, float t) {
  vec3 n = seaN(p.xz, .12 + t * .003);
  float h = clamp((p.y - gSeaY) / SEA_TOP, 0., 1.);
  // the low sun models the billows (their shadowed side turns to the sky's blue-grey), the hollows stay grey
  float sun = clamp(dot(n, gSun) * 1.4 + .35, 0., 1.);
  float sky = .5 + .5 * n.y;
  vec3 shade = uPal1 * .5;
  vec3 c = mix(shade, uInk * 2.2, smoothstep(.05, .95, .45 * sun + .35 * h + .3 * sky));
  c += uAccent * pow(sun, 4.) * .4;
  // the silver lining of the billows seen against the sun, and the light through their thin edges
  float rim = pow(1. - clamp(dot(n, -rd), 0., 1.), 3.);
  c += (uAccent * .9 + uInk * .3) * rim * pow(max(dot(rd, gSun), 0.), 3.);
  c = mix(c, c * vec3(.8, .81, .85), tarnish());
  // far away it melts into the white: no horizon
  return mix(c, skyO(rd), 1. - exp(-t * .0055));
}

/** The sky toward rd with the sea of clouds under it (tmax: as far as the sea goes). */
vec3 heavenO(vec3 ro, vec3 rd, float tmax) {
  float t = seaHit(ro, rd, tmax);
  return t > 0. ? seaShade(ro + rd * t, rd, t) : skyO(rd);
}

// ---- the light shafts: the low sun's beams in the air, the statue's shadow cut out of them

/** What casts its shadow into the beams: an ellipsoid (centre, radii; radii 0: nothing). */
vec3 gOccC = vec3(0.);
vec3 gOccR = vec3(0.);

/** Whether the way from p toward the sun crosses the occluder (0 or 1). */
float inShadow(vec3 p) {
  if (gOccR.x <= 0.) return 0.;
  vec3 o = (p - gOccC) / gOccR, d = gSun / gOccR;
  float a = dot(d, d), b = dot(o, d), c = dot(o, o) - 1.;
  float h = b * b - a * c;
  return h > 0. && (c < 0. || -b - sqrt(h) > 0.) ? 1. : 0.;
}

/**
 * Light shafts in the air between the eye and tEnd: rays fanning out round the low sun (bright rays and greyer gaps
 * between them, drifting slowly), the occluder's shadow cut out of them, all seen toward the sun. Returns the rays'
 * light (x), the occluder's shadow (y) and the gaps between rays (z), each weighted by the glare toward the sun and
 * by how much air lies before tEnd.
 */
vec3 shaftsO(vec3 ro, vec3 rd, float tEnd) {
  float c = dot(rd, gSun);
  if (c < .05) return vec3(0.);
  vec3 T = normalize(cross(gSun, vec3(0., 1., 0.)));
  vec3 B = cross(T, gSun);
  float a = atan(dot(rd, B), dot(rd, T));
  vec2 ca = vec2(cos(a), sin(a));
  float n = .65 * vnoise2(ca * 7. + uTime * .02) + .35 * vnoise2(ca * 19. - uTime * .03);
  float ray = smoothstep(.42, .7, n);
  float tMax = min(tEnd, 30.);
  float shade = 0.;
  if (gOccR.x > 0.) {
    float j = hash12(gl_FragCoord.xy + fract(uTime) * 17.);
    for (int i = 0; i < 8; i++) shade += inShadow(ro + rd * tMax * (float(i) + j) / 8.);
    shade /= 8.;
  }
  float w = pow(c, 4.) * min(tMax / 10., 1.);
  return vec3(ray * (1. - shade), shade, 1. - ray) * w;
}

/**
 * The shafts laid over a colour: the rays add their pale gold, the gaps between them and the occluder's shadow grey
 * the haze (that is what makes rays read in a white world). k: their strength (the music's pulse goes in it).
 */
vec3 withShafts(vec3 col, vec3 ro, vec3 rd, float tEnd, float k) {
  vec3 s = shaftsO(ro, rd, tEnd);
  return col * (1. - min(k, 1.6) * (.32 * s.y + .2 * s.z)) + (uAccent * 1.1 + uInk * .3) * s.x * k * .5;
}

// ---- the statues

/** White marble: a faint grey veining; the night weathers it (q: the statue's own frame). */
vec3 marbleO(vec3 q) {
  float v = fbm3(q * 2.1 + 4.);
  float vein = 1. - smoothstep(0., .06, abs(sin(q.x * 2.3 + q.y * 1.4 + q.z * .7 + v * 7.)));
  vec3 c = uInk * (1. - .1 * vein * smoothstep(.4, .7, fbm3(q * 1.1 + 2.)));
  return c * (1. - tarnish() * .4 * smoothstep(.45, .75, fbm3(q * 3.7 + 9.)));
}

/** Cumulus seen from the side, for the sky inside the stone: banks heaped with rounded puffs (0 the clear sky). */
float cumulus(vec2 x) {
  float bank = smoothstep(.4, .68, fbm3(vec3(x * vec2(.45, .8), 1.3)));
  return bank * (.75 * domes(x * vec2(1.6, 2.1)) + .45 * domes(x * 3.9 + 3.7));
}

/**
 * The sky inside the stone, as a photograph of the sky laid over a statue in a collage: heaped cumulus, lit from above
 * (each puff modelled by its own relief), grey underneath, on a clear grey-blue sky, projected from the front and
 * drifting slowly (q: the statue's frame, scale: the clouds' size). It replaces the marble's colour where it shows
 * (see skinMask).
 */
vec3 skinSky(vec3 q, float scale) {
  vec2 x = q.xy * scale + vec2(uTime * .018, uTime * .003);
  const float e = .025;
  float d = cumulus(x);
  vec2 g = vec2(cumulus(x + vec2(e, 0.)) - d, cumulus(x + vec2(0., e)) - d) / e;
  vec3 n = normalize(vec3(-g * .6, 1.));
  float lit = clamp(dot(n, normalize(vec3(-.3, .8, .5))), 0., 1.);
  float cloud = smoothstep(.04, .3, d);
  vec3 sky = mix(uPal1 * .42, mix(uInk, uPal1, .85) * .66, smoothstep(-.8, .9, q.y));
  vec3 c = mix(sky, uInk * (.4 + 1. * lit * lit), cloud);
  return mix(c, c * vec3(.85, .86, .88), tarnish());
}

/** Where the sky shows in a statue: its face and neck (q.z toward the front), not its hair (high up, at the back). */
float skinMask(vec3 q) { return smoothstep(-.15, .2, q.z) * (1. - smoothstep(.26, .42, q.y)); }

/**
 * Light on a statue in the white paradise: the key (the sky's brightest side) models it, the white dome fills every
 * shadow, the clouds bounce light from below, the low sun leaves a warm rim. a: albedo, n: normal, ao.
 */
vec3 lightO(vec3 a, vec3 n, vec3 rd, float ao) {
  float key = clamp(dot(n, gKey) * .8 + .2, 0., 1.);
  key *= key * (3. - 2. * key);
  float dome = .55 + .45 * n.y;
  float bounce = clamp(-n.y, 0., 1.);
  float sun = clamp(dot(n, gSun), 0., 1.);
  float rim = pow(1. - clamp(dot(n, -rd), 0., 1.), 3.);
  vec3 c = a * (uInk * (1.05 * key + .75 * dome + .45 * bounce) * (.35 + .65 * ao) + uAccent * .5 * sun * ao);
  c += uInk * pow(clamp(dot(reflect(-gKey, n), -rd), 0., 1.), 24.) * .25 * ao;
  return c + (uAccent * .6 * sun + uInk * .2) * rim * ao;
}

// ---- the canon of proportions, drawn over a face in graphite

/** Distance to the part of segment a..b the pencil has drawn (f: 0..1 of it). */
float strokeSeg(vec2 p, vec2 a, vec2 b, float f) {
  if (f <= 0.) return 1e3;
  b = a + (b - a) * f;
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0., 1.));
}

/** Distance to the part of a circle the pencil has drawn, from its top, clockwise (f: 0..1). */
float strokeArc(vec2 p, vec2 c, float r, float f) {
  if (f <= 0.) return 1e3;
  vec2 d = p - c;
  float a = fract(atan(d.x, d.y) / 6.2831853 + 1.);
  float on = abs(length(d) - r);
  if (a <= f) return on;
  vec2 e = c + r * vec2(sin(f * 6.2831853), cos(f * 6.2831853));
  return min(length(p - e), length(p - c - vec2(0., r)));
}

/**
 * How much graphite covers the point q of a face (head frame, the face toward +z): a vertical axis, the circle round
 * the face, a golden rectangle, the lines of the brow, the eyes, the nose, the mouth, two diagonals. k: 0..1, how far
 * the drawing has gone (stroke after stroke); px: a pixel, in the head's units.
 */
float canonInk(vec3 q, float k, float px) {
  if (k <= 0.) return 0.;
  vec2 p = q.xy + (vec2(vnoise(q * 30.), vnoise(q * 30. + 4.)) - .5) * .004;
  float n = 11., s = k * n, d = 1e3;
  d = min(d, strokeSeg(p, vec2(0., .95), vec2(0., -.8), clamp(s, 0., 1.)));
  d = min(d, strokeArc(p, vec2(0., .06), .66, clamp(s - 1., 0., 1.)));
  float g = .62 / 1.618;
  d = min(d, strokeSeg(p, vec2(-g, .62), vec2(g, .62), clamp(s - 2., 0., 1.)));
  d = min(d, strokeSeg(p, vec2(g, .62), vec2(g, -.62), clamp(s - 2.4, 0., 1.)));
  d = min(d, strokeSeg(p, vec2(g, -.62), vec2(-g, -.62), clamp(s - 2.8, 0., 1.)));
  d = min(d, strokeSeg(p, vec2(-g, -.62), vec2(-g, .62), clamp(s - 3.2, 0., 1.)));
  d = min(d, strokeSeg(p, vec2(-.55, .4), vec2(.55, .4), clamp(s - 4., 0., 1.)));
  d = min(d, strokeSeg(p, vec2(.6, .12), vec2(-.6, .12), clamp(s - 5., 0., 1.)));
  d = min(d, strokeSeg(p, vec2(-.5, -.17), vec2(.5, -.17), clamp(s - 6., 0., 1.)));
  d = min(d, strokeSeg(p, vec2(.45, -.36), vec2(-.45, -.36), clamp(s - 7., 0., 1.)));
  d = min(d, strokeSeg(p, vec2(-g, -.62), vec2(g, .62), clamp(s - 8., 0., 1.)));
  d = min(d, strokeSeg(p, vec2(g, -.62), vec2(-g, .62), clamp(s - 9., 0., 1.)));
  d = min(d, strokeArc(p, vec2(0., .12), .24, clamp(s - 10., 0., 1.)));
  float w = .0035 + px * .6;
  return (1. - smoothstep(w, w + px * 1.2, d)) * .75;
}
`;
