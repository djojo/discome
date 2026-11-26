/**
 * The heads sculpted in code, cooked by the oven (oven.ts) into distance grids: sculpt(p), in the frame of the head
 * library (y up, face towards +z, top of the skull at y ~ .78, chin at ~ -.6), for the recipe set in the uniforms
 * (cast.ts). The style is a sculpture's: clean volumes, the details carved.
 *
 * Needs ART_LIB (sdEllipsoid, sdCapsule, sdBox, smin, smax, vnoise) and rot().
 */
export const SCULPT_GLSL = /* glsl */ `
// ---- the recipe (cast.ts): which head
uniform int uKind;

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
  return d + .007 * (vnoise(p * 24.) - .5) * smoothstep(.35, .15, p.z);
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
  // the skin, finely wrinkled
  return d + .0012 * sin(p.y * 90. + 6. * vnoise(p * 5.));
}

/** The head being cooked. */
float sculpt(vec3 p) {
  if (uKind == 0) return cobra(p);
  if (uKind == 1) return panther(p);
  if (uKind == 2) return bear(p);
  if (uKind == 3) return deer(p);
  if (uKind == 4) return elephant(p);
  return 10.;
}
`;
