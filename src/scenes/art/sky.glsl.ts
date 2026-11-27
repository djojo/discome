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
/** The world's sun (art/olympe.ts): how high it stands (0..1), how warm its light is (0..1). */
uniform float uSunEl;
uniform float uSunWarm;
/** The world's whirl of feathers on the drop (radians turned), the canon drawn in the sky (how far, how visible). */
uniform float uFeatherSwirl;
uniform float uSkyCanon;
uniform float uSkyCanonA;
/** The height of the sun toward which a scene sets gSun (its bearing stays the scene's own). */
float sunY() { return mix(.05, .62, uSunEl); }
/** The colour of the sun's light: pale gold, warmer through the breakdown and over the night. */
vec3 sunCol() { return mix(uAccent, vec3(1., .74, .46), uSunWarm * .85); }
/** The tint the warm sun lays on the white light (the key on the statues, the lit sides of the clouds). */
vec3 warmLight() { return mix(vec3(1.), vec3(1.07, .95, .8), uSunWarm); }
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
  c += sunCol() * (.12 * pow(s, 4.) + .45 * pow(s, 40.)) + vec3(3.) * smoothstep(.9994, .9997, s);
  // the low sun warms the sky round the horizon
  c = mix(c, c * mix(vec3(1.), sunCol() / max(max(uAccent.r, uAccent.g), .5), .5 * uSunWarm), 1. - smoothstep(-.05, .65, rd.y));
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

// ---- the clouds in volume: a layer of cumulus carved from the cloud noise (cloudnoise.ts), lit by the low sun

uniform highp sampler3D uCloudTex;
uniform float uCloudReady;
/** The layer: its floor, its thickness; how much of the sky it covers, how dense; the wind (how far it has blown). */
float gCloudBase = -8.;
float gCloudThick = 6.;
float gCover = .55;
float gCloudDensity = 1.;
vec2 gWind = vec2(0.);
/**
 * A glow running through the clouds (the kick): its strength, and how far from the eye its front has gone (-1: all of
 * them at once); a clearing opening round a point of the ground plan (x, z, r).
 */
float gCloudGlow = 0.;
float gGlowR = -1.;
/** Columns of cloud standing in a ring (L'Assemblée): how many (0: none), the ring's radius, theirs, their top. */
float gColN = 0.;
float gColRing = 13.;
float gColR = 2.5;
float gColTop = 0.;
float gColA0 = 0.;
/** How light the clouds' undersides stay (a white floor bouncing the light up into them: higher). */
float gCloudUnder = .45;
vec3 gClearing = vec3(0., 0., 0.);

float cremap(float v, float a, float b, float c, float d) { return c + (v - a) * (d - c) / (b - a); }

/** The clouds' density at p; cheap: without the fine fraying (far away, and toward the sun). */
float cloudDensity(vec3 p, bool cheap) {
  float h = (p.y - gCloudBase) / gCloudThick;
  if (h <= 0. || h >= 1.) return 0.;
  vec3 w = p + vec3(gWind.x, 0., gWind.y);
  // where the masses are: clusters with clear gaps between them, and a clearing the music may open
  float big = textureLod(uCloudTex, vec3(w.xz * .0026, .31), 0.).r;
  float mid = textureLod(uCloudTex, vec3(w.xz * .009, .67), 0.).g;
  float cov = clamp((smoothstep(.32, .7, big) * .65 + smoothstep(.35, .8, mid) * .55) * gCover * 1.5, 0., 1.);
  if (gClearing.z > 0.) cov *= smoothstep(gClearing.z * .6, gClearing.z, length(p.xz - gClearing.xy));
  if (gColN > .5) {
    // the nearest column of the ring: full where it stands, up to its top
    float seg = 6.2831853 / gColN;
    float ca = gColA0 + floor((atan(p.z, p.x) - gColA0) / seg + .5) * seg;
    float r = length(p.xz - gColRing * vec2(cos(ca), sin(ca))) / gColR;
    cov = max(cov, (1. - smoothstep(.4, 1., r)) * (1. - smoothstep(gColTop - 2., gColTop, p.y)));
  }
  if (cov < .03) return 0.;
  vec4 n = textureLod(uCloudTex, w * .019 + vec3(0., uTime * .0025, 0.), 0.);
  float shape = cremap(n.r, n.g - 1., 1., 0., 1.);
  // flat-bottomed, heaped into towers where the cover is thick: the top rises with the cover and the billows
  float topH = .25 + .75 * cov * (.55 + .45 * shape);
  float prof = smoothstep(0., .08, h) * (1. - smoothstep(topH * .7, topH, h));
  float d = cremap(shape * prof, 1. - cov, 1., 0., 1.) * cov;
  if (d <= 0.) return 0.;
  if (!cheap) {
    // the billows rise and fray: wispy at the bottom, curled at the top
    vec4 m = textureLod(uCloudTex, w * .07 + vec3(uTime * .004, -uTime * .03, 0.), 0.);
    float det = mix(m.b, 1. - m.b, clamp(h * 3., 0., 1.));
    d = cremap(d, det * .55, 1., 0., 1.);
  }
  return clamp(d, 0., 1.) * gCloudDensity;
}

