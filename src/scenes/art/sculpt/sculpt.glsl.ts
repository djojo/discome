/**
 * The heads sculpted in code, cooked by the oven (oven.ts) into distance grids: sculpt(p), in the frame of the head
 * library (y up, face towards +z, top of the skull at y ~ .78, chin at ~ -.6), for the recipe set in the uniforms
 * (cast.ts). The style is a sculpture's: clean volumes, the details carved.
 *
 * Needs ART_LIB (sdEllipsoid, sdCapsule, sdBox, smin, smax, vnoise, hash13) and rot().
 */

/** The samples of the ring a wreath or a diadem follows round a bust (oven.ts traces it). */
export const RING_N = 48;

export const SCULPT_GLSL = /* glsl */ `
// ---- the recipe (cast.ts): which head; for a headdress laid on a bust, which one
uniform int uKind;
uniform int uWear;
// ---- the bust a headdress is laid on (oven.ts): its grid; the ring traced round it (its centre over the brow, how
// much lower it runs at the back, its radius at RING_N angles from the back, through the front, round to the back)
uniform float uBaseOn;
uniform highp sampler3D uBaseTex;
uniform vec3 uBaseMin;
uniform vec3 uBaseSize;
#define RING_N ${RING_N}
uniform vec3 uRingC;
uniform float uRingDrop;
uniform float uRing[RING_N];

float sdSph(vec3 p, float r) { return length(p) - r; }
/** A capsule from a (radius ra) to b (radius rb), tapering. */
float sdCone2(vec3 p, vec3 a, vec3 b, float ra, float rb) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.);
  return length(pa - ba * h) - mix(ra, rb, h);
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
  d += .005 * abs(sin(p.y * 36.)) * smoothstep(.02, .07, p.z) * (1. - smoothstep(.1, .22, q.x));
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

/** A panther (a jaguar): the broad round skull, wide cheeks, the short muzzle and its whisker pads, almond eyes. */
float panther(vec3 p) {
  vec3 q = vec3(abs(p.x), p.y, p.z);
  float d = sdEllipsoid(p - vec3(0., .43, -.1), vec3(.37, .33, .44));
  d = smin(d, sdEllipsoid(q - vec3(.22, .2, .14), vec3(.2, .19, .24)), .12);
  // the ruff of the cheeks
  d = smin(d, sdEllipsoid(q - vec3(.3, .12, .02), vec3(.13, .17, .17)), .1);
  // the muzzle, its whisker pads, the bridge of the nose, the nose pad and its nostrils
  d = smin(d, sdEllipsoid(p - vec3(0., .17, .44), vec3(.18, .15, .22)), .1);
  d = smin(d, sdEllipsoid(q - vec3(.085, .12, .56), vec3(.09, .072, .08)), .05);
  d = smin(d, sdCapsule(p, vec3(0., .43, .3), vec3(0., .26, .6), .072), .08);
  d = smin(d, sdEllipsoid(p - vec3(0., .235, .645), vec3(.072, .045, .045)), .03);
  d = smax(d, -sdEllipsoid(q - vec3(.03, .22, .68), vec3(.02, .012, .02)), .01);
  // the cleft under the nose, the line of the mouth under the pads, the chin
  d = smax(d, -sdCapsule(p, vec3(0., .2, .665), vec3(0., .11, .64), .006), .01);
  d = smax(d, -max(abs(p.y - .05 - .5 * q.x * q.x) - .005, max(q.x - .2, .4 - p.z)), .008);
  d = smin(d, sdEllipsoid(p - vec3(0., .01, .43), vec3(.12, .065, .14)), .06);
  // the eyes, slanted: their sockets, the almond eyeballs, the slit of the pupil, the brows
  vec3 o = q - vec3(.15, .35, .39);
  o.xy *= rot(-.25);
  d = smax(d, -sdEllipsoid(o, vec3(.08, .045, .07)), .04);
  d = smin(d, sdEllipsoid(o + vec3(0., .005, .03), vec3(.066, .036, .05)), .015);
  d = smax(d, -sdBox(o - vec3(0., -.005, .03), vec3(.006, .026, .02)), .004);
  d = smin(d, sdEllipsoid(q - vec3(.15, .41, .37), vec3(.09, .025, .05)), .04);
  // the ears, rounded, small, far back on the crown, hollowed in front
  vec3 e = q - vec3(.29, .66, -.18);
  e.xy *= rot(.4);
  float ear = sdEllipsoid(e, vec3(.09, .1, .04));
  ear = smax(ear, -sdEllipsoid(e - vec3(0., -.01, .04), vec3(.07, .08, .035)), .02);
  d = smin(d, ear, .05);
  // the neck, thick, broadening into the chest
  return smin(d, sdCone2(p, vec3(0., .25, -.14), vec3(0., -1.6, -.3), .33, .52), .2);
}

/** A bear: massive, the broad skull, round ears on top, the long tapering muzzle, little eyes, the fur of the neck. */
float bear(vec3 p) {
  vec3 q = vec3(abs(p.x), p.y, p.z);
  float d = sdEllipsoid(p - vec3(0., .42, -.08), vec3(.42, .37, .44));
  d = smin(d, sdEllipsoid(p - vec3(0., .55, .12), vec3(.25, .17, .22)), .15);
  d = smin(d, sdEllipsoid(q - vec3(.24, .22, .08), vec3(.24, .24, .27)), .15);
  // the muzzle, its broad nose and nostrils, the lower jaw, the line of the mouth
  d = smin(d, sdCone2(p, vec3(0., .3, .25), vec3(0., .23, .68), .17, .1), .12);
  d = smin(d, sdEllipsoid(p - vec3(0., .26, .74), vec3(.1, .065, .055)), .03);
  d = smax(d, -sdSph(q - vec3(.04, .25, .79), .021), .01);
  d = smin(d, sdEllipsoid(p - vec3(0., .1, .45), vec3(.12, .07, .2)), .06);
  d = smax(d, -max(abs(p.y - .15 + .1 * q.x) - .005, max(q.x - .15, .3 - p.z)), .008);
  // the eyes, small
  d = smax(d, -sdEllipsoid(q - vec3(.15, .4, .36), vec3(.05, .035, .05)), .025);
  d = smin(d, sdSph(q - vec3(.15, .4, .34), .03), .01);
  // the ears, round, on top
  vec3 e = q - vec3(.3, .73, -.12);
  e.xy *= rot(.3);
  float ear = sdEllipsoid(e, vec3(.11, .1, .06));
  ear = smax(ear, -sdEllipsoid(e - vec3(0., -.01, .05), vec3(.07, .06, .04)), .02);
  d = smin(d, ear, .06);
  // the neck, huge
  d = smin(d, sdCapsule(p, vec3(0., .2, -.2), vec3(0., -1.6, -.3), .42), .25);
  // its fur, in tufts (not on the muzzle)
  return d + .007 * (vnoise(p * 24.) - .5) * (1. - smoothstep(.15, .35, p.z));
}

/** The antlers of the stag (q: the point with |x|): the beam sweeping up and back, its tines. */
float antlers(vec3 q) {
  vec3 a0 = vec3(.11, .7, -.06), a1 = vec3(.24, .98, -.17), a2 = vec3(.4, 1.2, -.12), a3 = vec3(.48, 1.4, .02);
  float d = sdCone2(q, a0, a1, .058, .046);
  d = smin(d, sdCone2(q, a1, a2, .046, .036), .02);
  d = smin(d, sdCone2(q, a2, a3, .036, .02), .015);
  d = smin(d, sdCone2(q, a0 + vec3(.02, .06, .01), vec3(.22, .86, .22), .038, .015), .02);
  d = smin(d, sdCone2(q, a1, vec3(.38, 1.1, .14), .035, .015), .02);
  d = smin(d, sdCone2(q, a2, vec3(.64, 1.36, -.2), .03, .012), .015);
  // the burr at the base
  d = smin(d, sdEllipsoid(q - a0 - vec3(0., .02, 0.), vec3(.06, .03, .06)), .015);
  return d + .002 * sin(q.y * 120. + q.x * 40.);
}

/** A stag: the long face tapering to the muzzle, big eyes on the sides, ears held out, a long neck, the antlers. */
float deer(vec3 p) {
  vec3 q = vec3(abs(p.x), p.y, p.z);
  float d = sdEllipsoid(p - vec3(0., .5, -.08), vec3(.24, .22, .27));
  d = smin(d, sdCone2(p, vec3(0., .48, .1), vec3(0., .26, .55), .17, .1), .1);
  // the muzzle, the nostrils, the lower jaw, the line of the mouth
  d = smin(d, sdEllipsoid(p - vec3(0., .23, .62), vec3(.095, .085, .07)), .05);
  d = smax(d, -sdEllipsoid(q - vec3(.045, .24, .685), vec3(.015, .025, .02)), .01);
  d = smin(d, sdEllipsoid(p - vec3(0., .17, .45), vec3(.08, .05, .16)), .06);
  d = smax(d, -max(abs(p.y - .185) - .004, max(q.x - .1, .48 - p.z)), .008);
  // the eyes, big, on the sides, and the groove before them
  d = smax(d, -sdEllipsoid(q - vec3(.17, .47, .17), vec3(.06, .045, .06)), .03);
  d = smin(d, sdSph(q - vec3(.17, .465, .155), .045), .012);
  d = smax(d, -sdCapsule(q, vec3(.15, .43, .25), vec3(.12, .38, .33), .008), .01);
  // the ears, large, held out, hollowed in front
  vec3 e = q - vec3(.33, .64, -.12);
  e.xy *= rot(1.);
  float ear = sdEllipsoid(e, vec3(.075, .17, .045));
  ear = smax(ear, -sdEllipsoid(e - vec3(0., .01, .035), vec3(.05, .13, .03)), .015);
  d = smin(d, ear, .04);
  // the long neck
  d = smin(d, sdCone2(p, vec3(0., .42, -.15), vec3(0., -1.6, -.3), .21, .45), .15);
  return min(d, antlers(q));
}

/**
 * An elephant: the twin domes of the brow, the great ears held out like fans, the ringed trunk hanging and curling
 * forward at its tip, the tusks, its wrinkled skin.
 */
float elephant(vec3 p) {
  vec3 q = vec3(abs(p.x), p.y, p.z);
  float d = sdEllipsoid(p - vec3(0., .42, -.08), vec3(.4, .38, .42));
  d = smin(d, sdEllipsoid(q - vec3(.13, .62, .14), vec3(.17, .15, .18)), .12);
  d = smin(d, sdEllipsoid(p - vec3(0., .28, .26), vec3(.26, .3, .22)), .14);
  // the trunk, ringed on its front
  float tr = sdCone2(p, vec3(0., .25, .4), vec3(0., -.15, .52), .15, .12);
  tr = smin(tr, sdCone2(p, vec3(0., -.15, .52), vec3(0., -.5, .55), .12, .09), .04);
  tr = smin(tr, sdCone2(p, vec3(0., -.5, .55), vec3(0., -.75, .66), .09, .07), .03);
  tr += .004 * sin(p.y * 70.) * smoothstep(.45, .55, p.z);
  d = smin(d, tr, .08);
  // the tusks, curving forward
  float tk = sdCone2(q, vec3(.14, 0., .38), vec3(.2, -.3, .58), .05, .04);
  tk = smin(tk, sdCone2(q, vec3(.2, -.3, .58), vec3(.19, -.4, .76), .04, .022), .02);
  d = min(d, tk);
  // the eyes, small, on the sides
  d = smax(d, -sdEllipsoid(q - vec3(.3, .37, .22), vec3(.05, .035, .05)), .02);
  d = smin(d, sdSph(q - vec3(.3, .37, .2), .028), .01);
  // the ears, great fans held out a little forward
  vec3 e = q - vec3(.5, .28, -.12);
  e.xz *= rot(-.25);
  float ear = sdEllipsoid(e, vec3(.28, .4, .028));
  // their rolled upper edge
  ear = smin(ear, sdEllipsoid(e - vec3(-.02, .3, .0), vec3(.24, .1, .04)), .04);
  d = smin(d, ear, .06);
  // the neck, short and massive
  d = smin(d, sdCapsule(p, vec3(0., .2, -.2), vec3(0., -1.6, -.3), .42), .2);
  // the skin, finely wrinkled: broken creases, not stripes
  return d + .0006 * sin(p.y * 70. + 14. * vnoise(p * 6.)) * vnoise(p * 9. + 3.);
}

// ---------------------------------------------------------------- masks

/** Spheres of radius r on a jittered lattice of step s (an exact field): curls. */
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

/** The face of a theatre mask, full (k: 0 tragedy, its brows knitted, 1 comedy, its cheeks round and raised). */
float maskFace(vec3 p, float k) {
  vec3 q = vec3(abs(p.x), p.y, p.z);
  float d = sdEllipsoid(p - vec3(0., .1, 0.), vec3(.42 + .06 * k, .62 - .04 * k, .3));
  // the brows: knitted up in the middle in grief, arched high in laughter
  d = smin(d, sdCapsule(q, vec3(.05, .31 + .07 * (1. - k), .27), vec3(.32, .26 + .09 * k - .06 * (1. - k), .19), .045), .05);
  d = smin(d, sdEllipsoid(q - vec3(.22, -.08 + .05 * k, .2), vec3(.15 + .04 * k, .14 + .03 * k, .14)), .1);
  // the nose
  d = smin(d, sdCapsule(p, vec3(0., .25, .3), vec3(0., -.02, .4), .045 + .015 * k), .05);
  d = smin(d, sdEllipsoid(p - vec3(0., -.03, .39), vec3(.07 + .025 * k, .05, .05)), .04);
  // the chin
  return smin(d, sdEllipsoid(p - vec3(0., -.46 + .03 * k, .2), vec3(.16, .12, .12)), .1);
}

/**
 * A mask of the Greek theatre (k: 0 tragedy, 1 comedy): a shell, its eyes and its great open mouth pierced through,
 * the lips rolled round the mouth, the onkos (the mound of hair over the brow) and a frame of curls.
 */
float theatreMask(vec3 p, float k) {
  vec3 q = vec3(abs(p.x), p.y, p.z);
  float F = maskFace(p, k);
  // the shell, only the front of the face
  float d = smax(abs(F) - .024, -p.z - .04, .03);
  // the mouth: in grief its corners fall, in laughter they rise in a wide crescent
  vec3 m = p - vec3(0., -.24 + .02 * k, .3);
  m.y += (k > .5 ? -1.1 : 1.) * m.x * m.x;
  float mouth = sdEllipsoid(m, vec3(.17 + .07 * k, .085 + .01 * k, .4));
  // its lips, rolled round it
  d = smin(d, smax(abs(mouth) - .028, F - .03, .02), .02);
  d = smax(d, -mouth, .012);
  // the eyes: drooping at their outer corners in grief; in laughter, crescents
  vec3 e = q - vec3(.16, .13 + .02 * k, .3);
  e.xy *= rot(k > .5 ? .25 : -.3);
  float eye = sdEllipsoid(e, vec3(.075, .04, .4));
  if (k > .5) eye = smax(eye, -sdEllipsoid(e + vec3(0., .035, 0.), vec3(.08, .04, .5)), .01);
  d = smax(d, -eye, .01);
  // the onkos over the brow, and the curls framing the face (not under the chin)
  float hair = sdEllipsoid(p - vec3(0., .74, -.02), vec3(.32, .22, .16));
  float rim = length(vec2(length((p.xy - vec2(0., .1)) / vec2(.47, .67)) - 1., (p.z - .02) / .7) * vec2(.5, .7)) - .055;
  hair = smin(hair, smax(rim, -.2 - p.y, .05), .06);
  hair = smin(hair, smax(bumps(p, .07, .045), abs(hair) - .03, .01), .015);
  return smin(d, hair, .03);
}

// ---------------------------------------------------------------- headdresses, laid on a bust

/** The bust's distance (its grid, plus the distance to its box). */
float baseD(vec3 p) {
  vec3 uvw = (p - uBaseMin) / uBaseSize;
  vec3 c = clamp(uvw, 0., 1.);
  return textureLod(uBaseTex, c, 0.).r + length((uvw - c) * uBaseSize);
}
/** The bust's distance, blurred: a smooth surface round its curls, for what is laid over them. */
float baseSoft(vec3 p) {
  const float e = .05;
  return (2. * baseD(p) + baseD(p + vec3(e, 0., 0.)) + baseD(p - vec3(e, 0., 0.)) + baseD(p + vec3(0., e, 0.)) +
    baseD(p - vec3(0., e, 0.)) + baseD(p + vec3(0., 0., e)) + baseD(p - vec3(0., 0., e))) / 8.;
}

/** The ring's radius at the angle a (0 at the front, the sign of x): read round the profile traced by the oven. */
float ringR(float a) {
  float t = (a / 6.2831853 + .5) * float(RING_N);
  float f = floor(t);
  return mix(uRing[int(mod(f, float(RING_N)))], uRing[int(mod(f + 1., float(RING_N)))], t - f);
}
/** The ring's height at the angle a, from its centre: lower at the back of the head. */
float ringY(float a) {
  return -.5 * uRingDrop * (1. - cos(a));
}
/** A point's place relative to the ring: (out from it, above it), and its angle. */
vec3 ringFrame(vec3 p) {
  vec3 c = p - uRingC;
  float a = atan(c.x, c.z);
  return vec3(length(c.xz) - ringR(a), c.y - ringY(a), a);
}
/** The point of the ring at the angle a. */
vec3 ringAt(float a) {
  return uRingC + vec3(sin(a) * ringR(a), ringY(a), cos(a) * ringR(a));
}

/**
 * A wreath: two rows of leaves along the ring, pointing towards the brow from both sides, on a slender band. Laurel:
 * long narrow leaves, and the two ribbons of the knot falling on the nape; ivy: broad leaves, and a cluster of grapes
 * over each temple.
 */
float wreath(vec3 p, float ivy) {
  vec3 c = p - uRingC;
  float a = atan(c.x, c.z);
  float N = ivy > .5 ? 22. : 28.;
  float w = 6.2831853 / N;
  vec3 size = ivy > .5 ? vec3(.065, .052, .013) : vec3(.09, .036, .014);
  float d = 10.;
  for (int j = -1; j <= 1; j++) {
    float ai = (floor(a / w) + .5 + float(j)) * w;
    float rr = ringR(ai);
    vec3 rad = vec3(sin(ai), 0., cos(ai));
    vec3 cen = rad * rr + vec3(0., ringY(ai), 0.);
    // along the ring (and down it, towards the back), towards the front
    vec3 tng = normalize(vec3(cos(ai), -.5 * uRingDrop * sin(ai) / rr, -sin(ai))) * -sign(ai + 1e-4);
    for (int r = -1; r <= 1; r += 2) {
      float fr = float(r);
      // each row splayed out from the band, and tilted out from the head
      vec3 dir = normalize(tng + vec3(0., .55 * fr, 0.));
      vec3 side = normalize(cross(rad, dir));
      vec3 v = c - cen - vec3(0., .024 * fr, 0.);
      vec3 l = vec3(dot(v, dir) - size.x * .7, dot(v, side), dot(v, rad));
      // the leaf, curved a little, its middle vein
      l.z += 1.5 * l.x * l.x - 6. * l.y * l.y;
      float leaf = sdEllipsoid(l, size);
      leaf = smax(leaf, -max(abs(l.y) - .003, abs(l.z - size.z) - .006), .004);
      d = min(d, leaf);
    }
  }
  // the band under the leaves
  vec3 f = ringFrame(p);
  d = smin(d, length(f.xy) - .018, .01);
  vec3 q = vec3(abs(c.x), c.y, c.z);
  if (ivy > .5) {
    // the grapes, a cluster hanging over each temple, just out of the ring
    const float ag = 1.25;
    vec3 gc = vec3(sin(ag), 0., cos(ag)) * (ringR(ag) + .05) + vec3(0., ringY(ag) - .09, 0.);
    float g = sdEllipsoid(q - gc, vec3(.07, .12, .07));
    d = min(d, smax(bumps(p, .045, .028), g, .008));
  } else {
    // the knot at the back, its two ribbons falling, waving a little
    vec3 k = ringAt(3.14159) - uRingC;
    vec3 v = q - k;
    v.x -= .012 * sin(v.y * 16.);
    float rib = sdCapsule(vec3(v.x, v.y, (v.z + .03) * 2.), vec3(.04, 0., 0.), vec3(.1, -.4, -.24), .034) / 2.;
    d = min(d, min(rib, sdSph(v - vec3(0., 0., -.02), .035)));
  }
  return d;
}

/**
 * A diadem: a crescent of metal standing over the brow, tall in front and tapering away above the temples, flaring
 * out a little as it rises (as Hera's); a row of beads along its upper edge, a palmette at its front.
 */
float diadem(vec3 p) {
  vec3 f = ringFrame(p);
  float hAt = .2;
  float h = hAt * (1. - smoothstep(0., 1.25, abs(f.z)));
  float t = f.x - .3 * max(f.y, 0.) - .014;
  float band = max(abs(t) - .013, abs(f.y - .5 * h) - .5 * h);
  band = max(band, (abs(f.z) - 1.25) * .3);
  // the beads along its edge
  const float w = .09;
  float ai = (floor(f.z / w) + .5) * w;
  float hi = hAt * (1. - smoothstep(0., 1.25, abs(ai)));
  float bead = length(vec3((f.z - ai) * ringR(ai), f.y - hi, t - .3 * hi + .3 * max(f.y, 0.))) - .017;
  band = min(band, max(bead, (abs(ai) - 1.) * .3));
  // the palmette at the front: a fan of five lobes
  vec3 pf = p - ringAt(0.) - vec3(0., .5 * hAt, .022 + .15 * hAt);
  float palm = 10.;
  for (int i = -2; i <= 2; i++) {
    vec3 o = pf;
    o.xy *= rot(float(i) * .35);
    palm = min(palm, sdEllipsoid(o - vec3(0., .035, 0.), vec3(.016, .045, .012)));
  }
  return min(band, palm);
}

/**
 * A Greek helmet, as Athena wears it: its bowl round the head above the ring, the brow guard rising over the forehead
 * and flaring forward, tallest in front, its crest of horsehair from the brow down to the nape.
 */
float helmet(vec3 p) {
  vec3 f = ringFrame(p);
  float b = baseSoft(p);
  // the bowl, its edge thinning down to the hair at the rim
  float bowl = smax(b - .015 - .05 * smoothstep(0., .1, f.y), -f.y, .015);
  // the rim, rising in front into the brow guard, its edge rolled
  float h = .025 + .11 * (1. - smoothstep(0., 1.4, abs(f.z)));
  float t = f.x + .03 - .5 * max(f.y, 0.);
  float guard = max(abs(t) - .014, abs(f.y - .5 * h) - .5 * h);
  guard = min(guard, length(vec2(t, f.y - h)) - .02);
  float d = smin(bowl, guard, .015);
  // the crest, its horsehair combed across: rising from behind the brow guard, over the top, down to the nape
  vec2 s = p.zy - vec2(uRingC.z, uRingC.y - .1);
  float th = atan(s.y, s.x);
  th += th < -1.6 ? 6.2831853 : 0.;
  float tall = .07 + .18 * smoothstep(1., 1.6, th);
  float crest = smax(b - tall, abs(p.x) - .01 - .035 * smoothstep(1., 1.5, th) + .015 * smoothstep(1.6, 3.4, th), .02);
  crest = smax(crest, max(max(1. - th, th - 3.9), .06 - f.y) * .5, .04) + .003 * sin(p.y * 140. + p.z * 80.);
  return min(d, crest);
}

/**
 * A veil laid over the head, its front edge over the brow and down behind the jaw, the face left open; it falls from
 * the head to the shoulders, flaring a little, in folds deepening as it falls.
 */
float veil(vec3 p) {
  // the cloth hangs straight down from the head, from wherever it reaches furthest above (a knot of the hair, the
  // back of the skull), round those knots too (the blur would let them through)
  float b = 10.;
  for (int k = 0; k < 6; k++) {
    vec3 h = vec3(p.x, max(p.y, .25 + .1 * float(k)), p.z);
    // (smoothly: the cloth stretches across the hollows between them)
    b = smin(b, min(baseSoft(h), baseD(h) + .02), .12);
  }
  float below = max(.25 - p.y, 0.);
  b += (.006 + .03 * below) * sin(atan(p.x, p.z) * 12.) - .12 * below;
  float cloth = b - .07;
  // its front edge, a hem
  float edge = (p.z - .48 - .6 * (p.y - .6)) / 1.17;
  return smax(cloth, edge, .03);
}

/**
 * A bust of the library (uBaseOn) wearing a headdress (uWear): a wreath, a diadem or a helmet along the ring traced
 * round it, a veil on its surface.
 */
float wornHead(vec3 p) {
  float d = baseD(p);
  float w = uWear == 4 ? veil(p) : uWear == 3 ? helmet(p) : uWear == 2 ? diadem(p) : wreath(p, float(uWear));
  return min(d, w);
}

/** The head being cooked. */
float sculpt(vec3 p) {
  if (uKind == 7) return wornHead(p);
  if (uKind == 0) return cobra(p);
  if (uKind == 1) return panther(p);
  if (uKind == 2) return bear(p);
  if (uKind == 3) return deer(p);
  if (uKind == 4) return elephant(p);
  if (uKind == 5) return theatreMask(p, 0.);
  if (uKind == 6) return theatreMask(p, 1.);
  return 10.;
}
`;
