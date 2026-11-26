/**
 * The heads sculpted in code, cooked by the oven (oven.ts) into distance grids: sculpt(p), in the frame of the head
 * library (y up, face towards +z, top of the skull at y ~ .78, chin at ~ -.6), for the recipe set in the uniforms
 * (cast.ts).
 *
 * People: the sculpted human head of lib.glsl.ts (sdHead), every volume of it moved and resized by the recipe's
 * features (uP: zero is sdHead itself, about -1..1 each, never caricatural), then ageing, a beard, a head of hair.
 * The style is a sculptor's head in clay: clean volumes, no pores nor lashes. A feature that comes and goes is blended
 * in with mix(): a blend of two distance fields stays a field the scenes can march.
 *
 * Needs ART_LIB (sdEllipsoid, sdCapsule, smin, smax, vnoise, hash13) and rot().
 */
export const SCULPT_GLSL = /* glsl */ `
// ---- the recipe (cast.ts)
uniform int uKind;
uniform float uP[24];
uniform int uHair;
uniform int uBeard;
uniform int uWear;

#define SKULL_W uP[0]
#define SKULL_L uP[1]
#define FACE_LEN uP[2]
#define JAW uP[3]
#define CHEEK uP[4]
#define BROW uP[5]
#define CHIN uP[6]
#define NOSE_LEN uP[7]
#define NOSE_W uP[8]
#define NOSE_BRIDGE uP[9]
#define LIPS uP[10]
#define MOUTH_W uP[11]
#define EYES_OPEN uP[12]
#define AGE uP[13]
#define NECK uP[14]
#define EARS uP[15]
#define FOREHEAD uP[16]
#define EYE_DEPTH uP[17]
#define ADAM uP[18]
#define HAIR_LEN uP[19]
#define HAIR_VOL uP[20]
#define BEARD_LEN uP[21]

float sdSph(vec3 p, float r) { return length(p) - r; }

/** Spheres of radius r on a jittered lattice of step s (an exact field): curls, coils. */
float bumps(vec3 p, float s, float r) {
  vec3 i = floor(p / s), f = fract(p / s);
  float d = 1e9;
  for (int z = -1; z <= 1; z++)
    for (int y = -1; y <= 1; y++)
      for (int x = -1; x <= 1; x++) {
        vec3 o = vec3(float(x), float(y), float(z));
        vec3 h = vec3(hash13(i + o), hash13(i + o + 17.3), hash13(i + o + 41.7));
        d = min(d, length(f - o - .5 - .5 * (h - .5)));
      }
  return d * s - r;
}

/** Curls: little spheres on the surface of a mass of hair (d), of step s. */
float curls(vec3 p, float d, float s) {
  return smin(d, smax(bumps(p, s, s * .62), abs(d) - s * .45, .01), s * .2);
}

// ---------------------------------------------------------------- the face

/** The cranium of the face (scaled as the recipe says), thickened by t (the scalp under the hair: t > 0). */
float cranium(vec3 p, float t) {
  return sdEllipsoid(p - vec3(0., .17 + .02 * FOREHEAD, -.1 - .03 * SKULL_L), vec3(.45 * (1. + .07 * SKULL_W) + t, .6 + t, .57 * (1. + .06 * SKULL_L) + t));
}

/** The face: sdHead, each of its volumes moved by the recipe (all features zero: sdHead exactly). */
float face(vec3 p) {
  vec3 q = vec3(abs(p.x), p.y, p.z);
  float fl = FACE_LEN, ly = -.04 * fl;
  float d = cranium(p, 0.);
  float fw = 1. + .06 * SKULL_W;
  d = smin(d, sdEllipsoid(p - vec3(0., -.15 - .03 * fl, .07), vec3(.36 * (1. + .05 * JAW) * fw, .54 * (1. + .06 * fl), .46)), .2);
  // the chin
  d = smin(d, sdEllipsoid(p - vec3(0., -.56 - .06 * fl, .17 + .035 * CHIN), vec3(.17 * (1. + .25 * JAW), .15 * (1. + .1 * CHIN), .24)), .17);
  // a square jaw, its corners marked
  if (JAW > 0.) d = mix(d, smin(d, sdEllipsoid(q - vec3(.2, -.43 - .05 * fl, .2), vec3(.16, .15, .19)), .12), min(JAW, 1.));
  // the cheeks, higher and fuller with the cheekbones, falling with age
  d = smin(d, sdEllipsoid(q - vec3((.245 + .015 * CHEEK) * fw, -.06 + .025 * CHEEK - .03 * AGE, .25 + .015 * CHEEK), vec3(.11, .1, .15) * (1. + .15 * CHEEK)), .13);
  // the eye sockets
  d = smax(d, -sdEllipsoid(q - vec3(.15, .02, .52 - .02 * EYE_DEPTH), vec3(.105, .055, .1)), .075);
  // the eyes: closed lids (sdHead), or open, the eyeball under its lids, the pupil drilled as on a bust
  float closed = smin(d, sdEllipsoid(q - vec3(.15, .012, .462), vec3(.08, .04, .058)), .035);
  if (EYES_OPEN > 0.) {
    float o = smin(d, sdSph(q - vec3(.15, .012, .446), .06), .015);
    o = smin(o, sdEllipsoid(q - vec3(.15, .052, .468), vec3(.074, .02, .046)), .018);
    o = smin(o, sdEllipsoid(q - vec3(.15, -.034, .468), vec3(.068, .012, .04)), .012);
    o = smax(o, -sdSph(q - vec3(.15, .01, .512), .019), .005);
    d = mix(closed, o, min(EYES_OPEN, 1.));
  } else d = closed;
  // the brows
  d = smin(d, sdEllipsoid(q - vec3(.145, .115, .46 + .015 * BROW), vec3(.12, .028 * (1. + .45 * BROW), .065)), .09);
  // the nose: its bridge, its tip, the nostrils
  d = smin(d, sdCapsule(p, vec3(0., .04, .51 + .03 * NOSE_BRIDGE), vec3(0., -.185 - .035 * NOSE_LEN, .6 + .025 * NOSE_LEN + .015 * NOSE_BRIDGE), .032 * (1. + .25 * NOSE_BRIDGE + .15 * NOSE_W)), .06);
  d = smin(d, sdEllipsoid(p - vec3(0., -.205 - .035 * NOSE_LEN, .585 + .025 * NOSE_LEN), vec3(.055 * (1. + .45 * NOSE_W), .042, .052)), .045);
  d = smin(d, sdEllipsoid(q - vec3(.043 + .02 * NOSE_W, -.225 - .035 * NOSE_LEN, .535 + .015 * NOSE_LEN), vec3(.032, .026, .034) * (1. + .35 * NOSE_W)), .035);
  // the lips and the line of the mouth
  float mw = 1. + .15 * MOUTH_W;
  d = smin(d, sdEllipsoid(p - vec3(0., -.365 + ly, .515 + .012 * LIPS), vec3(.098 * mw, .025 * (1. + .8 * LIPS), .048 * (1. + .35 * LIPS))), .04);
  d = smin(d, sdEllipsoid(p - vec3(0., -.425 + ly - .012 * LIPS, .5 + .012 * LIPS), vec3(.082 * mw, .028 * (1. + .8 * LIPS), .048 * (1. + .35 * LIPS))), .04);
  d = smax(d, -sdEllipsoid(p - vec3(0., -.395 + ly - .005 * LIPS, .56 + .01 * LIPS), vec3(.088 * mw, .005, .044)), .01);
  // the ears
  d = smin(d, sdEllipsoid(q - vec3(.44, -.02, -.05), vec3(.033, .115, .072) * (1. + .25 * EARS)), .045);
  // the neck
  d = smin(d, sdCapsule(p, vec3(0., -.55, -.12), vec3(0., -1.6, -.2), .23 * (1. + .15 * NECK)), .15);
  // the Adam's apple
  if (ADAM > 0.) d = mix(d, smin(d, sdEllipsoid(p - vec3(0., -.8, .085), vec3(.04, .055, .04)), .05), min(ADAM, 1.));
  // age: jowls, the folds from the nose to the mouth, hollow temples, bags under the eyes, lines on the forehead
  if (AGE > 0.) {
    float a = min(AGE, 1.);
    float o = smin(d, sdEllipsoid(q - vec3(.18, -.47 + ly, .27), vec3(.08, .065, .08)), .08);
    o = smax(o, -sdCapsule(q, vec3(.075, -.25, .565), vec3(.135, -.43 + ly, .47), .007), .018);
    o = smax(o, -sdEllipsoid(q - vec3(.41, .2, .17), vec3(.07, .09, .09)), .06);
    o = smin(o, sdEllipsoid(q - vec3(.15, -.045, .5), vec3(.055, .016, .03)), .02);
    o += .0022 * sin(p.y * 110.) * smoothstep(.17, .24, p.y) * smoothstep(.42, .32, p.y) * smoothstep(.3, .45, p.z);
    d = mix(d, o, a);
  }
  return d;
}

// ---------------------------------------------------------------- beards

/**
 * Where a beard grows (< 0): the lower face, up the cheeks to the sideburns, down to under the jaw (soft edges); L: a
 * long beard, further down.
 */
float beardZone(vec3 p, float L) {
  float top = -.24 - .04 * FACE_LEN + .3 * smoothstep(.12, .42, abs(p.x));
  return smax(smax(p.y - top, -.02 - p.z, .08), -.76 - .06 * FACE_LEN - .25 * L - p.y, .06) * .6;
}
float moustache(vec3 p) {
  vec3 q = vec3(abs(p.x), p.y, p.z);
  float ly = -.04 * FACE_LEN;
  float m = sdEllipsoid(p - vec3(0., -.3 + ly, .575), vec3(.12, .038, .05));
  return smin(m, sdCapsule(q, vec3(.06, -.31 + ly, .57), vec3(.15, -.38 + ly, .5), .03), .03);
}
float beard(vec3 p, float d) {
  vec3 q = vec3(abs(p.x), p.y, p.z);
  float ly = -.04 * FACE_LEN;
  if (uBeard == 1) return smin(d, moustache(p), .02);
  float b;
  // how much beard there is here (0 where none grows): its texture only goes there
  float w = 1.;
  if (uBeard == 4) {
    // a goatee: round the chin
    b = smax(d - .035, sdEllipsoid(p - vec3(0., -.58 + ly, .3), vec3(.13, .16, .2)), .03);
  } else {
    // laid on the face where it grows, thinning to nothing at its edges (no wall); a full beard is thicker, a mass
    // round the jaw and the chin falling below it
    float L = uBeard == 3 ? 1. + BEARD_LEN : 0.;
    w = 1. - smoothstep(-.1, .06, beardZone(p, L));
    b = d - (uBeard == 3 ? .06 : .035) * w;
    if (uBeard == 3) {
      float m = sdEllipsoid(p - vec3(0., -.64 + ly - .1 * BEARD_LEN, .27), vec3(.21, .2 + .1 * BEARD_LEN, .17));
      m = smin(m, sdEllipsoid(q - vec3(.22, -.46 + ly, .22), vec3(.13, .18, .14)), .1);
      b = smin(b, smax(m, beardZone(p, L), .05), .06);
    }
  }
  // its texture, where it grows: curls
  float tw = smoothstep(.25, .7, w);
  b = mix(b, curls(p, b, uBeard == 3 ? .045 : .035), tw);
  // the mouth stays clear
  b = smax(b, -sdEllipsoid(p - vec3(0., -.4 + ly, .56), vec3(.09, .045, .1)), .015);
  d = smin(d, b, .012);
  return smin(d, moustache(p), .02);
}

// ---------------------------------------------------------------- hair

/** Above the hairline (> 0): the forehead at y = front, lower at the temples, down behind the ears to the nape. */
float hairline(vec3 p, float front) {
  float back = smoothstep(.12, -.42, p.z);
  float y0 = front - (front + .22) * back - .1 * smoothstep(.25, .42, abs(p.x)) * (1. - back);
  return (p.y - y0) * .5;
}
/** The hair lying on the scalp, t thick, from the hairline up. */
float hairCap(vec3 p, float t, float front) {
  return smax(cranium(p, t), -hairline(p, front), .02);
}
/** A strand falling from a to b, of radius r, in plaits (braid > 0) or wavy segments. */
float strand(vec3 p, vec3 a, vec3 b, float r, float braid, float seed) {
  vec3 pa = p - a, ba = b - a;
  float t = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.);
  vec3 c = pa - ba * t;
  float s = t * length(ba);
  c.x += .012 * sin(s * 9. + seed) * (1. - braid);
  return length(c) - r - (braid > 0. ? .005 * abs(sin(s * 45.)) : .004 * sin(s * 70. + seed));
}

float hair(vec3 p) {
  float h = 10.;
  if (uHair == 1) {
    // short, fuller on the crown, its texture in little tufts
    h = smax(cranium(p, .025 + .03 * smoothstep(.2, .7, p.y) + .02 * HAIR_VOL), -hairline(p, .36), .04);
    h = curls(p, h, .03);
  } else if (uHair == 2) {
    // long: a mass falling behind and beside the face, to the jaw or the shoulders
    h = hairCap(p, .04, .37);
    float fall = sdEllipsoid(p - vec3(0., -.1 - .3 * HAIR_LEN, -.26), vec3(.52, .6 + .2 * HAIR_LEN, .42));
    fall = smax(fall, -sdEllipsoid(p - vec3(0., -.2, .5), vec3(.36, .8, .55)), .08);
    h = smin(h, fall, .08);
    h += .0025 * sin(atan(p.x, p.z) * 55.) * smoothstep(.35, -.1, p.y);
  } else if (uHair == 3 || uHair == 8) {
    // combed back to a bun, or to a pony tail
    h = hairCap(p, .028, .37) + .002 * sin(atan(p.x, p.y - .1) * 60.);
    if (uHair == 3) {
      vec3 b = p - vec3(0., .44 - .35 * HAIR_LEN, -.66 + .06 * HAIR_LEN);
      float bun = sdEllipsoid(b, vec3(.2, .17, .15)) + .006 * sin(atan(b.x, b.y) * 3. + length(b.xy) * 60.);
      h = smin(h, bun, .05);
    } else {
      float tail = strand(p, vec3(0., .3, -.6), vec3(0., -.1, -.78), .075, 0., 0.);
      tail = smin(tail, strand(p, vec3(0., -.1, -.78), vec3(0., -.55 - .3 * HAIR_LEN, -.68), .055, 0., 1.), .05);
      h = smin(h, tail, .06);
      h = smin(h, sdCapsule(p, vec3(0., .32, -.6), vec3(0., .24, -.66), .085), .02);
    }
  } else if (uHair == 4) {
    // braids: rows on the scalp, the braids falling from the nape
    h = hairCap(p, .03, .37) + .006 * abs(sin(p.x * 30.));
    float br = 10.;
    for (int i = 0; i < 16; i++) {
      float fi = float(i);
      float a = PI + (fi - 7.5) * .2;
      vec3 top = vec3(sin(a) * .36, .22 - .2 * abs(fi - 7.5) / 7.5, cos(a) * .44 - .1);
      vec3 bot = vec3(sin(a) * .52, -.95 - .1 * HAIR_LEN, cos(a) * .44 - .16);
      br = min(br, strand(p, top, bot, .03, 1., fi));
    }
    h = smin(h, br, .03);
  } else if (uHair == 5) {
    // curls
    h = curls(p, hairCap(p, .07 + .03 * HAIR_VOL, .38), .07);
  } else if (uHair == 6) {
    // locs, falling from all over the scalp, their roots knotted on it
    h = curls(p, hairCap(p, .035, .37), .05);
    float lo = 10.;
    for (int i = 0; i < 14; i++) {
      float fi = float(i);
      float a = PI + (fi - 6.5) * .3;
      vec3 top = vec3(sin(a) * .3, .45 - .1 * abs(fi - 6.5) / 6.5, cos(a) * .32 - .1);
      vec3 bot = vec3(sin(a) * .52, -.7 - .25 * HAIR_LEN + .08 * sin(fi * 2.3), cos(a) * .46 - .12);
      lo = min(lo, strand(p, top, bot, .034, 0., fi));
    }
    h = smin(h, lo, .03);
  } else if (uHair == 7) {
    // an afro: a great round mass of curls, the face clear
    h = sdEllipsoid(p - vec3(0., .28, -.14), vec3(.7, .62, .7) * (1. + .12 * HAIR_VOL));
    // the face clear, an oval from the forehead to the chin; nothing below the nape
    h = smax(h, -sdEllipsoid(p - vec3(0., -.22, .5), vec3(.37, .64, .5)), .1);
    h = smax(h, (-.18 - p.y) * .5, .08);
    h = curls(p, h, .06);
  } else if (uHair == 9) {
    // a headscarf, wound round and knotted high at the front
    h = sdEllipsoid(p - vec3(0., .4, -.15), vec3(.5, .48, .62));
    h = smax(h, -hairline(p, .33), .03);
    h += .007 * sin(dot(p, normalize(vec3(.35, 1., .2))) * 38.);
    h = smin(h, sdEllipsoid(p - vec3(0., .66, .24), vec3(.14, .1, .1)), .06);
  } else if (uHair == 10) {
    // bald, a crown of hair round the back and the sides
    h = smax(hairCap(p, .022, .37), (p.y - .16 - .14 * smoothstep(0., -.5, p.z)) * .5, .07);
    h = curls(p, h, .024);
  }
  return h;
}

float person(vec3 p) {
  float d = face(p);
  if (uBeard > 0) d = beard(p, d);
  if (uHair > 0) d = smin(d, hair(p), .015);
  return d;
}

// ---------------------------------------------------------------- animals

/** The cobra, reared, its hood spread: broad under the head, narrowing into the neck; the head on top, looking ahead. */
float cobra(vec3 p) {
  vec3 q = vec3(abs(p.x), p.y, p.z);
  // the body rising
  float d = sdCapsule(p, vec3(0., .5, -.02), vec3(0., -1.6, -.1), .14);
  // the hood: broad under the head, narrowing down into the neck, thin, its edges swept back round the neck
  vec3 h = p - vec3(0., 0., -.06);
  h.z += .4 * h.x * h.x;
  float hood = sdEllipsoid(h - vec3(0., .24, 0.), vec3(.56, .42, .065));
  hood = smin(hood, sdEllipsoid(h - vec3(0., -.26, .01), vec3(.28, .44, .07)), .18);
  d = smin(d, hood, .08);
  // the broad scales of the throat, across the front of the neck and hood
  d += .005 * abs(sin(p.y * 36.)) * smoothstep(.02, .07, p.z) * smoothstep(.22, .1, q.x);
  // the head, looking ahead and a little down
  vec3 hp = p - vec3(0., .68, .14);
  hp.yz *= rot(.2);
  float head = sdEllipsoid(hp - vec3(0., 0., .05), vec3(.2, .105, .3));
  head = smin(head, sdEllipsoid(hp - vec3(0., .025, -.1), vec3(.225, .12, .19)), .07);
  vec3 hq = vec3(abs(hp.x), hp.yz);
  // the eyes, a ridge over each, the nostrils, the line of the mouth, the plates of the crown
  head = smin(head, sdSph(hq - vec3(.125, .04, .12), .036), .015);
  head = smin(head, sdEllipsoid(hq - vec3(.12, .07, .12), vec3(.055, .016, .045)), .02);
  head = smax(head, -sdSph(hq - vec3(.04, .03, .34), .013), .006);
  head = smax(head, -max(abs(hp.y + .035 - .02 * hp.z) - .003, -hp.z), .006);
  head += .003 * abs(sin(hp.x * 40.)) * smoothstep(.05, .1, hp.y);
  return smin(d, head, .08);
}

/** The head being cooked. */
float sculpt(vec3 p) {
  if (uKind == 1) return cobra(p);
  return person(p);
}
`;