float hgPhase(float c, float g) { return (1. - g * g) / pow(1. + g * g - 2. * g * c, 1.5) * .0796; }

/**
 * The clouds between the eye and tmax: their light (rgb) and what they let through (a). White where the sun reaches
 * them, grey in their depth and underneath, a silver lining against the sun, melting into the white far away.
 */
vec4 cloudsO(vec3 ro, vec3 rd, float tmax) {
  float top = gCloudBase + gCloudThick;
  float t0 = 0., t1 = tmax;
  if (abs(rd.y) > 1e-4) {
    float ta = (gCloudBase - ro.y) / rd.y, tb = (top - ro.y) / rd.y;
    t0 = max(min(ta, tb), 0.);
    t1 = min(max(ta, tb), tmax);
  } else if (ro.y < gCloudBase || ro.y > top) return vec4(0., 0., 0., 1.);
  t1 = min(t1, t0 + 220.);
  if (t1 <= t0) return vec4(0., 0., 0., 1.);
  vec3 sky = skyO(rd);
  float c = dot(rd, gSun);
  float phase = mix(hgPhase(c, .65), hgPhase(c, -.2), .35) * 12.;
  float T = 1.;
  vec3 L = vec3(0.);
  float t = t0 + .5 * hash12(gl_FragCoord.xy + fract(uTime) * 13.);
  for (int i = 0; i < 64; i++) {
    if (t > t1 || T < .03) break;
    vec3 p = ro + rd * t;
    bool far = t > 70.;
    float d = cloudDensity(p, far);
    float dt = mix(.4, 3.5, smoothstep(8., 140., t));
    if (d > .001) {
      // toward the sun: how much cloud the light crosses
      float ld = 0.;
      for (int k = 1; k <= 4; k++) ld += cloudDensity(p + gSun * float(k * k) * .55, true);
      // (the powder: the edges turned away from the sun stay darker than a thin veil would)
      float sunT = exp(-ld * 3.) * (1. - exp(-d * 4.));
      float h = clamp((p.y - gCloudBase) / gCloudThick, 0., 1.);
      vec3 amb = mix(mix(uPal1, uInk, gCloudUnder - .45) * gCloudUnder, uInk * 1., smoothstep(.05, .9, h));
      float glow = gCloudGlow * (gGlowR < 0. ? 1. : exp(-pow(t - gGlowR, 2.) * .006));
      vec3 S = amb + (uInk * 1.9 * warmLight() + sunCol() * .6) * sunT * (.45 + phase) + uAccent * glow * 1.6;
      // far away the clouds melt into the white
      S = mix(S, sky, 1. - exp(-t * .0045));
      float a = exp(-d * dt * .95);
      L += T * S * (1. - a);
      T *= a;
    } else dt *= 1.8;
    t += dt;
  }
  L = mix(L, L * vec3(.84, .85, .88), tarnish());
  return vec4(L, T);
}

/** Wisps drifting through a band of height (base..base + thick) between the eye and tEnd, thin and broken (cover). */
vec4 wispsO(vec3 ro, vec3 rd, float tEnd, float base, float thick, float cover) {
  if (uCloudReady < .5) return vec4(0., 0., 0., 1.);
  float b = gCloudBase, th = gCloudThick, cv = gCover, dn = gCloudDensity, cn = gColN;
  gCloudBase = base;
  gCloudThick = thick;
  gCover = cover;
  gCloudDensity = .6;
  gColN = 0.;
  vec4 r = cloudsO(ro, rd, tEnd);
  gCloudBase = b;
  gCloudThick = th;
  gCover = cv;
  gCloudDensity = dn;
  gColN = cn;
  return r;
}

/** How much sunlight reaches p through the cloud layer above it (1: no cloud in the way). */
float cloudShadow(vec3 p) {
  if (uCloudReady < .5 || gSun.y <= .05) return 1.;
  float ym = gCloudBase + gCloudThick * .35;
  if (p.y > ym) return 1.;
  return exp(-cloudDensity(p + gSun * ((ym - p.y) / gSun.y), true) * gCloudThick * .45);
}

float skyCanonO(vec3 rd);
/**
 * The sky toward rd with the clouds before tmax (the old sea of clouds while the noise is still cooking); through a
 * build the canon drawn in pencil across the sky, behind the clouds.
 */
vec3 heavenV(vec3 ro, vec3 rd, float tmax) {
  if (uCloudReady < .5) return heavenO(ro, rd, tmax);
  vec4 c = cloudsO(ro, rd, tmax);
  vec3 sky = skyO(rd);
  if (uSkyCanonA > .001) sky = mix(sky, uBase * .6 + uInk * .3, skyCanonO(rd));
  return sky * c.a + c.rgb;
}

// ---- a face in the clouds: for a while, a heap of cloud takes the shape of a head, then the wind carries it off. A
// scene that has one defines CLOUD_FACE(h) before SKY_GLSL: the head's distance field in its own frame (about -1..1).

/** Where the face stands (its centre), its scale (0: none), how far it has formed (0: a heap, 1: the face), gone. */
vec3 gFaceC = vec3(0.);
float gFaceS = 0.;
float gFaceForm = 0.;
float gFaceGone = 0.;
/** The light that models it, raking from the side so that its features cast their shadows. */
vec3 gFaceL = normalize(vec3(-.8, .5, .35));
/** (how far the last sample was from it, in its own units: to leap over the empty air) */
float gFaceFar = 0.;

#ifdef CLOUD_FACE
float faceDensity(vec3 p, bool cheap) {
  vec3 h = (p - gFaceC) / gFaceS;
  // the wind shears it as it carries it off, the top first
  h.x -= gFaceGone * gFaceGone * (h.y + 1.2) * .7;
  float form = smoothstep(.1, .85, gFaceForm);
  float ero = mix(.1, .016, form) + .35 * gFaceGone;
  float sd = sdEllipsoid(h - vec3(0., -.02, -.02), vec3(.68, 1.02, .84));
  gFaceFar = sd - ero - .06;
  if (gFaceFar > 0.) return 0.;
  if (form > 0.) sd = mix(sd, CLOUD_FACE(h), form);
  gFaceFar = sd - ero - .02;
  // its billows: big ones while it is still a heap, fine ones on the face, torn apart as it goes
  // (billows of a few units whatever its scale: puffed out, cauliflower-like, rising slowly)
  float n = .5;
  if (!cheap) {
    vec3 w = p / gFaceS * mix(1.6, 4., form) + vec3(uTime * .004, -uTime * .012, 0.);
    vec4 m = textureLod(uCloudTex, w, 0.);
    vec4 m2 = textureLod(uCloudTex, w * 2.7 + .37, 0.);
    n = .65 * m.r + .35 * m2.g;
  }
  // (soft as a cloud while it is a heap, crisper once it is a face)
  float v = (-sd + (n - .5) * 2. * ero) / (mix(.07, .012, form) + .15 * gFaceGone);
  // the neck melts into the sea of clouds
  return clamp(v, 0., 1.) * (1. - gFaceGone) * smoothstep(0., .12, gFaceForm) * smoothstep(-1.1, -.55, h.y);
}

/**
 * The face in the clouds between the eye and tmax: its light (rgb), what it lets through (a); tHalf: where it gets
 * opaque (the clouds before it are drawn up to there). Modelled by the white sky's key light, which its own features
 * shade (the brow over the eyes, the nose), a silver lining against the sun, the haze of the distance.
 */
vec4 faceCloudO(vec3 ro, vec3 rd, float tmax, out float tHalf) {
  tHalf = tmax;
  if (gFaceS <= 0. || gFaceForm <= 0. || gFaceGone >= 1. || uCloudReady < .5) return vec4(0., 0., 0., 1.);
  vec3 oc = ro - gFaceC;
  float R = 1.3 * gFaceS * (1. + .8 * gFaceGone);
  float b = dot(oc, rd), hh = b * b - dot(oc, oc) + R * R;
  if (hh < 0.) return vec4(0., 0., 0., 1.);
  hh = sqrt(hh);
  float t = max(-b - hh, 0.), t1 = min(-b + hh, tmax);
  if (t1 <= t) return vec4(0., 0., 0., 1.);
  float st = .008 * gFaceS;
  t += st * hash12(gl_FragCoord.xy + fract(uTime) * 17.);
  vec3 sky = skyO(rd);
  float phase = hgPhase(dot(rd, gSun), .6) * 7.;
  float T = 1.;
  vec3 L = vec3(0.);
  for (int i = 0; i < 72; i++) {
    if (t > t1 || T < .03) break;
    vec3 p = ro + rd * t;
    float d = faceDensity(p, false);
    if (d > .002) {
      float ld = faceDensity(p + gFaceL * .02 * gFaceS, true) + faceDensity(p + gFaceL * .05 * gFaceS, true) + faceDensity(p + gFaceL * .12 * gFaceS, true);
      float keyT = exp(-ld * 2.2);
      float sunT = exp(-faceDensity(p + gSun * .1 * gFaceS, true) * 2.5);
      float hy = clamp((p.y - gFaceC.y) / gFaceS * .5 + .5, 0., 1.);
      // (a touch darker than the white sky behind it, so that it stands out in pearl grey)
      vec3 S = mix(uPal1 * .4, uInk * .5, hy) + uInk * 1.3 * warmLight() * keyT + sunCol() * .45 * sunT * phase;
      S = mix(S, sky, 1. - exp(-t * .0004));
      float a = exp(-d * st * 1.5);
      L += T * S * (1. - a);
      T *= a;
      if (T < .5 && tHalf >= tmax) tHalf = t;
      t += st;
    } else t += max(st, gFaceFar * gFaceS);
  }
  return vec4(L, T);
}
#endif

// ---- a flight of doves: white birds in a loose flock crossing the sky, their wings beating, the flock tightening and
// spreading as it goes. Drawn like the dust (each bird where it comes nearest the ray): cheap. The scene sets the
// flight (art/olympe.ts: flockStep): from uFlockA to uFlockB, how far along it is (uFlockT 0..1; out of that: none),
// the flock's spread, a bird's wingspan; uFlockBurst: they start all from one point (out of the opened head).
uniform vec3 uFlockA;
uniform vec3 uFlockB;
uniform float uFlockT;
uniform float uFlockR;
uniform float uFlockSize;
uniform float uFlockBurst;

vec3 flockPath(float s) {
  vec3 ab = uFlockB - uFlockA;
  // (a crossing rises in an arc; a burst out of the head flies straight out)
  return uFlockA + ab * s + vec3(0., sin(3.1416 * s) * (uFlockBurst > .5 ? .02 : .05) * length(ab), 0.);
}

/** The doves before tEnd along the ray: their colour (rgb), how much of the pixel they cover (a). */
vec4 dovesO(vec3 ro, vec3 rd, float tEnd) {
  if (uFlockT < 0. || uFlockT >= 1.) return vec4(0.);
  float s = uFlockT;
  float spread = uFlockBurst > .5 ? smoothstep(0., .35, s) : 1.;
  float R = uFlockR * spread * (.75 + .25 * sin(uTime * .5 + 1.3));
  // (the whole flock's bounds first)
  vec3 oc = flockPath(s) - ro;
  float tc = dot(oc, rd);
  float bound = uFlockR * 1.7 + uFlockSize + .06 * length(uFlockB - uFlockA);
  if (dot(oc, oc) - tc * tc > bound * bound) return vec4(0.);
  vec3 right = normalize(cross(rd, vec3(0., 1., 0.)));
  vec3 upv = cross(right, rd);
  float sz = uFlockSize * .5;
  vec4 acc = vec4(0.);
  float nearest = tEnd;
  for (int i = 0; i < 22; i++) {
    float fi = float(i);
    vec3 hh = vec3(hash12(vec2(fi, 1.7)), hash12(vec2(fi, 5.3)), hash12(vec2(fi, 9.1)));
    // its place in the flock, wandering about it; some trailing a little behind
    vec3 o = (hh * 2. - 1.) * vec3(1., .45, 1.) * R;
    o += R * .3 * vec3(sin(uTime * .9 + fi * 1.7), .5 * sin(uTime * 1.3 + fi * 2.3), cos(uTime * .8 + fi * 1.1));
    vec3 v = flockPath(s - .05 * hh.z * spread) + o - ro;
    float tb = dot(v, rd);
    if (tb < .2 || tb > nearest) continue;
    vec3 q = v - rd * tb;
    if (dot(q, q) > sz * sz * 1.5) continue;
    // in its own frame across the view: the wings beating, tips up and down, a little banking
    vec2 l = vec2(-dot(q, right), -dot(q, upv)) / sz;
    float flap = sin(uTime * 14. + hh.x * 6.28);
    l *= rot(.3 * sin(uTime * .7 + fi));
    float ax = abs(l.x);
    float y = .55 * flap * ax + .35 * ax * (1. - ax) - .05;
    float dy = .55 * flap + .35 * (1. - 2. * ax);
    float dw = abs(l.y - y) / sqrt(1. + dy * dy);
    float th = .1 * (1. - .65 * ax);
    float pw = tb / (uRes.y * sz);
    float wing = (1. - smoothstep(th - pw, th + pw, dw)) * (1. - smoothstep(1. - pw, 1. + pw, ax));
    float body = 1. - smoothstep(1. - pw * 5., 1. + pw * 5., length(vec2(l.x / .12, (l.y + .03) / .2)));
    float a = max(wing, body);
    if (a <= 0.) continue;
    // white, the undersides of the wings a pearl grey; hazy far away
    vec3 c = mix(uPal1 * .62 + uInk * .15, uInk * 1.3 * warmLight(), .5 - .35 * flap);
    c = mix(c, uInk * 2.2, 1. - exp(-tb * .004));
    acc = vec4(c, a);
    nearest = tb;
  }
  return acc;
}

// ---- feathers: white feathers falling slowly through the light, rocking and rolling over as they fall, whirled
// round on the drop. Where each one is (xyz) and its own number (w) comes from the scene (art/olympe.ts: featherStep:
// a box of air round the eye, fixed in the world, wrapping round as the eye moves); uFeatherL: a feather's length.
uniform vec4 uFeathers[24];
uniform float uFeatherL;

/** The feathers before tEnd along the ray: their colour, how much of the pixel they cover. */
vec4 feathersO(vec3 ro, vec3 rd, float tEnd) {
  float L = uFeatherL;
  if (L <= 0.) return vec4(0.);
  vec4 acc = vec4(0.);
  float nearest = tEnd;
  vec3 right = vec3(0.), upv = vec3(0.);
  for (int i = 0; i < 24; i++) {
    vec3 v = uFeathers[i].xyz - ro;
    float tb = dot(v, rd);
    if (tb < .05 || tb > nearest) continue;
    vec3 q = v - rd * tb;
    if (dot(q, q) > L * L * .4) continue;
    if (right.x == 0. && right.z == 0.) {
      right = normalize(cross(rd, vec3(0., 1., 0.)));
      upv = cross(right, rd);
    }
    // in its own frame, in lengths of a feather: rocking in the view, rolling over (the vane narrows edge-on)
    float h = uFeathers[i].w;
    vec2 l = vec2(-dot(q, right), -dot(q, upv)) / L;
    l *= rot(h * 6.28 + .8 * sin(uTime * (.7 + .5 * fract(h * 7.)) + h * 30.));
    float roll = cos(uTime * (1.2 + fract(h * 13.)) + h * 50.);
    float s = l.x + .5;
    float px = tb / (uRes.y * L);
    float w = .27 * sqrt(max(s * (1.05 - s), 0.)) * (.3 + .7 * abs(roll));
    float dv = abs(l.y - .04 * sin(s * 3.1));
    float vane = (1. - smoothstep(w - px, w + px, dv)) * smoothstep(-px, px, s) * (1. - smoothstep(1. - px, 1. + px, s));
    float quill = (1. - smoothstep(.006, .006 + px * 1.5, abs(l.y))) * smoothstep(-.12, -.1, s) * (1. - smoothstep(.9, .95, s));
    float a = max(vane * .9, quill * .8);
    if (a <= 0.) continue;
    // (a touch darker than the white sky, or white on white they would not show)
    vec3 c = mix(uPal1 * .58 + uInk * .12, uInk * 1.2 * warmLight(), .45 + .35 * roll);
    c = mix(c, uPal1 * .5, quill * .5);
    c = mix(c, uInk * 2.2, 1. - exp(-tb * .004));
    acc = vec4(c, a);
    nearest = tb;
  }
  return acc;
}

// ---- the light shafts: the low sun's beams in the air, the statue's shadow cut out of them

/** What casts its shadow into the beams: an ellipsoid (centre, radii; radii 0: nothing). */
vec3 gOccC = vec3(0.);
vec3 gOccR = vec3(0.);

/**
 * Whether the way from p toward the sun crosses the occluder (0 or 1). A scene may add its own (a colonnade): it
 * defines SHAFT_OCCLUDER(p) before SKY_GLSL.
 */
float inShadow(vec3 p) {
  float s = 0.;
#ifdef SHAFT_OCCLUDER
  s = SHAFT_OCCLUDER(p);
#endif
  if (gOccR.x <= 0.) return s;
  vec3 o = (p - gOccC) / gOccR, d = gSun / gOccR;
  float a = dot(d, d), b = dot(o, d), c = dot(o, o) - 1.;
  float h = b * b - a * c;
  return max(s, h > 0. && (c < 0. || -b - sqrt(h) > 0.) ? 1. : 0.);
}
#ifdef SHAFT_OCCLUDER
const bool OCCLUDED = true;
#else
const bool OCCLUDED = false;
#endif

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
  if (gOccR.x > 0. || OCCLUDED) {
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
  return col * (1. - min(k, 1.6) * (.32 * s.y + .2 * s.z)) + (sunCol() * 1.1 + uInk * .3) * s.x * k * .5;
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
  vec3 c = a * (uInk * (1.05 * key * warmLight() + .75 * dome + .45 * bounce) * (.35 + .65 * ao) + sunCol() * .5 * sun * ao);
  c += uInk * pow(clamp(dot(reflect(-gKey, n), -rd), 0., 1.), 24.) * .25 * ao;
  return c + (sunCol() * .6 * sun + uInk * .2) * rim * ao;
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

/** Distance to the part of an arc round c (radius r) from angle a0 toward a1 (from the top, clockwise) drawn so far. */
float strokeArcPart(vec2 p, vec2 c, float r, float a0, float a1, float f) {
  if (f <= 0.) return 1e3;
  vec2 d = p - c;
  float span = abs(a1 - a0) * f, dir = sign(a1 - a0);
  float rel = mod((atan(d.x, d.y) - a0) * dir, 6.2831853);
  if (rel <= span) return abs(length(d) - r);
  float ae = a0 + dir * span;
  return min(length(p - c - r * vec2(sin(a0), cos(a0))), length(p - c - r * vec2(sin(ae), cos(ae))));
}

/**
 * The canon drawn across the sky through a build, at the scale of the landscape: a golden rectangle, its squares and
 * the golden spiral winding in low over the horizon toward the sun, then a circle and two diagonals, in pencil,
 * stroke after stroke (uSkyCanon); it fades after the drop (uSkyCanonA). How much graphite covers the sky toward rd.
 */
float skyCanonO(vec3 rd) {
  // (low over the horizon, toward the sun: where the views look; the sun itself climbs out of them through a build)
  vec3 c = normalize(normalize(vec3(gSun.x, 0., gSun.z)) + vec3(0., .2, 0.));
  float cd = dot(rd, c);
  if (cd < .25) return 0.;
  vec3 right = normalize(cross(c, vec3(0., 1., 0.)));
  vec3 up = cross(right, c);
  // in the plane of the sky round that point, in heights of the rectangle; the spiral's eye on it, its rectangle
  // reaching toward the middle of the view
  const float HS = .5;
  vec2 p = vec2(dot(rd, right), dot(rd, up)) / cd / HS;
  if (gSun.x < 0.) p.x = -p.x;
  p += vec2(1.1708, .2765);
  float px = 1.3 / (uRes.y * 1.6 * HS * cd);
  float k = uSkyCanon * 21., d = 1e3;
  const float W = 1.618034;
  d = min(d, strokeSeg(p, vec2(0., 0.), vec2(W, 0.), clamp(k, 0., 1.)));
  d = min(d, strokeSeg(p, vec2(W, 0.), vec2(W, 1.), clamp(k - 1., 0., 1.)));
  d = min(d, strokeSeg(p, vec2(W, 1.), vec2(0., 1.), clamp(k - 2., 0., 1.)));
  d = min(d, strokeSeg(p, vec2(0., 1.), vec2(0., 0.), clamp(k - 3., 0., 1.)));
  // the squares cut off one after another, each with its quarter of the spiral
  float x = 0., y = 0., w = W, h = 1.;
  for (int i = 0; i < 7; i++) {
    float fi = float(i), m = mod(fi, 4.);
    float f1 = clamp(k - 4. - fi * 2., 0., 1.), f2 = clamp(k - 5. - fi * 2., 0., 1.);
    if (m < .5) {
      d = min(d, strokeSeg(p, vec2(x + h, y), vec2(x + h, y + h), f1));
      d = min(d, strokeArcPart(p, vec2(x + h, y), h, -1.5708, 0., f2));
      x += h; w -= h;
    } else if (m < 1.5) {
      d = min(d, strokeSeg(p, vec2(x, y + h - w), vec2(x + w, y + h - w), f1));
      d = min(d, strokeArcPart(p, vec2(x, y + h - w), w, 0., 1.5708, f2));
      h -= w;
    } else if (m < 2.5) {
      d = min(d, strokeSeg(p, vec2(x + w - h, y), vec2(x + w - h, y + h), f1));
      d = min(d, strokeArcPart(p, vec2(x + w - h, y + h), h, 1.5708, 3.1416, f2));
      w -= h;
    } else {
      d = min(d, strokeSeg(p, vec2(x, y + w), vec2(x + w, y + w), f1));
      d = min(d, strokeArcPart(p, vec2(x + w, y + w), w, 3.1416, 4.7124, f2));
      y += w; h -= w;
    }
  }
  d = min(d, strokeArc(p, vec2(W * .5, .5), .5, clamp(k - 18., 0., 1.)));
  d = min(d, strokeSeg(p, vec2(0., 0.), vec2(W, 1.), clamp(k - 19., 0., 1.)));
  d = min(d, strokeSeg(p, vec2(0., 1.), vec2(W, 0.), clamp(k - 20., 0., 1.)));
  return (1. - smoothstep(px * .5, px * 1.5, d)) * .4 * uSkyCanonA * smoothstep(.25, .45, cd);
}
`;
